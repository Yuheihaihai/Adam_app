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
const axios = require('axios');
const servicesData = require('./services');
const { explicitAdvicePatterns } = require('./advice_patterns');
// セキュリティ強化のための追加モジュール
const rateLimit = require('express-rate-limit');
const xss = require('xss');
const csrf = require('csurf');

// 必須環境変数の検証
const requiredEnvVars = [
  'CHANNEL_ACCESS_TOKEN',
  'CHANNEL_SECRET',
  'OPENAI_API_KEY'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('ERROR: 必須環境変数が不足しています:', missingEnvVars.join(', '));
  process.exit(1); // 重大なエラーなのでプロセスを終了
}

// 任意環境変数の検証（あれば使用、なければログを出力）
const optionalEnvVars = [
  'ANTHROPIC_API_KEY',
  'PERPLEXITY_API_KEY',
  'AIRTABLE_API_KEY',
  'AIRTABLE_BASE_ID'
];

optionalEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.warn(`WARNING: 任意環境変数 ${varName} が設定されていません。関連機能は利用できません。`);
  }
});

// Import service hub components
const UserNeedsAnalyzer = require('./userNeedsAnalyzer');
const ServiceRecommender = require('./serviceRecommender');

// Import ML Hook for enhanced machine learning capabilities
const { processMlData, analyzeResponseWithMl } = require('./mlHook');

// User Preferences Module
const userPreferences = {
  _prefStore: {}, // Simple in-memory storage
  
  getUserPreferences: function(userId) {
    if (!this._prefStore[userId]) {
      this._prefStore[userId] = {
        recentlyShownServices: {},
        showServiceRecommendations: true, // デフォルトでサービス推奨を有効にする
        positiveFeedback: {} // 新規: ポジティブフィードバックの履歴を追跡
      };
    }
    return this._prefStore[userId];
  },
  
  updateUserPreferences: function(userId, preferences) {
    this._prefStore[userId] = preferences;
    return this._prefStore[userId];
  },
  
  trackImplicitFeedback: function(userId, userMessage, recentServices) {
    // Get user preferences
    const prefs = this.getUserPreferences(userId);
    
    // フィードバックを判定するために小文字化と空白除去
    const lowerMessage = userMessage.toLowerCase().trim();
    
    // 共通のフィードバックパターン定義
    const FEEDBACK_PATTERNS = {
      positive: [
        'いいね', 'よかった', '良かった', '便利', 'ありがとう', '感謝', 
        '助かる', '使いやすい', 'すごい', '素晴らしい', 'すばらしい', 
        '役立つ', '参考になる', 'グッド'
      ],
      negative: [
        '要らない', 'いらない', '不要', '邪魔', '見たくない', '表示しないで', '非表示', '消して', '表示するな', '出すな', 'オススメ要らないです', 'おすすめ要らないです', 'お勧め要らないです', 'サービス要らない', 'サービスいらない', 'サービス不要', 'サービス邪魔', 'お勧め要らない', 'お勧めいらない', 'お勧め不要', 'お勧め邪魔', 'おすすめ要らない', 'おすすめいらない', 'おすすめ不要', 'おすすめ邪魔', 'オススメ要らない', 'オススメいらない', 'オススメ不要', 'オススメ邪魔', '推奨要らない', '推奨いらない', '推奨不要', '推奨邪魔', 'サービスは結構です', 'お勧めは結構です', 'おすすめは結構です', 'オススメは結構です', 'サービス要りません', 'お勧め要りません', 'おすすめ要りません', 'オススメ要りません', 'もういい', 'もういらない', 'もう十分', 'もう結構', 'やめて', '止めて', '停止', 'やめてください', '止めてください', '停止してください', 'うざい', 'うるさい', 'しつこい', 'ノイズ', '迷惑', 'もう表示しないで', 'もう出さないで', 'もう見せないで', '要らないです', 'いらないです', '不要です', '邪魔です', 'サービス表示オフ', 'お勧め表示オフ', 'おすすめ表示オフ', 'オススメ表示オフ'
      ]
    };
    
    // 明確な肯定的フィードバックがあり、かつ明確な否定的フィードバックがない場合のみポジティブと判定
    const hasPositiveFeedback = FEEDBACK_PATTERNS.positive.some(pattern => lowerMessage.includes(pattern));
    const hasNegativeFeedback = FEEDBACK_PATTERNS.negative.some(pattern => lowerMessage.includes(pattern));
    
    const isPositiveFeedback = hasPositiveFeedback && !hasNegativeFeedback;
    
    if (isPositiveFeedback && recentServices && recentServices.length > 0) {
      console.log(`Detected positive feedback from user ${userId}: "${userMessage}"`);
      
      // If user gave positive feedback, ensure service recommendations are turned on
      if (!prefs.showServiceRecommendations) {
        prefs.showServiceRecommendations = true;
        console.log(`Enabled service recommendations for user ${userId} due to positive feedback`);
        
        // Store the updated preferences
        this.updateUserPreferences(userId, prefs);
        
        // Return true to indicate preferences were updated
        return true;
      }
    }
    
    // Placeholder for tracking user feedback on services
    console.log(`Tracking feedback for user ${userId} on services:`, recentServices);
    return false;
  },
  
  processPreferenceCommand: function(userId, command) {
    // Check if this is actually a preference command
    const preferenceCommandPatterns = [
      '設定', 'せってい', 'setting', 'config', 
      'オプション', 'option', 'オン', 'オフ',
      'on', 'off', '表示', 'ひょうじ',
      '非表示', 'ひひょうじ', '設定確認', '設定リセット',
      'サービスオン', 'サービスオフ', 'サービス表示'
    ];
    
    const isPreferenceCommand = preferenceCommandPatterns.some(pattern => 
      command.toLowerCase().includes(pattern.toLowerCase())
    );
    
    if (!isPreferenceCommand) {
      return null; // Not a preference command
    }
    
    // Log that we're processing a preference command
    console.log(`Processing preference command for user ${userId}: ${command}`);
    
    // Get current preferences
    const prefs = this.getUserPreferences(userId);
    
    // サービス表示に関するコマンドパターン定義
    const serviceOnPatterns = ['サービス表示オン', 'サービスオン', 'サービス表示 オン', 'サービス オン'];
    const serviceOffPatterns = [
      // 明示的な無効化コマンド
      'サービス表示オフ', 'サービスオフ', 'サービス表示 オフ', 'サービス オフ',
      
      // 否定フィードバックを整理・グループ化（重複を排除）
      'サービス要らない', 'サービスいらない', 'サービス不要', 'サービス邪魔',
      'お勧め表示オフ', 'おすすめ表示オフ', 'オススメ表示オフ',
      
      // 非表示関連のパターン
      '非表示', '表示しないで'
    ];
    const serviceSettingsPatterns = ['サービス設定', 'サービス設定確認'];
    
    // サービス数設定
    const serviceCountMatch = command.match(/サービス数(\d+)/);
    
    // 信頼度設定
    const confidenceMatch = command.match(/信頼度(\d+)/);
    
    // 設定リセット
    const resetPatterns = ['設定リセット', '設定を初期化', 'リセット'];
    
    // Handle specific preference commands
    if (command.includes('設定確認') || serviceSettingsPatterns.some(pattern => command.includes(pattern))) {
      prefs.settingsRequested = true;
      return prefs;
    }
    
    // サービス表示オン
    if (serviceOnPatterns.some(pattern => command.includes(pattern))) {
      prefs.showServiceRecommendations = true;
      this.updateUserPreferences(userId, prefs);
      return prefs;
    }
    
    // サービス表示オフ
    if (serviceOffPatterns.some(pattern => command.includes(pattern))) {
      prefs.showServiceRecommendations = false;
      this.updateUserPreferences(userId, prefs);
      return prefs;
    }
    
    // サービス数設定
    if (serviceCountMatch) {
      const count = parseInt(serviceCountMatch[1]);
      if (!isNaN(count) && count >= 0 && count <= 5) {
        prefs.maxRecommendations = count;
        this.updateUserPreferences(userId, prefs);
        return prefs;
      }
    }
    
    // 信頼度設定
    if (confidenceMatch) {
      const score = parseInt(confidenceMatch[1]);
      if (!isNaN(score) && score >= 0 && score <= 100) {
        prefs.minConfidenceScore = score / 100;
        this.updateUserPreferences(userId, prefs);
        return prefs;
      }
    }
    
    // 設定リセット
    if (resetPatterns.some(pattern => command.includes(pattern))) {
      // デフォルト設定に戻す
      prefs.showServiceRecommendations = true;
      prefs.maxRecommendations = 3;
      prefs.minConfidenceScore = 0.7;
      prefs.resetRequested = true;
      this.updateUserPreferences(userId, prefs);
      return prefs;
    }
    
    // If no specific command matched but it was detected as a preference command
    // Just return the current preferences for now
    return prefs;
  },
  
  getHelpMessage: function() {
    return "設定を変更するには以下のコマンドを使用できます：\n"
      + "- サービス表示オン：サービス推奨を有効にする\n"
      + "- サービス表示オフ：サービス推奨を無効にする\n"
      + "- サービス数[数字]：表示するサービスの数を設定（例：サービス数2）\n"
      + "- 信頼度[数字]：サービス推奨の最低信頼度を設定（例：信頼度80）\n"
      + "- 設定確認：現在の設定を表示\n"
      + "- 設定リセット：設定をデフォルトに戻す";
  },
  
  getCurrentSettingsMessage: function(userId) {
    const prefs = this.getUserPreferences(userId);
    const serviceStatus = prefs.showServiceRecommendations ? "オン" : "オフ";
    const maxRecs = prefs.maxRecommendations !== undefined ? prefs.maxRecommendations : 3;
    const confidenceScore = prefs.minConfidenceScore !== undefined 
      ? Math.round(prefs.minConfidenceScore * 100) 
      : 70;
    
    return `現在の設定：\n`
      + `- サービス推奨：${serviceStatus}\n`
      + `- 最大サービス数：${maxRecs}\n`
      + `- 最低信頼度：${confidenceScore}%\n\n`
      + `設定を変更するには「サービス表示オン」「サービス表示オフ」「サービス数2」などと入力してください。`;
  },
  
  _getServiceCategory: function(service) {
    return service && service.category ? service.category : "未分類";
  }
};

const app = express();
app.set('trust proxy', 1);
// セキュリティヘッダーの強化
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // 必要に応じて調整
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.openai.com", "https://api.anthropic.com", "https://api.perplexity.ai"],
      frameAncestors: ["'none'"], // クリックジャッキング防止
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 15552000, // 180日
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use(timeout('120s'));
// app.use(express.json()); // JSONボディの解析を有効化 - LINE webhookに影響するため削除

// APIルート用のJSONパーサーを追加
app.use('/api', express.json({ limit: '1mb' })); // JSONのサイズ制限を設定

// XSS対策用ミドルウェア
app.use('/api', (req, res, next) => {
  if (req.body) {
    // リクエストボディの各フィールドをXSS対策
    for (let key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = xss(req.body[key]);
      }
    }
  }
  next();
});

// レートリミットの設定
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分間
  max: 100, // 15分間で最大100リクエスト
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// APIルートにレートリミットを適用
app.use('/api', apiLimiter);

// CSRF保護を適用するルート（webhook以外）
const csrfProtection = csrf({ cookie: true, ignoreMethods: ['GET', 'HEAD', 'OPTIONS', 'POST'] });

// 静的ファイルを提供する際に使用（実際のアプリで使用している場合）
app.use(express.static(path.join(__dirname, 'public')));

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
  
  // 重要な変更: すぐに200 OKを返して、Herokuのタイムアウトを防ぐ
  res.status(200).json({
    message: 'Webhook received, processing in background'
  });
  
  // 処理をバックグラウンドで継続（レスポンス後に処理を続行）
  (async () => {
    try {
      // 各イベントを非同期で処理
      const results = await Promise.all(req.body.events.map(event => {
        // handleEventが例外をスローする可能性があるため、Promise.resolveでラップする
        return Promise.resolve().then(() => handleEvent(event))
          .catch(err => {
            console.error(`Error handling event: ${JSON.stringify(event)}`, err);
            return null; // エラーを飲み込んで処理を続行
          });
      }));
      
      console.log(`Webhook processing completed for ${results.filter(r => r !== null).length} events`);
    } catch (err) {
      console.error('Webhook background processing error:', err);
    }
  })();
});

