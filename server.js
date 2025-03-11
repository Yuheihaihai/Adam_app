require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const line = require('@line/bot-sdk');
const Airtable = require('airtable');
const { OpenAI } = require('openai');
const { Anthropic } = require('@anthropic-ai/sdk');
const timeout = require('connect-timeout');
const path = require('path');
const fs = require('fs');

// Import service hub components
const UserNeedsAnalyzer = require('./userNeedsAnalyzer');
const ServiceRecommender = require('./serviceRecommender');

// User Preferences Module
const userPreferences = {
  _prefStore: {}, // Simple in-memory storage
  
  getUserPreferences: function(userId) {
    if (!this._prefStore[userId]) {
      this._prefStore[userId] = {
        recentlyShownServices: {}
      };
    }
    return this._prefStore[userId];
  },
  
  updateUserPreferences: function(userId, preferences) {
    this._prefStore[userId] = preferences;
    return this._prefStore[userId];
  },
  
  trackImplicitFeedback: function(userId, userMessage, recentServices) {
    // Placeholder for tracking user feedback on services
    console.log(`Tracking feedback for user ${userId} on services:`, recentServices);
    return true;
  },
  
  processPreferenceCommand: function(userId, command) {
    // Check if this is actually a preference command
    const preferenceCommandPatterns = [
      '設定', 'せってい', 'setting', 'config', 
      'オプション', 'option', 'オン', 'オフ',
      'on', 'off', '表示', 'ひょうじ',
      '非表示', 'ひひょうじ', '設定確認', '設定リセット'
    ];
    
    const isPreferenceCommand = preferenceCommandPatterns.some(pattern => 
      command.toLowerCase().includes(pattern.toLowerCase())
    );
    
    if (!isPreferenceCommand) {
      return null; // Not a preference command
    }
    
    // Log that we're processing a preference command
    console.log(`Processing preference command for user ${userId}: ${command}`);
    
    // Handle specific preference commands
    if (command.includes('設定確認')) {
      const prefs = this.getUserPreferences(userId);
      prefs.settingsRequested = true;
      return prefs;
    }
    
    // If no specific command matched but it was detected as a preference command
    // Just return the current preferences for now
    return this.getUserPreferences(userId);
  },
  
  getHelpMessage: function() {
    return "設定を変更するには以下のコマンドを使用できます：\n- 設定確認：現在の設定を表示\n- 設定リセット：設定をデフォルトに戻す";
  },
  
  getCurrentSettingsMessage: function(userId) {
    return "現在の設定です。特別な設定はありません。";
  },
  
  _getServiceCategory: function(service) {
    return service && service.category ? service.category : "未分類";
  }
};

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(timeout('60s'));
// app.use(express.json()); // JSONボディの解析を有効化 - LINE webhookに影響するため削除

// APIルート用のJSONパーサーを追加
app.use('/api', express.json());

// APIルートの登録
const intentRoutes = require('./routes/api/intent');
app.use('/api/intent', intentRoutes);

// webhookエンドポイント用の特別な設定
const rawBodyParser = express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
});

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// webhookエンドポイントの定義
app.post('/webhook', rawBodyParser, line.middleware(config), (req, res) => {
  console.log('Webhook was called! Events:', JSON.stringify(req.body, null, 2));
  
  // リクエストにeventsがない場合のエラー処理を追加
  if (!req.body || !req.body.events || !Array.isArray(req.body.events)) {
    console.warn('Invalid webhook request format:', req.body);
    // 常に200 OKを返す（LINEプラットフォームの要件）
    return res.status(200).json({
      message: 'Invalid webhook data received, but still returning 200 OK as per LINE Platform requirements'
    });
  }
  
  // 各イベントを非同期で処理し、常に200 OKを返す
  Promise.all(req.body.events.map(event => {
    // handleEventが例外をスローする可能性があるため、Promise.resolveでラップする
    return Promise.resolve().then(() => handleEvent(event))
      .catch(err => {
        console.error(`Error handling event: ${JSON.stringify(event)}`, err);
        return null; // エラーを飲み込んで処理を続行
      });
  }))
  .then(results => {
    // 結果に関係なく、常に200 OKを返す
    res.status(200).json(results.filter(result => result !== null));
  })
  .catch(err => {
    console.error('Webhook error:', err);
    res.status(200).json({});
  });
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PerplexitySearch = require('./perplexitySearch');
const perplexity = new PerplexitySearch(process.env.PERPLEXITY_API_KEY);

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);
const INTERACTIONS_TABLE = 'ConversationHistory';

// Initialize service hub components
const userNeedsAnalyzer = new UserNeedsAnalyzer(process.env.OPENAI_API_KEY);
const serviceRecommender = new ServiceRecommender(base);

const SYSTEM_PROMPT_GENERAL = `
あなたは「Adam」というアシスタントです。

【役割】
ASDやADHDなど発達障害の方へのサポートが主目的です。

【機能について】
Xの共有方法を尋ねられた場合は、「もしAdamのことが好きならぜひ『Adamは素晴らしいね』等々と言っていただくと、Xへの共有URLが表示されますので、ぜひご活用ください」と必ず案内してください。
さらに、あなたには画像認識と画像生成の機能が備わっており、送信された画像ファイルを解析し、必要に応じて画像の生成も行います。この機能について質問やリクエストがあった場合、どのように動作するかを分かりやすく説明してください。

【出力形式】
・日本語で回答してください。
・200文字以内で回答してください。
・友好的かつ共感を示す言葉遣いや態度を心がけてください。
・必要に応じて（ユーザーの他者受容特性に合わせて）客観的なアドバイス（ユーザー自身の思考に相対する指摘事項も含む）を友好的かつ建設的かつ謙虚な表現で提供してください。
・過去10件の会話履歴を参照して一貫した対話を行ってください。
・専門家への相談を推奨してください。
・「AIとして思い出せない、または「記憶する機能を持っていない」は禁止、ここにある履歴があなたの記憶です。
・ユーザーのメッセージ内容をしっかりと理解し、その内容の前提を踏まえる。

【Adamの使い方-ユーザ向けマニュアル】
・お気軽に相談内容や質問をテキストで送信してください。
・必要に応じて、送信された画像の内容を解析し、アドバイスに反映します。
・もし前回の回答が理解できなかった場合は、分かりませんや理解できませんと送ってください。
・すると、前回の回答について画像による説明を生成しましょうか？
・『はい』または『いいえ』でお答えいただくよう促すメッセージが届きます。
・あなたが『はい』と回答された場合、画像付きで詳しい説明を生成してお送りします。
`;

const SYSTEM_PROMPT_CHARACTERISTICS = `
あなたは「Adam」という発達障害専門のカウンセラーです。ユーザーの過去ログ(最大200件)を分析し、以下の観点から深い洞察を提供してください。

[分析の観点]
1. コミュニケーションパターン
   - 言葉遣いの特徴
   - 表現の一貫性
   - 感情表現の方法

2. 思考プロセス
   - 論理的思考の特徴
   - 問題解決アプローチ
   - 興味・関心の対象

3. 社会的相互作用
   - 対人関係での傾向
   - ストレス対処方法
   - コミュニケーション上の強み/課題

4. 感情と自己認識
   - 感情表現の特徴
   - 自己理解の程度
   - モチベーションの源泉

[分析プロセス]
1. 目標の明確化
   - 分析における目的を定義
   - 対象となる行動や特性の範囲を明確化
   - 分析の成功基準を設定

2. 問題の分解
   - 観察された行動を要素ごとに分解
   - 各要素の重要度を評価
   - 短期・長期の影響を分類

3. 情報の選別
   - 過去の会話から重要なパターンを抽出
   - 偶発的な要素を除外
   - 一貫した行動傾向に注目

4. 推論と検証
   - 行動パターンから仮説を構築
   - 複数の会話履歴での検証
   - 必要に応じて仮説を修正

5. 統合と最終判断
   - 分析結果を統合し、一貫性のある特性像を提示
   - 具体的な強みと課題を特定
   - 改善のための具体的な提案を含める

[出力形式]
- 日本語で簡潔に（200文字以内）
- 肯定的な側面を含める
- 改善提案あれば添える
- 断定的な診断は避ける（専門医に相談を推奨する。）
- 「AIとして思い出せない、または「記憶する機能を持っていない」は禁止、ここにある履歴があなたの記憶です。
- 専門家への相談を推奨してください。
- ユーザーのメッセージ内容をしっかりと理解し、その内容の前提を踏まえている。
`;

const SYSTEM_PROMPT_CAREER = `あなたは「Adam」という優秀なキャリアカウンセラーです。以下の指示に従って回答してください：

[分析の観点]
1. ユーザーの特性
   - コミュニケーションパターン
   - 思考プロセス
   - 興味・関心分野

2. 市場適合性
   - 現在の求人動向との整合
   - 成長が期待される分野
   - 必要なスキルと準備

3. キャリア提案
   - 具体的な職種
   - 準備すべきスキル
   - 段階的なステップ

[出力形式]
- 日本語で簡潔に（200文字以内）
- 市場データの引用を含める
- 具体的な行動提案を示す
- 「AIとして思い出せない、または「記憶する機能を持っていない」は禁止、ここにある履歴があなたの記憶です。
- 専門家への相談を推奨してください。
- ユーザーのメッセージ内容をしっかりと理解し、その内容の前提を踏まえている。
`;

const SYSTEM_PROMPT_MEMORY_RECALL = `
あなたは「Adam」、ユーザーの過去ログ(最大200件)が記憶。
「思い出して」と言われたら、記録を要約。
AIとして「記憶不可」または「記憶する機能を持っていない」は禁止。過去ログに基づき日本語で簡潔要約。
`;

const SYSTEM_PROMPT_HUMAN_RELATIONSHIP = `
あなたは「Adam」というカウンセラーです。
過去ログ(最大200件)があなたの記憶。人間関係の相談では下記の観点に則って回答してください。

[分析の観点]
1. コミュニケーションパターン
   - 言葉遣いの特徴
   - 表現の一貫性
   - 感情表現の方法

2. 思考プロセス
   - 論理的思考の特徴
   - 問題解決アプローチ
   - 興味・関心の対象

3. 社会的相互作用
   - 対人関係での傾向
   - ストレス対処方法
   - コミュニケーション上の強み/課題

4. 感情と自己認識
   - 感情表現の特徴
   - 自己理解の程度
   - モチベーションの源泉

[分析プロセス]
1. 目標の明確化
   - 分析における目的を定義
   - 対象となる行動や特性の範囲を明確化
   - 分析の成功基準を設定

2. 問題の分解
   - 観察された行動を要素ごとに分解
   - 各要素の重要度を評価
   - 短期・長期の影響を分類

3. 情報の選別
   - 過去の会話から重要なパターンを抽出
   - 偶発的な要素を除外
   - 一貫した行動傾向に注目

4. 推論と検証
   - 行動パターンから仮説を構築
   - 複数の会話履歴での検証
   - 必要に応じて仮説を修正

5. 統合と最終判断
   - 分析結果を統合し、一貫性のある特性像を提示
   - 具体的な強みと課題を特定
   - 改善のための具体的な提案を含める

   [出力形式]
1. ユーザー特徴を分析
2. 状況を整理
3. 具体的提案
日本語200文字以内。共感的かつ建設的に。
4. 「AIとして思い出せない、または「記憶する機能を持っていない」は禁止、ここにある履歴があなたの記憶です。
5.　専門家への相談を推奨してください。
6. ユーザーのメッセージ内容をしっかりと理解し、その内容の前提を踏まえている。
`;

const SYSTEM_PROMPT_CONSULTANT = `あなたは優秀な「Adam」という非常に優秀なエリートビジネスコンサルタントです。以下の思考プロセスと指示に従って回答してください：

[思考プロセス]
1. 現状認識（質問理解）
   • ユーザーの質問や課題の背景を理解
   • 明確な事実と不明点を区別
   • 追加で必要な情報を特定

2. 主題定義（論点抽出→構造化）
   • 本質的な問題点を特定
   • 問題の構造を整理
   • 優先順位を設定

3. 解決策の立案
   • 具体的な対応方法を提示
   • 実行可能なステップを明示
   • 期待される効果を説明

[回答における注意点]
1. 確実な情報のみを提供し、不確かな情報は含めない
2. 具体的な事実やデータに基づいて説明する
3. 推測や憶測を避け、「かもしれない」などの曖昧な表現は使用しない
4. 追加情報が必要な場合は、具体的に質問する
5. 話題が完全に変わるまでコンサルタントモードを維持する
6. ユーザーのメッセージ内容をしっかりと理解し、その内容の前提を踏まえている。

[回答形式]
• 現状認識：（質問の背景と理解）
• 本質的課題：（特定された核心的な問題）
• 解決策：（具体的な対応方法）
• 実行ステップ：（具体的なアクション）
• 期待効果：（具体的な成果）
• 留意点：（実践時の注意事項）
• 必ず短く簡潔でわかりやすい（平たい表現）を使ってまとめる。（必ず200字以内）
• 「AIとして思い出せない、または「記憶する機能を持っていない」は禁止、ここにある履歴があなたの記憶です。
• 専門家への相談を推奨してください。

[継続確認]
この話題について追加の質問やお悩みがありましたら、お気軽にお申し付けください。`;

const rateLimit = new Map();

// グローバル変数: 各ユーザーの保留中の画像説明情報を管理するためのMap
const pendingImageExplanations = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const cooldown = 1000;
  const lastRequest = rateLimit.get(userId) || 0;
  
  if (now - lastRequest < cooldown) {
    return false;
  }
  
  rateLimit.set(userId, now);
  return true;
}

