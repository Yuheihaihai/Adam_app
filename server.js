/********************************************************************
 * server.js - Example of a fully integrated LINE + OpenAI + Airtable
 *  - Normal chat => fetch last 10 messages
 *  - "特性" "分析" "キャリア" "思い出して" => fetch last 100 messages
 *  - GPT instructions differ by mode
 *  - Additional instructions added for:
 *    (a) minimal chat history => ask for more user context
 *    (b) secret "IQ" style adjustment
 *    (c) clarifying if 3rd-person analysis (child or friend)
 *    (d) remind user to consult professionals
 ********************************************************************/

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const line = require('@line/bot-sdk');
const Airtable = require('airtable');
const { OpenAI } = require('openai');

// 1) Basic environment checks
console.log('Environment check:', {
  hasAccessToken: !!process.env.CHANNEL_ACCESS_TOKEN,
  hasSecret: !!process.env.CHANNEL_SECRET,
  openAIKey: !!process.env.OPENAI_API_KEY,
  airtableToken: !!process.env.AIRTABLE_API_KEY,
  airtableBase: !!process.env.AIRTABLE_BASE_ID,
});

// 2) Setup Express app
const app = express();
app.set('trust proxy', 1);
app.use(helmet());

// DO NOT add express.json() or express.urlencoded() here
// because line.middleware needs raw body

// 3) LINE config & client
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// 4) OpenAI initialization
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 5) Airtable initialization
console.log('Airtable Configuration Check:', {
  hasApiKey: !!process.env.AIRTABLE_API_KEY,
  baseId: process.env.AIRTABLE_BASE_ID,
  tableName: 'ConversationHistory',
});
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);
const INTERACTIONS_TABLE = 'ConversationHistory';

// 6) System prompts (default)
const SYSTEM_PROMPT_GENERAL = `
あなたは「Adam」というアシスタントです。
ASDやADHDなど発達障害の方へのサポートが主目的。
返答は日本語のみ、200文字以内。過去10件の履歴を参照して一貫した会話をしてください。
「AIとして思い出せない」は禁止、ここにある履歴があなたの記憶です。
`;

const SYSTEM_PROMPT_CHARACTERISTICS = `
あなたは「Adam」という発達障害専門のカウンセラーです。
ユーザーの過去ログ(最大200件)を分析し、以下の観点から深い洞察を提供してください。

[分析の観点]
1. コミュニケーションパターン
2. 思考プロセス
3. 社会的相互作用
4. 感情と自己認識

[出力形式]
- 日本語で簡潔に（200文字以内）
- 肯定的な側面を含める
- 改善提案あれば添える
- 断定的な診断は避ける
`;

const SYSTEM_PROMPT_CAREER = `
あなたは「Adam」というキャリアカウンセラーです。
ユーザーの過去ログ(最大100件)があなたの記憶。
希望職や興味を踏まえ広い選択肢を提案。必ず「専門家にも相談ください」と言及。
日本語・200文字以内。
`;

const SYSTEM_PROMPT_MEMORY_RECALL = `
あなたは「Adam」、ユーザーの過去ログ(最大200件)が記憶。
「思い出して」と言われたら、記録を要約。
AIとして「記憶不可」は禁止。過去ログに基づき日本語で簡潔要約。
`;

const SYSTEM_PROMPT_HUMAN_RELATIONSHIP = `
あなたは「Adam」というカウンセラーです。
過去ログ(最大200件)があなたの記憶。人間関係の相談では：
1. ユーザー特徴を分析
2. 状況を整理
3. 具体的提案
日本語200文字以内。共感的かつ建設的に。
`;

// 7) Decide "mode" & "limit" based on user message
function determineModeAndLimit(userMessage) {
  const lcMsg = userMessage.toLowerCase();

  // "特性" / "分析" => 200
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
  // "思い出して" => 200
  if (lcMsg.includes('思い出して') || lcMsg.includes('今までの話')) {
    return { mode: 'memoryRecall', limit: 200 };
  }
  // "人間関係" / "友人" / "同僚" / "恋愛" => 200
  if (
    lcMsg.includes('人間関係') ||
    lcMsg.includes('友人') ||
    lcMsg.includes('同僚') ||
    lcMsg.includes('恋愛') ||
    lcMsg.includes('パートナー')
  ) {
    return { mode: 'humanRelationship', limit: 200 };
  }
  // "キャリア" => 200
  if (lcMsg.includes('キャリア')) {
    return { mode: 'career', limit: 200 };
  }
  // else => general (limit=10)
  return { mode: 'general', limit: 10 };
}

// 8) pick system prompt
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

// 9) store single interaction
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

// 10) fetch user history
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