// テスト用エンドポイントを追加
app.get('/test-feedback', (req, res) => {
  const message = req.query.message || '';
  const userId = req.query.userId || 'test-user';
  
  // フィードバックを判定するメソッドを呼び出し
  const result = userPreferences.trackImplicitFeedback(userId, message, ['test-service']);
  
  // フィードバックパターンの定義を取得
  const FEEDBACK_PATTERNS = {
    positive: [
      'いいね', 'よかった', '良かった', '便利', 'ありがとう', '感謝', 
      '助かる', '使いやすい', 'すごい', '素晴らしい', 'すばらしい', 
      '役立つ', '参考になる', 'グッド'
    ],
    negative: [
      '要らない', 'いらない', '不要', '邪魔', '見たくない', 
      '表示しないで', '非表示', '消して', '表示するな', '出すな',
      'オススメ要らないです', 'おすすめ要らないです', 'お勧め要らないです',
      'サービス要らない', 'サービスいらない', 'サービス不要', 'サービス邪魔', 
      'お勧め要らない', 'お勧めいらない', 'お勧め不要', 'お勧め邪魔', 
      'おすすめ要らない', 'おすすめいらない', 'おすすめ不要', 'おすすめ邪魔', 
      'オススメ要らない', 'オススメいらない', 'オススメ不要', 'オススメ邪魔', 
      '推奨要らない', '推奨いらない', '推奨不要', '推奨邪魔',
      'サービスは結構です', 'お勧めは結構です', 'おすすめは結構です', 'オススメは結構です',
      'サービス要りません', 'お勧め要りません', 'おすすめ要りません', 'オススメ要りません',
      'もういい', 'もういらない', 'もう十分', 'もう結構',
      'やめて', '止めて', '停止', 'やめてください', '止めてください', '停止してください',
      'うざい', 'うるさい', 'しつこい', 'ノイズ', '迷惑',
      'もう表示しないで', 'もう出さないで', 'もう見せないで',
      '要らないです', 'いらないです', '不要です', '邪魔です',
      'サービス表示オフ', 'お勧め表示オフ', 'おすすめ表示オフ', 'オススメ表示オフ'
    ]
  };
  
  // パターン検出結果
  const hasPositiveFeedback = FEEDBACK_PATTERNS.positive.some(pattern => message.toLowerCase().includes(pattern));
  const hasNegativeFeedback = FEEDBACK_PATTERNS.negative.some(pattern => message.toLowerCase().includes(pattern));
  
  // レスポンスを返す
  res.json({
    message: message,
    hasPositiveFeedback: hasPositiveFeedback,
    hasNegativeFeedback: hasNegativeFeedback,
    result: result,
    patterns: {
      positive: FEEDBACK_PATTERNS.positive,
      negative: FEEDBACK_PATTERNS.negative
    }
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
// Load enhanced features
require('./loadEnhancements')(serviceRecommender);

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

const messageRateLimit = new Map();

// グローバル変数: 各ユーザーの保留中の画像説明情報を管理するためのMap
const pendingImageExplanations = new Map();

// Add a new map to track users who just received image generation
const recentImageGenerationUsers = new Map();

// Add a tracking variable to prevent double responses
const imageGenerationInProgress = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const cooldown = 1000;
  const lastRequest = messageRateLimit.get(userId) || 0;
  
  if (now - lastRequest < cooldown) {
    return false;
  }
  
  messageRateLimit.set(userId, now);
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
  
  // シェアモードの簡易検出（詳細な判断はLLMで行う）
  // 明らかなポジティブフィードバックとパーソナルレファレンスの組み合わせのみを抽出
  if (
    PERSONAL_REFERENCES.some(ref => lcMsg.includes(ref)) && 
    POSITIVE_KEYWORDS.some(keyword => lcMsg.includes(keyword))
  ) {
    console.log('Potential share mode detected, will confirm with LLM');
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
    
    // 履歴分析用のメタデータオブジェクトを初期化
    const historyMetadata = {
      totalRecords: 0,
      recordsByType: {},
      hasCareerRelatedContent: false,
      insufficientReason: null
    };
    
    // 1. まずConversationHistoryテーブルからの取得を試みる（新機能）
    try {
      if (process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
        const airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
          .base(process.env.AIRTABLE_BASE_ID);
          
        try {
          const conversationRecords = await airtableBase('ConversationHistory')
            .select({
              filterByFormula: `{UserID} = "${userId}"`,
              sort: [{ field: 'Timestamp', direction: 'asc' }],
              maxRecords: limit * 2 // userとassistantのやり取りがあるため、2倍のレコード数を取得
            })
            .all();
            
          if (conversationRecords && conversationRecords.length > 0) {
            console.log(`Found ${conversationRecords.length} conversation history records in ConversationHistory table`);
            
            const history = conversationRecords.map((r) => ({
              role: r.get('Role') === 'assistant' ? 'assistant' : 'user',
              content: r.get('Content') || '',
            }));
            
            // 履歴の内容を分析
            historyMetadata.totalRecords += conversationRecords.length;
            analyzeHistoryContent(history, historyMetadata);
            
            // 新しい会話履歴順（昇順→降順→最新のlimit件）に並べ替え
            if (history.length > limit) {
              return { history: history.slice(-limit), metadata: historyMetadata };
            }
            return { history, metadata: historyMetadata };
          }
        } catch (tableErr) {
          // ConversationHistoryテーブルが存在しない場合は無視して次の方法を試す
          console.log(`ConversationHistory table not found or error: ${tableErr.message}. Falling back to UserAnalysis.`);
        }
        
        // 2. 次にUserAnalysisテーブルの会話データを試す（代替方法）
        try {
          const userAnalysisRecords = await airtableBase('UserAnalysis')
            .select({
              filterByFormula: `AND({UserID} = "${userId}", {Mode} = "conversation")`,
              maxRecords: 1
            })
            .all();
            
          if (userAnalysisRecords && userAnalysisRecords.length > 0) {
            const rawData = userAnalysisRecords[0].get('AnalysisData');
            if (rawData) {
              try {
                const data = JSON.parse(rawData);
                if (data.conversation && Array.isArray(data.conversation)) {
                  console.log(`Found ${data.conversation.length} messages in UserAnalysis conversation data`);
                  
                  const history = data.conversation.map(msg => ({
                    role: msg.role || 'user',
                    content: msg.content || msg.message || '',
                  }));
                  
                  // 履歴の内容を分析
                  historyMetadata.totalRecords += data.conversation.length;
                  analyzeHistoryContent(history, historyMetadata);
                  
                  // 最新のlimit件を返す
                  if (history.length > limit) {
                    return { history: history.slice(-limit), metadata: historyMetadata };
                  }
                  return { history, metadata: historyMetadata };
                }
              } catch (jsonErr) {
                console.error('Error parsing conversation data from UserAnalysis:', jsonErr);
              }
            }
          }
        } catch (analysisErr) {
          // UserAnalysisテーブルのアクセスエラーは無視して次の方法を試す
          console.log(`UserAnalysis table not found or error: ${analysisErr.message}. Falling back to original method.`);
        }
      }
    } catch (airtableErr) {
      console.error('Error accessing Airtable for conversation history:', airtableErr);
    }
    
    // 3. 最後に既存の方法でデータを取得（元のコード）
    const records = await base(INTERACTIONS_TABLE)
      .select({
        filterByFormula: `{UserID} = "${userId}"`,
        sort: [{ field: 'Timestamp', direction: 'desc' }],
        maxRecords: limit,
      })
      .all();
    console.log(`Found ${records.length} records for user in original INTERACTIONS_TABLE`);

    const reversed = records.reverse();
    const history = reversed.map((r) => ({
      role: r.get('Role') === 'assistant' ? 'assistant' : 'user',
      content: r.get('Content') || '',
    }));
    
    // 履歴の内容を分析
    historyMetadata.totalRecords += records.length;
    analyzeHistoryContent(history, historyMetadata);
    
    // 履歴が少ない場合の理由を設定
    if (history.length < 3) {
      historyMetadata.insufficientReason = 'few_records';
    }
    
    return { history, metadata: historyMetadata };
  } catch (error) {
    console.error('Error fetching history:', error);
    return { history: [], metadata: { totalRecords: 0, insufficientReason: 'error' } };
  }
}

// 履歴の内容を分析する関数
function analyzeHistoryContent(history, metadata) {
  console.log(`\n======= 履歴内容分析デバッグ =======`);
  console.log(`→ 分析対象メッセージ数: ${history.length}件`);
  
  // 記録タイプのカウンターを初期化
  metadata.recordsByType = metadata.recordsByType || {};
  
  // キャリア関連のキーワード
  const careerKeywords = ['仕事', 'キャリア', '職業', '転職', '就職', '働き方', '業界', '適職'];
  
  // カウンター初期化
  let careerContentCount = 0;
  let userMessageCount = 0;
  
  // 各メッセージを分析
  history.forEach(msg => {
    if (msg.role === 'user') {
      userMessageCount++;
      const content = msg.content.toLowerCase();
      
      // キャリア関連の内容かチェック
      if (careerKeywords.some(keyword => content.includes(keyword))) {
        metadata.recordsByType.career = (metadata.recordsByType.career || 0) + 1;
        metadata.hasCareerRelatedContent = true;
        careerContentCount++;
      }
    }
  });
  
  // 分析結果ログ
  console.log(`→ ユーザーメッセージ: ${userMessageCount}件`);
  console.log(`→ キャリア関連: ${careerContentCount}件 (${Math.round(careerContentCount/userMessageCount*100)}%)`);
  
  // メタデータの設定
  if (history.length < 3) {
    metadata.insufficientReason = 'few_records';
    console.log(`→ 結論: 履歴が少ない (${history.length}件)`);
  } else {
    console.log(`→ 結論: 分析に十分な履歴あり`);
  }
  
  console.log(`======= 履歴内容分析デバッグ終了 =======\n`);
}

function applyAdditionalInstructions(basePrompt, mode, historyData, userMessage) {
  let finalPrompt = basePrompt;
  
  // historyDataから履歴とメタデータを取得
  const history = historyData.history || [];
  const metadata = historyData.metadata || {};

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

  // 履歴メタデータに基づいて説明を追加
  if ((mode === 'characteristics' || mode === 'career') && metadata && metadata.insufficientReason) {
    // 履歴が少ない場合
    if (metadata.insufficientReason === 'few_records') {
      finalPrompt += `
※ユーザーの履歴が少ないです（${history.length}件）。まずは本人に追加の状況説明や詳細を尋ね、やりとりを増やして理解を深めてください。また、履歴が少ない理由を最初に簡潔に説明してください。

[説明例]
「過去の会話記録が少ないため、詳細な分析が難しい状況です。より正確な診断のためには、あなたについてもう少し情報をお聞かせください。」

[質問例]
• 現在の職種や経験について
• 興味のある分野や得意なこと
• 働く上で大切にしたい価値観
• 具体的なキャリアの悩みや課題
`;
    } 
    // 主に翻訳依頼の場合
    else if (metadata.insufficientReason === 'mostly_translation') {
      const translationCount = metadata.recordsByType.translation || 0;
      const totalRecords = metadata.totalRecords || 0;
      const translationPercentage = totalRecords > 0 ? Math.round((translationCount / totalRecords) * 100) : 0;
      
      finalPrompt += `
※ユーザーの過去の会話記録は主に翻訳依頼（全体の約${translationPercentage}%）であり、キャリア分析に必要な個人的な情報が少ないため、詳細な分析が難しい状況です。この状況を最初に簡潔に説明し、より多くの情報を得るための質問をしてください。

[説明例]
「過去の会話記録は主に翻訳依頼であり、キャリア分析に使える個人的な情報が少ないため、詳細な分析が難しい状況です。より正確な診断のためには、あなたの仕事に関する好み、スキル、経験などの情報をもう少し共有していただけると助かります。」

[質問例]
• 現在の職種や経験について
• 興味のある分野や得意なこと
• 働く上で大切にしたい価値観
• 具体的なキャリアの悩みや課題
`;
    }
  } 
  // 従来の条件（履歴が少ない場合）
  else if ((mode === 'characteristics' || mode === 'career') && history.length < 3) {
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
  if (message.length <= MAX_LENGTH) {
    return message;
  }
  
  // 文の区切りで切るように改善
  let truncatedMessage = message.substring(0, MAX_LENGTH);
  
  // 文の区切り（。!?）で終わるように調整
  const sentenceEndings = [
    truncatedMessage.lastIndexOf('。'),
    truncatedMessage.lastIndexOf('！'),
    truncatedMessage.lastIndexOf('？'),
    truncatedMessage.lastIndexOf('!'),
    truncatedMessage.lastIndexOf('?'),
    truncatedMessage.lastIndexOf('\n\n')
  ].filter(pos => pos > MAX_LENGTH * 0.9); // 末尾から10%以内の位置にある区切りのみ
  
  // 区切りが見つかれば、そこで切る
  if (sentenceEndings.length > 0) {
    const cutPosition = Math.max(...sentenceEndings) + 1;
    truncatedMessage = message.substring(0, cutPosition);
  }
  
  return truncatedMessage + '\n\n...(一部省略されました)';
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
  });

  // キーワードベースの簡易チェック（速度優先の場合）
  const lcMsg = userMessage.toLowerCase();
  // 明らかに該当しないメッセージは早期リターンで処理負荷軽減
  if (!PERSONAL_REFERENCES.some(ref => lcMsg.includes(ref)) || 
      !POSITIVE_KEYWORDS.some(keyword => lcMsg.includes(keyword))) {
    return false;
  }
  
  // 単なる「ありがとう」系の短文は除外
  const simpleThankYous = ['ありがとう', 'ありがとうございます', 'thanks', 'thank you'];
  if (simpleThankYous.includes(userMessage.toLowerCase().trim())) {
    return false;
  }

  // LLMを使用した高度な文脈理解による判定
  return checkEngagementWithLLM(userMessage, history);
}

// LLMを使用して文脈からシェア意図を判定する新しい関数
async function checkEngagementWithLLM(userMessage, history) {
  try {
    console.log('Using LLM to check sharing intent in message:', userMessage);
    
    const prompt = `
ユーザーの次のメッセージから、サービスを他者に共有したい意図や高い満足度を示しているかを判断してください:

"${userMessage}"

判断基準:
1. ユーザーがAIアシスタント「Adam」またはサービスに対して明確な満足や感謝を示している
2. 単なる簡易な感謝（「ありがとう」だけ）ではなく、具体的な言及がある
3. サービスを友人や知人に共有したいという意図や、推薦したい気持ちがある
4. アプリやサービスに対して高い評価をしている

応答は「yes」または「no」のみで答えてください。
`;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "あなたはユーザーの意図を正確に判断するAIです。yes/noのみで回答してください。" },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 10
    });
    
    const result = response.choices[0].message.content.trim().toLowerCase();
    console.log(`LLM engagement check result: ${result}`);
    
    return result === 'yes';
  } catch (error) {
    console.error('Error in LLM engagement check:', error);
    // エラー時はキーワードベースの判定にフォールバック
    const hasPersonalReference = PERSONAL_REFERENCES.some(ref => 
      userMessage.toLowerCase().includes(ref)
    );
    const hasPositiveKeyword = POSITIVE_KEYWORDS.some(keyword => 
      userMessage.includes(keyword)
    );
    return hasPersonalReference && hasPositiveKeyword;
  }
}