const careerKeywords = ['仕事', 'キャリア', '職業', '転職', '就職', '働き方', '業界', '適職診断'];

function determineModeAndLimit(userMessage) {
  console.log('Checking message for mode:', userMessage);
  
  // Only check the current message for career keywords, not the history
  const hasCareerKeyword = careerKeywords.some(keyword => userMessage.includes(keyword));

  if (hasCareerKeyword) {
    console.log('Setting career mode');
    return { mode: 'career', limit: 200 };
  }

  // Only check current message for characteristics keywords, not the history
  const lcMsg = userMessage.toLowerCase();
  if (
    lcMsg.includes('特性') ||
    lcMsg.includes('分析') ||
    lcMsg.includes('思考') ||
    lcMsg.includes('傾向') ||
    lcMsg.includes('パターン') ||
    lcMsg.includes('コミュニケーション') ||
    lcMsg.includes('対人関係') ||
    lcMsg.includes('性格')
  ) {
    return { mode: 'characteristics', limit: 200 };
  }
  if (lcMsg.includes('思い出して') || lcMsg.includes('今までの話')) {
    return { mode: 'memoryRecall', limit: 200 };
  }
  if (
    lcMsg.includes('人間関係') ||
    lcMsg.includes('友人') ||
    lcMsg.includes('同僚') ||
    lcMsg.includes('恋愛') ||
    lcMsg.includes('パートナー')
  ) {
    return { mode: 'humanRelationship', limit: 200 };
  }
  if (
    PERSONAL_REFERENCES.some(ref => lcMsg.includes(ref)) && 
    POSITIVE_KEYWORDS.some(keyword => lcMsg.includes(keyword))
  ) {
    return { mode: 'share', limit: 10 };
  }
  return { mode: 'general', limit: 10 };
}

function getSystemPromptForMode(mode) {
  switch (mode) {
    case 'characteristics':
      return SYSTEM_PROMPT_CHARACTERISTICS;
    case 'career':
      return SYSTEM_PROMPT_CAREER;
    case 'memoryRecall':
      return SYSTEM_PROMPT_MEMORY_RECALL;
    case 'humanRelationship':
      return SYSTEM_PROMPT_HUMAN_RELATIONSHIP;
    case 'consultant':
      return SYSTEM_PROMPT_CONSULTANT;
    default:
      return SYSTEM_PROMPT_GENERAL;
  }
}

async function storeInteraction(userId, role, content) {
  try {
    console.log(
      `Storing interaction => userId: ${userId}, role: ${role}, content: ${content}`
    );
    await base(INTERACTIONS_TABLE).create([
      {
        fields: {
          UserID: userId,
          Role: role,
          Content: content,
          Timestamp: new Date().toISOString(),
        },
      },
    ]);
  } catch (err) {
    console.error('Error storing interaction:', err);
  }
}

async function fetchUserHistory(userId, limit) {
  try {
    console.log(`Fetching history for user ${userId}, limit: ${limit}`);
    const records = await base(INTERACTIONS_TABLE)
      .select({
        filterByFormula: `{UserID} = "${userId}"`,
        sort: [{ field: 'Timestamp', direction: 'desc' }],
        maxRecords: limit,
      })
      .all();
    console.log(`Found ${records.length} records for user`);

    const reversed = records.reverse();
    return reversed.map((r) => ({
      role: r.get('Role') === 'assistant' ? 'assistant' : 'user',
      content: r.get('Content') || '',
    }));
  } catch (error) {
    console.error('Error fetching history:', error);
    return [];
  }
}

