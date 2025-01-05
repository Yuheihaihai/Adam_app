const express = require('express');
const line = require('@line/bot-sdk');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();

// Validate environment variables
if (!process.env.CHANNEL_ACCESS_TOKEN) throw new Error('Missing LINE Channel Access Token');
if (!process.env.CHANNEL_SECRET) throw new Error('Missing LINE Channel Secret');
if (!process.env.OPENAI_API_KEY) throw new Error('Missing OpenAI API Key');

// LINE SDK configuration
const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

// OpenAI configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Create LINE client
const client = new line.Client(lineConfig);

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof line.SignatureValidationFailed) {
    res.status(401).send('Invalid signature');
    return;
  }
  if (err instanceof line.JSONParseError) {
    res.status(400).send('Invalid JSON');
    return;
  }
  console.error('Error:', err);
  res.status(500).send('Internal error');
});

// Webhook handler with error handling
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    const results = await Promise.all(
      req.body.events.map(handleEvent)
    );
    res.json(results);
  } catch (err) {
    console.error('Webhook Error:', err);
    res.status(500).send('Webhook processing failed');
  }
});

// Event handler with improved error handling
async function handleEvent(event) {
  try {
    if (event.type !== 'message' || event.message.type !== 'text') {
      console.log('Unsupported event type:', event.type);
      return null;
    }

    const userMessage = event.message.text.trim();
    
    if (!userMessage) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'メッセージを入力してください。'
      });
    }

    // Process message with OpenAI with timeout
    const response = await Promise.race([
      openai.completions.create({
        model: "gpt-4o-realtime-preview-2024-12-17",
        prompt: userMessage,
        max_tokens: 150
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OpenAI timeout')), 10000)
      )
    ]);

    const aiReply = response.choices[0]?.text?.trim() || 
                    'すみません、応答の生成に失敗しました。';

    // Ensure reply is not too long for LINE (max 5000 chars)
    const truncatedReply = aiReply.length > 4999 ? 
      aiReply.substring(0, 4996) + '...' : 
      aiReply;

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: truncatedReply
    });

  } catch (error) {
    console.error('Event handling error:', error);
    
    // Send error message to user
    if (event.replyToken) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'エラーが発生しました。しばらく待ってから再度お試しください。'
      });
    }
    return null;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Add these error handling functions
async function handleError(error, replyToken) {
  console.error('Error:', error);
  
  const errorMessages = {
    'AUDIO_PROCESSING': 'すみません、音声の処理中にエラーが発生しました。',
    'SESSION_EXPIRED': 'セッションが切れました。もう一度お試しください。',
    'OPENAI_ERROR': 'AIサービスとの通信に問題が発生しました。',
    'DEFAULT': '申し訳ありません。エラーが発生しました。'
  };

  const message = errorMessages[error.code] || errorMessages.DEFAULT;
  
  await client.replyMessage(replyToken, {
    type: 'text',
    text: message
  });
}

// Add session management
const sessions = new Map();

function cleanupSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session) {
    if (session.ws) session.ws.close();
    sessions.delete(sessionId);
  }
}

// Add audio processing utilities
const audioUtils = {
  validateAudioFormat: (audio) => {
    // Implement audio format validation
  },
  
  convertAudioFormat: async (audio, targetFormat) => {
    // Implement audio conversion
  },
  
  createAudioResponse: async (chunks) => {
    // Implement response creation
  }
};

// Update the processAudioWithOpenAI function
async function processAudioWithOpenAI(audioStream, session) {
  const ws = new WebSocket('wss://api.openai.com/v1/realtime');
  let audioChunks = [];
  
  try {
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'authentication',
          token: session.client_secret.value
        }));
        
        audioStream.pipe(ws);
      });
      
      ws.on('message', async (data) => {
        const event = JSON.parse(data);
        
        switch(event.type) {
          case 'response.audio.delta':
            audioChunks.push(Buffer.from(event.delta, 'base64'));
            break;
            
          case 'response.audio.done':
            resolve(await audioUtils.createAudioResponse(audioChunks));
            break;
        }
      });
      
      ws.on('error', reject);
    });
  } finally {
    ws.close();
  }
}

// Add monitoring
const metrics = {
  sessions: 0,
  activeConnections: 0,
  errors: 0,
  audioProcessed: 0
};

function updateMetrics(type, value) {
  metrics[type] = value;
  console.log('Metrics updated:', metrics);
}

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}); 