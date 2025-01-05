/********************************************************************
 * server.js - Example of a fully integrated LINE + OpenAI + Airtable
 ********************************************************************/
const express = require('express');
const line = require('@line/bot-sdk');
const { OpenAI } = require('openai');
const Airtable = require('airtable');

/* 
  1) Environment check - For Heroku, environment variables come from config vars.
     Make sure you have set: 
       CHANNEL_ACCESS_TOKEN, CHANNEL_SECRET, OPENAI_API_KEY, AIRTABLE_API_KEY, AIRTABLE_BASE_ID
*/
console.log('Environment check:', {
  hasAccessToken: !!process.env.CHANNEL_ACCESS_TOKEN,
  hasSecret: !!process.env.CHANNEL_SECRET,
  openAIKey: !!process.env.OPENAI_API_KEY,
  airtableKey: !!process.env.AIRTABLE_API_KEY,
  airtableBase: !!process.env.AIRTABLE_BASE_ID,
});

// ------------------------------------------------------------------
// 2) Configure LINE
// ------------------------------------------------------------------
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// ------------------------------------------------------------------
// 3) Initialize OpenAI and Airtable
// ------------------------------------------------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

// ------------------------------------------------------------------
// 4) In-memory storage for conversation history (per user).
//    For production, consider storing in Airtable or database.
// ------------------------------------------------------------------
const userChatHistory = new Map(); // userId -> Array of {text: string}

// ------------------------------------------------------------------
// 5) System instructions for the AI
// ------------------------------------------------------------------
const AI_INSTRUCTIONS = {
  general: `
あなたは「Adam」というアシスタントです。
ASD支援を意図し、日本語のみで200字以内に回答してください。過去ログを確認し、
「前に話したことを覚えている」ように返答してください。
ただし第三者の個人情報は流出しないようにしてください。
  `,
  // If you want more specialized instructions (characteristics/career),
  // you can add them similarly:
  // characteristics: "...",
  // career: "..."
};

// ------------------------------------------------------------------
// 6) Helper function: talk to GPT-4 via openai package
// ------------------------------------------------------------------
async function processWithAI(userId, userMessage, mode = 'general') {
  console.log('Starting AI processing for user:', userId);

  // 1) Grab existing chat from memory:
  const history = userChatHistory.get(userId) || [];

  // 2) Prepare messages for Chat API
  //    a) Add system instruction
  //    b) Add past user messages (role: "user") and AI replies (role: "assistant") if stored
  //    c) Add the new user message
  const messages = [
    { role: "system", content: AI_INSTRUCTIONS[mode] },
    // Past messages
    ...history.map(item => ({ role: item.role, content: item.text })),
    // Current user message
    { role: "user", content: userMessage },
  ];

  try {
    console.log('Calling GPT-4 with messages length:', messages.length);
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
      max_tokens: 500,
      temperature: 0.7,
    });

    const aiReply = completion.choices[0]?.message?.content || '（エラー）';
    console.log('AI response:', aiReply.slice(0, 70) + '...');
    return aiReply;
  } catch (error) {
    console.error('OpenAI error:', error);
    return "申し訳ありません。サーバー側エラーが発生しました。";
  }
}

// ------------------------------------------------------------------
// 7) Express app
// ------------------------------------------------------------------
const app = express();

// Simple GET to test server
app.get('/', (req, res) => {
  res.send('Hello! This is Adam on Heroku.');
});

// Because line.middleware() needs raw body, do not use standard json parser on /webhook
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    // The events from LINE
    const events = req.body.events || [];
    console.log('Webhook events:', events);

    // Handle all events in parallel
    await Promise.all(events.map(handleEvent));

    // Return 200
    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(500).json({ error: error.toString() });
  }
});

// ------------------------------------------------------------------
// 8) Main Event Handler
// ------------------------------------------------------------------
async function handleEvent(event) {
  console.log('Received event:', event);

  // Only handle text messages
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const userId = event.source.userId;
  const userMessage = event.message.text.trim();
  console.log('Processing message from user:', userId, 'msg:', userMessage);

  // 1) Store user’s new message in memory
  //    Let’s store it as role = "user"
  if (!userChatHistory.has(userId)) {
    userChatHistory.set(userId, []);
  }
  userChatHistory.get(userId).push({ role: "user", text: userMessage });

  // 2) Optionally store in Airtable if you want:
  //    base('ConversationHistory').create({ fields: {...} })

  // 3) Get AI reply
  const aiReply = await processWithAI(userId, userMessage, 'general');

  // 4) Also store AI’s reply in memory with role = "assistant"
  userChatHistory.get(userId).push({ role: "assistant", text: aiReply });

  // 5) Send back to user
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: aiReply,
  });
}

// ------------------------------------------------------------------
// 9) Start the server
// ------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});