async function processWithAI(systemPrompt, userMessage, historyData, mode, userId, client) {
  try {
    console.log(`Processing message in mode: ${mode}`);
    
    // Start performance measurement
    const startTime = Date.now();
    const overallStartTime = startTime; // Add this line to fix the ReferenceError
    
    // historyDataからhistoryとmetadataを取り出す
    const history = historyData.history || [];
    const historyMetadata = historyData.metadata || {};
    
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
        // LocalML processing for other modes (general, mental_health, analysis)
        else if (['general', 'mental_health', 'analysis'].includes(mode)) {
          try {
            console.log('\n🤖 [1C] ML AUGMENTATION: LOCALML DATA - Starting');
            const localMlStartTime = Date.now();
            
            // Process ML data through mlHook
            const { mlData } = await processMlData(userId, userMessage, mode);
            
            const localMlTime = Date.now() - localMlStartTime;
            console.log(`    ├─ [1C.2] ML data processed in ${localMlTime}ms`);
            
            // Log ML data status
            if (mlData) {
              console.log('    ├─ [1C.3] ML DATA RESULTS:');
              console.log(`    │  ✅ User ${mode} analysis: Retrieved`);
              console.log(`    │    └─ Data size: ${JSON.stringify(mlData).length} bytes`);
              
              // Log detected traits or features based on mode
              if (mode === 'general' && mlData.traits) {
                console.log('    │    └─ Detected traits:');
                Object.entries(mlData.traits).forEach(([trait, value]) => {
                  console.log(`    │       - ${trait}: ${value}`);
                });
              } else if (mode === 'mental_health' && mlData.indicators) {
                console.log('    │    └─ Detected indicators:');
                Object.entries(mlData.indicators).forEach(([indicator, value]) => {
                  console.log(`    │       - ${indicator}: ${value}`);
                });
              } else if (mode === 'analysis' && mlData.complexity) {
                console.log('    │    └─ Detected complexity factors:');
                Object.entries(mlData.complexity).forEach(([factor, value]) => {
                  console.log(`    │       - ${factor}: ${value}`);
                });
              }
            } else {
              console.log('    ├─ [1C.3] ML DATA RESULTS:');
              console.log('    │  ❌ No ML data available for this conversation');
            }
            
            console.log('    └─ [1C.4] ML AUGMENTATION: LOCALML DATA - Completed');
            
            return mlData;
          } catch (error) {
            console.error('\n❌ Error processing LocalML data:', error.message);
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
    
    // Service recommendations are shown ONLY when:
    // 1. User preferences allow it (showServiceRecommendations = true)
    // 2. User explicitly asked for advice (using patterns from advice_patterns.js via detectAdviceRequest)
    // This ensures we only show recommendations when users actually want them
    let serviceRecommendationsPromise = Promise.resolve([]);
    let serviceNotificationReason = null;

    if (!userPrefs.showServiceRecommendations) {
      serviceNotificationReason = 'disabled';
      console.log('Skipping service recommendations: User preferences disabled');
    } else {
      // detectAdviceRequestが非同期関数になったため、awaitで結果を取得
      const isAdviceRequest = await detectAdviceRequestWithLLM(userMessage, history);
      if (!isAdviceRequest) {
        serviceNotificationReason = 'no_request';
        console.log('Skipping service recommendations: No advice request detected by LLM');
      } else {
        // Check timing constraints
        const shouldShow = await shouldShowServicesToday(userId, history, userMessage);
        if (!shouldShow) {
          // Check the reason
          const now = Date.now();
          const lastServiceTime = userPrefs.lastServiceTime || 0;
          
          // Count total service recommendations today
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          
          let servicesToday = 0;
          if (userPrefs.recentlyShownServices) {
            for (const timestamp in userPrefs.recentlyShownServices) {
              if (parseInt(timestamp) > todayStart.getTime()) {
                servicesToday += userPrefs.recentlyShownServices[timestamp].length;
              }
            }
          }
          
          if (servicesToday >= 9) {
            serviceNotificationReason = 'daily_limit';
          } else {
            serviceNotificationReason = 'cooldown';
          }
          
          console.log(`Skipping service recommendations: Timing constraints not met (reason: ${serviceNotificationReason})`);
        } else {
          console.log('User explicitly asked for advice and timing is appropriate. Getting service recommendations...');
          // 最終的に表示が決まったら、表示時刻を記録
          userPrefs.lastServiceTime = Date.now();
          userPreferences.updateUserPreferences(userId, userPrefs);
          
          // Enhance conversationContext with the latest user message
          if (conversationContext.recentMessages) {
            conversationContext.recentMessages.push(userMessage);
            console.log(`Added message to conversationContext, now has ${conversationContext.recentMessages.length} messages`);
            console.log(`Latest message: ${conversationContext.recentMessages[conversationContext.recentMessages.length - 1]}`);
          }
          
          serviceRecommendationsPromise = serviceRecommender.getFilteredRecommendations(
            userId, 
            userNeeds,
            conversationContext
          );
        }
      }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n┌──────────────────────────────────────────────────────────┐');
    console.log('│ 3. AI PROMPT CONSTRUCTION PHASE                          │');
    console.log('└──────────────────────────────────────────────────────────┘');
    // ─────────────────────────────────────────────────────────────────────
    
    // デバッグログ追加
    console.log(`\n======= AIプロンプト構築デバッグ =======`);
    console.log(`→ モード: ${mode}`);
    console.log(`→ 会話履歴件数: ${history.length}`);
    
    // 特性分析に関するキーワードの検出
    const analysisKeywords = ['特性', '分析', '性格', '過去の記録', '履歴'];
    const containsAnalysisKeywords = userMessage && analysisKeywords.some(keyword => userMessage.includes(keyword));
    console.log(`→ 特性分析キーワード検出: ${containsAnalysisKeywords}`);
    
    // 特性/キャリア分析モードの確認
    if (mode === 'characteristics' || mode === 'career') {
      console.log(`→ 特性/キャリア分析モードが有効`);
      
      // historyDataオブジェクトからメタデータを安全に取得
      const historyMetadata = historyData && historyData.metadata ? historyData.metadata : {};
      
      if (historyMetadata.insufficientReason) {
        console.log(`→ 履歴不足理由: ${historyMetadata.insufficientReason}`);
        if (historyMetadata.insufficientReason === 'few_records') {
          console.log(`→ 履歴が少ない警告をプロンプトに追加: ${history.length}件`);
        } else if (historyMetadata.insufficientReason === 'translation_heavy') {
          console.log(`→ 翻訳依頼が多い警告をプロンプトに追加: 翻訳率=${historyMetadata.translationPercentage}%`);
        }
      } else if (history.length < 3) {
        console.log(`→ 履歴が3件未満の警告をプロンプトに追加: ${history.length}件`);
      }
    }
    console.log(`======= AIプロンプト構築デバッグ終了 =======\n`);
    
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
      
      // Record baseline prompt size before adding ML data
      const baselinePromptSize = JSON.stringify(messages).length;
      console.log(`    ├─ Baseline prompt size before ML data: ${baselinePromptSize} bytes`);
      
      // Log the basic system instruction content before ML augmentation
      const systemInstructions = messages.find(m => m.role === 'system')?.content || '';
      console.log(`    ├─ Base system instructions: ${systemInstructions.substring(0, 100)}...`);
      
      if (perplexityData.jobTrends) {
        console.log('    ├─ Adding job market trends:');
        console.log(`    │  └─ Market analysis: ${perplexityData.jobTrends.analysis ? perplexityData.jobTrends.analysis.length : 0} characters`);
        console.log(`    │  └─ Job URLs: ${perplexityData.jobTrends.urls ? 'Included' : 'Not available'}`);
        
        // Extract key market insights for logging
        const marketInsights = extractKeyInsights(perplexityData.jobTrends.analysis, 3);
        console.log('    │  └─ Key market insights:');
        marketInsights.forEach((insight, i) => {
          console.log(`    │     ${i+1}. ${insight.substring(0, 40)}...`);
        });
        
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
        
        // Extract key characteristics for logging
        const userCharacteristics = extractKeyInsights(perplexityData.knowledge, 3);
        console.log('       └─ Key user characteristics:');
        userCharacteristics.forEach((characteristic, i) => {
          console.log(`          ${i+1}. ${characteristic.substring(0, 40)}...`);
        });
        
        messages.push({
          role: 'system',
          content: `
# ユーザー特性の追加分析 (Perplexityから取得)

${perplexityData.knowledge}

この特性を考慮してアドバイスを提供してください。
`
        });
      }
      
      // Log the ML data impact on prompt size
      const mlAugmentedPromptSize = JSON.stringify(messages).length;
      const promptSizeIncrease = mlAugmentedPromptSize - baselinePromptSize;
      const percentIncrease = ((promptSizeIncrease / baselinePromptSize) * 100).toFixed(1);
      console.log(`    ├─ ML-augmented prompt size: ${mlAugmentedPromptSize} bytes`);
      console.log(`    └─ ML data added ${promptSizeIncrease} bytes (${percentIncrease}% increase)`);
    }
    // Add LocalML data for other modes (general, mental_health, analysis)
    else if (['general', 'mental_health', 'analysis'].includes(mode)) {
      console.log('\n🔄 [3B] INTEGRATING LOCAL ML DATA INTO PROMPT');
      
      // Record baseline prompt size before adding ML data
      const baselinePromptSize = JSON.stringify(messages).length;
      console.log(`    ├─ Baseline prompt size before ML data: ${baselinePromptSize} bytes`);
      
      // Get system prompt from ML data
      const { systemPrompt } = await processMlData(userId, userMessage, mode);
      
      if (systemPrompt) {
        console.log(`    ├─ Adding ${mode} mode ML analysis`);
        console.log(`    │  └─ Analysis length: ${systemPrompt.length} characters`);
        
        // Add the ML system prompt
        messages.push({
          role: 'system',
          content: systemPrompt
        });
        
        // Log the ML data impact on prompt size
        const mlAugmentedPromptSize = JSON.stringify(messages).length;
        const promptSizeIncrease = mlAugmentedPromptSize - baselinePromptSize;
        const percentIncrease = ((promptSizeIncrease / baselinePromptSize) * 100).toFixed(1);
        console.log(`    ├─ ML-augmented prompt size: ${mlAugmentedPromptSize} bytes`);
        console.log(`    └─ ML data added ${promptSizeIncrease} bytes (${percentIncrease}% increase)`);
      } else {
        console.log(`    └─ No ML data available to integrate`);
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
          
          // Pre-response analysis: Show what information we expect the ML data to provide
          if (mode === 'career' && perplexityData) {
            console.log('    ├─ Expected ML influence on response:');
            
            if (perplexityData.jobTrends && perplexityData.jobTrends.analysis) {
              // Extract key job sectors from the market data
              const jobSectors = extractJobSectors(perplexityData.jobTrends.analysis);
              console.log('    │  └─ Expected job sectors in response:');
              jobSectors.forEach((sector, i) => {
                if (i < 3) {
                  console.log(`    │     - ${sector}`);
                }
              });
              
              // Add more detailed analysis of job trends data
              console.log('    │  └─ Market data influence details:');
              // Check for salary information
              const hasSalary = perplexityData.jobTrends.analysis.includes('年収') || 
                               perplexityData.jobTrends.analysis.includes('給与') ||
                               perplexityData.jobTrends.analysis.includes('賃金');
              console.log(`    │     - Salary information: ${hasSalary ? '含まれる✅' : '含まれない❌'}`);
              
              // Check for skill requirements
              const hasSkills = perplexityData.jobTrends.analysis.includes('スキル') || 
                               perplexityData.jobTrends.analysis.includes('能力') ||
                               perplexityData.jobTrends.analysis.includes('資格');
              console.log(`    │     - Skill requirements: ${hasSkills ? '含まれる✅' : '含まれない❌'}`);
              
              // Check for future trends
              const hasFutureTrends = perplexityData.jobTrends.analysis.includes('将来') || 
                                     perplexityData.jobTrends.analysis.includes('今後') ||
                                     perplexityData.jobTrends.analysis.includes('予測');
              console.log(`    │     - Future predictions: ${hasFutureTrends ? '含まれる✅' : '含まれない❌'}`);
            }
            
            if (perplexityData.knowledge) {
              // Extract personality traits from user characteristics
              const personalityTraits = extractPersonalityTraits(perplexityData.knowledge);
              console.log('    │  └─ Expected personality traits addressed:');
              personalityTraits.forEach((trait, i) => {
                if (i < 3) {
                  console.log(`    │     - ${trait}`);
                }
              });
              
              // Add more detailed analysis of user characteristics data
              console.log('    │  └─ User characteristics influence details:');
              
              // Check for communication style
              const hasCommunication = perplexityData.knowledge.includes('コミュニケーション') || 
                                      perplexityData.knowledge.includes('対話') ||
                                      perplexityData.knowledge.includes('会話');
              console.log(`    │     - Communication style: ${hasCommunication ? '分析済み✅' : '未分析❌'}`);
              
              // Check for decision-making patterns
              const hasDecisionMaking = perplexityData.knowledge.includes('決断') || 
                                       perplexityData.knowledge.includes('判断') ||
                                       perplexityData.knowledge.includes('選択');
              console.log(`    │     - Decision patterns: ${hasDecisionMaking ? '分析済み✅' : '未分析❌'}`);
              
              // Check for values and priorities
              const hasValues = perplexityData.knowledge.includes('価値観') || 
                               perplexityData.knowledge.includes('大切') ||
                               perplexityData.knowledge.includes('重視');
              console.log(`    │     - Values/priorities: ${hasValues ? '分析済み✅' : '未分析❌'}`);
            }
          }
          
          // Call OpenAI API
          console.log('    ├─ Sending request to OpenAI API...');
          const response = await openai.chat.completions.create(requestOptions);
          
          // 特性分析に関連するキーワードを持つメッセージかどうかを確認
          const isCharacteristicsRelated = userMessage && [
            '特性', '分析', '性格', '過去の記録', '履歴'
          ].some(keyword => userMessage.includes(keyword));
          
          // デバッグログ追加
          if (isCharacteristicsRelated) {
            console.log(`\n======= 特性分析関連レスポンスデバッグ =======`);
            console.log(`→ AIレスポンス先頭: ${response.choices[0].message.content.substring(0, 50)}...`);
            console.log(`→ 「過去の記録がない」関連フレーズを含むか: ${
              response.choices[0].message.content.includes('過去の記録がない') || 
              response.choices[0].message.content.includes('会話履歴がない') ||
              response.choices[0].message.content.includes('過去の会話履歴がない')
            }`);
            
            // レスポンスに問題がある場合、生成時の条件を詳細出力
            if (response.choices[0].message.content.includes('過去の記録がない') || 
                response.choices[0].message.content.includes('会話履歴がない') ||
                response.choices[0].message.content.includes('過去の会話履歴がない')) {
              console.log(`→ モード: ${mode}`);
              console.log(`→ 会話履歴件数: ${history.length}`);
              console.log(`→ ユーザーメッセージ: ${userMessage}`);
              console.log(`→ 使用モデル: ${model}`);
              
              // システムプロンプト（messages配列の最初の要素）を使用
              const systemPromptContent = messages[0].content;
              
              // 重要な部分の処理確認
              console.log(`→ プロンプトに「過去の記録がないなどとは言わず」の指示: ${
                systemPromptContent.includes('過去の記録がない」などとは言わず')
              }`);
            }
            console.log(`======= 特性分析関連レスポンスデバッグ終了 =======\n`);
          }
          
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
          // 安全にconfidenceプロパティにアクセス
          const confidenceStr = rec.confidence ? `confidence ${rec.confidence.toFixed(2)}` : 'confidence N/A';
          
          // 適切なサービス名の表示処理（オブジェクトの場合の処理を改善）
          let serviceName;
          if (typeof rec === 'string') {
            serviceName = rec;
          } else if (rec.serviceName) {
            serviceName = rec.serviceName;
          } else if (rec.id) {
            serviceName = rec.id;
          } else {
            serviceName = JSON.stringify(rec).substring(0, 30); // 長すぎる場合は切り詰める
          }
          
          console.log(`    ├─ [${index + 1}] ${serviceName}: ${confidenceStr}`);
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
    
    // New logging: Analyze how ML data influenced the AI response
    if (mode === 'career' && perplexityData) {
      console.log('\n=== ML DATA INFLUENCE ANALYSIS ===');
      
      // Analyze job market influence
      if (perplexityData.jobTrends && perplexityData.jobTrends.analysis) {
        console.log('\n📊 ML INFLUENCE: JOB MARKET DATA');
        
        // Extract key phrases from job trends analysis
        const jobTrendsText = perplexityData.jobTrends.analysis;
        const keyPhrases = extractSignificantPhrases(jobTrendsText);
        console.log('   ├─ Key market insights from Perplexity:');
        keyPhrases.forEach((phrase, index) => {
          if (index < 5) { // Limit to top 5 phrases
            console.log(`   │  ${index + 1}. ${phrase}`);
          }
        });
        
        // Check if these phrases appear in the response
        const phrasesInResponse = keyPhrases.filter(phrase => 
          aiResponse.includes(phrase) || 
          aiResponse.includes(phrase.substring(0, Math.min(phrase.length, 15)))
        );
        
        console.log('   ├─ Market data influence detection:');
        if (phrasesInResponse.length > 0) {
          console.log(`   │  ✅ Found ${phrasesInResponse.length} market insights in the response`);
          phrasesInResponse.forEach((phrase, index) => {
            if (index < 3) { // Limit to top 3 matches
              console.log(`   │     - "${phrase.substring(0, 30)}..."`)
            }
          });
        } else {
          console.log('   │  ⚠️ No direct market data phrases detected in response');
          console.log('   │     (Data may still have influenced general reasoning)');
        }
        
        // Check for job URLs influence
        if (perplexityData.jobTrends.urls) {
          const urlsIncluded = aiResponse.includes('http') || aiResponse.includes('www') || 
                              aiResponse.includes('求人') || aiResponse.includes('サイト');
          console.log(`   │  ${urlsIncluded ? '✅' : '❌'} Job URLs influence: ${urlsIncluded ? 'Detected' : 'Not detected'}`);
        }
      }
      
      // Analyze user characteristics influence
      if (perplexityData.knowledge) {
        console.log('\n👤 ML INFLUENCE: USER CHARACTERISTICS');
        
        // Extract key insights from user analysis
        const userInsightsText = perplexityData.knowledge;
        const userInsights = extractSignificantPhrases(userInsightsText);
        console.log('   ├─ Key user insights from Perplexity:');
        userInsights.forEach((insight, index) => {
          if (index < 5) { // Limit to top 5 insights
            console.log(`   │  ${index + 1}. ${insight}`);
          }
        });
        
        // Check if these insights appear in the response
        const insightsInResponse = userInsights.filter(insight => 
          aiResponse.includes(insight) || 
          aiResponse.includes(insight.substring(0, Math.min(insight.length, 15)))
        );
        
        console.log('   ├─ User characteristics influence detection:');
        if (insightsInResponse.length > 0) {
          console.log(`   │  ✅ Found ${insightsInResponse.length} user traits in the response`);
          insightsInResponse.forEach((insight, index) => {
            if (index < 3) { // Limit to top 3 matches
              console.log(`   │     - "${insight.substring(0, 30)}..."`)
            }
          });
        } else {
          console.log('   │  ⚠️ No direct user trait phrases detected in response');
          console.log('   │     (Characteristics may still have guided overall approach)');
        }
        
        // Look for terms that suggest personality-based recommendations
        const personalTerms = ["あなたの", "あなたは", "personality", "特性", "傾向", "タイプ", "向いています", "合っています"];
        const personalRecommendation = personalTerms.some(term => aiResponse.includes(term));
        console.log(`   │  ${personalRecommendation ? '✅' : '❌'} Personalized approach: ${personalRecommendation ? 'Detected' : 'Not detected'}`);
      }
      
      // Overall influence assessment
      console.log('\n🔄 ML INFLUENCE: OVERALL ASSESSMENT');
      // Compare response length with and without ML data
      const averageBaseResponseLength = 1000; // Estimated average
      const responseLengthRatio = aiResponse.length / averageBaseResponseLength;
      console.log(`   ├─ Response richness: ${responseLengthRatio.toFixed(2)}x typical length`);
      
      // Check for market terminology
      const marketTerms = ["市場", "トレンド", "需要", "業界", "成長", "最新", "現在"];
      const marketTermsCount = marketTerms.filter(term => aiResponse.includes(term)).length;
      console.log(`   ├─ Market awareness: ${marketTermsCount}/${marketTerms.length} market terms used`);
      
      // Check for specificity
      const specificTerms = ["具体的", "例えば", "たとえば", "特に", "実際に", "現実的"];
      const specificTermsCount = specificTerms.filter(term => aiResponse.includes(term)).length;
      console.log(`   ├─ Response specificity: ${specificTermsCount}/${specificTerms.length} specificity indicators`);
      
      // Time references - check if response discusses current time period
      const timeTerms = ["2023年", "2024年", "2025年", "現在", "最近", "近年", "今日", "将来"];
      const timeTermsCount = timeTerms.filter(term => aiResponse.includes(term)).length;
      console.log(`   ├─ Temporal relevance: ${timeTermsCount}/${timeTerms.length} time references`);
      
      // Add detailed ML data impact on specific aspects of the response
      console.log('   ├─ ML データが回答に与えた具体的な影響:');
      
      // 1. Check if the response mentions specific jobs/roles that were in the ML data
      if (perplexityData.jobTrends && perplexityData.jobTrends.analysis) {
        // Extract job roles from ML data
        const jobRoleRegex = /([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}A-Za-z]+?)(エンジニア|デザイナー|マネージャー|ディレクター|コンサルタント|スペシャリスト|アナリスト)/gu;
        const jobRolesInData = [];
        let match;
        const dataText = perplexityData.jobTrends.analysis;
        while ((match = jobRoleRegex.exec(dataText)) !== null) {
          jobRolesInData.push(match[0]);
        }
        
        // Check which job roles from data are mentioned in response
        const jobRolesInResponse = jobRolesInData.filter(role => aiResponse.includes(role));
        console.log(`   │  ├─ ML データの職種が回答に反映: ${jobRolesInResponse.length}/${jobRolesInData.length > 0 ? jobRolesInData.length : '0'}`);
        jobRolesInResponse.forEach((role, i) => {
          if (i < 3) console.log(`   │  │  └─ ${role}`);
        });
      }
      
      // 2. Check if skill recommendations in response match skills mentioned in ML data
      if (perplexityData.jobTrends && perplexityData.jobTrends.analysis) {
        // Common skills that might be mentioned
        const skillsToCheck = [
          "プログラミング", "コミュニケーション", "英語", "マネジメント", 
          "データ分析", "企画", "マーケティング", "営業", "AI", "機械学習"
        ];
        
        // Filter skills that appear in both ML data and response
        const dataText = perplexityData.jobTrends.analysis;
        const skillsInData = skillsToCheck.filter(skill => dataText.includes(skill));
        const skillsInResponse = skillsInData.filter(skill => aiResponse.includes(skill));
        
        console.log(`   │  ├─ ML データのスキルが回答に反映: ${skillsInResponse.length}/${skillsInData.length > 0 ? skillsInData.length : '0'}`);
        skillsInResponse.forEach((skill, i) => {
          if (i < 3) console.log(`   │  │  └─ ${skill}`);
        });
      }
      
      // 3. Check if user traits from ML data are reflected in career recommendations
      if (perplexityData.knowledge) {
        const userTraits = {
          "論理的思考": ["論理的", "分析的", "体系的"],
          "コミュニケーション能力": ["コミュニケーション", "対話", "会話"], 
          "創造性": ["創造", "クリエイティブ", "新しい"],
          "リーダーシップ": ["リーダー", "主導", "牽引"],
          "忍耐力": ["忍耐", "根気", "継続"],
          "協調性": ["協調", "チーム", "調和"]
        };
        
        // Count traits that appear in both ML data and response
        let traitsReflected = 0;
        let traitsInData = 0;
        const mentionedTraits = [];
        
        Object.entries(userTraits).forEach(([trait, keywords]) => {
          // Check if trait is in ML data
          const traitInData = keywords.some(keyword => perplexityData.knowledge.includes(keyword));
          if (traitInData) {
            traitsInData++;
            // Check if trait is also in response
            const traitInResponse = keywords.some(keyword => aiResponse.includes(keyword));
            if (traitInResponse) {
              traitsReflected++;
              mentionedTraits.push(trait);
            }
          }
        });
        
        console.log(`   │  └─ ML データの性格特性が回答に反映: ${traitsReflected}/${traitsInData > 0 ? traitsInData : '0'}`);
        mentionedTraits.forEach((trait, i) => {
          if (i < 3) console.log(`   │     └─ ${trait}`);
        });
      }
      
      // Final assessment based on indicators
      const influenceScore = (
        (marketTermsCount / marketTerms.length) * 0.3 + 
        (specificTermsCount / specificTerms.length) * 0.3 + 
        (timeTermsCount / timeTerms.length) * 0.2 + 
        Math.min(responseLengthRatio / 2, 1) * 0.2
      ) * 100;
      
      console.log(`   └─ ML influence score: ${Math.round(influenceScore)}% (estimated impact on response)`);
    }
    // LocalML influence analysis for other modes
    else if (['general', 'mental_health', 'analysis'].includes(mode)) {
      // Use mlHook to analyze the response
      const mlInfluence = analyzeResponseWithMl(aiResponse, perplexityData, mode);
      
      if (mlInfluence) {
        console.log('\n=== LOCAL ML DATA INFLUENCE ANALYSIS ===');
        console.log(`\n🔍 ML INFLUENCE SCORE: ${Math.round(mlInfluence.influence_score)}%`);
        
        if (mlInfluence.influence_detected) {
          console.log('   ├─ ML data influence: ✅ Detected');
          if (mlInfluence.influence_details && mlInfluence.influence_details.detected_terms) {
            console.log(`   ├─ Detected ${mlInfluence.influence_details.detected_terms.length} ML-influenced terms`);
            mlInfluence.influence_details.detected_terms.slice(0, 5).forEach((term, i) => {
              console.log(`   │  ${i+1}. ${term}`);
            });
          }
        } else {
          console.log('   ├─ ML data influence: ❌ Not detected');
          console.log('   ├─ ML data may still have influenced general approach');
        }
        
        // Mode-specific analysis
        console.log(`   └─ ${mode.toUpperCase()} mode influence details in logs`);
      }
    }
    
    // Return response and service recommendations
    return {
      response: aiResponse,
      recommendations: serviceRecommendations
    };
  } catch (error) {
    console.error('Error in processWithAI:', error);
    return {
      response: '申し訳ありません。処理中にエラーが発生しました。もう一度お試しください。',
      recommendations: []
    };
  }
}

// Add timeout handling with retries and proper error handling
const MAX_RETRIES = 3;
const TIMEOUT_PER_ATTEMPT = 25000; // 25 seconds per attempt

async function processMessage(userId, messageText) {
  // ユーザーIDの検証
  const validatedUserId = validateUserId(userId);
  if (!validatedUserId) {
    console.error('不正なユーザーIDでのメッセージ処理をスキップします');
    return null;
  }
  
  // メッセージテキストの検証と無害化
  const sanitizedMessage = sanitizeUserInput(messageText);
  if (!sanitizedMessage) {
    console.warn('空のメッセージをスキップします');
    return '申し訳ありませんが、メッセージを受け取れませんでした。もう一度お試しください。';
  }
  
  // 既存の処理を続行
  if (sanitizedMessage.includes('思い出して') || sanitizedMessage.includes('記憶')) {
    return handleChatRecallWithRetries(validatedUserId, sanitizedMessage);
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
  console.log(`\n======= 特性分析デバッグログ: 履歴取得開始 =======`);
  console.log(`→ ユーザーID: ${userId}`);
  
  try {
    // PostgreSQLから最大200件のメッセージを取得
    const pgHistory = await fetchUserHistory(userId, 200);
    console.log(`📝 Found ${pgHistory.length} records from PostgreSQL in ${Date.now() - startTime}ms`);
    
    // Airtableからも追加でデータを取得（可能な場合）
    let airtableHistory = [];
    try {
      if (process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
        const airtable = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY });
        const base = airtable.base(process.env.AIRTABLE_BASE_ID);
        
        // Airtableからの取得を試みる
        const records = await base('ConversationHistory')
          .select({
            filterByFormula: `{userId} = '${userId}'`,
            sort: [{ field: 'timestamp', direction: 'desc' }],
            maxRecords: 100
          })
          .all();
        
        airtableHistory = records.map(record => ({
          role: record.get('role') || 'user',
          content: record.get('content') || '',
          timestamp: record.get('timestamp') || new Date().toISOString()
        }));
        
        console.log(`📝 Found additional ${airtableHistory.length} records from Airtable`);
      }
    } catch (airtableError) {
      console.error(`⚠️ Error fetching from Airtable: ${airtableError.message}`);
      // Airtableからの取得に失敗しても処理を続行
    }
    
    // 両方のソースからのデータを結合
    const combinedHistory = [...pgHistory];
    
    // 重複を避けるために、既にPGに存在しないAirtableのデータのみを追加
    const pgContentSet = new Set(pgHistory.map(msg => `${msg.role}:${msg.content}`));
    
    for (const airtableMsg of airtableHistory) {
      const key = `${airtableMsg.role}:${airtableMsg.content}`;
      if (!pgContentSet.has(key)) {
        combinedHistory.push(airtableMsg);
      }
    }
    
    // タイムスタンプでソート（新しい順）
    combinedHistory.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeB - timeA;
    });
    
    console.log(`📊 Total combined records for analysis: ${combinedHistory.length}`);
    
    // 結合したデータを使用して分析を実行
    const response = await generateHistoryResponse(combinedHistory);
    
    console.log(`✨ History analysis completed in ${Date.now() - startTime}ms`);
    console.log(`→ 特性分析レスポンス生成完了: ${response.substring(0, 50)}...`);
    console.log(`======= 特性分析デバッグログ: 履歴分析完了 =======\n`);
    return {
      type: 'text',
      text: response
    };
    
  } catch (error) {
    console.error(`❌ Error in fetchAndAnalyzeHistory: ${error.message}`);
    console.error(`→ スタックトレース: ${error.stack}`);
    // エラーが発生した場合でも、ユーザーフレンドリーなメッセージを返す
    return {
      type: 'text',
      text: "申し訳ありません。会話履歴の分析中にエラーが発生しました。もう一度お試しいただくか、別の質問をしていただけますか？"
    };
  }
}