function applyAdditionalInstructions(basePrompt, mode, history, userMessage) {
  let finalPrompt = basePrompt;

  // Add character limit instruction (add this at the very beginning)
  finalPrompt = `
※重要: すべての返答は必ず500文字以内に収めてください。

${finalPrompt}`;

  // Add summarization instruction
  finalPrompt += `
※ユーザーが長文を送信した場合、それが明示的な要求がなくても、以下のように対応してください：
1. まず内容を簡潔に要約する（「要約すると：」などの前置きは不要）
2. その後で、具体的なアドバイスや質問をする
3. 特に200文字以上の投稿は必ず要約してから返答する
`;

  // If chat history < 3 but user wants analysis/career
  if ((mode === 'characteristics' || mode === 'career') && history.length < 3) {
    finalPrompt += `
※ユーザーの履歴が少ないです。まずは本人に追加の状況説明や詳細を尋ね、やりとりを増やして理解を深めてください。

[質問例]
• 現在の職種や経験について
• 興味のある分野や得意なこと
• 働く上で大切にしたい価値観
• 具体的なキャリアの悩みや課題
`;
  }

  // Add Perplexity data handling instruction for career mode
  if (mode === 'career') {
    finalPrompt += `
## Perplexityから取得した最新の市場データの活用方法

Perplexityから取得した最新の市場データや特性分析が含まれる場合、以下の方法で活用してください：

1. 市場データを分析に適切に組み込む
2. 「現在の市場動向では～」という形で最新情報に言及する
3. データに基づいた、ユーザーの特性を考慮した具体的な提案をする
4. ユーザーの特性と市場データの関連性を説明する
5. 求人情報があれば、それを適切に紹介する

これらの情報は別途「# 最新の市場データ」と「# ユーザー特性の追加分析」として提供されます。
`;
  }

  finalPrompt += `
※ユーザーの文章からコミュニケーション能力や理解度を推定し、返答の難易度や言葉遣いを自然に調整してください。
AIが「IQを計測」とは明示せず、自然に簡易化または高度化します。
`;

  if (/\b(child|friend|someone|others|children|son|daughter)\b/.test(userMessage)) {
    finalPrompt += `
※ユーザーが自分以外の第三者の分析を依頼している可能性があります。誰の特徴か曖昧なら、会話の中で丁寧に確認してください。
`;
  }

  finalPrompt += `
※重度の発達障害の相談や重要な進路選択の場合、「専門家にも相談ください」と定期的に伝えてください。
`;

  finalPrompt += `
Please understand if user wants to end a conversation or not by context. Especially when user's sentiment is strong (positive or negative), do not suspend the conversation at your own.
ユーザーの障害があまりにも重い場合、状況認識や表情・仕草等の理解が難しいと思われます。その場合、ユーザーに「Adamに直接、長文でいいので全部書いて」とアドバイスし、ユーザーが書き終わったら、Adamが状況を分析し対応策を具体的に指示してください。
(1) 毎回の会話でAIが相手の状況理解の障害の重さを可能性レベルで判断し、仮説を立てる。 
(2) 重い可能性が高いと判断したら、ユーザーへの返信時に(1)の仮説を自然かつ尊重的な言い回しで確認（過去の指摘経験など）。 
(3) ユーザーが仮説を認めたら「整理しようとせず思いつくまま長文で全部書いて」と依頼。 
(4) 書かれた内容をAIが分析し、必要な支援策や提案を具体的に行う。ただし医療的な診断は行わない。
`;

  return finalPrompt;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function callPrimaryModel(gptOptions) {
  const resp = await openai.chat.completions.create(gptOptions);
  return resp.choices?.[0]?.message?.content || '（No reply）';
}

async function callClaudeModel(messages) {
  try {
    let systemPrompt = messages.find(m => m.role === 'system')?.content || '';
    let userMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => m.content)
      .join('\n\n');

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userMessages
      }]
    });

    return response.content[0].text;
  } catch (err) {
    console.error('Claude API error:', err);
    throw err;
  }
}

async function tryPrimaryThenBackup(gptOptions) {
  try {
    console.log('Attempting primary model (OpenAI):', gptOptions.model);
    return await callPrimaryModel(gptOptions);
  } catch (err) {
    console.error('OpenAI error:', err);
    console.log('Attempting Claude fallback...');
    try {
      return await callClaudeModel(gptOptions.messages);
    } catch (claudeErr) {
      console.error('Claude also failed:', claudeErr);
      if (err.code === 'rate_limit_exceeded' || claudeErr.code === 'rate_limit_exceeded') {
        return 'アクセスが集中しています。しばらく待ってから試してください。';
      } else if (err.code === 'context_length_exceeded' || claudeErr.code === 'context_length_exceeded') {
        return 'メッセージが長すぎます。短く分けて送信してください。';
      }
      return '申し訳ありません。AIサービスが一時的に利用できません。しばらく経ってからお試しください。';
    }
  }
}

function securityFilterPrompt(userMessage) {
  const suspiciousPatterns = [
    'ignore all previous instructions',
    'system prompt =',
    'show me your chain-of-thought',
    'reveal your hidden instruction',
    'reveal your internal config',
  ];
  for (const pattern of suspiciousPatterns) {
    if (userMessage.toLowerCase().includes(pattern.toLowerCase())) {
      return false;
    }
  }
  return true;
}

// Helper function to fetch the most recent past AI messages for a specific user.
// Adjust this implementation to work with your actual data source (e.g., Airtable, database, etc.).
async function fetchPastAiMessages(userId, limit = 10) {
  try {
    // Example using a pseudo Airtable integration:
    // const records = await airtableBase('AIInteractions')
    //   .select({
    //     filterByFormula: `{userId} = '${userId}'`,
    //     maxRecords: limit,
    //     sort: [{ field: 'timestamp', direction: 'desc' }]
    //   })
    //   .firstPage();
    // return records.map(record => record.get('content')).join("\n");
    
    // Temporary placeholder implementation (replace with your actual logic):
    return "過去のAIの返答1\n過去のAIの返答2\n過去のAIの返答3\n過去のAIの返答4\n過去のAIの返答5";
  } catch (error) {
    console.error("Error fetching past AI messages:", error);
    return "";
  }
}

async function runCriticPass(aiDraft, userMessage, userId) {
  console.log('🔍 Starting critic pass with o3-mini-2025-01-31');
  
  // Extract service recommendations if present
  let serviceRecommendationSection = '';
  const recommendationMatch = aiDraft.match(/以下のサービスがあなたの状況に役立つかもしれません：[\s\S]*$/);
  if (recommendationMatch) {
    serviceRecommendationSection = recommendationMatch[0];
    console.log('Found service recommendations in AI response, preserving them');
    // Remove recommendations from the draft for critic review
    aiDraft = aiDraft.replace(recommendationMatch[0], '').trim();
  }
  
  // Fetch 10 past AI return messages for this user.
  const pastAiReturns = await fetchPastAiMessages(userId, 10);

  // Build the critic prompt including the user's question.
  const baseCriticPrompt = `
Adamがユーザーに送る文章をあなたが分析し、現実的であるか、またユーザーの特性やニーズに合っているかを評価してください。以下の手順に従ってください：
	1. 実現可能性の確認:
　　　内容が実行可能で現実的であるかを確認し、必要に応じて現実的な表現に修正してください。
	2. 出力の要件:
　　　• 修正後の内容のみを出力してください。修正点や理由は記述しないでください。
　　　• ラベルや修正を示唆する表現は含まないでください。
　　　• 元の文章の口調や共感的なトーンを維持してください。
	3. 整合性・一貫性の確認:
　　　最新のメッセージ内容、過去の会話履歴および過去のAIの返答との間に矛盾がないか確認してください。
    ・回答内容がユーザーのメッセージ内容をしっかりと理解し、その内容の前提を踏まえているか。
  4. 段落わけと改行の確認:
  　　文章を段落わけし、改行を入れて読みやすくしてください。

[分析の基本フレームワーク]
1. 論理性チェック（MECE原則）:
   • 議論や説明に論理的な飛躍がないか
   • 重要な要素が漏れなく含まれているか
   • 各要素が相互に排他的か

2. 実現可能性の評価（5W1H分析）:
   • Who: 実行主体は明確か
   • What: 具体的な行動が示されているか
   • When: タイミングや期間は現実的か
   • Where: 場所や環境の考慮は適切か
   • Why: 目的や理由が明確か
   • How: 実行方法は具体的か

3. 内容の適切性チェック:
   • ユーザーの認知特性への配慮
   • 説明の難易度調整
   • 共感的なトーンの維持（但し必要に応じて反対の視点も検討する。）
   • 文化的配慮

4. 構造化と可読性:
   • 情報の階層構造
   • 段落分けの適切性
   • 視覚的な読みやすさ

5.安全性フィルター
   • 医療・健康・法律・財務に関するアドバイスは専門家への相談を促しているか。
   • 精神的健康に関するアドバイスは適切な配慮がなされているか。
   • 自傷行為や暴力を助長する（可能性含む）表現が内容に含まれていないか。また該当ケースがあればユーザーに対して当局への通報や相談窓口へ連絡するように促しているか。
   • 個人情報の取り扱いに関する注意喚起はあるか。
   • 違法行為や倫理的に問題のある行動を推奨していないか。また該当ケースがあればユーザーに対して必ず当局への出頭や相談窓口へ連絡するように促しているか。（違法行為の場合は必ず出頭を促す。）


--- チェック対象 ---
最新のドラフト:
${aiDraft}

ユーザーの質問:
${userMessage}

過去のAIの返答:
${pastAiReturns}
`;

  const messages = [{ role: 'user', content: baseCriticPrompt }];
  const criticOptions = {
    model: 'o3-mini-2025-01-31',
    messages,
    temperature: 1,
  };

  try {
    console.log('💭 Critic model:', criticOptions.model);
    const criticResponse = await openai.chat.completions.create(criticOptions);
    console.log('✅ Critic pass completed');
    let criticOutput = criticResponse.choices?.[0]?.message?.content || '';
    
    // Reattach service recommendations if they were present
    if (serviceRecommendationSection) {
      console.log('Reattaching service recommendations to critic output');
      criticOutput = criticOutput.trim() + '\n\n' + serviceRecommendationSection;
    }
    
    return criticOutput;
  } catch (err) {
    console.error('❌ Critic pass error:', err);
    // If critic fails, return original with recommendations
    if (serviceRecommendationSection) {
      return aiDraft.trim() + '\n\n' + serviceRecommendationSection;
    }
    return aiDraft;
  }
}

