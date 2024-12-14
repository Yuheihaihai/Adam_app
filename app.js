require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');

// Load environment variables
const { CHANNEL_ACCESS_TOKEN, CHANNEL_SECRET } = process.env;

if (!CHANNEL_ACCESS_TOKEN || !CHANNEL_SECRET) {
  console.error("Missing LINE channel tokens. Set CHANNEL_ACCESS_TOKEN and CHANNEL_SECRET.");
  process.exit(1);
}

const config = {
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
  channelSecret: CHANNEL_SECRET
};

const app = express();

// Health check route - to ensure the server is running
app.get('/', (req, res) => {
  res.send('Hello! The server is running.');
});

// Webhook route for LINE
app.post('/webhook', line.middleware(config), (req, res) => {
  // Just return a 200 OK response no matter what
  // This ensures that the LINE platform sees 200 and not 404.
  console.log('Received a POST /webhook request from LINE.');
  res.status(200).json({received:true});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});