async function handleEvent(event) {
  if (event.type === 'follow') {
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
    console.error(`Error in handleEvent: ${error}`);
    return Promise.resolve(null);
  }
}

/**
 * 画像メッセージを処理する関数
 * @param {Object} event - LINEのメッセージイベント
 * @returns {Promise}
 */
async function handleImage(event) {
  const userId = event.source.userId;

  try {
    // 画像メッセージIDを取得
    const messageId = event.message.id;
    
    // ユーザー履歴に画像メッセージを記録（メッセージIDも保存）
    await storeInteraction(userId, 'user', `画像が送信されました (ID: ${messageId})`);

    // 処理中であることを通知
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '画像を分析しています。少々お待ちください...'
    });

    try {
      console.log(`Using image message ID: ${messageId} for analysis`);

      // LINE APIを使用して画像コンテンツを取得
      const stream = await client.getMessageContent(messageId);
      
      // 画像データをバッファに変換
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const imageBuffer = Buffer.concat(chunks);
      
      // Base64エンコード
      const base64Image = imageBuffer.toString('base64');
      
      // 画像の安全性チェック
      const isSafeImage = await checkImageSafety(base64Image);
      
      if (!isSafeImage) {
        console.log('Image did not pass safety check');
        await client.pushMessage(userId, {
          type: 'text',
          text: '申し訳ありません。この画像は不適切であるため、分析できません。適切な画像をお送りください。'
        });
        return Promise.resolve();
      }
      
      // OpenAI Vision APIに送信するリクエストを準備
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "この画像について詳しく説明してください。何が写っていて、どんな状況か、重要な詳細を教えてください。" },
              { 
                type: "image_url", 
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 500
      });
      
      const analysis = response.choices[0].message.content;
      console.log(`Image analysis completed for user ${userId}`);
      
      // ユーザーに分析結果を送信
      await client.pushMessage(userId, {
        type: 'text',
        text: analysis
      });
      
      // 会話履歴に画像分析を記録
      await storeInteraction(userId, 'assistant', `[画像分析] ${analysis}`);
      
    } catch (analysisError) {
      console.error('Error in image analysis:', analysisError);
      
      // エラーメッセージを送信
      await client.pushMessage(userId, {
        type: 'text',
        text: '申し訳ありません。画像の分析中にエラーが発生しました: ' + analysisError.message
      });
    }

    return Promise.resolve();
  } catch (error) {
    console.error(`Error handling image: ${error}`);
    
    // エラーが発生した場合でもユーザーに通知
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '申し訳ありません、画像の処理中にエラーが発生しました。しばらくしてからもう一度お試しください。'
    }).catch(replyError => {
      console.error(`Failed to send error message: ${replyError}`);
    });
    
    return Promise.resolve();
  }
}

