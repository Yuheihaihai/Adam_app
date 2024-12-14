require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const Airtable = require('airtable');

// Load environment variables
const {
  CHANNEL_ACCESS_TOKEN,
  CHANNEL_SECRET,
  OPENAI_API_KEY,
  AIRTABLE_API_KEY,
  AIRTABLE_BASE_ID,
  INTERACTIONS_TABLE
} = process.env;

// Basic checks
if (!CHANNEL_ACCESS_TOKEN || !CHANNEL_SECRET || !OPENAI_API_KEY || !AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !INTERACTIONS_TABLE) {
  console.error("Missing one or more environment variables. Check your Heroku config vars.");
  process.exit(1);
}

const config = {
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
  channelSecret: CHANNEL_SECRET
};

const client = new line.Client(config);

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

async function storeInteraction(userId, role, content) {
  try {
    await base(INTERACTIONS_TABLE).create([
      {
        fields: {
          UserID: userId,
          Role: role,
          Content: content,
          Timestamp: new Date().toISOString()
        }
      }
    ]);
  } catch (error) {
    console.error("Error storing interaction in Airtable:", error);
  }
}

async function getOpenAIResponse(userMessage) {
  try {
    const openaiResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-3.5-turbo", // or gpt-4 if you have access
      messages: [
        { role: "system", content: "You are a helpful assistant. Please answer in Japanese." },
        { role: "user", content: userMessage }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return openaiResponse.data.choices[0].message.content;
  } catch (error) {
    console.error("OpenAI request error:", error);
    return "申し訳ありません、現在お手伝いできません。"; // Fallback message
  }
}

const app = express();

// LINE middleware must come before any body parsing
app.post('/webhook', line.middleware(config), async (req, res) => {
  if (!req.body.events || req.body.events.length === 0) {
    return res.json([]);
  }

  const event = req.body.events[0];

  // Only handle text messages
  if (event.type === 'message' && event.message.type === 'text') {
    const userMessage = event.message.text.trim();
    const userId = event.source.userId;

    // Store user message in Airtable
    await storeInteraction(userId, "user", userMessage);

    // Get OpenAI response
    const openaiReply = await getOpenAIResponse(userMessage);

    // Store assistant message in Airtable
    await storeInteraction(userId, "assistant", openaiReply);

    // Reply to user
    try {
      await client.replyMessage(event.replyToken, { type: 'text', text: openaiReply });
    } catch (err) {
      console.error("LINE reply error:", err);
    }

    return res.json({}); // Return 200 OK
  } else {
    // If not a text message, just return OK
    return res.json({});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});