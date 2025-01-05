const express = require('express');
const line = require('@line/bot-sdk');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();

// Add basic health check endpoint
app.get('/', (req, res) => {
  res.send('OK');
});

// LINE SDK configuration
const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

// Validate environment variables
if (!process.env.CHANNEL_ACCESS_TOKEN) {
  console.error('Missing CHANNEL_ACCESS_TOKEN');
  process.exit(1);
}

if (!process.env.CHANNEL_SECRET) {
  console.error('Missing CHANNEL_SECRET');
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

// Parse JSON bodies
app.use(express.json());

// LINE webhook endpoint with error handling
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events;
    console.log('Received events:', events);
    
    await Promise.all(events.map(handleEvent));
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error'
  });
});

// Start server with error handling
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
})
.on('error', (error) => {
  console.error('Server startup error:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}); 