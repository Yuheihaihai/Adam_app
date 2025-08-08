const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');
const dns = require('dns').promises;

const PerplexitySearch = require('./perplexitySearch');
const existingServices = require('./services');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function slugify(input) {
  return input
    .toString()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function urlHostKey(url) {
  try {
    const u = new URL(url);
    return (u.hostname || '')
      .toLowerCase()
      .replace(/^www\./, '');
  } catch (_) {
    return '';
  }
}

function collectExistingKeys() {
  const ids = new Set();
  const nameSlugs = new Set();
  const hostKeys = new Set();
  for (const s of Array.isArray(existingServices) ? existingServices : []) {
    if (s.id) ids.add(String(s.id).toLowerCase());
    if (s.name) nameSlugs.add(slugify(s.name));
    if (s.url) hostKeys.add(urlHostKey(s.url));
  }
  return { ids, nameSlugs, hostKeys };
}

function isDuplicateCandidate(candidate, keys) {
  const idKey = (candidate.id || '').toLowerCase();
  const nameKey = candidate.name ? slugify(candidate.name) : '';
  const hostKey = candidate.url ? urlHostKey(candidate.url) : '';
  if (idKey && keys.ids.has(idKey)) return true;
  if (nameKey && keys.nameSlugs.has(nameKey)) return true;
  if (hostKey && keys.hostKeys.has(hostKey)) return true;
  return false;
}

function getYearMonth() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function writeJsonAtomic(targetFile, data) {
  ensureDir(path.dirname(targetFile));
  const tmp = `${targetFile}.tmp-${uuidv4()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, targetFile);
}

function toServiceSchema(candidate) {
  // Minimal normalization into our service schema
  const id = candidate.id || slugify(candidate.url || candidate.name || uuidv4());
  return {
    id,
    name: candidate.name,
    url: candidate.url,
    description: candidate.description || candidate.summary || '',
    criteria: {
      needs: candidate.needs || [],
      topics: candidate.topics || [],
      moods: candidate.moods || [],
      excludes: candidate.excludes || [],
      urgent: Boolean(candidate.urgent)
    },
    tags: candidate.tags || [],
    cooldown_days: typeof candidate.cooldown_days === 'number' ? candidate.cooldown_days : 14
  };
}

function getLlmModel() {
  // ENV優先。未指定時は安価モデルを既定に
  return process.env.DISCOVERY_LLM_MODEL || 'gpt-4o-mini';
}

async function evaluateComplianceWithLLM(openai, vendor) {
  // Evaluate ①法令遵守 ②反社非関与 ③第三者評価の顧客満足 ④ND/精神発達の関与
  const system = `あなたはコンプライアンス審査官です。以下の基準を満たすか厳格に評価し、JSONで返してください。
出力スキーマ: {
  "passes": boolean,
  "confidence": number, // 0-1
  "criteria": {
    "law_compliance": boolean,
    "anti_social_ties": boolean, // 関与なしならtrue
    "third_party_high_csat": boolean,
    "nd_or_dev_relations": boolean
  },
  "evidence": {
    "law_compliance": string[],
    "anti_social_ties": string[],
    "third_party_high_csat": string[],
    "nd_or_dev_relations": string[]
  }
}`;
  const user = `候補: ${JSON.stringify(vendor, null, 2)}\n厳格評価し、証跡URLや出典がある場合はevidenceに含めてください。`;

  const resp = await openai.chat.completions.create({
    model: getLlmModel(),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0,
    max_tokens: 450
  });
  const text = resp.choices[0]?.message?.content || '{}';
  try {
    const json = JSON.parse(text);
    return json;
  } catch (_) {
    return { passes: false, confidence: 0, criteria: {}, evidence: {} };
  }
}

async function extractCandidatesWithLLM(openai, searchText) {
  const system = `あなたは企業リスト抽出のエキスパートです。テキストから日本国内の事業者候補を抽出し、JSON配列で返してください。
出力配列の各要素スキーマ: {
  "name": string,
  "url": string,
  "description": string,
  "needs": string[],
  "topics": string[],
  "moods": string[],
  "tags": string[]
}`;
  const user = `入力テキスト: \n${searchText}\n\n上記から候補を最大20件で返してください。`;
  const resp = await openai.chat.completions.create({
    model: getLlmModel(),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.2,
    max_tokens: 900
  });
  const text = resp.choices[0]?.message?.content || '[]';
  try {
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function deduplicateByUrlOrName(candidates) {
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    const key = (c.url && slugify(c.url)) || slugify(c.name || uuidv4());
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

async function runDiscoveryOnce() {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.warn('[VendorDiscovery] OPENAI_API_KEY missing. Abort.');
    return { added: 0, updated: 0 };
  }
  const openai = new OpenAI({ apiKey: openaiKey });
  const px = new PerplexitySearch(perplexityKey);

  // 1) 検索クエリを組む（ND/精神発達×高評価×コンプライアンス観点）
  const queries = [
    '日本 ニューロダイバーシティ 支援 企業 高評価 第三者評価 口コミ 2025',
    '発達障害 支援 サービス 顧客満足度 ランキング 2025 日本',
    '就労移行支援 事業所 評価 反社会的勢力 関与なし 監査 2025',
    'メンタルヘルス 支援 企業 NPO 顧客満足 第三者機関 調査 2025',
    'ASD ADHD 自閉症 支援機関 評価 レビュー 日本 2025',
    '障害者 就労支援 評判 第三者 調査 日本 2025',
    'ニューロダイバーシティ 企業 取り組み 社外評価 日本 2025'
  ];

  const allCandidates = [];
  for (const q of queries) {
    try {
      const text = await px.generalSearch(q);
      if (!text) continue;
      const extracted = await extractCandidatesWithLLM(openai, text);
      allCandidates.push(...extracted);
    } catch (e) {
      console.warn('[VendorDiscovery] query failed:', q, e.message);
    }
  }

  const uniqueCandidates = deduplicateByUrlOrName(allCandidates).slice(0, 150); // safety cap拡大

  // Remove candidates that appear to be duplicates of existing services
  const existingKeys = collectExistingKeys();
  const newOnly = uniqueCandidates.filter(c => !isDuplicateCandidate(c, existingKeys));

  // 2) 各候補をLLMでコンプライアンス評価
  const approved = [];
  for (const cand of newOnly) {
    try {
      // 事前にWebページ本文を取得して要件抽出を強化
      let enriched = { ...cand };
      try {
        if (!(await isSafePublicURL(cand.url))) throw new Error('unsafe_url');
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), 8000);
        const fetchResp = await fetch(cand.url, { method: 'GET', redirect: 'manual', signal: controller.signal });
        clearTimeout(to);
        const html = await fetchResp.text();
        const extractPrompt = `以下のWebページ本文を読み、サービスの概要をJSONで返してください。スキーマ: {"description": string, "needs": string[], "topics": string[], "moods": string[], "tags": string[]}. 本文: ${html.slice(0, 15000)}`;
        const ext = await openai.chat.completions.create({
          model: getLlmModel(),
          messages: [
            { role: 'system', content: 'あなたは情報抽出アシスタントです。' },
            { role: 'user', content: extractPrompt }
          ],
          temperature: 0,
          max_tokens: 700
        });
        const extJson = JSON.parse(ext.choices[0]?.message?.content || '{}');
        enriched.description = extJson.description || enriched.description;
        enriched.needs = Array.isArray(extJson.needs) ? extJson.needs : enriched.needs;
        enriched.topics = Array.isArray(extJson.topics) ? extJson.topics : enriched.topics;
        enriched.moods = Array.isArray(extJson.moods) ? extJson.moods : enriched.moods;
        enriched.tags = Array.isArray(extJson.tags) ? extJson.tags : enriched.tags;
      } catch (_) { /* best effort */ }

      const evalResult = await evaluateComplianceWithLLM(openai, enriched);
      const evidenceCount = evalResult && evalResult.evidence
        ? ['law_compliance','anti_social_ties','third_party_high_csat','nd_or_dev_relations']
            .reduce((n,k)=> n + (Array.isArray(evalResult.evidence[k]) ? evalResult.evidence[k].length : 0), 0)
        : 0;
      const ok = Boolean(evalResult.passes) && (evalResult.confidence || 0) >= 0.6 && evidenceCount >= 2;
      if (!ok) continue;
      // Map topics if empty
      if (!enriched.topics || enriched.topics.length === 0) {
        enriched.topics = ['employment', 'mental_health', 'social', 'education', 'daily_living'].filter(() => false);
      }
      approved.push(toServiceSchema(enriched));
    } catch (e) {
      console.warn('[VendorDiscovery] eval failed for', cand?.name, e.message);
    }
  }

  // 3) 追加がない場合はキュレート種で再評価（厳格基準は維持）
  if (approved.length === 0) {
    const seeds = [
      { name: '日本発達障害ネットワーク(JDDnet)', url: 'https://jddnet.jp/', description: '発達障害に関する支援・情報提供を行う全国ネットワーク' },
      { name: 'こころの耳（厚生労働省委託事業）', url: 'https://kokoro.mhlw.go.jp/', description: '働く人のメンタルヘルス支援ポータル' }
    ];
    for (const seed of seeds) {
      try {
        const evalResult = await evaluateComplianceWithLLM(openai, seed);
        const evidenceCount = evalResult && evalResult.evidence
          ? ['law_compliance','anti_social_ties','third_party_high_csat','nd_or_dev_relations']
              .reduce((n,k)=> n + (Array.isArray(evalResult.evidence[k]) ? evalResult.evidence[k].length : 0), 0)
          : 0;
        const ok = Boolean(evalResult.passes) && (evalResult.confidence || 0) >= 0.6 && evidenceCount >= 2;
        if (ok && !isDuplicateCandidate(seed, collectExistingKeys())) {
          approved.push(toServiceSchema(seed));
          break; // 1件でも追加できたら終了
        }
      } catch (_) { /* continue */ }
    }
  }

  // 4) 追記保存（発見分）: 直接 core.json に書き込み
  const coreFile = path.join(__dirname, 'data', 'services', 'core.json');
  const coreList = fs.existsSync(coreFile) ? JSON.parse(fs.readFileSync(coreFile, 'utf8')) : [];
  const idToObj = new Map();
  for (const e of coreList) idToObj.set(e.id, e);
  for (const a of approved) idToObj.set(a.id, a);
  const merged = Array.from(idToObj.values());
  writeJsonAtomic(coreFile, merged);

  // 4) 既存エントリのリフレッシュ（description等）
  await refreshExistingEntries(openai);

  return { added: approved.length, updated: 0 };
}

async function refreshExistingEntries(openai) {
  const servicesDir = path.join(__dirname, 'data', 'services');
  if (!fs.existsSync(servicesDir)) return;
  const files = fs.readdirSync(servicesDir).filter(f => f.endsWith('.json'));
  const all = [];
  for (const f of files) {
    try {
      const list = JSON.parse(fs.readFileSync(path.join(servicesDir, f), 'utf8'));
      if (Array.isArray(list)) all.push(...list);
    } catch (_) {
      // ignore
    }
  }
  // sample subset for refresh to control cost
  const sample = all.slice(0, 50);
  const updates = [];
  for (const s of sample) {
    try {
      const prompt = `次のサービスの最新情報（名称、description、URL、必要ならneeds/topics/tagsの補正）をJSONで返してください。存在しない変更は行わないでください。\n出力: {"name":string?, "url":string?, "description":string?, "needs":string[]?, "topics":string[]?, "moods":string[]?, "tags":string[]?}.\n対象: ${JSON.stringify(s)}`;
      const resp = await openai.chat.completions.create({
        model: getLlmModel(),
        messages: [
          { role: 'system', content: 'あなたはデータ更新アシスタントです。変更が確実な場合のみJSONで返します。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0,
        max_tokens: 300
      });
      const text = resp.choices[0]?.message?.content || '{}';
      const delta = JSON.parse(text);
      const updated = { ...s };
      for (const k of ['name', 'url', 'description']) {
        if (typeof delta[k] === 'string' && delta[k].trim()) updated[k] = delta[k].trim();
      }
      for (const k of ['needs', 'topics', 'moods', 'tags']) {
        if (Array.isArray(delta[k])) updated.criteria && k !== 'tags' ? (updated.criteria[k] = delta[k]) : (updated[k] = delta[k]);
        if (k === 'tags' && Array.isArray(delta[k])) updated.tags = delta[k];
      }
      updates.push(updated);
    } catch (_) {
      // skip on error
    }
  }
  if (updates.length > 0) {
    // 直接 core.json を更新（IDでマージ）
    const coreFile = path.join(servicesDir, 'core.json');
    const coreList = fs.existsSync(coreFile) ? JSON.parse(fs.readFileSync(coreFile, 'utf8')) : [];
    const idTo = new Map();
    for (const e of coreList) idTo.set(e.id, e);
    for (const u of updates) idTo.set(u.id, u);
    writeJsonAtomic(coreFile, Array.from(idTo.values()));
  }
}

module.exports = {
  runDiscoveryOnce
};

// --------- Security helpers (SSRF guard) ---------
function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(n => parseInt(n, 10));
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function isLocalHostname(host) {
  const h = host.toLowerCase();
  return h === 'localhost' || h.endsWith('.local');
}

async function isSafePublicURL(inputUrl) {
  try {
    const u = new URL(inputUrl);
    if (u.protocol !== 'https:') return false;
    if (isLocalHostname(u.hostname)) return false;
    const res = await dns.lookup(u.hostname, { all: true });
    for (const a of res) {
      const addr = a.address;
      if (addr.includes(':')) {
        // IPv6: block loopback and link-local prefixes
        if (addr === '::1' || addr.toLowerCase().startsWith('fe80:')) return false;
      } else {
        if (isPrivateIpv4(addr)) return false;
      }
    }
    return true;
  } catch (_) {
    return false;
  }
}