async function handleText(event) {
  try {
    const userId = event.source.userId;
    const messageText = event.message.text;
    
    // 特性分析に関連するメッセージかどうかを検出
    if (messageText && (
      messageText.includes('特性') || 
      messageText.includes('分析') || 
      messageText.includes('性格') || 
      messageText.includes('過去の記録') || 
      messageText.includes('履歴')
    )) {
      console.log(`\n======= 特性分析リクエスト検出 =======`);
      console.log(`→ ユーザーID: ${userId}`);
      console.log(`→ メッセージ: ${messageText}`);
      console.log(`======= 特性分析リクエスト検出終了 =======\n`);
    }
    
    // Define feedback patterns for sentiment detection
    const FEEDBACK_PATTERNS = {
      positive: ['ありがとう', 'thank', 'thanks', 'good', 'helpful', 'useful', 'great', 'excellent', '助かる', '役に立つ', 'いいね', 'すごい', '素晴らしい'],
      negative: ['違う', 'wrong', 'bad', 'not helpful', 'useless', 'poor', 'terrible', '役に立たない', '違います', 'だめ', 'ダメ', '違いますよ', '違うよ']
    };
    
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
    
    const userMessage = event.message.text.trim();
    
    // Get user preferences to check for recently shown services
    const preferences = userPreferences.getUserPreferences(userId);
    
    // Check if this is a share mode message
    const { mode, limit } = determineModeAndLimit(userMessage);
    
    // シェアモードが判定された場合のLLM確認処理
    if (mode === 'share') {
      console.log(`Share mode triggered by determineModeAndLimit, confirming with LLM...`);
      const history = await fetchUserHistory(userId, 10);
      const isHighEngagement = await checkHighEngagement(userMessage, history);
      
      if (isHighEngagement) {
        console.log(`High engagement confirmed by LLM, sending sharing URL to user ${userId}`);
        // Send sharing message with Twitter URL
        await storeInteraction(userId, 'user', userMessage);
        const shareMessage = `お褒めの言葉をいただき、ありがとうございます！😊

Adamをお役立ていただけているようで、開発チーム一同とても嬉しく思います。もしよろしければ、下記のリンクからX(Twitter)でシェアしていただけると、より多くの方にAIカウンセラー「Adam」を知っていただけます。

${SHARE_URL}

通常の会話に戻る場合は、そのまま質問や相談を続けていただければと思います。`;

        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: shareMessage
        });
        await storeInteraction(userId, 'assistant', shareMessage);
        return;
      } else {
        console.log(`LLM did not confirm high engagement despite keywords, processing as normal message`);
      }
    }
    
    // Track implicit feedback for recently shown services (continue with original handleText implementation)
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
        const feedbackResult = userPreferences.trackImplicitFeedback(userId, userMessage, recentServices);
        
        // If positive feedback was detected and preferences were updated, respond accordingly
        if (feedbackResult === true) {
          // Respond with a friendly acknowledgement
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: 'ありがとうございます！今後も役立つサービスをご紹介します。'
          });
        }
        
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
            // Check if this was triggered by positive feedback
            const lowerMessage = userMessage.toLowerCase();
            const isPositiveFeedback = FEEDBACK_PATTERNS.positive.some(pattern => lowerMessage.includes(pattern)) && 
                                      !FEEDBACK_PATTERNS.negative.some(pattern => lowerMessage.includes(pattern));
            
            if (isPositiveFeedback) {
              // Friendly response for positive feedback
              responseMessage = `ありがとうございます！今後も役立つサービスをご紹介します。`;
            } else {
              responseMessage = `サービス表示をオンにしました。お役立ちそうなサービスがあれば、会話の中でご紹介します。`;
            }
          } else {
            // Check if this was triggered by negative feedback
            const lowerMessage = userMessage.toLowerCase();
            const isNegativeFeedback = FEEDBACK_PATTERNS.negative.some(pattern => lowerMessage.includes(pattern));
            
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
      // Check if this user recently received an image generation - if so, skip ASD guide
      const recentImageTimestamp = recentImageGenerationUsers.get(userId);
      console.log(`[DEBUG] ASD Guide check - User ${userId} has recentImageTimestamp: ${recentImageTimestamp ? 'YES' : 'NO'}`);
      if (recentImageTimestamp) {
        const timeSinceImage = Date.now() - recentImageTimestamp;
        console.log(`[DEBUG] ASD Guide check - Time since image generation: ${timeSinceImage}ms, Protection threshold: 30000ms`);
      }
      
      if (recentImageTimestamp && (Date.now() - recentImageTimestamp < 30000)) { // 30 seconds protection
        console.log(`User ${userId} recently received image generation, skipping ASD guide`);
        recentImageGenerationUsers.delete(userId); // Clean up after use
        return;
      }
      
      return handleASDUsageInquiry(event);
    }
    
    // Check if image generation is in progress for this user - if so, skip further processing
    if (imageGenerationInProgress.has(userId)) {
      console.log(`Image generation in progress for ${userId}, skipping additional message handling`);
      return;
    }
    
    // pendingImageExplanations のチェック（はい/いいえ 判定）
    if (pendingImageExplanations.has(userId)) {
      if (userMessage === "はい") {
        const explanationText = pendingImageExplanations.get(userId);
        pendingImageExplanations.delete(userId);
        console.log("ユーザーの「はい」が検出されました。画像生成を開始します。");
        return handleVisionExplanation(event, explanationText);
      } else if (userMessage === "いいえ") {
        pendingImageExplanations.delete(userId);
        console.log("ユーザーの「いいえ」が検出されました。画像生成をキャンセルします。");
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: "承知しました。引き続きテキストでの回答を行います。"
        });
      }
    }

    // Add prevention check for users who just received image generation (prevents ASD guide sending)
    const recentImageTimestamp = recentImageGenerationUsers.get(userId);
    if (recentImageTimestamp) {
      const timeSinceImage = Date.now() - recentImageTimestamp;
      console.log(`[DEBUG] Recent image check - User ${userId}, time since image: ${timeSinceImage}ms, threshold: 10000ms`);
    }

    if (recentImageTimestamp && (Date.now() - recentImageTimestamp < 10000)) {
      console.log("画像生成直後のため、重複応答を防止します。");
      recentImageGenerationUsers.delete(userId);
      return;
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
    const historyData = await fetchUserHistory(userId, 10);
    const historyForProcessing = historyData.history || [];
    const historyMetadata = historyData.metadata || {};
    const systemPrompt = getSystemPromptForMode(mode);

    // 画像説明の提案トリガーチェック：isConfusionRequest のみを使用
    let triggerImageExplanation = false;
    
    
    // 直接的な画像分析リクエストの場合は即座にトリガー
    if (isConfusionRequest(userMessage)) {
      console.log(`[DEBUG] Direct image request detected in message: "${userMessage}"`);
      triggerImageExplanation = true;
    } 
    // それ以外のすべてのメッセージはLLMで分析
    else {
      // LLMを使用して「AIの発言を理解していないか」を判定
      try {
        console.log(`[DEBUG] Analyzing if user understands AI response: "${userMessage}"`);
        
        // 直前のAI回答を取得する
        const previousAIResponse = lastAssistantMessage ? lastAssistantMessage.content : null;
        
        // 直前のAI回答がない場合はスキップ
        if (!previousAIResponse) {
          console.log(`[DEBUG] No previous AI response to analyze against, skipping confusion detection`);
        } else {
          // OpenAI APIを使用して混乱度を判定
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          
          const systemPrompt = `あなたはユーザーとAIの会話を分析し、ユーザーがAIの発言を理解できているかどうかを判断する専門家です。

あなたの任務は、「ユーザーがAIの直前の回答を理解していないかどうか」を判断することです。
ユーザーの発言から、AIの回答に対する混乱や理解困難が示されていると判断できる場合は、その確度（0〜100%）を評価してください。

確度が95%以上の場合のみ「CONFUSED:95」と回答し、それ以外は「NOT_CONFUSED」と回答してください。

判断の際は、以下のポイントに注意してください：
1. ユーザーの発言がAIの回答内容に関連しているか
2. ユーザーが「わからない」「理解できない」などの表現を使っているか
3. ユーザーが説明の簡略化や別の言い方を求めているか
4. ユーザーの質問がAIの回答内容を正しく理解していないことを示しているか

「億劫」などの表現は通常、混乱ではなく単に気が進まないという意味なので混乱とは判断しないでください。
純粋に会話を継続する意図の発言は混乱とみなさないでください。

回答は「CONFUSED:95」または「NOT_CONFUSED」の形式のみで返してください。`;

          // メッセージ配列を作成
          const messages = [
            { role: "system", content: systemPrompt },
            { role: "system", content: `直前のAIの回答: "${previousAIResponse.substring(0, 500)}${previousAIResponse.length > 500 ? '...' : ''}"` },
            { role: "user", content: userMessage }
          ];
          
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            max_tokens: 10,
            temperature: 0.0
          });
          
          const content = response.choices[0].message.content.trim();
          console.log(`[DEBUG] LLM understanding analysis result: ${content}`);
          
          if (content.startsWith('CONFUSED:')) {
            const confidenceParts = content.split(':');
            if (confidenceParts.length > 1) {
              const confidence = parseFloat(confidenceParts[1]);
              if (confidence >= 95) {
                console.log(`[DEBUG] LLM determined user doesn't understand AI response with high confidence (${confidence}%)`);
                triggerImageExplanation = true;
              } else {
                console.log(`[DEBUG] LLM detected some confusion but confidence too low (${confidence}%)`);
              }
            }
          }
        }
      } catch (error) {
        console.error(`[DEBUG] Error in LLM understanding analysis: ${error.message}`);
      }
    }

    if (triggerImageExplanation) {
      console.log(`[DEBUG] Image explanation triggered for user ${userId}`);
      
      // Check if this user recently received an image generation - if so, skip image generation prompt
      const recentImageTimestamp = recentImageGenerationUsers.get(userId);
      if (recentImageTimestamp) {
        console.log(`[DEBUG] User ${userId} has recent image timestamp: ${recentImageTimestamp}, now: ${Date.now()}, diff: ${Date.now() - recentImageTimestamp}ms`);
      }
      
      if (recentImageTimestamp && (Date.now() - recentImageTimestamp < 30000)) { // 30 seconds protection
        console.log(`[DEBUG] User ${userId} recently received image generation, skipping image explanation offer`);
        recentImageGenerationUsers.delete(userId); // Clean up after use
        return;
      }
      
      if (lastAssistantMessage) {
        console.log(`[DEBUG] Setting pendingImageExplanations for user ${userId} with content: "${lastAssistantMessage.content.substring(0, 30)}..."`);
        pendingImageExplanations.set(userId, lastAssistantMessage.content);
      } else {
        console.log(`[DEBUG] No last assistant message found for user ${userId}, using default message`);
        pendingImageExplanations.set(userId, "日常会話の基本とコミュニケーションのポイント");
      }
      
      const suggestionMessage = "前回の回答について、画像による説明を生成しましょうか？「はい」または「いいえ」でお答えください。";
      console.log(`[DEBUG] Image explanation suggestion sent to user ${userId}`);
      await storeInteraction(userId, 'user', userMessage);
      await storeInteraction(userId, 'assistant', suggestionMessage);
      
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: suggestionMessage
      });
    }

    // 通常のテキスト処理へ進む
    await storeInteraction(userId, 'user', userMessage);

    const historyForAIProcessing = await fetchUserHistory(userId, limit);
    // systemPrompt is already defined above
    
    // アドバイス要求の検出（非同期処理に対応）
    const adviceRequested = await detectAdviceRequestWithLLM(userMessage, historyForAIProcessing);
    
    // サービス表示の判断
    const showServices = await shouldShowServicesToday(userId, historyForAIProcessing, userMessage);
    
    // AIでの処理を実行
    const result = await processWithAI(systemPrompt, userMessage, historyForAIProcessing, mode, userId, client);
    
    // サービス推奨がある場合、それを応答に追加
    let finalResponse = result.response;
    const serviceRecommendations = result.recommendations;
    
    if (serviceRecommendations && serviceRecommendations.length > 0) {
      console.log(`Adding ${serviceRecommendations.length} service recommendations to response`);
      
      // サービス推奨の表示用カテゴリを決定
      const category = mode === 'mental_health' ? 'mental_health' : 
                      mode === 'career' ? 'career' : 'general';
      
      // 自然な移行テキストを作成
      const transitionText = createNaturalTransition(finalResponse, category, false);
      
      // サービス情報を構築
      let serviceText = '';
      
      // 最大3つのサービスを表示
      const displayServices = serviceRecommendations.slice(0, 3);
      
      // サービス情報を追加
      displayServices.forEach((service, index) => {
        // サービス名の取得
        let serviceName;
        let serviceDescription = '';
        let serviceUrl = '';
        
        if (typeof service === 'string') {
          // サービスIDからサービス情報を取得
          const serviceInfo = servicesData.find(s => s.id === service);
          if (serviceInfo) {
            serviceName = serviceInfo.name;
            serviceDescription = serviceInfo.description;
            serviceUrl = serviceInfo.url;
          } else {
            serviceName = service;
          }
        } else if (service.name) {
          serviceName = service.name;
          serviceDescription = service.description || '';
          serviceUrl = service.url || '';
        } else if (service.serviceName) {
          serviceName = service.serviceName;
          serviceDescription = service.description || '';
          serviceUrl = service.url || '';
        } else if (service.id) {
          // サービスIDからサービス情報を取得
          const serviceInfo = servicesData.find(s => s.id === service.id);
          if (serviceInfo) {
            serviceName = serviceInfo.name;
            serviceDescription = serviceInfo.description;
            serviceUrl = serviceInfo.url;
          } else {
            serviceName = service.id;
          }
        }
        
        // サービス情報をテキストに追加
        serviceText += `${index + 1}. ${serviceName}`;
        if (serviceUrl) {
          serviceText += `\n   URL: ${serviceUrl}`;
        }
        if (serviceDescription) {
          // 説明文の切り捨て長さを80から150に拡大し、より自然な切り捨てを実現
          const maxDescLength = 150;
          let trimmedDesc = serviceDescription;
          if (serviceDescription.length > maxDescLength) {
            // 文の区切りで切る
            const lastSentenceEnd = serviceDescription.substring(0, maxDescLength).lastIndexOf('。');
            if (lastSentenceEnd > maxDescLength * 0.7) { // 70%以上の位置にある場合
              trimmedDesc = serviceDescription.substring(0, lastSentenceEnd + 1) + '...';
            } else {
              trimmedDesc = serviceDescription.substring(0, maxDescLength) + '...';
            }
          }
          serviceText += `\n   ${trimmedDesc}`;
        }
        serviceText += '\n\n'; // サービス間の区切りを改善
      });
      
      // 最終的な応答を構築
      finalResponse = `${finalResponse}${transitionText}${serviceText}`;
      
      // 推奨されたサービスを記録（将来のユーザーフィードバック追跡のため）
      const preferences = userPreferences.getUserPreferences(userId);
      if (preferences) {
        const timestamp = Date.now().toString();
        const serviceIds = displayServices.map(service => 
          typeof service === 'string' ? service : 
          service.id ? service.id : 
          service.serviceName ? service.serviceName : '');
          
        // 以前の表示済みサービス情報を読み込み
        preferences.recentlyShownServices = preferences.recentlyShownServices || {};
        
        // 新しい表示済みサービス情報を追加
        preferences.recentlyShownServices[timestamp] = serviceIds;
        
        // ユーザー設定を更新
        userPreferences.updateUserPreferences(userId, preferences);
      }
    }
    
    // サービス推奨が表示されない理由をユーザーに通知するための関数
    function getServiceNotificationMessage(userId, showServiceReason) {
      // 通知メッセージ - 実際のUI表示には使用せず、内部的に記録のみ
      if (!showServiceReason) {
        return null; // 理由が指定されていない場合は何も表示しない
      }

      const userPrefs = userPreferences.getUserPreferences(userId);
      
      switch (showServiceReason) {
        case 'disabled':
          return '（現在サービス推奨は無効になっています。「サービス表示オン」と入力すると有効になります）';
        case 'no_request':
          return '（明示的なアドバイス要求がない場合、サービス推奨は表示されません。「アドバイスください」などと入力すると表示されます）';
        case 'daily_limit':
          return '（1日の推奨上限に達しました。明日以降に再度ご利用ください）';
        case 'cooldown':
          return '（最近サービスを推奨したため、しばらく表示を控えています。少し時間をおいてから再度お試しください）';
        default:
          return null;
      }
    }

    // デバッグ情報として表示されない理由を取得
    // (serviceNotificationReasonの初期化が不足していたため、ここで適切に設定)
    let serviceNotificationReason = null;
    
    // ユーザー設定を取得
    const userPrefs = userPreferences.getUserPreferences(userId);
    
    // サービス表示がオフの場合に理由を設定
    if (!showServices && userPrefs && !userPrefs.showServiceRecommendations) {
      serviceNotificationReason = 'disabled';
    } else if (!showServices && !adviceRequested) {
      serviceNotificationReason = 'no_request';
    }
    
    // サービス推奨の通知メッセージを取得
    const notificationMessage = getServiceNotificationMessage(userId, serviceNotificationReason);
    if (notificationMessage) {
      console.log('Service notification message (debug only):', notificationMessage);
      // デバッグモードの場合のみ、AIの応答に追記（本番環境では表示しない）
      if (process.env.DEBUG_MODE === 'true') {
        finalResponse += '\n\n' + notificationMessage;
      }
    }
    
    return client.replyMessage(event.replyToken, { type: 'text', text: finalResponse });
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
 * Now only checks for direct image analysis requests
 * @param {string} text - The message text to check
 * @return {boolean} - True if the message is a direct request for image analysis
 */
