/********************************************************************
 * server.js - Example of a fully integrated LINE + OpenAI + Airtable
 *  - Normal chat => fetch last 10 messages
 *  - "特性" "分析" "キャリア" "思い出して" => fetch last 100 messages
 *  - GPT instructions differ by mode
 ********************************************************************/

// 1) Import dependencies
require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { OpenAI } = require('openai');
const Airtable = require('airtable');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Constants
const INTERACTIONS_TABLE = 'Interactions';
const MAX_HISTORY_LIMIT = 10;

// LINE config
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

// Initialize APIs with shorter timeouts
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 8000,
  maxRetries: 0
});

Airtable.configure({
  apiKey: process.env.AIRTABLE_API_KEY,
  requestTimeout: 5000
});

const base = Airtable.base(process.env.AIRTABLE_BASE_ID);
const client = new line.Client(config);

// Helper functions
function determineModeAndLimit(message) {
  if (message.includes('特性を分析して')) {
    return { mode: 'analysis', limit: 5 };
  }
  if (message.includes('思い出して')) {
    return { mode: 'memory', limit: MAX_HISTORY_LIMIT };
  }
  return { mode: 'chat', limit: 3 };
}

async function fetchUserHistory(userId, limit = 3) {
  try {
    const records = await base(INTERACTIONS_TABLE)
      .select({
        filterByFormula: `{UserID} = '${userId}'`,
        sort: [{ field: 'Timestamp', direction: 'desc' }],
        maxRecords: limit
      })
      .firstPage();
    return records.map(record => ({
      role: record.get('Role'),
      content: record.get('Content')
    }));
  } catch (err) {
    console.error('History fetch error:', err.message);
    return [];
  }
}

// Express setup
const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Webhook route
app.post('/webhook',
  line.middleware(config),
  async (req, res) => {
    try {
      const events = req.body.events || [];
      await Promise.all(events.map(handleEvent));
      return res.json({ status: 'ok' });
    } catch (err) {
      console.error('Webhook error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Event handler
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const userId = event.source.userId;
  const userMessage = event.message.text.trim();

  try {
    const { mode, limit } = determineModeAndLimit(userMessage);
    const userHistory = await fetchUserHistory(userId, limit);
    
    const aiReply = await processWithAI(userMessage, userHistory, mode);

    // Store messages in background
    storeInteraction(userId, 'user', userMessage).catch(console.error);
    storeInteraction(userId, 'assistant', aiReply).catch(console.error);

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: aiReply.slice(0, 2000)
    });
  } catch (err) {
    console.error('Event handling error:', err.message);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '申し訳ありません、エラーが発生しました。もう一度お試しください。'
    });
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});