require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');

// Load environment variables from .env or Heroku config vars
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

// Simple GET route at root path to verify the app is up.
app.get('/', (req, res) => {
  res.send('Hello, this is the LINE bot server running on Heroku!');
});

// LINE webhook endpoint
// This must match the webhook URL you set in the LINE Developer Console: https://your-app-name.herokuapp.com/webhook
app.post('/webhook', line.middleware(config), (req, res) => {
  if (!req.body.events || req.body.events.length === 0) {
    // If no events, return empty array (JSON) with 200 OK
    return res.json([]);
  }

  // If there are events, return a simple JSON object to confirm receipt.
  // This ensures a 200 OK response.
  return res.json({status: 'ok'});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});