// 11) modify systemPrompt with additional instructions
function applyAdditionalInstructions(
  basePrompt,
  mode,
  history,
  userMessage
) {
  let finalPrompt = basePrompt;

  // (a) 履歴が極端に少ない & ユーザーが分析やキャリアを求める
  if (
    (mode === 'characteristics' || mode === 'career') &&
    history.length < 3
  ) {
    finalPrompt += `
※ユーザーの履歴が少ないです。まずは本人に追加の状況説明や詳細を尋ね、やりとりを増やして理解を深めてください。
`;
  }

  // (b) 「IQ」や認知度に応じた密かな調整
  finalPrompt += `
※ユーザーの文章からコミュニケーション能力や理解度を推定し、返答の難易度や言葉遣いを自然に調整してください。
AIが「IQを計測」とは明示せず、自然に簡易化または高度化します。
`;

  // (c) 第三者(子供、友達)への特性相談かどうかをチェックし、必要なら明確化
  if (/\b(child|friend|someone|others|children|son|daughter)\b/.test(userMessage)) {
    finalPrompt += `
※ユーザーが自分以外の第三者の分析を依頼している可能性があります。誰の特徴か曖昧なら、会話の中で丁寧に確認してください。
`;
  }

  // (d) 重要な相談ごと（発達障害や大きな進路決定など）には適宜専門家相談を促す
  finalPrompt += `
※重度の発達障害の相談や重要な進路選択の場合、「専門家にも相談ください」と定期的に伝えてください。
`;

  // ----- (NEW) Additional instructions to AI (English corrected + Japanese added) -----
  finalPrompt += `
Please understand if user wants to end a conversation or not by context. Especially when user’s sentiment is strong (positive or negative), do not suspend the conversation at your own.
ユーザーの障害があまりにも重い場合、状況認識や表情・仕草等の理解が難しいと思われます。その場合、ユーザーに「Adamに直接、長文でいいので全部書いて」とアドバイスし、ユーザーが書き終わったら、Adamが状況を分析し対応策を具体的に指示してください。
(1) 毎回の会話でAIが相手の状況理解の障害の重さを可能性レベルで判断し、仮説を立てる。 
(2) 重い可能性が高いと判断したら、ユーザーへの返信時に(1)の仮説を自然かつ尊重的な言い回しで確認（過去の指摘経験など）。 
(3) ユーザーが仮説を認めたら「整理しようとせず思いつくまま長文で全部書いて」と依頼。 
(4) 書かれた内容をAIが分析し、必要な支援策や提案を具体的に行う。ただし医療的な診断は行わない。
`;

  return finalPrompt;
}

// 12) call GPT
async function processWithAI(systemPrompt, userMessage, history, mode) {
  // Decide model name dynamically
  let selectedModel = 'chatgpt-4o-latest';
  if (
    userMessage
      .toLowerCase()
      .includes('a request for a deeper exploration of the ai’s thoughts and an even clearer explanation')
  ) {
    selectedModel = 'o1-2024-12-17';
  }

  // (NEW) Provide explicit logging for the chosen model
  console.log(`Using model: ${selectedModel}`);

  const finalSystemPrompt = applyAdditionalInstructions(
    systemPrompt,
    mode,
    history,
    userMessage
  );

  const messages = [
    { role: 'system', content: finalSystemPrompt },
    ...history.map((item) => ({ role: item.role, content: item.content })),
    { role: 'user', content: userMessage },
  ];

  console.log(
    `Loaded ${history.length} messages for context in mode=[${mode}]`
  );
  console.log(
    `Calling GPT with ${messages.length} msgs, mode=${mode}, model=${selectedModel}`
  );

  try {
    const resp = await openai.chat.completions.create({
      model: selectedModel, // either "chatgpt-4o-latest" or "o1-2024-12-17"
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

// 13) main LINE event handler
async function handleEvent(event) {
  console.log('Received LINE event:', JSON.stringify(event, null, 2));

  // Only handle text messages
  if (event.type !== 'message' || event.message.type !== 'text') {
    console.log('Not a text message, ignoring.');
    return null;
  }

  const userId = event.source?.userId || 'unknown';
  const userMessage = event.message.text.trim();

  console.log(`User ${userId} said: "${userMessage}"`);

  // (13a) store user’s incoming message
  await storeInteraction(userId, 'user', userMessage);

  // (13b) determine “mode” & “limit”
  const { mode, limit } = determineModeAndLimit(userMessage);
  console.log(`Determined mode=${mode}, limit=${limit}`);

  // (13c) fetch conversation
  const history = await fetchUserHistory(userId, limit);

  // (13d) pick system prompt
  const systemPrompt = getSystemPromptForMode(mode);

  // (13e) call GPT with additional instructions
  const aiReply = await processWithAI(systemPrompt, userMessage, history, mode);

  // (13f) store AI’s response
  await storeInteraction(userId, 'assistant', aiReply);

  // (13g) reply to user
  const lineMessage = { type: 'text', text: aiReply.slice(0, 2000) };
  console.log('Replying to LINE user with:', lineMessage.text);

  try {
    await client.replyMessage(event.replyToken, lineMessage);
    console.log('Successfully replied to the user.');
  } catch (err) {
    console.error('Error replying to user:', err);
  }
}

// 14) simple health check
app.get('/', (req, res) => {
  res.send('Adam App Cloud v2.2 is running. Ready for LINE requests.');
});

// 15) POST /webhook => includes console logging
app.post('/webhook', line.middleware(config), (req, res) => {
  console.log('Webhook was called! Events:', req.body.events);

  Promise.all(req.body.events.map(handleEvent))
    .then((result) => {
      res.json(result);
    })
    .catch((err) => {
      console.error('Webhook error:', err);
      // Return 200 to avoid repeated LINE retries
      res.status(200).json({});
    });
});

// 16) Listen
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});