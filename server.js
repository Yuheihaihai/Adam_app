/********************************************************************
 * server.js - Example updated for 10 vs 100 message contexts, plus
 * "memory recall" summary approach.
 ********************************************************************/
const express = require('express');
const line = require('@line/bot-sdk');
const { OpenAI } = require('openai');
const Airtable = require('airtable');

const app = express();

/** 1) Environment variable checks. */
console.log('Environment check:', {
  hasAccessToken: !!process.env.CHANNEL_ACCESS_TOKEN,
  hasSecret: !!process.env.CHANNEL_SECRET,
  openAIKey: !!process.env.OPENAI_API_KEY,
  airtableToken: !!process.env.AIRTABLE_ACCESS_TOKEN,
  airtableBase: !!process.env.AIRTABLE_BASE_ID,
});

/** 2) LINE config. */
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

/** 3) OpenAI initialization. */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/** 4) Airtable initialization. */
console.log('Airtable Configuration Check:', {
  hasAccessToken: !!process.env.AIRTABLE_ACCESS_TOKEN,
  tokenPrefix: process.env.AIRTABLE_ACCESS_TOKEN
    ? process.env.AIRTABLE_ACCESS_TOKEN.slice(0, 4)
    : '(none)',
  baseId: process.env.AIRTABLE_BASE_ID,
  tableName: 'ConversationHistory',
});

const base = new Airtable({
  apiKey: process.env.AIRTABLE_ACCESS_TOKEN,
  endpointUrl: 'https://api.airtable.com',
  requestTimeout: 300000,
}).base(process.env.AIRTABLE_BASE_ID);

const INTERACTIONS_TABLE = 'ConversationHistory';

/** 5) AI instructions (for different modes). */
const AI_INSTRUCTIONS = {
  general: `
    Always remember these instructions. Speak in Japanese under 200 chars.
    Keep conversation casual, empathic, and keep it going with short questions.
  `,
  characteristics: `
    You are Adam, a counselor specialized in neurodivergence (ASD/ADHD).
    Summarize or analyze user traits with up to 100 messages of context.
    Respond in Japanese, under 200 characters.
  `,
  career: `
    You are Adam, a career counselor for individuals with ASD/ADHD.
    Provide broad suggestions referencing the user’s preferences, using up to 100 messages.
    Must disclaim “See a real counselor.” Under 200 chars in Japanese.
  `,
  memoryRecall: `
    The user wants a memory summary. Summarize the user’s last few interactions.
    Provide a short, coherent recap in Japanese, <200 chars. 
  `,
};

/** 6) Store a conversation record in Airtable. */
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
    console.error('Error storing interaction in Airtable:', err);
  }
}

/** 7) Fetch user chat history from Airtable. */
async function fetchUserHistory(userId, limit = 10) {
  try {
    // limit can be 10 or 100, depending on mode
    console.log(`Fetching history for user ${userId}, limit: ${limit}`);
    const records = await base(INTERACTIONS_TABLE)
      .select({
        filterByFormula: `{UserID} = "${userId}"`,
        sort: [{ field: 'Timestamp', direction: 'desc' }],
        maxRecords: limit,
      })
      .all();

    console.log(`Found ${records.length} records for user`);
    // Reverse so older first
    const sorted = records.reverse();
    return sorted.map((r) => ({
      role: r.get('Role'),
      content: r.get('Content'),
      timestamp: r.get('Timestamp'),
    }));
  } catch (error) {
    console.error('Error fetching history:', error);
    return [];
  }
}

/** 8) Summarize the user's conversation (for memory recall). */
async function summarizeConversation(fullHistory) {
  // Prepare a chunk of the user’s entire conversation for summarization
  const partialText = fullHistory
    .map((msg) => `[${msg.role}] ${msg.content}`)
    .join('\n');

  const systemPrompt = AI_INSTRUCTIONS.memoryRecall;

  // We'll instruct GPT to produce a very short summary in Japanese.
  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `全会話ログです:\n${partialText}\n\n短い要約をお願いします。`,
    },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      max_tokens: 300,
      temperature: 0.7,
    });
    const reply = completion.choices[0]?.message?.content || '…';
    return reply;
  } catch (err) {
    console.error('Error summarizing conversation:', err);
    return 'すみません、要約中にエラーが発生しました。';
  }
}

/** 9) Main GPT logic: decides instructions + calls GPT. */
async function processWithAI(userMessage, userHistory, mode = 'general') {
  // For "general" we only keep last 10 from userHistory
  // For "characteristics" or "career" we may keep last 100
  let relevantHistory = [];
  if (mode === 'general') {
    relevantHistory = userHistory.slice(-10); // up to 10
  } else {
    // analysis or career => up to 100
    relevantHistory = userHistory.slice(-100);
  }

  const systemPrompt = AI_INSTRUCTIONS[mode] || AI_INSTRUCTIONS.general;

  // Build messages for GPT
  const messages = [
    { role: 'system', content: systemPrompt },
    ...relevantHistory.map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: item.content,
    })),
    { role: 'user', content: userMessage },
  ];

  console.log(`Calling GPT with ${messages.length} messages [mode=${mode}]`);
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      max_tokens: 300,
      temperature: 0.7,
    });
    const reply = completion.choices[0]?.message?.content || '（No reply）';
    return reply;
  } catch (err) {
    console.error('OpenAI error:', err);
    return '申し訳ありません、AI応答中にエラーが発生しました。';
  }
}

/** 10) Handling each incoming LINE event. */
async function handleEvent(event) {
  // Only handle text messages for simplicity
  if (event.type !== 'message' || event.message.type !== 'text') {
    return;
  }

  const userId = event.source.userId;
  const userMessage = event.message.text.trim();
  // store the user’s message
  await storeInteraction(userId, 'user', userMessage);

  // If user requests a memory summary (like “今までの話を思い出して”)
  // we can do a special “summarizeConversation”
  if (userMessage.includes('思い出して') || userMessage.includes('今までの話')) {
    // fetch *all* user logs, or maybe 50 or 100, up to you
    const allHistory = await fetchUserHistory(userId, 50);
    const summaryReply = await summarizeConversation(allHistory);
    await storeInteraction(userId, 'assistant', summaryReply);

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: summaryReply.slice(0, 2000),
    });
  }

  // Otherwise, decide if “characteristics” or “career” or default
  let mode = 'general';
  if (userMessage.includes('特性') || userMessage.includes('分析')) {
    mode = 'characteristics';
  } else if (userMessage.includes('キャリア')) {
    mode = 'career';
  }

  // fetch up to 100 records if analysis/career, or 10 if general
  const limit = mode === 'general' ? 10 : 100;
  const userHistory = await fetchUserHistory(userId, limit);

  // generate AI reply
  const aiReply = await processWithAI(userMessage, userHistory, mode);

  // store the AI reply
  await storeInteraction(userId, 'assistant', aiReply);

  // send it back to user
  await client.replyMessage(event.replyToken, {
    type: 'text',
    text: aiReply.slice(0, 2000),
  });
}

/** 11) Basic test endpoint. */
app.get('/', (req, res) => {
  res.send('Hello! This is Adam with 10/100 memory logic. Everything looks good.');
});

/** 12) LINE webhook. */
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events || [];
    await Promise.all(events.map(handleEvent));
    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook Error:', err);
    return res.status(500).json({ error: err.toString() });
  }
});

/** 13) Listen on the configured port. */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});