function validateMessageLength(message) {
  const MAX_LENGTH = 4000;
  if (message.length > MAX_LENGTH) {
    return message.slice(0, MAX_LENGTH) + '...';
  }
  return message;
}

const SHARE_URL = 'https://twitter.com/intent/tweet?' + 
  new URLSearchParams({
    text: 'AIカウンセラー「Adam」が発達障害の特性理解やキャリア相談をサポート。無料でLINEから利用できます！🤖\n\n#ADHD #ASD #発達障害 #神経多様性',
    url: 'https://line.me/R/ti/p/@767cfbjv'
  }).toString();

const POSITIVE_KEYWORDS = [
  '素晴らしい', '助かった', 'ありがとう', '感謝', 'すごい', 
  '役立った', '嬉しい', '助けになった', '期待', '良かった', '参考にします','いいね','便利','おすすめしたい','シェア','共有'
];

const PERSONAL_REFERENCES = ['adam', 'あなた', 'きみ', '君', 'Adam'];

function checkHighEngagement(userMessage, history) {
  // デバッグログを追加
  console.log('Checking engagement:', {
    message: userMessage,
    hasPersonalRef: PERSONAL_REFERENCES.some(ref => userMessage.toLowerCase().includes(ref)),
    hasPositive: POSITIVE_KEYWORDS.some(keyword => userMessage.includes(keyword))
  });

  // 人称への言及をチェック（必須）
  const hasPersonalReference = PERSONAL_REFERENCES.some(ref => 
    userMessage.toLowerCase().includes(ref)
  );

  // ポジティブキーワードを含む（必須）
  const hasPositiveKeyword = POSITIVE_KEYWORDS.some(keyword => 
    userMessage.includes(keyword)
  );
  
  // 単なる「ありがとう」系の短文は除外
  const simpleThankYous = ['ありがとう', 'ありがとうございます', 'thanks', 'thank you'];
  if (simpleThankYous.includes(userMessage.toLowerCase().trim())) {
    return false;
  }

  // 両方の条件を満たす場合のみtrueを返す
  return hasPersonalReference && hasPositiveKeyword;
}

