const express = require('express');
const line = require('@line/bot-sdk');
const { OpenAI } = require('openai');
const Airtable = require('airtable');

const app = express();

// Debug logging
console.log('Environment check:', {
  hasAccessToken: !!process.env.CHANNEL_ACCESS_TOKEN,
  hasSecret: !!process.env.CHANNEL_SECRET
});

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

// OpenAI Config
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

// Chat history and user state management
const userChatHistory = new Map();
const userStates = new Map();

// Initialize LINE client
const client = new line.Client(config);

// AI Processing functions
async function processWithAIInstructions(text, userId) {
  const history = userChatHistory.get(userId) || [];
  
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are Adam, a specialized counselor for neurodivergent individuals..."
          // Full instructions would go here
        },
        ...history.map(msg => ({
          role: "user",
          content: msg.text
        })),
        {
          role: "user",
          content: text
        }
      ],
      max_tokens: 1000
    });

    // Store response in Airtable
    await base('Interactions').create([
      {
        fields: {
          UserID: userId,
          Message: text,
          Response: completion.choices[0].message.content,
          Timestamp: new Date().toISOString()
        }
      }
    ]);

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('AI Processing Error:', error);
    return "申し訳ありません。一時的なエラーが発生しました。😢";
  }
}

// Basic health check
app.get('/', (req, res) => {
  res.send('OK');
});

// Add request debugging
app.use('/webhook', (req, res, next) => {
  console.log('Webhook request:', {
    signature: req.headers['x-line-signature'],
    body: JSON.stringify(req.body).substring(0, 100) + '...'
  });
  next();
});

// LINE Webhook
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events || [];
    console.log('Webhook events:', events); // Debug log
    await Promise.all(events.map(handleEvent));
    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(500).json({ error: error.toString() });
  }
});

// Event Handler
async function handleEvent(event) {
  console.log('Received event:', event); // Debug log

  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  // Safely handle the message text
  const messageText = event.message?.text || '';
  console.log('Processing message:', messageText); // Debug log

  try {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: messageText || 'メッセージを受け取りました。'
    });
  } catch (error) {
    console.error('Reply error:', error);
    return Promise.resolve(null);
  }
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
}); 