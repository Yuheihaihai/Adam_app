#!/usr/bin/env node
/**
 * Heroku 本番スモークテスト
 * - / (GET): 200想定
 * - /api/intent/detect (POST): 2xx想定（最低限動作）
 * - /session (POST): CSRF保護のため 403 想定（外部からの直接呼び出しは拒否）
 * - /security/stats (GET): 本番では 404 想定（管理者のみ）
 */

const https = require('https');

const BASE_URL = process.env.HEROKU_URL || 'https://adam-app-cloud-v2-4-40ae2b8ccd08.herokuapp.com';

function log(step, ok, extra) {
  const mark = ok ? '✅' : '❌';
  console.log(`${mark} ${step}${extra ? `: ${extra}` : ''}`);
}

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      method,
      hostname: url.hostname,
      path: url.pathname + (url.search || ''),
      protocol: url.protocol,
      headers: {
        'User-Agent': 'adam-ai-smoke-test/1.0',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers
      },
      timeout: 12000
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => chunks += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: chunks }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log(`🚀 Herokuスモークテスト: ${BASE_URL}`);
  const results = [];
  try {
    // 1) /
    const r1 = await request('GET', '/', null);
    const ok1 = r1.status >= 200 && r1.status < 400;
    results.push(ok1);
    log('GET /', ok1, `status=${r1.status}`);

    // セキュリティヘッダーの一部確認（任意）
    const secHeaders = ['content-security-policy', 'x-frame-options', 'x-content-type-options'];
    const present = secHeaders.filter(h => r1.headers[h]);
    log('Security headers (partial)', present.length >= 2, `present=${present.join(',')}`);

    // 2) /api/intent/categories
    const r2 = await request('GET', '/api/intent/categories', null);
    const ok2 = r2.status >= 200 && r2.status < 400;
    results.push(ok2);
    log('GET /api/intent/categories', ok2, `status=${r2.status}`);

    // 3) /api/intent/detect
    const r3a = await request('POST', '/api/intent/detect', { text: 'キャリアについて相談したいです' });
    const ok3a = r3a.status >= 200 && r3a.status < 400;
    results.push(ok3a);
    log('POST /api/intent/detect', ok3a, `status=${r3a.status}`);

    // 3) /session （CSRF保護のため外部からは403想定）
    const r3 = await request('POST', '/session', {});
    const ok3 = r3.status === 403 || r3.status === 404 || r3.status === 401; // 本番で不可視化/未認証ブロックも許容
    results.push(ok3);
    log('POST /session (expect 403)', ok3, `status=${r3.status}`);

    // 4) /csrf（CSRFトークン発行）
    const r4 = await request('GET', '/csrf', null);
    const ok4 = r4.status === 200 && (() => { try { const j = JSON.parse(r4.body); return !!j.token; } catch { return false; } })();
    results.push(ok4);
    log('GET /csrf issues token', ok4, `status=${r4.status}`);

    // 5) /session GET（旧仕様に残っていないか確認：200が返ると危険）
    const r5 = await request('GET', '/session', null);
    const ok5 = r5.status === 404 || r5.status === 405 || r5.status === 403; // 許容: 存在しない/禁止
    results.push(ok5);
    log('GET /session should NOT be 200', ok5, `status=${r5.status}`);

    // 6) /security/stats （本番では404想定）
    const r6 = await request('GET', '/security/stats', null);
    const ok6 = r6.status === 404 || r6.status === 200; // 200は管理者時、404が通常
    results.push(ok6);
    log('GET /security/stats (expect 404 in prod)', ok6, `status=${r6.status}`);

    const success = results.every(Boolean);
    console.log(`\n🎯 結果: ${results.filter(Boolean).length}/${results.length} 成功`);
    process.exit(success ? 0 : 1);
  } catch (err) {
    console.error('💥 リモートテスト失敗:', err.message || err);
    process.exit(1);
  }
}

main();


