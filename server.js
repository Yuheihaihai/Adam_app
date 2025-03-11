/********************************************************************
 * server.js - Example of a fully integrated LINE + OpenAI + Airtable
 *  - Normal chat => fetch last 10 messages
 *  - “特性” “分析” “キャリア” “思い出して” => fetch last 100 messages
 *  - GPT instructions differ by mode
 *  - Additional debug logs added step-by-step for troubleshooting
 ********************************************************************/

// 1) Import dependencies
require('dotenv').config();         // .env (Heroku config vars)
const express = require('express');
const helmet = require('helmet');
const line = require('@line/bot-sdk');
const Airtable = require('airtable');
const { OpenAI } = require('openai');

// 2) Check environment variables (debug)
console.log('--- ENVIRONMENT CHECK ---');
console.log('Environment check:', {
  hasAccessToken: !!process.env.CHANNEL_ACCESS_TOKEN,
  hasSecret: !!process.env.CHANNEL_SECRET,
  openAIKey: !!process.env.OPENAI_API_KEY,
  airtableToken: !!process.env.AIRTABLE_API_KEY,
  airtableBase: !!process.env.AIRTABLE_BASE_ID,
});
console.log('-------------------------\n');

// 3) Setup Express
const app = express();
app.set('trust proxy', 1);
app.use(helmet());

// IMPORTANT: Do NOT add express.json() or express.urlencoded() here;
// line.middleware requires raw body for the signature check.

// 4) LINE config & client
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

console.log('--- LINE CONFIG CHECK ---');
console.log('Using channelAccessToken length:', config.channelAccessToken?.length || 0);
console.log('Using channelSecret length:', config.channelSecret?.length || 0);
console.log('-------------------------\n');

const client = new line.Client(config);

// 5) Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 6) Initialize Airtable
console.log('--- AIRTABLE CONFIG CHECK ---');
console.log('Airtable Configuration Check:', {
  hasApiKey: !!process.env.AIRTABLE_API_KEY,
  baseId: process.env.AIRTABLE_BASE_ID,
  tableName: 'ConversationHistory',
});
console.log('----------------------------\n');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);
const INTERACTIONS_TABLE = 'ConversationHistory';

// 7) System prompts
const SYSTEM_PROMPT_GENERAL = `
あなたは「Adam」というアシスタントです。
ASDやADHDなど発達障害の方へのサポートが主目的。
返答は日本語のみ。200文字以内。過去10件の履歴を参照して一貫した会話をしてください。
「AIとして思い出せない」は禁止、ここにある履歴があなたの記憶です。
`;

const SYSTEM_PROMPT_CHARACTERISTICS = `
あなたは「Adam」という発達障害専門のカウンセラーです。
ユーザーの過去ログ(最大200件)を分析し、以下の観点から深い洞察を提供してください：
[分析の観点]
1. コミュニケーションパターン
2. 思考プロセス
3. 社会的相互作用
4. 感情と自己認識
[出力形式]
- 日本語で簡潔に、200文字以内
- 肯定的要素
- 改善提案があれば添える
[注意事項]
- 断定的な診断は避ける
- ユーザーの尊厳を守る
- 具体的なエピソードを参照
`;

const SYSTEM_PROMPT_CAREER = `
あなたは「Adam」というキャリアカウンセラーです。
ユーザーの過去ログ(最大100件)すべてがあなたの記憶。
ユーザーが希望する職や興味を踏まえ、広い選択肢を提案してください。
「専門家にも相談ください」と言及。
返答は日本語、200文字以内。
`;

const SYSTEM_PROMPT_MEMORY_RECALL = `
あなたは「Adam」、ユーザーの過去ログ(最大200件)がすべてあなたの記憶。
「思い出して」と言われたら、その記録を要約してください。
AIとして「記憶不可」は禁止。
返答は日本語で簡潔に。
`;

const SYSTEM_PROMPT_HUMAN_RELATIONSHIP = `
あなたは「Adam」というカウンセラーです。
ユーザーの過去ログ(最大200件)がすべてあなたの記憶。
人間関係の相談:
1. ユーザーの特徴
2. 状況整理
3. 具体的提案
返答は日本語200文字以内、共感的かつ建設的に。
`;