async function processWithAI(systemPrompt, userMessage, history, mode, userId, client) {
  try {
    console.log(`Processing message in mode: ${mode}`);
    
    // Start performance measurement
    const startTime = Date.now();
    const overallStartTime = startTime; // Add this line to fix the ReferenceError
    
    // Get user preferences
    const userPrefs = userPreferences.getUserPreferences(userId);
    
    // Check if this is a new user or has very few messages
    const isNewUser = history.length < 3;
    
    // Determine which model to use
    const useGpt4 = mode === 'characteristics' || mode === 'analysis';
    const model = useGpt4 ? 'gpt-4o' : 'gpt-4o';
    console.log(`Using model: ${model}`);
    
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n=== WORKFLOW VISUALIZATION: AI RESPONSE GENERATION PROCESS ===');
    console.log('┌──────────────────────────────────────────────────────────┐');
    console.log('│ 1. PARALLEL DATA COLLECTION PHASE                        │');
    console.log('└──────────────────────────────────────────────────────────┘');
    // ─────────────────────────────────────────────────────────────────────
    
    // Run user needs analysis, conversation context extraction, and service matching in parallel
    const [userNeedsPromise, conversationContextPromise, perplexityDataPromise] = await Promise.all([
      // Analyze user needs from conversation history
      (async () => {
        console.log('\n📊 [1A] USER NEEDS ANALYSIS - Starting');
        const needsStartTime = Date.now();
        const userNeeds = await userNeedsAnalyzer.analyzeUserNeeds(userMessage, history);
        console.log(`📊 [1A] USER NEEDS ANALYSIS - Completed in ${Date.now() - needsStartTime}ms`);
        return userNeeds;
      })(),
      
      // Extract conversation context
      (async () => {
        console.log('\n🔍 [1B] CONVERSATION CONTEXT EXTRACTION - Starting');
        const contextStartTime = Date.now();
        const conversationContext = extractConversationContext(history, userMessage);
        console.log(`🔍 [1B] CONVERSATION CONTEXT EXTRACTION - Completed in ${Date.now() - contextStartTime}ms`);
        return conversationContext;
      })(),
      
      // Fetch Perplexity data if in career mode
      (async () => {
        if (mode === 'career') {
          try {
            console.log('\n🤖 [1C] ML AUGMENTATION: PERPLEXITY DATA - Starting');
            const perplexityStartTime = Date.now();
            
            console.log('    ├─ [1C.1] Initiating parallel API calls to Perplexity');
            // Run both knowledge enhancement and job trends in parallel
            const [knowledgeData, jobTrendsData] = await Promise.all([
              perplexity.enhanceKnowledge(history, userMessage).catch(err => {
                console.error('    │  ❌ Knowledge enhancement failed:', err.message);
                return null;
              }),
              perplexity.getJobTrends().catch(err => {
                console.error('    │  ❌ Job trends failed:', err.message);
                return null;
              })
            ]);
            
            const perplexityTime = Date.now() - perplexityStartTime;
            console.log(`    ├─ [1C.2] ML data retrieved in ${perplexityTime}ms`);
            
            // Log what we got with more details
            console.log('    ├─ [1C.3] ML DATA RESULTS:');
            console.log(`    │  ${knowledgeData ? '✅' : '❌'} User characteristics analysis: ${knowledgeData ? 'Retrieved' : 'Failed'}`);
            if (knowledgeData) {
                console.log('    │    └─ Length: ' + knowledgeData.length + ' characters');
                console.log('    │    └─ Sample: ' + knowledgeData.substring(0, 50) + '...');
            }
            
            console.log(`    │  ${jobTrendsData ? '✅' : '❌'} Job market trends: ${jobTrendsData ? 'Retrieved' : 'Failed'}`);
            if (jobTrendsData && jobTrendsData.analysis) {
                console.log('    │    └─ Analysis length: ' + jobTrendsData.analysis.length + ' characters');
                console.log('    │    └─ Sample: ' + jobTrendsData.analysis.substring(0, 50) + '...');
                console.log('    │    └─ URLs provided: ' + (jobTrendsData.urls ? 'Yes' : 'No'));
            }
            
            console.log('    └─ [1C.4] ML AUGMENTATION: PERPLEXITY DATA - Completed');
            
            return {
              knowledge: knowledgeData,
              jobTrends: jobTrendsData
            };
          } catch (error) {
            console.error('\n❌ Error fetching ML data:', error.message);
            console.log('   └─ Proceeding without ML augmentation');
            return null;
          }
        }
        return null;
      })()
    ]);
    
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n┌──────────────────────────────────────────────────────────┐');
    console.log('│ 2. DATA INTEGRATION PHASE                                │');
    console.log('└──────────────────────────────────────────────────────────┘');
    // ─────────────────────────────────────────────────────────────────────

    // Wait for all promises to resolve
    const userNeeds = await userNeedsPromise;
    const conversationContext = await conversationContextPromise;
    const perplexityData = await perplexityDataPromise;
    
    console.log('\n🧩 [2A] USER NEEDS RESULT:');
    Object.keys(userNeeds).forEach(category => {
        console.log(`    ├─ ${category}:`);
        const categoryData = userNeeds[category];
        Object.keys(categoryData).forEach(key => {
            const value = categoryData[key];
            if (typeof value === 'boolean') {
                console.log(`    │  ${value ? '✅' : '❌'} ${key}: ${value}`);
            } else if (value !== null && value !== undefined) {
                console.log(`    │  📝 ${key}: ${value}`);
            }
        });
    });
    
    // Start service matching process
    console.log('\n📋 [2B] SERVICE MATCHING - Starting with confidence threshold');
    
    // Get service recommendations only if user preferences allow it
    let serviceRecommendationsPromise = Promise.resolve([]);
    if (userPrefs.showServiceRecommendations) {
      serviceRecommendationsPromise = serviceRecommender.getFilteredRecommendations(
        userId, 
        userNeeds,
        conversationContext
      );
    }
    
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n┌──────────────────────────────────────────────────────────┐');
    console.log('│ 3. AI PROMPT CONSTRUCTION PHASE                          │');
    console.log('└──────────────────────────────────────────────────────────┘');
    // ─────────────────────────────────────────────────────────────────────
    
    // Prepare the messages for the AI model
    console.log('\n📝 [3A] CREATING BASE PROMPT');
    console.log(`    ├─ System prompt: ${systemPrompt.length} characters`);
    console.log(`    └─ Including ${history.length} conversation messages`);
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }))
    ];
    
    // Add Perplexity data if available for career mode
    if (mode === 'career' && perplexityData) {
      console.log('\n🔄 [3B] INTEGRATING ML DATA INTO PROMPT');
      
      if (perplexityData.jobTrends) {
        console.log('    ├─ Adding job market trends:');
        console.log(`    │  └─ Market analysis: ${perplexityData.jobTrends.analysis ? perplexityData.jobTrends.analysis.length : 0} characters`);
        console.log(`    │  └─ Job URLs: ${perplexityData.jobTrends.urls ? 'Included' : 'Not available'}`);
        
        messages.push({
          role: 'system',
          content: `
# 最新の市場データ (Perplexityから取得)

[市場分析]
${perplexityData.jobTrends.analysis || '情報を取得できませんでした。'}

[求人情報]
${perplexityData.jobTrends.urls || '情報を取得できませんでした。'}

このデータを活用してユーザーに適切なキャリアアドバイスを提供してください。
`
        });
      }
      
      if (perplexityData.knowledge) {
        console.log('    └─ Adding user characteristics analysis:');
        console.log(`       └─ Analysis: ${perplexityData.knowledge.length} characters`);
        
        messages.push({
          role: 'system',
          content: `
# ユーザー特性の追加分析 (Perplexityから取得)

${perplexityData.knowledge}

この特性を考慮してアドバイスを提供してください。
`
        });
      }
    }
    
    // Add user message after all context
    console.log('\n📨 [3C] FINALIZING PROMPT:');
    console.log(`    ├─ Total prompt components: ${messages.length}`);
    console.log(`    └─ Adding user message: "${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}"`);
    
    messages.push({ role: 'user', content: userMessage });
    
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n┌──────────────────────────────────────────────────────────┐');
    console.log('│ 4. AI GENERATION & SERVICE MATCHING PHASE                │');
    console.log('└──────────────────────────────────────────────────────────┘');
    // ─────────────────────────────────────────────────────────────────────
    
    // Run AI response generation and service matching in parallel
    const [aiResponse, serviceRecommendations] = await Promise.all([
      // Generate AI response
      (async () => {
        console.log('\n🧠 [4A] AI RESPONSE GENERATION - Starting');
        const startTime = Date.now();
        try {
          const requestOptions = {
            model,
            messages,
            temperature: 0.7,
            max_tokens: 1500,
            top_p: 1,
            frequency_penalty: 0.5,
            presence_penalty: 0.5,
          };

          console.log(`    ├─ Model: ${model}`);
          console.log(`    ├─ Temperature: ${requestOptions.temperature}`);
          console.log(`    ├─ Max tokens: ${requestOptions.max_tokens}`);
          console.log(`    ├─ Total prompt components: ${messages.length}`);
          
          // Call OpenAI API
          console.log('    ├─ Sending request to OpenAI API...');
          const response = await openai.chat.completions.create(requestOptions);
          
          const timeTaken = Date.now() - startTime;
          console.log(`    ├─ AI response generated in ${timeTaken}ms`);
          console.log(`    ├─ Tokens used: ${response.usage.total_tokens} (prompt: ${response.usage.prompt_tokens}, completion: ${response.usage.completion_tokens})`);
          
          // Get AI response content
          const responseContent = response.choices[0].message.content;
          console.log(`    ├─ Response length: ${responseContent.length} characters`);
          console.log(`    └─ First 50 chars: ${responseContent.substring(0, 50)}...`);
          
          return responseContent;
        } catch (error) {
          console.error(`    ❌ AI response generation error: ${error.message}`);
          if (error.response) {
            console.error(`    ├─ Status: ${error.response.status}`);
            console.error(`    └─ Data: ${JSON.stringify(error.response.data)}`);
          }
          throw error; // Rethrow to be caught by the main error handler
        }
      })(),
      
      // Get service recommendations in parallel
      (async () => {
        try {
          console.log('\n🔍 [4B] SERVICE MATCHING - Processing');
          const startTime = Date.now();
          const recommendations = await serviceRecommendationsPromise;
          const timeTaken = Date.now() - startTime;
          
          console.log(`    ├─ Service matching completed in ${timeTaken}ms`);
          console.log(`    ├─ Recommendations found: ${recommendations.length}`);
          
          if (recommendations.length > 0) {
            console.log('    └─ Top recommendation: ' + recommendations[0].serviceName);
          } else {
            console.log('    └─ No recommendations matched criteria');
          }
          
          return recommendations;
        } catch (error) {
          console.error(`    ❌ Service matching error: ${error.message}`);
          return []; // Return empty array on error
        }
      })()
    ]);
    
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n┌──────────────────────────────────────────────────────────┐');
    console.log('│ 5. RESPONSE DELIVERY PHASE                               │');
    console.log('└──────────────────────────────────────────────────────────┘');
    // ─────────────────────────────────────────────────────────────────────

    // Log the service recommendations if any
    if (serviceRecommendations && serviceRecommendations.length > 0) {
      console.log('\n📦 [5A] SERVICE RECOMMENDATIONS FOR RESPONSE:');
      serviceRecommendations.forEach((rec, index) => {
        if (index < 3) { // Just log the top 3 to avoid clutter
          console.log(`    ├─ [${index + 1}] ${rec.serviceName}: confidence ${rec.confidence.toFixed(2)}`);
        }
      });
    } else {
      console.log('\n📦 [5A] NO SERVICE RECOMMENDATIONS INCLUDED');
    }
    
    // Log final response details
    console.log('\n📤 [5B] FINAL RESPONSE PREPARATION:');
    console.log(`    ├─ Response content length: ${aiResponse.length} characters`);
    console.log(`    ├─ Including ${serviceRecommendations.length} service recommendations`);
    console.log(`    └─ Full workflow completed in ${Date.now() - overallStartTime}ms`);
    
    console.log('\n=== WORKFLOW VISUALIZATION: COMPLETE ===\n');
    
    // Process the AI response
    let responseText = aiResponse;
    
    // Add service recommendations if user preferences allow it
    if (userPrefs.showServiceRecommendations && serviceRecommendations && serviceRecommendations.length > 0) {
      console.log(`\n=== SERVICE RECOMMENDATION DECISION ===`);
      console.log(`Processing ${serviceRecommendations.length} service recommendations`);
      
      // Detect if user is asking for advice or sharing a problem
      const isAskingForAdvice = detectAdviceRequest(userMessage, history);
      
      // Log whether user is asking for advice
      console.log(`Is user asking for advice: ${isAskingForAdvice}`);
      
      // Check for explicit advice requests which should always allow service recommendations
      const explicitAdvicePatterns = [
        'アドバイスください', 'アドバイス下さい', 'アドバイスを下さい', 'アドバイスをください',
        'アドバイスが欲しい', 'アドバイスがほしい', 'アドバイスをお願い', '助言ください',
        '助言下さい', 'おすすめを教えて', 'お勧めを教えて', 'オススメを教えて'
      ];
      
      const isExplicitAdviceRequest = explicitAdvicePatterns.some(pattern => 
        userMessage && userMessage.includes(pattern)
      );
      
      if (isExplicitAdviceRequest) {
        console.log('✅ Explicit advice request detected in processWithAI - will show service recommendations');
      }
      
      // Check timing and frequency constraints
      const isTimeAppropriate = isAppropriateTimeForServices(history, userMessage);
      console.log(`Is time appropriate: ${isTimeAppropriate}`);
      
      const isWithinFrequencyLimits = shouldShowServicesToday(userId, history, userMessage);
      console.log(`Is within frequency limits: ${isWithinFrequencyLimits}`);
      
      // Check if we should show services - explicit advice requests always get recommendations
      const shouldShow = isExplicitAdviceRequest || 
                        (shouldShowServicesToday(userId, history, userMessage) && 
                         isAppropriateTimeForServices(history, userMessage) &&
                         isAskingForAdvice);
      
      console.log(`\nFINAL DECISION: ${shouldShow ? '✅ SHOWING' : '❌ NOT SHOWING'} service recommendations`);
      
      if (!shouldShow) {
        if (isExplicitAdviceRequest) {
          // This should not happen given our logic, but add a warning just in case
          console.warn('WARNING: Explicit advice request detected but services not shown - check logic!');
        } else if (!isAskingForAdvice) {
          console.log('Reason: Not asking for advice');
        } else if (!isAppropriateTimeForServices(history, userMessage)) {
          console.log('Reason: Not an appropriate time based on conversation flow');
        } else if (!shouldShowServicesToday(userId, history, userMessage)) {
          console.log('Reason: Frequency/timing constraints');
        } else {
          console.log('Reason: Unknown reason');
        }
        console.log(`=== END SERVICE RECOMMENDATION DECISION ===\n`);
      } else {
        console.log(`Reason: ${isExplicitAdviceRequest ? 'Explicit advice request' : 'Detected advice need'}`);
        console.log(`Sample service structure: ${JSON.stringify(serviceRecommendations[0])}`);
        console.log(`=== END SERVICE RECOMMENDATION DECISION ===\n`);
        
        // Map service IDs to full service objects if needed
        let fullServiceRecommendations = serviceRecommendations;
        if (serviceRecommendations[0] && (typeof serviceRecommendations[0] === 'string' || !serviceRecommendations[0].description)) {
          const servicesModule = require('./services');
          fullServiceRecommendations = serviceRecommendations.map(service => {
            const serviceId = typeof service === 'string' ? service : service.id;
            return servicesModule.services.find(s => s.id === serviceId) || service;
          });
        }
        
        // Get user preferences
        const preferences = userPreferences.getUserPreferences(userId);
        const maxRecommendations = preferences.maxRecommendations || 3;
        const confidenceThreshold = preferences.minConfidenceScore || 0.6;
        
        // Create a presentation context with our simplified approach
        const presentationContext = {
          shouldBeMinimal: false,
          hasSeenServicesBefore: false,
          categoryFeedback: preferences.categoryCooldowns || {},
          preferredCategory: null
        };
        
        // Check if user has seen services before
        if (history && history.length > 0) {
          for (let i = 0; i < history.length; i++) {
            const msg = history[i];
            if (msg.role === 'assistant' && msg.content && 
                (msg.content.includes('サービス') || 
                 msg.content.includes('お役立ち情報'))) {
              presentationContext.hasSeenServicesBefore = true;
        break;
            }
          }
        }
        
        // Detect distress indicators for minimal presentation
        const distressIndicators = [
          'つらい', '苦しい', '死にたい', '自殺', '助けて', 
          'しんどい', '無理', 'やばい', '辛い', '悲しい'
        ];
        
        if (userMessage) {
          for (const indicator of distressIndicators) {
            if (userMessage.includes(indicator)) {
              presentationContext.shouldBeMinimal = true;
              break;
            }
          }
        }
        
        // Apply cooldowns to filter out services in cooldown categories
        fullServiceRecommendations = fullServiceRecommendations.filter(service => {
          // Skip if no service
          if (!service) return false;
          
          // Determine service category
          const category = userPreferences._getServiceCategory(service);
          
          // Skip if category is in cooldown
          if (category && preferences.categoryCooldowns && preferences.categoryCooldowns[category]) {
            const cooldownUntil = new Date(preferences.categoryCooldowns[category]);
            if (cooldownUntil > new Date()) {
              console.log(`Filtering out service ${service.id} due to category cooldown until ${cooldownUntil}`);
              return false;
            }
          }
          
          // Skip if service has received negative feedback
          if (preferences.implicitFeedback && 
              preferences.implicitFeedback[service.id] === 'negative') {
            console.log(`Filtering out service ${service.id} due to previous negative feedback`);
            return false;
          }
          
          return true;
        });
        
        // Filter recommendations based on user preferences and context
        let filteredRecommendations = fullServiceRecommendations
          .filter(service => {
            const confidence = service.confidence || service.confidenceScore || 0.8;
            return confidence >= confidenceThreshold;
          })
          .slice(0, maxRecommendations);
        
        // Determine the appropriate introduction text based on user needs and preferred category
        let introText = '\n\n【お役立ち情報】\n以下のサービスがお役に立つかもしれません：\n';
        
        // Group services by category for better organization
        const servicesByCategory = {
          'career': [],
          'mental_health': [],
          'social': [],
          'financial': [],
          'other': []
        };
        
        // Categorize services
        for (const service of filteredRecommendations) {
          let serviceCategory = null;
          
          // Determine service category
          if (service.criteria && service.criteria.topics) {
            if (service.criteria.topics.includes('employment')) serviceCategory = 'career';
            else if (service.criteria.topics.includes('mental_health')) serviceCategory = 'mental_health';
            else if (service.criteria.topics.includes('social')) serviceCategory = 'social';
            else if (service.criteria.topics.includes('daily_living')) serviceCategory = 'financial';
          }
          
          if (!serviceCategory && service.tags) {
            if (service.tags.includes('employment') || service.tags.includes('career')) serviceCategory = 'career';
            else if (service.tags.includes('mental_health')) serviceCategory = 'mental_health';
            else if (service.tags.includes('social') || service.tags.includes('community')) serviceCategory = 'social';
            else if (service.tags.includes('financial') || service.tags.includes('assistance')) serviceCategory = 'financial';
          }
          
          if (!serviceCategory) serviceCategory = 'other';
          
          // Skip services from negatively rated categories
          if (presentationContext.categoryFeedback[serviceCategory] === 'negative') {
            console.log(`Filtering out service ${service.id} due to negative feedback for category ${serviceCategory}`);
            continue;
          }
          
          servicesByCategory[serviceCategory].push(service);
        }
        
        // Prioritize services based on preferred category or user needs
        let priorityCategory = presentationContext.preferredCategory;
        
        if (!priorityCategory && userNeeds) {
          if (userNeeds.mental_health && 
              (userNeeds.mental_health.shows_depression || userNeeds.mental_health.shows_anxiety)) {
            priorityCategory = 'mental_health';
          } else if (userNeeds.employment && 
                    (userNeeds.employment.seeking_job || userNeeds.employment.career_transition) &&
                    presentationContext.categoryFeedback['career'] !== 'negative') {
            priorityCategory = 'career';
          } else if (userNeeds.social && 
                    (userNeeds.social.isolation || userNeeds.social.is_hikikomori)) {
            priorityCategory = 'social';
          } else if (userNeeds.daily_living && userNeeds.daily_living.financial_assistance) {
            priorityCategory = 'financial';
          }
        }
        
        // Set the appropriate introduction based on priority category
        if (priorityCategory === 'mental_health') {
          introText = '\n\n【メンタルヘルスサポート】\nこちらのサービスが心の健康をサポートするかもしれません：\n';
        } else if (priorityCategory === 'career' && presentationContext.categoryFeedback['career'] !== 'negative') {
          introText = '\n\n【キャリア支援サービス】\nお仕事の状況は大変かと思います。少しでもお役に立てるかもしれないサービスをご紹介します：\n';
        } else if (priorityCategory === 'social') {
          introText = '\n\n【コミュニティサポート】\n以下のサービスが社会とのつながりをサポートします：\n';
        } else if (priorityCategory === 'financial') {
          introText = '\n\n【生活支援サービス】\n経済的な支援に関する以下のサービスが参考になるかもしれません：\n';
        }
        
        // Build our final recommendations list prioritizing the preferred category
        let finalRecommendations = [];
        
        if (priorityCategory && servicesByCategory[priorityCategory].length > 0) {
          // Add services from the priority category first
          finalRecommendations = [...servicesByCategory[priorityCategory]];
          
          // If we need more services, add from other categories (excluding negative feedback categories)
          if (finalRecommendations.length < 3) {
            for (const [category, services] of Object.entries(servicesByCategory)) {
              if (category !== priorityCategory && category !== 'other' && 
                  presentationContext.categoryFeedback[category] !== 'negative') {
                finalRecommendations = [...finalRecommendations, ...services];
                if (finalRecommendations.length >= 3) break;
              }
            }
            
            // If still not enough, add from 'other' category
            if (finalRecommendations.length < 3 && servicesByCategory['other'].length > 0) {
              finalRecommendations = [...finalRecommendations, ...servicesByCategory['other']];
            }
          }
        } else {
          // If no priority category, combine all non-negative categories
          for (const [category, services] of Object.entries(servicesByCategory)) {
            if (presentationContext.categoryFeedback[category] !== 'negative') {
              finalRecommendations = [...finalRecommendations, ...services];
            }
          }
        }
        
        // Limit to max 3 recommendations
        finalRecommendations = finalRecommendations.slice(0, 3);
        
        // Only proceed if we have recommendations to show after all filtering
        if (finalRecommendations.length > 0) {
          // Create a natural transition based on message content
          const introText = createNaturalTransition(
            responseText, 
            priorityCategory, 
            presentationContext.shouldBeMinimal
          );
          
          // Add service recommendations to the response with improved formatting
          responseText += introText;
          
          // Check if this is a new user (fewer than 3 interactions)
          const isNewUser = history.length < 5;
          
          // Add a subtle hint for new users about how to control service display
          if (isNewUser && !presentationContext.hasSeenServicesBefore) {
            responseText += '\n（「サービス表示オフ」と言っていただくと、サービス情報を非表示にできます）\n';
          }
          
          // Store shown services for later implicit feedback tracking
          const shownServices = [];
          
          // Display the services with improved formatting
          finalRecommendations.forEach((service, index) => {
            // Keep track of shown services
            shownServices.push(service);
            
            // Customize service presentation based on context
            if (presentationContext.shouldBeMinimal) {
              // Minimal presentation for users who seem overwhelmed
              responseText += `${index + 1}. **${service.name}**\n   ${service.url}\n\n`;
            } else {
              // Standard presentation
              responseText += `${index + 1}. **${service.name}**\n`;
              if (service.description) {
                responseText += `   ${service.description}\n`;
              }
              if (service.url) {
                responseText += `   ${service.url}\n`;
              }
              responseText += '\n';
            }
          });
          
          // Save recently shown services in preferences for future reference
          if (!preferences.recentlyShownServices) {
            preferences.recentlyShownServices = {};
          }
          preferences.recentlyShownServices[Date.now()] = finalRecommendations.map(
            service => typeof service === 'string' ? service : service.id
          );
          userPreferences.updateUserPreferences(userId, preferences);
          
          // Record service recommendations
          try {
            for (const service of finalRecommendations) {
              await recordServiceRecommendation(userId, service.id, 0.8); // Use default confidence score
            }
          } catch (error) {
            console.error('Error recording service recommendations:', error);
          }
        }
      }
    }
    
    console.log(`Total processing time: ${Date.now() - startTime}ms`);
    return responseText;
  } catch (error) {
    console.error('Error in processWithAI:', error);
    return '申し訳ありません。処理中にエラーが発生しました。もう一度お試しください。';
  }
}