function isConfusionRequest(text) {
  // 直接的な画像分析リクエストかどうかを判断するだけの機能に変更
  // 互換性のために関数名は変更せず
  return isDirectImageAnalysisRequest(text);
}

/**
 * Handles vision explanation requests
 * @param {Object} event - The LINE event object
 * @return {Promise<void>}
 */
async function handleVisionExplanation(event, explanationText) {
  const userId = event.source.userId;
  
  // Mark this user as having image generation in progress
  imageGenerationInProgress.set(userId, true);
  console.log(`Starting image generation for user ${userId} - setting protection flag`);
  
  try {
    // explanationTextが提供されている場合、それを使用して画像説明を生成
    if (explanationText) {
      // Check if this is a long text like the ASD guide and summarize if needed
      let displayText = explanationText;
      let enhancedPrompt = "";
      let isASDGuide = false;
      
      // If text is very long (like the ASD guide), create a summary version
      if (explanationText.length > 300) {
        console.log(`[DEBUG] Long text detected (${explanationText.length} chars), creating summary version`);
        
        // Check if it's the ASD guide
        if (explanationText.includes("ASD支援機能の使い方ガイド") || explanationText.includes("自閉症スペクトラム障害")) {
          isASDGuide = true;
          displayText = "ASD支援機能の活用方法";
          enhancedPrompt = "ASD（自閉症スペクトラム障害）支援の主要なポイントを簡潔に示した視覚的な図解。質問例（コミュニケーション、感覚過敏、社会場面などの対応）、基本的な使い方、注意点を含む。シンプルで分かりやすいインフォグラフィック形式。";
          console.log(`[DEBUG] ASD guide detected, using specialized summary and prompt`);
        } else {
          // For other long texts, extract the first sentence or first 100 chars
          displayText = explanationText.split('。')[0] + "。";
          if (displayText.length > 100) {
            displayText = displayText.substring(0, 97) + "...";
          }
          enhancedPrompt = `以下の内容の要点を視覚的に説明するイラスト: ${explanationText.substring(0, 500)}`;
        }
      } else if (explanationText.length <= 20) {
        // 短いテキストの場合は教育的なコンテキストを追加
        console.log(`[DEBUG] Short text detected (${explanationText.length} chars), adding educational context`);
        displayText = explanationText;
        enhancedPrompt = `「${explanationText}」についての教育的で分かりやすい図解。日常生活での応用例や基本概念を含む、明るく親しみやすいイラスト。`;
      } else {
        // For normal length text, use as is
        enhancedPrompt = `以下のテキストに基づいて詳細で、わかりやすいイラストを作成してください。テキスト: ${explanationText}`;
      }
      
      // Use a simple message for generation notification
      let generationMessage = isASDGuide 
        ? "ASD支援機能の主なポイントを視覚化しています。少々お待ちください..."
        : `「${displayText}」に基づく視覚的な説明を生成しています。少々お待ちください...`;
      
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: generationMessage
      });
      
      // DALL-Eを使用して画像を生成
      try {
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        });
        
        console.log(`[DEBUG] Using enhanced prompt: ${enhancedPrompt.substring(0, 100)}...`);
        
        const response = await openai.images.generate({
          model: "dall-e-3",
          prompt: enhancedPrompt,
          n: 1,
          size: "1024x1024",
          quality: "standard"
        });
        
        const imageUrl = response.data[0].url;
        
        // 生成された画像のURLを取得
        console.log(`Generated image URL: ${imageUrl}`);
        
        // Create a concise response message
        let responseMessage = "";
        if (isASDGuide) {
          responseMessage = "ASD支援機能の主なポイントをまとめた画像です。この視覚的な説明は理解の助けになりましたか？";
        } else {
          responseMessage = `「${displayText}」の要点を視覚化しました。この画像は参考になりましたか？`;
        }
        
        // 画像をLINEに送信
        await client.pushMessage(userId, [
          {
            type: 'image',
            originalContentUrl: imageUrl,
            previewImageUrl: imageUrl
          },
          {
            type: 'text',
            text: responseMessage
          }
        ]);
        
        // 生成した画像情報を保存 - Store only image reference with concise text
        let storageText = isASDGuide ? "ASD支援機能の視覚的ガイド" : displayText;
        await storeInteraction(userId, 'assistant', `[生成画像] ${storageText}`);
        
        // Add user to recent image generation tracking with timestamp to prevent ASD guide
        recentImageGenerationUsers.set(userId, Date.now());
        console.log(`[DEBUG] Setting recentImageGenerationUsers timestamp for user ${userId}: ${Date.now()}`);
        
        // Clear the image generation flag after a delay (5 seconds should be enough)
        setTimeout(() => {
          imageGenerationInProgress.delete(userId);
          console.log(`Cleared image generation flag for user ${userId} after successful generation`);
          console.log(`[DEBUG] Image generation protection status - imageGenerationInProgress: ${imageGenerationInProgress.has(userId) ? 'YES' : 'NO'}, recentImageGenerationUsers timestamp: ${recentImageGenerationUsers.get(userId)}`);
        }, 5000);
        
      } catch (error) {
        console.error('DALL-E画像生成エラー:', error);
        
        // エラーの種類に応じたメッセージを提供
        let errorMessage = '申し訳ありません。画像の生成中にエラーが発生しました。';
        
        // 安全システムによる拒否の場合
        if (error.code === 'content_policy_violation' || 
            (error.message && error.message.includes('safety system'))) {
          errorMessage = '申し訳ありません。このテキストから安全な画像を生成できませんでした。「日常会話のポイント」「コミュニケーションの基本」などの具体的なテーマで試してみてください。';
        } else {
          errorMessage += '別の表現で試してみてください。';
        }
        
        await client.pushMessage(userId, {
          type: 'text',
          text: errorMessage
        });
        
        // Also clear the flag in case of error
        imageGenerationInProgress.delete(userId);
        console.log(`Cleared image generation flag for user ${userId} due to error`);
      }
      
      return;
    }
    
    // explanationTextがない場合は通常の画像履歴検索処理を行う
    // Get user's recent history to find the last image
    const history = await fetchUserHistory(userId, 10);
    
    // Find the most recent image message
    const lastImageMessage = history
      .filter(item => item.content && item.content.includes('画像が送信されました'))
      .pop();
    
    if (!lastImageMessage) {
      // No recent image found
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '最近の画像が見つかりませんでした。説明してほしい画像を送信してください。もし画像の説明を求めていない場合は、別の質問をお願いします。'
      });
      return;
    }

    // 処理中であることを通知
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '画像を分析しています。少々お待ちください...'
    });

    // 画像メッセージIDを抽出
    const messageIdMatch = lastImageMessage.content.match(/\(ID: ([^)]+)\)/);
    const messageId = messageIdMatch ? messageIdMatch[1] : null;
    
    if (!messageId) {
      throw new Error('画像メッセージIDが見つかりませんでした');
    }
    
    console.log(`Using image message ID: ${messageId} for analysis`);

    // LINE APIを使用して画像コンテンツを取得
    const stream = await client.getMessageContent(messageId);
    
    // 画像データをバッファに変換
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const imageBuffer = Buffer.concat(chunks);
    
    // Base64エンコード
    const base64Image = imageBuffer.toString('base64');
    
    // OpenAI Vision APIに送信するリクエストを準備
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "この画像について詳しく説明してください。何が写っていて、どんな状況か、重要な詳細を教えてください。" },
            { 
              type: "image_url", 
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 500
    });
    
    const analysis = response.choices[0].message.content;
    console.log(`Image analysis completed for user ${userId}`);
    
    // ユーザーに分析結果を送信
    await client.pushMessage(userId, {
      type: 'text',
      text: analysis
    });
    
    // 会話履歴に画像分析を記録
    await storeInteraction(userId, 'assistant', `[画像分析] ${analysis}`);
    
  } catch (error) {
    console.error('Error in handleVisionExplanation:', error);
    
    // エラーメッセージを送信
    try {
      await client.pushMessage(userId, {
        type: 'text',
        text: '申し訳ありません。画像の分析中にエラーが発生しました: ' + error.message
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

// Define the missing handleASDUsageInquiry function
async function handleASDUsageInquiry(event) {
  const userId = event.source.userId;
  const messageText = event.message.text;
  
  console.log(`[DEBUG] handleASDUsageInquiry called for user ${userId}`);
  console.log(`[DEBUG] Protection check - imageGenerationInProgress: ${imageGenerationInProgress.has(userId) ? 'YES' : 'NO'}, recentImageTimestamp: ${recentImageGenerationUsers.has(userId) ? recentImageGenerationUsers.get(userId) : 'NONE'}`);
  
  // Check if image generation is in progress - if so, skip sending ASD guide
  if (imageGenerationInProgress.has(userId)) {
    console.log(`Image generation in progress for ${userId}, skipping ASD guide`);
    return;
  }
  
  // Create a comprehensive response about ASD support features
  const response = `
【ASD支援機能の使い方ガイド】

Adamでは以下のようなASD(自閉症スペクトラム障害)に関する質問や相談に対応できます：

■ 対応可能な質問例
• 「自閉症スペクトラムの特性について教えて」
• 「ASDの子どもとのコミュニケーション方法は？」
• 「感覚過敏への対処法を知りたい」
• 「社会的場面での不安に対するアドバイスが欲しい」
• 「特定の興味や関心を活かせる仕事は？」
• 「構造化や視覚支援の方法を教えて」
• 「学校や職場での合理的配慮について」

■ 使い方
• テキストで質問するだけ：気になることを自然な言葉で入力してください
• 継続的な会話：フォローアップ質問も自然にできます
• 画像の送信：視覚的な説明が必要なときは「画像で説明して」と伝えてください

■ 注意点
• 医学的診断はできません
• あくまで情報提供や一般的なアドバイスが中心です
• 専門家への相談も並行して検討してください

何か具体的に知りたいことがあれば、お気軽に質問してください。
`;

  // Store the interaction
  await storeInteraction(userId, 'user', messageText);
  await storeInteraction(userId, 'assistant', response);

  // Reply to the user
  await client.replyMessage(event.replyToken, {
    type: 'text',
    text: response
  });
  
  return;
}

// Helper functions for ML influence analysis
function extractJobSectors(marketData) {
  if (!marketData) return [];
  
  // List of common job sectors and related terms to look for
  const sectorKeywords = {
    'AI/機械学習': ['AI', '人工知能', '機械学習', 'ディープラーニング', 'データサイエンティスト'],
    'ウェブ開発': ['ウェブ', 'Web', 'フロントエンド', 'バックエンド', 'フルスタック'],
    'モバイル開発': ['モバイル', 'iOS', 'Android', 'アプリ開発'],
    'クラウド': ['クラウド', 'AWS', 'Azure', 'GCP', 'DevOps'],
    'サイバーセキュリティ': ['セキュリティ', 'サイバー', 'ハッキング', '脆弱性'],
    'ブロックチェーン': ['ブロックチェーン', '暗号通貨', 'NFT', 'Web3'],
    'IoT': ['IoT', 'インターネット・オブ・シングス', 'センサー', '組み込み'],
    '医療/ヘルスケア': ['医療', 'ヘルスケア', '健康', '病院'],
    '金融/フィンテック': ['金融', 'フィンテック', '銀行', '投資'],
    '教育': ['教育', 'EdTech', '学習', '教師'],
    '持続可能性': ['持続可能', 'SDGs', '環境', 'グリーン', 'カーボンニュートラル']
  };
  
  // Count mentions of each sector
  const sectorCounts = {};
  Object.entries(sectorKeywords).forEach(([sector, keywords]) => {
    sectorCounts[sector] = keywords.filter(keyword => 
      marketData.includes(keyword)
    ).length;
  });
  
  // Return sectors sorted by mention count (only those with at least one mention)
  return Object.entries(sectorCounts)
    .filter(([_, count]) => count > 0)
    .sort(([_, countA], [__, countB]) => countB - countA)
    .map(([sector, _]) => sector);
}

function extractPersonalityTraits(text) {
  if (!text) return [];
  
  const traits = [
    ['論理的', '分析的', '理性的'],
    ['創造的', '革新的', 'クリエイティブ'],
    ['社交的', '外向的', 'コミュニケーション'],
    ['慎重', '注意深い', '計画的'],
    ['リーダーシップ', '指導的', 'マネジメント'],
    ['サポート', '協力的', '支援'],
    ['目標志向', '成果主義', '達成']
  ];
  
  return traits
    .filter(synonyms => synonyms.some(trait => text.includes(trait)))
    .map(([trait, _]) => trait);
}

// Helper function to extract key insights from text
function extractKeyInsights(text, count = 3) {
  if (!text) return [];
  
  // Split by sentence end markers and filter for meaningful sentences
  const sentences = text.split(/[。.?!]/).filter(s => s.length > 15);
  
  // Sort by length (shorter sentences are often more concise insights)
  const sortedSentences = [...sentences].sort((a, b) => {
    // Prioritize sentences with key indicator terms
    const keyTerms = ['重要', '特徴', '傾向', '注目', '成長', '特性', '好み', '強み', '市場'];
    const aScore = keyTerms.filter(term => a.includes(term)).length;
    const bScore = keyTerms.filter(term => b.includes(term)).length;
    
    if (aScore !== bScore) return bScore - aScore;
    
    // Then consider length (prefer 20-50 character sentences)
    const aLengthScore = Math.abs(35 - a.length);
    const bLengthScore = Math.abs(35 - b.length);
    return aLengthScore - bLengthScore;
  });
  
  // Return top insights
  return sortedSentences.slice(0, count).map(s => s.trim());
}

// Helper function to extract meaningful phrases from text
function extractSignificantPhrases(text) {
  if (!text) return [];
  
  // Split into sentences
  const sentences = text.split(/。|\./).filter(s => s.trim().length > 10);
  
  // Extract key phrases (8-30 characters)
  let phrases = [];
  for (const sentence of sentences) {
    // Split by common separators
    const parts = sentence.split(/、|,|（|）|\(|\)|「|」|『|』|"|"|'|'/).filter(p => p.trim().length >= 8 && p.trim().length <= 30);
    phrases = [...phrases, ...parts.map(p => p.trim())];
    
    // If the sentence itself is a good length, include it too
    if (sentence.trim().length >= 8 && sentence.trim().length <= 40) {
      phrases.push(sentence.trim());
    }
  }
  
  // Deduplicate and filter out very similar phrases
  const uniquePhrases = [];
  for (const phrase of phrases) {
    if (!uniquePhrases.some(p => 
      p.includes(phrase) || 
      phrase.includes(p) || 
      levenshteinDistance(p, phrase) < Math.min(p.length, phrase.length) * 0.3
    )) {
      uniquePhrases.push(phrase);
    }
  }
  
  return uniquePhrases.slice(0, 10); // Return up to 10 phrases
}

// Helper function for string similarity
function levenshteinDistance(a, b) {
  const matrix = Array(a.length + 1).fill().map(() => Array(b.length + 1).fill(0));
  
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i-1][j] + 1,
        matrix[i][j-1] + 1,
        matrix[i-1][j-1] + cost
      );
    }
  }
  
  return matrix[a.length][b.length];
}

