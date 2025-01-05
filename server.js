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
    console.log('Processing events:', events.length);
    await Promise.all(events.map(handleEvent));
    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(500).json({ error: error.toString() });
  }
});

// Event Handler
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const client = new line.Client(config);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-1106-preview",
      messages: [{
        role: "user",
        content: event.message.text
      }],
      max_tokens: 500
    });

    const aiReply = response.choices[0]?.message?.content || 
                    'すみません、応答の生成に失敗しました。';

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: aiReply
    });
  } catch (error) {
    console.error('OpenAI Error:', error);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'すみません、エラーが発生しました。'
    });
  }
}

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on ${port}`);
}); 