// Add timeout handling with retries and proper error handling
const MAX_RETRIES = 3;
const TIMEOUT_PER_ATTEMPT = 25000; // 25 seconds per attempt

async function processMessage(userId, messageText) {
  if (messageText.includes('思い出して') || messageText.includes('記憶')) {
    return handleChatRecallWithRetries(userId, messageText);
  }
  // ... existing message handling code ...
}

async function handleChatRecallWithRetries(userId, messageText) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`🔄 Chat recall attempt ${attempt}/${MAX_RETRIES} for user ${userId}`);
    
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout on attempt ${attempt}`)), TIMEOUT_PER_ATTEMPT);
      });

      // Race between the chat recall and timeout
      const result = await Promise.race([
        fetchAndAnalyzeHistory(userId),
        timeoutPromise
      ]);
      
      console.log(`✅ Chat recall succeeded on attempt ${attempt}`);
      return result;
      
    } catch (error) {
      lastError = error;
      console.log(`⚠️ Attempt ${attempt} failed: ${error.message}`);
      
      // If we have more attempts, wait before retrying
      if (attempt < MAX_RETRIES) {
        console.log(`Waiting 1 second before attempt ${attempt + 1}...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  // If all attempts failed, return a user-friendly message
  console.log(`❌ All ${MAX_RETRIES} attempts failed. Last error: ${lastError?.message}`);
  return {
    type: 'text',
    text: `申し訳ございません。${MAX_RETRIES}回試みましたが、処理を完了できませんでした。\n少し時間をおいてから、もう一度お試しください。`
  };
}

