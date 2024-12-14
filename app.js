require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');

// Load environment variables
const {
  CHANNEL_ACCESS_TOKEN,
  CHANNEL_SECRET
} = process.env;

if (!CHANNEL_ACCESS_TOKEN || !CHANNEL_SECRET) {
  console.error("Missing LINE channel tokens. Set CHANNEL_ACCESS_TOKEN and CHANNEL_SECRET.");
  process.exit(1);
}

const config = {
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
  channelSecret: CHANNEL_SECRET
};

const app = express();

// DO NOT use app.use(express.json()) or other body parsers before line.middleware!
// line.middleware needs the raw request body.

app.post('/webhook', line.middleware(config), (req, res) => {
  // If no events, return empty array (200 OK)
  if (!req.body.events || req.body.events.length === 0) {
    return res.json([]);
  }

  // If events are present, just return 200 with empty array for now
  // This confirms the webhook works, you can add logic later.
  return res.json([]);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});