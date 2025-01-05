const express = require('express');
const line = require('@line/bot-sdk');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();

// LINE Config
const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

// OpenAI Config
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Basic health check
app.get('/', (req, res) => {
  res.send('OK');
});

// LINE Webhook
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).end();
  }
});

// Event Handler
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const client = new line.Client(lineConfig);

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