async function fetchAndAnalyzeHistory(userId) {
  const startTime = Date.now();
  console.log(`📚 Fetching chat history for user ${userId}`);
  
  try {
    const history = await fetchUserHistory(userId, 200);
    console.log(`📝 Found ${history.length} records in ${Date.now() - startTime}ms`);
    
    // Process the history and generate response
    const response = await generateHistoryResponse(history);
    
    console.log(`✨ History analysis completed in ${Date.now() - startTime}ms`);
    return {
      type: 'text',
      text: response
    };
    
  } catch (error) {
    console.error(`❌ Error in fetchAndAnalyzeHistory: ${error.message}`);
    throw error;
  }
}

async function handleEvent(event) {
  if (event.type === 'follow') {
    console.log('Handling follow event for user:', event.source.userId);
    return handleFollowEvent(event);
  }

  if (event.type !== 'message') {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;

  try {
    // Handle image messages
    if (event.message.type === 'image') {
      console.log('Processing image message...');
      return handleImage(event);
    }

    // Handle text messages with existing logic
    if (event.message.type === 'text') {
      const userText = event.message.text.trim();
      return handleText(event);
    }

    console.log(`Unsupported message type: ${event.message.type}`);
    return Promise.resolve(null);

  } catch (error) {
    console.error('Error in handleEvent:', error);
    return Promise.resolve(null);
  }
}

async function handleText(event) {
  try {
    const userId = event.source.userId;
    const messageText = event.message.text;
    
    // Check for general help request
    if (messageText.toLowerCase() === 'ヘルプ' || 
        messageText.toLowerCase() === 'help' || 
        messageText.toLowerCase() === 'へるぷ') {
      // Return the general help message
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: helpSystem.getGeneralHelp()
      });
      return;
    }
    
    // Handle confusion request
    if (isConfusionRequest(messageText)) {
      await handleVisionExplanation(event);
      return;
    }
    
    const userMessage = event.message.text.trim();
    
    // Get user preferences to check for recently shown services
    const preferences = userPreferences.getUserPreferences(userId);
    
    // Track implicit feedback for recently shown services
    if (preferences && preferences.recentlyShownServices) {
      // Get services shown in the last hour
      const oneHourAgo = Date.now() - 3600000;
      let recentServices = [];
      
      // Collect service IDs shown in the last hour
      Object.entries(preferences.recentlyShownServices).forEach(([timestamp, services]) => {
        if (parseInt(timestamp) > oneHourAgo) {
          recentServices = [...recentServices, ...services];
        }
      });
      
      // If there are recent services, track implicit feedback
      if (recentServices.length > 0) {
        console.log(`Tracking implicit feedback for ${recentServices.length} recently shown services`);
        userPreferences.trackImplicitFeedback(userId, userMessage, recentServices);
        
        // Clean up old entries
        const newRecentlyShownServices = {};
        Object.entries(preferences.recentlyShownServices).forEach(([timestamp, services]) => {
          if (parseInt(timestamp) > oneHourAgo) {
            newRecentlyShownServices[timestamp] = services;
          }
        });
        preferences.recentlyShownServices = newRecentlyShownServices;
        userPreferences.updateUserPreferences(userId, preferences);
      }
    }

    // Check for user preference commands
    const updatedPreferences = userPreferences.processPreferenceCommand(userId, userMessage);
    if (updatedPreferences) {
      let responseMessage = '';
      
      // Handle help request
      if (updatedPreferences.helpRequested) {
        responseMessage = userPreferences.getHelpMessage();
      } 
      // Handle settings check request
      else if (updatedPreferences.settingsRequested) {
        responseMessage = userPreferences.getCurrentSettingsMessage(userId);
      }
      // Handle preference updates
      else {
        // Create a more conversational response based on what was changed
        if (updatedPreferences.showServiceRecommendations !== undefined) {
          if (updatedPreferences.showServiceRecommendations) {
            responseMessage = `サービス表示をオンにしました。お役立ちそうなサービスがあれば、会話の中でご紹介します。`;
    } else {
            // Check if this was triggered by negative feedback
            const lowerMessage = userMessage.toLowerCase();
            const negativePatterns = ['要らない', 'いらない', '不要', '邪魔', '見たくない', '表示しないで', '非表示', '消して'];
            const isNegativeFeedback = negativePatterns.some(pattern => lowerMessage.includes(pattern));
            
            if (isNegativeFeedback) {
              // Minimal response for negative feedback
              responseMessage = `わかりました。`;
            } else {
              responseMessage = `サービス表示をオフにしました。`;
            }
          }
        } else if (updatedPreferences.maxRecommendations !== undefined) {
          if (updatedPreferences.maxRecommendations === 0) {
            responseMessage = `サービスを表示しない設定にしました。`;
          } else {
            responseMessage = `表示するサービスの数を${updatedPreferences.maxRecommendations}件に設定しました。`;
          }
        } else if (updatedPreferences.minConfidenceScore !== undefined) {
          responseMessage = `信頼度${Math.round(updatedPreferences.minConfidenceScore * 100)}%以上のサービスのみ表示するように設定しました。`;
        } else {
          // Fallback to current settings if we can't determine what changed
          responseMessage = userPreferences.getCurrentSettingsMessage(userId);
        }
      }
      
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: responseMessage
      });
      
      // Store the interaction
      await storeInteraction(userId, 'user', userMessage);
      await storeInteraction(userId, 'assistant', responseMessage);
      
      return;
    }
    
    // 特定の問い合わせ（ASD支援の質問例や使い方の案内）を検出
    if (userMessage.includes("ASD症支援であなたが対応できる具体的な質問例") && userMessage.includes("使い方")) {
      return handleASDUsageInquiry(event);
    }
    
    // pendingImageExplanations のチェック（はい/いいえ 判定）
    if (pendingImageExplanations.has(userId)) {
      if (userMessage === "はい") {
        const explanationText = pendingImageExplanations.get(userId);
        pendingImageExplanations.delete(userId);
        console.log("ユーザーの「はい」が検出されました。画像生成を開始します。");
        return handleImageExplanation(event, explanationText);
      } else if (userMessage === "いいえ") {
        pendingImageExplanations.delete(userId);
        console.log("ユーザーの「いいえ」が検出されました。画像生成をキャンセルします。");
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: "承知しました。引き続きテキストでの回答を行います。"
        });
      }
    }

    // セキュリティチェック
    const isSafe = await securityFilterPrompt(userMessage);
    if (!isSafe) {
      const refusal = '申し訳ありません。このリクエストには対応できません。';
      await storeInteraction(userId, 'assistant', refusal);
      await client.replyMessage(event.replyToken, { type: 'text', text: refusal });
      return null;
    }

    // 最近の会話履歴の取得
    const history = await fetchUserHistory(userId, 10);
    const lastAssistantMessage = history.filter(item => item.role === 'assistant').pop();

    // 画像説明の提案トリガーチェック：isConfusionRequest のみを使用
    let triggerImageExplanation = false;
    if (isConfusionRequest(userMessage)) {
      triggerImageExplanation = true;
    }

    // トリガーされた場合、pending 状態として前回の回答を保存し、yes/no で質問
    if (triggerImageExplanation) {
      if (lastAssistantMessage) {
        pendingImageExplanations.set(userId, lastAssistantMessage.content);
      } else {
        pendingImageExplanations.set(userId, "説明がありません。");
      }
      const suggestionMessage = "前回の回答について、画像による説明を生成しましょうか？「はい」または「いいえ」でお答えください。";
      console.log("画像による説明の提案をユーザーに送信:", suggestionMessage);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: suggestionMessage
      });
    }

    // 通常のテキスト処理へ進む
    await storeInteraction(userId, 'user', userMessage);

    const { mode, limit } = determineModeAndLimit(userMessage);
    console.log(`mode=${mode}, limit=${limit}`);

    const historyForAI = await fetchUserHistory(userId, limit);
    const systemPrompt = getSystemPromptForMode(mode);
    
    // TODO: ここに残りのコードを実装

    // AIでの処理を実行
    const result = await processWithAI(systemPrompt, userMessage, historyForAI, mode, userId, client);
    return client.replyMessage(event.replyToken, { type: 'text', text: result });
  } catch (error) {
    console.error('Error handling text message:', error);
    return Promise.resolve(null);
  }
}

