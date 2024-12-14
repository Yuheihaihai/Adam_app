require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');

// Load environment variables
const {
  CHANNEL_ACCESS_TOKEN,
  CHANNEL_SECRET
} = process.env;

if (!CHANNEL_ACCESS_TOKEN || !CHANNEL_SECRET) {
  console.error("Missing LINE channel tokens. Please set CHANNEL_ACCESS_TOKEN and CHANNEL_SECRET.");
  process.exit(1);
}

const config = {
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
  channelSecret: CHANNEL_SECRET
};

const app = express();

// A simple GET route for the root path to show a friendly message
app.get('/', (req, res) => {
  res.send('Hello, this is the Adam server running on Heroku!');
});

// The LINE webhook endpoint (POST)
app.post('/webhook', line.middleware(config), (req, res) => {
  // If no events, return empty array (200 OK)
  if (!req.body.events || req.body.events.length === 0) {
    return res.json([]);
  }

  // For now, just send back an empty array to confirm receipt
  return res.json([]);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});