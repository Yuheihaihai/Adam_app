require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');

const {
  CHANNEL_ACCESS_TOKEN,
  CHANNEL_SECRET,
  OPENAI_API_KEY,
  AIRTABLE_API_KEY,
  AIRTABLE_BASE_ID,
  INTERACTIONS_TABLE,
  FEEDBACK_TABLE
} = process.env;

if (!CHANNEL_ACCESS_TOKEN || !CHANNEL_SECRET) {
  console.error("Missing LINE tokens");
  process.exit(1);
}

const config = {
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
  channelSecret: CHANNEL_SECRET
};

const app = express();

// DO NOT put express.json() before line.middleware.
app.post('/webhook', line.middleware(config), (req, res) => {
  if (!req.body.events || req.body.events.length === 0) {
    return res.json([]);
  }

  // For testing, just respond with a simple message.
  const client = new line.Client(config);
  const event = req.body.events[0];

  if (event.type === 'message' && event.message.type === 'text') {
    return client.replyMessage(event.replyToken, { type: 'text', text: 'Test OK' })
      .then(() => res.json({}))
      .catch(err => {
        console.error("Reply error:", err);
        // still return 200 to not cause signature error confusion
        return res.json({});
      });
  } else {
    return res.json({});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server on ${PORT}`);
});