// Create a natural transition based on message content
function createNaturalTransition(responseText, category, isMinimal) {
  // より単純かつ一貫性のあるカテゴリ判定ロジック
  if (isMinimal) {
    return '\n\n■ サポート情報 ■\n必要な時にご覧いただければ幸いです：\n';
  }
  
  // カテゴリごとに適切な導入メッセージを表示
  switch (category) {
    case 'mental_health':
      return '\n\n■ メンタルヘルスサポート ■\nこちらのサービスが心の健康をサポートするかもしれません：\n';
    case 'career':
      return '\n\n■ キャリア支援サービス ■\nキャリアアップに役立つかもしれないサービスをご紹介します：\n';
    case 'social':
      return '\n\n■ コミュニティサポート ■\n以下のサービスが社会とのつながりをサポートします：\n';
    case 'financial':
      return '\n\n■ 生活支援サービス ■\n経済的な支援に関する以下のサービスが参考になるかもしれません：\n';
    case 'education':
      return '\n\n■ 学習支援サービス ■\n以下の学習サポートサービスがお役に立つかもしれません：\n';
    case 'daily_living':
      return '\n\n■ 日常生活サポート ■\n日常生活をサポートする以下のサービスをご紹介します：\n';
    default:
      // レスポンスのコンテンツに基づいて判断（バックアップ）
      if (responseText.includes('ストレス') || responseText.includes('不安') || 
          responseText.includes('悩み') || responseText.includes('落ち込み')) {
        return '\n\n■ メンタルヘルスサポート ■\nこちらのサービスが心の健康をサポートするかもしれません：\n';
      } else if (responseText.includes('キャリア') || responseText.includes('仕事') || 
                responseText.includes('就職') || responseText.includes('転職')) {
        return '\n\n■ キャリア支援サービス ■\nキャリアアップに役立つかもしれないサービスをご紹介します：\n';
      } else if (responseText.includes('スキル') || responseText.includes('技術') || 
                responseText.includes('学習') || responseText.includes('勉強')) {
        return '\n\n■ スキルアップ支援 ■\n以下のサービスがスキル向上に役立つかもしれません：\n';
      }
      // デフォルトの一般的なメッセージ
      return '\n\n■ 関連サポートサービス ■\n以下のサービスが参考になるかもしれません：\n';
  }
}

/**
 * Detect if the user is asking for advice or recommendations using LLM context understanding
 */
function detectAdviceRequest(userMessage, history) {
  if (!userMessage) return false;
  
  // Use LLM to detect if user needs advice based on context
  return detectAdviceRequestWithLLM(userMessage, history);
}

/**
 * Use GPT-4o-mini to determine if user is asking for advice or in need of service recommendations
 */
