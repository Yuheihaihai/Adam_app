/********************************************************************
 * server.js - Example of a fully integrated LINE + OpenAI + Airtable
 *   + Additional instructions for:
 *     - Prompting user if few messages in Airtable
 *     - Secretly measuring user IQ
 *     - Handling third-party or ambiguous queries
 ********************************************************************/

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const line = require('@line/bot-sdk');
const Airtable = require('airtable');
const { OpenAI } = require('openai');

//---------------------------------------------------------
// 1) Basic environment checks
//---------------------------------------------------------
console.log('Environment check:', {
  hasAccessToken: !!process.env.CHANNEL_ACCESS_TOKEN,
  hasSecret: !!process.env.CHANNEL_SECRET,
  openAIKey: !!process.env.OPENAI_API_KEY,
  airtableToken: !!process.env.AIRTABLE_API_KEY,
  airtableBase: !!process.env.AIRTABLE_BASE_ID,
});

//---------------------------------------------------------
// 2) Setup Express app
//---------------------------------------------------------
const app = express();
app.set('trust proxy', 1);
app.use(helmet());

// DO NOT do express.json() or urlencoded() here. line.middleware needs raw body.

//---------------------------------------------------------
// 3) LINE config and client
//---------------------------------------------------------
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.Client(config);

//---------------------------------------------------------
// 4) OpenAI initialization
//---------------------------------------------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

//---------------------------------------------------------
// 5) Airtable initialization
//---------------------------------------------------------
console.log('Airtable Configuration Check:', {
  hasApiKey: !!process.env.AIRTABLE_API_KEY,
  baseId: process.env.AIRTABLE_BASE_ID,
  tableName: 'ConversationHistory'
});

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);
const INTERACTIONS_TABLE = process.env.INTERACTIONS_TABLE || 'ConversationHistory';

//---------------------------------------------------------
// 6) System prompts
//---------------------------------------------------------
const SYSTEM_PROMPT_GENERAL = `
あなたは「Adam」というアシスタントです。
ASDやADHDなど発達障害の方へのサポートが主目的。
返答は日本語のみ。200文字以内。過去10件の履歴を参照して一貫した会話をしてください。
「AIとして思い出せない」は禁止、ここにある履歴があなたの記憶です。
`;

const SYSTEM_PROMPT_CHARACTERISTICS = `
... (same as before) ...
`;

const SYSTEM_PROMPT_CAREER = `
... (same as before) ...
`;

const SYSTEM_PROMPT_MEMORY_RECALL = `
... (same as before) ...
`;

const SYSTEM_PROMPT_HUMAN_RELATIONSHIP = `
... (same as before) ...
`;

//---------------------------------------------------------
// 7) decide "mode" & "limit" based on user message
//---------------------------------------------------------
function determineModeAndLimit(userMessage) {
  const lcMsg = userMessage.toLowerCase();

  // example checks for "特性", "分析", "思い出して", "人間関係", "キャリア", etc.
  // ... unchanged ...
  // fallback => general
  return { mode: 'general', limit: 10 };
}

//---------------------------------------------------------
// 8) pick system prompt
//---------------------------------------------------------
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

//---------------------------------------------------------
// 9) NEW LOGIC START: Secret IQ measurement placeholder
//---------------------------------------------------------
function measureUserIQ(userMessage) {
  // In reality, you might track the user’s grammar complexity,
  // response speed, or question types. This is just a placeholder.
  let iqEstimate = 100; // default
  // e.g. simplistic approach: if user uses complicated expressions:
  if (userMessage.length > 80) {
    iqEstimate += 10;
  }
  // Return your “secret” or ephemeral IQ measure
  return iqEstimate;
}
// 9) NEW LOGIC END

//---------------------------------------------------------
// 10) store a single interaction in Airtable
//---------------------------------------------------------
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

//---------------------------------------------------------
// 11) fetch user history from Airtable
//---------------------------------------------------------
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

    const sorted = records.reverse();
    return sorted.map(r => ({
      role: (r.get('Role') === 'assistant') ? 'assistant' : 'user',
      content: r.get('Content') || ''
    }));
  } catch (error) {
    console.error('Error fetching history:', error);
    return [];
  }
}

//---------------------------------------------------------
// 12) call GPT
//---------------------------------------------------------
async function processWithAI(systemPrompt, userMessage, history, mode) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage },
  ];

  console.log(`Loaded ${history.length} messages for context in mode=[${mode}]`);
  console.log(`Calling GPT with ${messages.length} msgs, mode=${mode}`);

  try {
    const resp = await openai.chat.completions.create({
      model: 'chatgpt-4o-latest', // example only
      messages,
      temperature: 0.7
    });
    const reply = resp.choices?.[0]?.message?.content || '（No reply）';
    return reply;
  } catch (err) {
    console.error('OpenAI error:', err);
    return '申し訳ありません、AI処理中にエラーが発生しました。';
  }
}

