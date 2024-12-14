const express = require('express');
const line = require('@line/bot-sdk');
require('dotenv').config();

const { CHANNEL_ACCESS_TOKEN, CHANNEL_SECRET } = process.env;

if (!CHANNEL_ACCESS_TOKEN || !CHANNEL_SECRET) {
  console.error("Missing LINE tokens");
  process.exit(1);
}

const config = {
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
  channelSecret: CHANNEL_SECRET
};

const app = express();

// Do NOT use express.json() before line.middleware.
app.post('/webhook', line.middleware(config), (req, res) => {
  if (!req.body.events || req.body.events.length === 0) {
    return res.json([]);
  }

  const client = new line.Client(config);
  const event = req.body.events[0];

  if (event.type === 'message' && event.message.type === 'text') {
    return client.replyMessage(event.replyToken, { type: 'text', text: 'Hello from Heroku!' })
      .then(() => res.json({}))
      .catch(err => {
        console.error("Reply error:", err);
        return res.json({});
      });
  } else {
    return res.json({});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});