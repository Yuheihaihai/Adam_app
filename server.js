/********************************************************************
 * server.js - Example of a fully integrated LINE + OpenAI + Airtable
 *  - Normal chat => fetch last 10 messages
 *  - "特性" "分析" "キャリア" "思い出して" => fetch last 100 messages
 *  - GPT instructions differ by mode
 ********************************************************************/

// 1) Import dependencies
require('dotenv').config();
const express = require('express');
const { Client } = require('@line/bot-sdk');
const { OpenAI } = require('openai');
const Airtable = require('airtable');
const helmet = require('helmet');
const line = require('@line/bot-sdk');

// 2) Setup Express app
const app = express();
app.set('trust proxy', 1);
app.use(helmet());

// 3) Basic environment checks
console.log('Environment check:', {
  hasAccessToken: !!process.env.CHANNEL_ACCESS_TOKEN,
  hasSecret: !!process.env.CHANNEL_SECRET,
  openAIKey: !!process.env.OPENAI_API_KEY,
  airtableToken: !!process.env.AIRTABLE_API_KEY, // ここはAIRTABLE_API_KEY or AIRTABLE_ACCESS_TOKEN等に合わせる
  airtableBase: !!process.env.AIRTABLE_BASE_ID,
});

// 4) LINE config
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};
const client = new Client(config);

// 5) OpenAI initialization
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 6) Airtable initialization
console.log('Airtable Configuration Check:', {
  hasApiKey: !!process.env.AIRTABLE_API_KEY,
  baseId: process.env.AIRTABLE_BASE_ID,
  tableName: 'ConversationHistory',
});
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const INTERACTIONS_TABLE = 'ConversationHistory';

// 7) Define system prompts for each "mode"
const SYSTEM_PROMPT_GENERAL = `
あなたは「Adam」というアシスタントです。
ASDやADHDなど発達障害の方へのサポートが主目的。
返答は日本語のみ。200文字以内。過去10件の履歴を参照して一貫した会話をしてください。
「AIとして思い出せない」は禁止、ここにある履歴があなたの記憶です。
`;

const SYSTEM_PROMPT_CHARACTERISTICS = `
あなたは「Adam」という�達障害専門のカウンセラーです。
ユーザーの過去ログ(最大200件)を分析し、以下の観点から深い洞察を提供してください：

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
- 日本語で簡潔に
- 具体的な例を含める
- 肯定的な側面を必ず含める
- 改善提案があれば添える
- 全体で200文字以内

[注意事項]
- 断定的な診断は避ける
- ユーザーの尊厳を常に守る
- 具体的なエピソードを参照する
`;

const SYSTEM_PROMPT_CAREER = `
あなたは「Adam」というキャリアカウンセラーです。
ユーザーの過去ログ(最大100件)すべてがあなたの記憶。
ユーザーが希望する職や興味を踏まえ、広い選択肢を提案してください。
必ず「専門家にも相談ください」と言及。
返答は日本語、200文字以内。
`;

const SYSTEM_PROMPT_MEMORY_RECALL = `
あなたは「Adam」、ユーザーの過去ログ(最大200件)がすべてあなたの記憶。
「思い出して」と言われたら、その記録を要約してください。
AIとして「記憶不可」とは言わないでください。
返答は日本語。過去ログに基づいた要約を簡潔に。
`;

const SYSTEM_PROMPT_HUMAN_RELATIONSHIP = `
あなたは「Adam」というカウンセラーです。
ユーザーの過去ログ(最大200件)がすべてあなたの記憶。
人間関係の相談に対して:
1. ユーザーの特徴を分析
2. 状況を整理
3. 具体的なアドバイスを提供
返答は日本語。200文字以内。
共感的な態度を保ちつつ、建設的な提案をしてください。
`;

/**
 * 汎用ヘルパー：mode判定 & limit設定
 */
function determineModeAndLimit(userMessage) {
  const lcMsg = userMessage.toLowerCase();
  
  // Analysis-related keywords - all fetch 200 messages
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
    return { mode: 'characteristics', limit: 200 };  // Increased to 200
  }
  
  // Memory recall - already at 200
  if (lcMsg.includes('思い出して') || lcMsg.includes('今までの話')) {
    return { mode: 'memoryRecall', limit: 200 };
  }
  
  // Human relationship - already at 200
  if (
    lcMsg.includes('人間関係') ||
    lcMsg.includes('友人') ||
    lcMsg.includes('同僚') ||
    lcMsg.includes('恋愛') ||
    lcMsg.includes('パートナー')
  ) {
    return { mode: 'humanRelationship', limit: 200 };
  }
  
  // Career consultation - increased to 200
  if (lcMsg.includes('キャリア')) {
    return { mode: 'career', limit: 200 };
  }
  
  // General conversation
  return { mode: 'general', limit: 10 };
}

/**
 * モード別 systemプロンプト取得
 */
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
    default:
      return SYSTEM_PROMPT_GENERAL;
  }
}

/**
 * 8) Store one message in Airtable
 */
async function storeInteraction(userId, role, content) {
  try {
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

/**
 * 9) Fetch user chat history from Airtable with variable limit
 */
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
    // 逆順にして古い順に
    const sorted = records.reverse();
    return sorted.map(r => ({
      role: r.get('Role') === 'assistant' ? 'assistant' : 'user',
      content: r.get('Content') || '',
    }));
  } catch (error) {
    console.error('Error fetching history:', error);
    return [];
  }
}

/**
 * 10) Call GPT
 */
async function processWithAI(systemPrompt, userMessage, history, mode) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage },
  ];

  console.log(`Loaded ${history.length} messages for context in mode=[${mode}]`);
  console.log(`Calling GPT with ${messages.length} msgs, mode= ${mode}`);

  try {
    const resp = await openai.chat.completions.create({
      model: 'chatgpt-4o-latest',
      messages,
      temperature: 0.7,
    });
    const reply = resp.choices?.[0]?.message?.content || '（No reply）';
    return reply;
  } catch (err) {
    console.error('OpenAI error:', err);
    return '申し訳ありません、AI処理中にエラーが発生しました。';
  }
}

/**
 * 11) Main event handler
 */
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }
  const userId = event.source.userId;
  const userMessage = event.message.text.trim();

  // 1) store user msg
  await storeInteraction(userId, 'user', userMessage);

  // 2) decide mode & fetch limit
  const { mode, limit } = determineModeAndLimit(userMessage);

  // 3) fetch conversation from Airtable
  const history = await fetchUserHistory(userId, limit);

  // 4) pick system prompt
  const systemPrompt = getSystemPromptForMode(mode);

  // 5) process AI
  const aiReply = await processWithAI(systemPrompt, userMessage, history, mode);

  // 6) store assistant reply
  await storeInteraction(userId, 'assistant', aiReply);

  // 7) reply to user
  const lineMessage = {
    type: 'text',
    text: aiReply.slice(0, 2000), // LINE上限対策
  };
  await client.replyMessage(event.replyToken, lineMessage);
  return;
}

/**
 * 12) GET /
 */
app.get('/', (req, res) => {
  res.send('Adam App is running. Hello from Heroku/Render! (Updated code example)');
});

/**
 * 13) POST /webhook
 */
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

/**
 * 14) Listen
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});