async function detectAdviceRequestWithLLM(userMessage, history) {
  try {
    console.log('Using LLM to analyze if user needs service recommendations');
    
    const prompt = `
ユーザーの次のメッセージから、アドバイスやサービスの推薦を求めているか、または困った状況にあるかを判断してください:

"${userMessage}"

判断基準:
1. ユーザーが明示的にアドバイスやサービスの推薦を求めている
2. ユーザーが困った状況や問題を抱えており、サービス推薦が役立つ可能性がある
3. 単なる雑談やお礼の場合は推薦不要
4. ユーザーが推薦を拒否している場合は推薦不要

応答は「yes」または「no」のみで答えてください。
`;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "あなたはユーザーの意図を正確に判断するAIです。yes/noのみで回答してください。" },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 10
    });
    
    const result = response.choices[0].message.content.trim().toLowerCase();
    console.log(`LLM advice request detection result: ${result}`);
    
    return result === 'yes';
  } catch (error) {
    console.error('Error in LLM advice request detection:', error);
    // Fall back to simpler heuristic in case of error
    return false;
  }
}

/**
 * Check if it's an appropriate time in the conversation to show service recommendations
 */
function isAppropriateTimeForServices(history, userMessage) {
  if (!history || history.length < 1) return true;
  
  // Check if the conversation just started (fewer than 4 messages)
  if (history.length < 4) {
    return false; // Too early in conversation
  }
  
  // Get the most recent messages
  const recentMessages = history.slice(-5);
  
  // Check if services were already shown very recently
  let lastServiceTime = -1;
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (msg.role === 'assistant' && 
        msg.content && 
        (msg.content.includes('サービス') || 
         msg.content.includes('■ お役立ち情報 ■') || 
         msg.content.includes('■ サポート情報 ■'))) {
      lastServiceTime = i;
      break;
    }
  }
  
  // If services were shown in the last message, don't show again
  if (lastServiceTime === recentMessages.length - 1) {
    return false;
  }
  
  // If services were shown in the last 2 exchanges, check if user engaged
  if (lastServiceTime >= 0 && lastServiceTime >= recentMessages.length - 3) {
    // Check if user mentioned services or seemed interested
    const userResponse = recentMessages[lastServiceTime + 1];
    if (userResponse && userResponse.role === 'user' && userResponse.content) {
      const interestWords = ['ありがとう', 'サービス', 'いいね', '助かる', '使ってみ'];
      const showedInterest = interestWords.some(word => userResponse.content.includes(word));
      
      if (!showedInterest) {
        // User didn't engage with previous recommendations
        return false;
      }
    }
  }
  
  // Check if user seems to be in a rapid back-and-forth informational exchange
  let shortExchangeCount = 0;
  for (let i = 0; i < recentMessages.length - 1; i++) {
    if (recentMessages[i].role === 'user' && 
        recentMessages[i + 1].role === 'assistant' && 
        recentMessages[i].content && recentMessages[i + 1].content &&
        recentMessages[i].content.length < 30 && 
        recentMessages[i + 1].content.length < 200) {
      shortExchangeCount++;
    }
  }
  
  // If in the middle of a rapid exchange, don't interrupt with services
  if (shortExchangeCount >= 2 && userMessage && userMessage.length < 30) {
    return false;
  }
  
  return true;
}

/**
 * Check frequency and timing constraints for showing services
 */
async function shouldShowServicesToday(userId, history, userMessage) {
  // If user explicitly asks for advice/services, always show
  const isAdviceRequest = await detectAdviceRequestWithLLM(userMessage, history);
  if (isAdviceRequest) {
    console.log('Advice request detected by LLM in shouldShowServicesToday - always showing services');
    return true;
  }
  
  try {
    // Use a shared function to get/set last service time
    const userPrefs = userPreferences.getUserPreferences(userId);
    const lastServiceTime = userPrefs.lastServiceTime || 0;
    const now = Date.now();
    
    // If user recently received service recommendations (within last 4 hours)
    if (lastServiceTime > 0 && now - lastServiceTime < 4 * 60 * 60 * 1000) {
      // Count total service recommendations today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      let servicesToday = 0;
      if (userPrefs.recentlyShownServices) {
        for (const timestamp in userPrefs.recentlyShownServices) {
          if (parseInt(timestamp) > todayStart.getTime()) {
            servicesToday += userPrefs.recentlyShownServices[timestamp].length;
          }
        }
      }
      
      // Limit to no more than 9 service recommendations per day
      if (servicesToday >= 9) {
        console.log('Daily service recommendation limit reached (9 per day) - not showing services');
        return false;
      }
      
      // If fewer than 5 service recommendations today, require a longer minimum gap
      if (servicesToday < 5 && now - lastServiceTime < 45 * 60 * 1000) {
        console.log('Time between service recommendations too short (< 45 minutes) - not showing services');
        return false; // Less than 45 minutes since last recommendation
      }
    }

    return true;
  } catch (err) {
    console.error('Error in shouldShowServicesToday:', err);
    return true; // Default to showing if there's an error
  }
}

/**
 * Safety check for images using OpenAI's moderation capability with GPT-4o-mini
 * @param {string} base64Image - Base64 encoded image
 * @return {Promise<boolean>} - Whether the image passed the safety check
 */
async function checkImageSafety(base64Image) {
  try {
    // Using OpenAI's GPT-4o-mini model to detect potential safety issues
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "あなたは画像モデレーターです。この画像が安全かどうかを判断してください。画像が暴力的、性的、または不適切な内容が含まれている場合、それを特定してください。回答は「SAFE」または「UNSAFE」で始めてください。"
        },
        {
          role: "user",
          content: [
            { 
              type: "image_url", 
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 150,
      temperature: 0
    });
    
    const moderationResult = response.choices[0].message.content;
    console.log(`Image safety check (4o-mini): ${moderationResult}`);
    
    // If the response starts with UNSAFE, the image didn't pass the safety check
    return !moderationResult.startsWith("UNSAFE");
  } catch (error) {
    console.error('Error in image safety check:', error);
    // In case of error, assume the image is safe to not block valid images
    return true;
  }
}

/**
 * ユーザー入力の検証と無害化
 * @param {string} input - ユーザーからの入力メッセージ
 * @returns {string} - 検証済みの入力メッセージ
 */
function sanitizeUserInput(input) {
  if (!input) return '';
  
  // 文字列でない場合は文字列に変換
  if (typeof input !== 'string') {
    input = String(input);
  }
  
  // 最大長の制限
  const MAX_INPUT_LENGTH = 2000;
  if (input.length > MAX_INPUT_LENGTH) {
    console.warn(`ユーザー入力が長すぎます (${input.length} > ${MAX_INPUT_LENGTH}). 切り詰めます。`);
    input = input.substring(0, MAX_INPUT_LENGTH);
  }
  
  // XSS対策 - xssライブラリを使用
  input = xss(input);
  
  // SQL Injection対策 - SQL関連のキーワードを検出して警告
  const SQL_PATTERN = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|UNION|JOIN|WHERE|OR)\b/gi;
  if (SQL_PATTERN.test(input)) {
    console.warn('SQL Injectionの可能性があるユーザー入力を検出しました');
    // キーワードを置換
    input = input.replace(SQL_PATTERN, '***');
  }
  
  return input;
}

/**
 * Line UserIDの検証
 * @param {string} userId - LineのユーザーID
 * @returns {string|null} - 検証済みのユーザーIDまたはnull
 */
function validateUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    console.error('不正なユーザーID形式:', userId);
    return null;
  }
  
  // Line UserIDの形式チェック (UUIDv4形式)
  const LINE_USERID_PATTERN = /^U[a-f0-9]{32}$/i;
  if (!LINE_USERID_PATTERN.test(userId)) {
    console.error('Line UserIDの形式が不正です:', userId);
    return null;
  }
  
  return userId;
}

// Add cleanup for the tracking map every hour
// Setup a cleanup interval for recentImageGenerationUsers
setInterval(() => {
  const now = Date.now();
  recentImageGenerationUsers.forEach((timestamp, userId) => {
    // Remove entries older than 1 hour
    if (now - timestamp > 3600000) {
      recentImageGenerationUsers.delete(userId);
    }
  });
}, 3600000); // Clean up every hour

// Export functions for use in other modules
module.exports = {
  fetchUserHistory
};

/**
 * 会話履歴から特性分析を行い、レスポンスを生成する関数
 * @param {Array} history - 会話履歴の配列
 * @returns {Promise<string>} - 分析結果のテキスト
 */
async function generateHistoryResponse(history) {
  try {
    console.log(`\n======= 特性分析詳細ログ =======`);
    
    // 会話履歴が空の場合
    if (!history || history.length === 0) {
      console.log(`→ 会話履歴なし: 空のhistoryオブジェクト`);
      return "会話履歴がありません。もう少し会話を続けると、あなたの特性について分析できるようになります。";
    }

    console.log(`→ 分析開始: ${history.length}件の会話レコード`);
    
    // 会話履歴からユーザーのメッセージのみを抽出
    const userMessages = history.filter(msg => msg.role === 'user').map(msg => msg.content);
    console.log(`→ ユーザーメッセージ抽出: ${userMessages.length}件`);
    
    // 短いメッセージを分類（20文字未満）
    const shortMessages = userMessages.filter(msg => msg.length < 20);
    
    // 分析に十分なデータがあるかどうかを確認（最低1件あれば分析を試みる）
    if (userMessages.length > 0) {
      console.log(`→ OpenAI API呼び出し準備完了`);
      console.log(`→ プロンプト付与: "たとえデータが少なくても、「過去の記録がない」などとは言わず、利用可能なデータから最大限の分析を行ってください"`);
      
      // OpenAI APIを使用して特性分析を実行
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `あなたは「Adam」という発達障害専門のカウンセラーです。ユーザーの過去ログを分析し、以下の観点から深い洞察を提供してください。

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

[出力形式]
- 日本語で簡潔に（200文字以内）
- 肯定的な側面を含める
- 改善提案あれば添える
- 断定的な診断は避ける（専門医に相談を推奨する）
- 「データが不足している」「分析できない」「記録が少ない」などの否定的な表現は避け、限られたデータからでも何らかの洞察を提供する
- 専門家への相談を推奨する

重要: たとえデータが少なくても、「過去の記録がない」「データが少ない」「これまでの記録が少ない」などの表現は絶対に使わず、利用可能なデータから最大限の具体的な分析を行ってください。データ量についての言及は一切避け、直接分析内容を伝えてください。`
          },
          {
            role: "user",
            content: `以下はユーザーの過去の会話履歴です。この情報を基に、ユーザーの特性について分析してください。
            
会話履歴:
${userMessages.join('\n\n')}`
          }
        ],
        max_tokens: 500
      });
      
      console.log(`→ OpenAI API応答受信: ${response.choices[0].message.content.substring(0, 50)}...`);
      console.log(`→ レスポンスが「過去の記録がない」を含むか: ${response.choices[0].message.content.includes('過去の記録がない') || response.choices[0].message.content.includes('会話履歴がない')}`);
      console.log(`======= 特性分析詳細ログ終了 =======\n`);
      return response.choices[0].message.content;
    } else {
      console.log(`→ 分析に利用可能なメッセージなし`);
      console.log(`======= 特性分析詳細ログ終了 =======\n`);
      // 会話履歴が不足している場合でも、否定的な表現は避ける
      return "会話履歴を分析しました。より詳細な特性分析のためには、もう少し会話を続けることをお勧めします。現時点では、あなたの興味や関心に合わせたサポートを提供できるよう努めています。何か具体的な質問や話題があれば、お気軽にお聞かせください。";
    }
  } catch (error) {
    console.error('Error in generateHistoryResponse:', error);
    console.error(`→ エラースタックトレース: ${error.stack}`);
    console.log(`======= 特性分析詳細ログ終了 (エラー発生) =======\n`);
    // エラーが発生した場合でも、ユーザーフレンドリーなメッセージを返す
    return "申し訳ありません。特性分析の処理中にエラーが発生しました。もう一度お試しいただくか、別の質問をしていただけますか？";
  }
}

/**
 * 混乱や理解困難を示す表現を含むかどうかをチェックする
 * @param {string} text - チェックするテキスト
 * @return {boolean} - 混乱表現を含む場合はtrue
 */
function containsConfusionTerms(text) {
  if (!text || typeof text !== 'string') return false;
  
  // 一般的な混乱表現
  const confusionTerms = [
    'わからない', '分からない', '理解できない', '意味がわからない', '意味が分からない',
    'どういう意味', 'どういうこと', 'よくわからない', 'よく分からない',
    '何が言いたい', 'なにが言いたい', '何を言ってる', 'なにを言ってる',
    'もう少し', 'もっと', '簡単に', 'かみ砕いて', 'シンプルに', '例を挙げて',
    '違う方法で', '別の言い方', '言い換えると', '言い換えれば', '詳しく',
    '混乱', '複雑', '難解', 'むずかしい'
  ];
  
  return confusionTerms.some(term => text.includes(term));
}

/**
 * 直接的な画像分析リクエストかどうかを判断する
 * @param {string} text - チェックするテキスト
 * @return {boolean} - 直接的な画像分析リクエストの場合はtrue
 */
function isDirectImageAnalysisRequest(text) {
  if (!text || typeof text !== 'string') return false;
  
  // 画像分析に特化したフレーズ
  const directAnalysisRequests = [
    'この画像について', 'この写真について', 'この画像を分析', 'この写真を分析',
    'この画像を解析', 'この写真を解析', 'この画像を説明', 'この写真を説明',
    'この画像の内容', 'この写真の内容', 'この画像に写っているもの', 'この写真に写っているもの'
  ];
  
  // 直接的な画像分析リクエストの場合はtrueを返す
  return directAnalysisRequests.some(phrase => text.includes(phrase));
}
