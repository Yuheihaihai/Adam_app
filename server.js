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

// Add WebSocket handling for real-time audio
const wss = new WebSocket.Server({ server });

wss.on('connection', async (ws) => {
  try {
    // Initialize OpenAI session
    const session = await initializeOpenAISession();
    ws.session = session;

    ws.on('message', async (data) => {
      try {
        // Handle incoming audio data
        await processRealtimeAudio(ws, data);
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      cleanupSession(ws);
    });
  } catch (error) {
    console.error('WebSocket connection error:', error);
    ws.close();
  }
});

// Add session management
const sessions = new Map();

function cleanupSession(ws) {
  if (ws.session) {
    sessions.delete(ws.session.id);
  }
}

// Add audio processing
async function processRealtimeAudio(ws, audioData) {
  // Process audio with OpenAI Realtime API
  const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime');
  
  openaiWs.on('open', () => {
    openaiWs.send(JSON.stringify({
      type: 'authentication',
      token: ws.session.client_secret.value
    }));
  });

  openaiWs.on('message', (data) => {
    const event = JSON.parse(data);
    switch(event.type) {
      case 'response.audio.delta':
        ws.send(JSON.stringify({
          type: 'audio',
          data: event.delta
        }));
        break;
    }
  });
}

// Add monitoring
const metrics = {
  activeSessions: 0,
  totalRequests: 0,
  errors: 0
};

function updateMetrics(type, value) {
  metrics[type] = value;
  console.log('Metrics updated:', metrics);
} 