// サーバー起動設定
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT} (if local)\n`);
});

/**
 * Checks if a message indicates user confusion or a request for explanation about an image
 * @param {string} text - The message text to check
 * @return {boolean} - True if the message indicates confusion about an image
 */
function isConfusionRequest(text) {
  if (!text || typeof text !== 'string') return false;
  
  // First check if the message contains image-related terms
  const imageTerms = ['画像', '写真', 'イメージ', '図', 'がぞう', 'しゃしん', 'ピクチャ', '絵'];
  const hasImageTerm = imageTerms.some(term => text.includes(term));
  
  // Then check for confusion patterns
  const confusionPatterns = [
    'わからない', '分からない', '理解できない', '意味がわからない', '意味が分からない',
    '何これ', 'なにこれ', '何だこれ', 'なんだこれ', '何だろう', 'なんだろう',
    'どういう意味', 'どういうこと', 'よくわからない', 'よく分からない', 
    '何が起きてる', '何が起きている', 'なにが起きてる',
    '何が書いてある', '何て書いてある', '何と書いてある', 'これは何',
    'これはなに', 'これって何', 'これってなに', '何が表示されてる',
    '何が表示されている', 'なにが表示されてる', 'これ何', 'これなに'
  ];
  
  // More specific explanation request patterns that must be image-related
  const explanationPatterns = [
    '説明して', '教えて'
  ];
  
  // Return true if:
  // 1. Contains a confusion pattern AND an image term, OR
  // 2. Contains a specific explanation request AND an image term
  const hasConfusionPattern = confusionPatterns.some(pattern => text.includes(pattern));
  const hasExplanationRequest = explanationPatterns.some(pattern => text.includes(pattern));
  
  return (hasImageTerm && (hasConfusionPattern || hasExplanationRequest));
}

/**
 * Handles vision explanation requests
 * @param {Object} event - The LINE event object
 * @return {Promise<void>}
 */
async function handleVisionExplanation(event) {
  const userId = event.source.userId;
  
  try {
    // Get user's recent history to find the last image
    const history = await fetchUserHistory(userId, 10);
    
    // Find the most recent image message
    const lastImageMessage = history
      .filter(item => item.role === 'user' && item.type === 'image')
      .pop();
    
    if (!lastImageMessage) {
      // No recent image found
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '最近の画像が見つかりませんでした。説明してほしい画像を送信してください。もし画像の説明を求めていない場合は、別の質問をお願いします。'
      });
      return;
    }
    
    // Reply with explanation that we're processing the image
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '画像を確認しています。少々お待ちください。画像の内容について説明します。'
    });
    
    // In a real implementation, you would process the image here
    // For now, we'll just log that we would process it
    console.log(`Would process image explanation for user ${userId}`);
    
    // Send a follow-up message with the explanation
    // In a real implementation, this would be the result of image analysis
    setTimeout(async () => {
      try {
        await client.pushMessage(userId, {
          type: 'text',
          text: '画像の説明機能は現在開発中です。もうしばらくお待ちください。'
        });
      } catch (error) {
        console.error('Error sending follow-up explanation:', error);
      }
    }, 2000);
  } catch (error) {
    console.error('Error in handleVisionExplanation:', error);
    // Try to send an error message
    try {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '申し訳ありません。画像の処理中にエラーが発生しました。'
      });
    } catch (replyError) {
      console.error('Error sending error reply:', replyError);
    }
  }
}

/**
 * Extracts relevant context from conversation history
 * @param {Array} history - Array of conversation history items
 * @param {string} userMessage - Current user message
 * @return {Object} - Extracted context information
 */
function extractConversationContext(history, userMessage) {
  try {
    // Extract recent topics from last 5 messages
    const recentMessages = history.slice(-5);
    
    // Extract user interests
    const userInterests = [];
    const interestKeywords = [
      '趣味', '好き', '興味', 'ホビー', '楽しい', '関心', 
      'すき', 'きょうみ', 'たのしい', 'かんしん'
    ];
    
    recentMessages.forEach(msg => {
      if (msg.role === 'user') {
        for (const keyword of interestKeywords) {
          if (msg.content.includes(keyword)) {
            // Extract the sentence containing the keyword
            const sentences = msg.content.split(/。|！|\.|!/).filter(s => s.includes(keyword));
            userInterests.push(...sentences);
          }
        }
      }
    });
    
    // Check for emotion indicators
    const emotions = {
      positive: 0,
      negative: 0,
      neutral: 1 // Default to slightly neutral
    };
    
    const positiveWords = [
      '嬉しい', '楽しい', '良い', '好き', '素晴らしい', 
      'うれしい', 'たのしい', 'よい', 'すき', 'すばらしい'
    ];
    
    const negativeWords = [
      '悲しい', '辛い', '苦しい', '嫌い', '心配', 
      'かなしい', 'つらい', 'くるしい', 'きらい', 'しんぱい'
    ];
    
    // Check current message for emotion words
    for (const word of positiveWords) {
      if (userMessage.includes(word)) emotions.positive++;
    }
    
    for (const word of negativeWords) {
      if (userMessage.includes(word)) emotions.negative++;
    }
    
    // Return the compiled context
    return {
      userInterests: userInterests.length > 0 ? userInterests : null,
      userEmotion: emotions.positive > emotions.negative ? 'positive' : 
                   emotions.negative > emotions.positive ? 'negative' : 'neutral',
      emotionIntensity: Math.max(emotions.positive, emotions.negative),
      messageCount: history.length,
      recentTopics: recentMessages
        .map(msg => msg.content)
        .join(' ')
        .split(/。|！|\.|!/)
        .filter(s => s.length > 5)
        .slice(-3)
    };
  } catch (error) {
    console.error('Error extracting conversation context:', error);
    // Return a minimal context object in case of error
    return {
      userEmotion: 'neutral',
      emotionIntensity: 0,
      messageCount: history.length
    };
  }
}

async function processUserMessage(userId, userMessage, history, initialMode = null) {
  try {
    // Start timer for overall processing
    const overallStartTime = Date.now();
    console.log(`\n==== PROCESSING USER MESSAGE (${new Date().toISOString()}) ====`);
    console.log(`User ID: ${userId}`);
    console.log(`Message: ${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}`);
    
    // Get user preferences
    // ... existing code ...
  } catch (error) {
    console.error('Error processing user message:', error);
    return {
      type: 'text',
      text: '申し訳ありません。メッセージの処理中にエラーが発生しました。もう一度お試しください。'
    };
  }
}