//---------------------------------------------------------
// 13) NEW LOGIC START: Helpers for ambiguous messages or third-party check
//---------------------------------------------------------
function isThirdPartyQuery(userMessage) {
  // Very naive example: if user uses words like "my child" or "子ども" or "彼の特性"
  const lc = userMessage.toLowerCase();
  if (lc.includes('my child') || lc.includes('子ども') || lc.includes('彼の') || lc.includes('彼女の')) {
    return true;
  }
  return false;
}

function generateAmbiguousResponse() {
  // Generic approach: ask clarifying questions
  return `具体的にはどのようなシーンやお困りごとでしょう？\n
もう少し状況を教えていただけますか？（例：いつ、どんな場所、どんな相手との会話かなど）`;
}

function mayNeedMoreContext(history) {
  // If user’s conversation length < e.g. 3 messages, we might caution that we have incomplete data
  return history.length < 3;
}
//---------------------------------------------------------
// 13) NEW LOGIC END

//---------------------------------------------------------
// 14) main LINE event handler
//---------------------------------------------------------
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    // Not a text message => do nothing
    return null;
  }

  const userId = event.source?.userId || 'unknown';
  const userMessage = event.message.text.trim();

  // NEW LOGIC: measure user IQ in background
  const userIQ = measureUserIQ(userMessage);
  console.log(`(Debug) Measured IQ ~ ${userIQ} (secretly, not told to user)`);

  // Check if user might be talking about a third party
  const thirdParty = isThirdPartyQuery(userMessage);

  // Attempt to store user’s message
  await storeInteraction(userId, 'user', userMessage);

  // Determine mode & limit
  const { mode, limit } = determineModeAndLimit(userMessage);

  // Fetch conversation
  const history = await fetchUserHistory(userId, limit);

  // If we have very few messages, or the user’s question is ambiguous:
  if (mayNeedMoreContext(history)) {
    // If user directly asked for “analysis” or “career” etc. but we have no data
    // or the question is ambiguous => respond with a prompt for more detail
    // example check:
    if (
      mode === 'characteristics' ||
      mode === 'career' ||
      userMessage.includes('どうやったら') ||
      userMessage.includes('できますか') ||
      userMessage.includes('作れません')
    ) {
      // We might ask user to provide more context
      const clarifyingResponse = `現時点では情報が少なく、詳しい分析や提案が難しいかもしれません。\n
もう少し日常の具体的な場面や困りごとを教えていただけますか？`;
      // Return clarifying response
      await client.replyMessage(event.replyToken, { type: 'text', text: clarifyingResponse });
      return null;
    }
  }

  // If user might be referencing a third party:
  if (thirdParty) {
    // Insert a clarifying note
    const disclaim = `ご本人ではなくご家族や別の方についてのご相談ですね。\n
もし可能であれば、対象の方の特徴やエピソードをもう少し教えていただけますか？`;
    // We’ll just send this once. (Your logic can be more refined.)
    if (mayNeedMoreContext(history)) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: disclaim
      });
      return null;
    }
    // Otherwise continue normal flow
  }

  // System prompt
  const systemPrompt = getSystemPromptForMode(mode);

  // Call GPT
  const aiReply = await processWithAI(systemPrompt, userMessage, history, mode);

  // If the message is extremely ambiguous, we can do another final check
  if (
    aiReply.length < 40 && // GPT gave a short or unclear answer
    (userMessage.includes('どうやったら') || userMessage.includes('作れません'))
  ) {
    // Possibly add a fallback to ask clarifying questions
    // but this might be optional
    const appended = aiReply + '\n\n' + generateAmbiguousResponse();
    await storeInteraction(userId, 'assistant', appended);
    await client.replyMessage(event.replyToken, { type: 'text', text: appended.slice(0, 2000) });
    return null;
  }

  // Store assistant reply
  await storeInteraction(userId, 'assistant', aiReply);

  // Return reply to user
  const lineMessage = {
    type: 'text',
    text: aiReply.slice(0, 2000) // LINE limit safeguard
  };
  await client.replyMessage(event.replyToken, lineMessage);
}

//---------------------------------------------------------
// 15) GET / => simple health check
//---------------------------------------------------------
app.get('/', (req, res) => {
  res.send('Adam App Cloud v2 is running. Ready for LINE requests.');
});

//---------------------------------------------------------
// 16) POST /webhook => line.middleware + handle events
//---------------------------------------------------------
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    console.log('Webhook received:', req.body);
    const events = req.body.events;
    await Promise.all(
      events.map(async (event) => {
        console.log('Processing event:', event);
        if (event.type === 'message' && event.message.type === 'text') {
          console.log('Sending echo for:', event.message.text);
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: `Echo test: ${event.message.text}`
          });
        }
      })
    );
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).end();
  }
});

//---------------------------------------------------------
// 17) Listen
//---------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});