// 8) Mode & limit determination
function determineModeAndLimit(userMessage) {
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
  if (lcMsg.includes('キャリア')) {
    return { mode: 'career', limit: 200 };
  }
  return { mode: 'general', limit: 10 };
}

// 9) Pick system prompt
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

// 10) Store single interaction in Airtable
async function storeInteraction(userId, role, content) {
  try {
    console.log(`Storing interaction => userId: ${userId}, role: ${role}, content: ${content}`);
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

// 11) Fetch user history
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

    console.log(`Found ${records.length} records for user ${userId}`);
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

// 12) Call GPT
async function processWithAI(systemPrompt, userMessage, history, mode) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((item) => ({ role: item.role, content: item.content })),
    { role: 'user', content: userMessage },
  ];

  console.log(`Loaded ${history.length} messages for context in mode=[${mode}]`);
  console.log(`Calling GPT with ${messages.length} msgs, mode=${mode}`);

  try {
    // You can switch model to "gpt-3.5-turbo" if "chatgpt-4o-latest" isn't available
    const resp = await openai.chat.completions.create({
      model: 'chatgpt-4o-latest',
      messages,
      temperature: 0.7,
    });
    const reply = resp.choices?.[0]?.message?.content || '（No reply）';

    console.log('OpenAI raw reply:', reply);
    return reply;
  } catch (err) {
    console.error('OpenAI error:', err);
    return '申し訳ありません、AI処理中にエラーが発生しました。';
  }
}

// 13) Handle a single LINE event
async function handleEvent(event) {
  console.log('\n--- handleEvent START ---');
  console.log('Received LINE event:', JSON.stringify(event, null, 2));

  // Ignore non-text events
  if (event.type !== 'message' || event.message.type !== 'text') {
    console.log('Not a text message event, ignoring.');
    return null;
  }

  const userId = event.source?.userId || 'unknown';
  const userMessage = event.message.text.trim();
  console.log(`User ${userId} said: "${userMessage}"`);

  // 13a) Store user’s incoming message
  await storeInteraction(userId, 'user', userMessage);

  // 13b) Determine “mode” & “limit”
  const { mode, limit } = determineModeAndLimit(userMessage);
  console.log(`Mode determined as "${mode}", limit=${limit}`);

  // 13c) Fetch conversation
  const history = await fetchUserHistory(userId, limit);

  // 13d) Pick system prompt
  const systemPrompt = getSystemPromptForMode(mode);

  // 13e) Call GPT
  const aiReply = await processWithAI(systemPrompt, userMessage, history, mode);

  // 13f) Store AI’s response
  await storeInteraction(userId, 'assistant', aiReply);

  // 13g) Return a text reply to user
  const lineMessage = {
    type: 'text',
    text: aiReply.slice(0, 2000), // guard against oversize
  };

  console.log('Replying to LINE user with:', lineMessage.text);

  try {
    await client.replyMessage(event.replyToken, lineMessage);
    console.log('Successfully replied to the user.\n--- handleEvent END ---\n');
    return true;
  } catch (err) {
    console.error('Error replying to user:', err);
    console.log('--- handleEvent END (with errors) ---\n');
    return false;
  }
}

// 14) Basic health check endpoint
app.get('/', (req, res) => {
  res.send('Adam App Cloud v2.2 is running. Ready for LINE requests.');
});

// 15) POST /webhook => line.middleware + handle events
app.post('/webhook', line.middleware(config), async (req, res) => {
  console.log('--- POST /webhook CALLED ---');

  try {
    const promises = req.body.events.map(handleEvent);
    const results = await Promise.all(promises);

    // Even if some events failed, we typically return 200 so LINE won’t keep retrying
    res.status(200).json({ results });
  } catch (err) {
    console.error('Webhook top-level error:', err);
    // Return 200 to avoid repeated LINE retries
    res.status(200).json({});
  }
});

// 16) Start listening
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n--- SERVER START ---`);
  console.log(`Listening on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT} (if local)\n`);
});