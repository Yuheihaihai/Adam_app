/********************************************************************
 * server.js - Example of a fully integrated LINE + OpenAI + Airtable
 *  - Normal chat => fetch last 10 messages
 *  - "特性" "分析" "キャリア" "思い出して" => fetch last 100 messages
 *  - GPT instructions differ by mode
 ********************************************************************/

// 1) Import dependencies
require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { OpenAI } = require('openai');
const Airtable = require('airtable');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// 1. Environment Variables & Config
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

// Validate environment variables
const REQUIRED_ENV = [
  {
    key: 'CHANNEL_ACCESS_TOKEN',
    validator: (val) => val?.length >= 20,
  },
  {
    key: 'CHANNEL_SECRET',
    validator: (val) => val?.length >= 10,
  },
  {
    key: 'OPENAI_API_KEY',
    validator: (val) => val?.startsWith('sk-'),
  },
  {
    key: 'AIRTABLE_API_KEY',
    validator: (val) => val?.length >= 10,
  }
];

REQUIRED_ENV.forEach(({key, validator}) => {
  if (!process.env[key] || !validator(process.env[key])) {
    console.error(`Security: Missing/Invalid env var: ${key}`);
    process.exit(1);
  }
});

// 1. Configure timeouts for external APIs
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 20000, // 20s timeout
  maxRetries: 2
});

Airtable.configure({
  apiKey: process.env.AIRTABLE_API_KEY,
  requestTimeout: 20000
});

const base = Airtable.base(process.env.AIRTABLE_BASE_ID);
const client = new line.Client(config);

// 3. Security Utilities
function sanitizeForLog(content) {
  if (!content) return '';
  const str = typeof content === 'string' ? content : JSON.stringify(content);
  // Remove potential sensitive data patterns
  return str
    .replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-***') // OpenAI key pattern
    .replace(/key[a-zA-Z0-9]{32,}/g, 'key***') // Airtable key pattern
    .slice(0, 100) + (str.length > 100 ? '...(truncated)' : '');
}

function validateUserInput(content) {
  if (!content || typeof content !== 'string') return false;
  if (content.length > 1000) return false;
  // Prevent common injection patterns
  const dangerousPatterns = [
    '<script',
    'javascript:',
    'data:',
    'vbscript:',
    'onclick=',
    'onerror=',
    'onload='
  ];
  return !dangerousPatterns.some(pattern => 
    content.toLowerCase().includes(pattern)
  );
}

// 4. Rate Limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests' }
});

// 5. Express Setup with Security
const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ 
  limit: '10kb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      throw new Error('Invalid JSON');
    }
  }
}));

// 6. Secure Storage
async function storeInteraction(userId, role, content) {
  try {
    // Validate inputs before storage
    if (!userId || !role || !content) {
      throw new Error('Missing required fields for storage');
    }
    
    await base(INTERACTIONS_TABLE).create([
      {
        fields: {
          UserID: userId,
          Role: role,
          Content: content,
          Timestamp: new Date().toISOString(),
          MetaData: JSON.stringify({
            source: 'LINE',
            version: '1.0'
          })
        },
      },
    ]);
    console.log(`Stored ${role} message for user: ${sanitizeForLog(userId)}`);
  } catch (err) {
    console.error('Storage error:', sanitizeForLog(err.message));
    throw err; // Re-throw to handle in calling function
  }
}

// 7. Secure Event Handler
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const userId = event.source.userId;
  const userMessage = event.message.text.trim();

  if (!validateUserInput(userMessage)) {
    console.warn(`Rejected invalid input from user: ${sanitizeForLog(userId)}`);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '申し訳ありませんが、そのメッセージは処理できません。'
    });
  }

  try {
    await storeInteraction(userId, 'user', userMessage);
    
    const { mode, limit } = determineModeAndLimit(userMessage);
    const userHistory = await fetchUserHistory(userId, limit);
    
    const aiReply = await Promise.race([
      processWithAI(userMessage, userHistory, mode),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('AI timeout')), 15000)
      )
    ]);

    await storeInteraction(userId, 'assistant', aiReply);

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: aiReply.slice(0, 2000)
    });
  } catch (err) {
    console.error('Event handling error:', err.message);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '申し訳ありません、エラーが発生しました。もう一度お試しください。'
    });
  }
}

// 8. Secure Webhook
app.post('/webhook', 
  limiter,
  (req, res, next) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      req.rawBody = data;
      try {
        req.body = JSON.parse(data);
        next();
      } catch (err) {
        res.status(400).json({ error: 'Invalid JSON' });
      }
    });
  },
  line.middleware(config),
  async (req, res) => {
    try {
      const events = req.body.events || [];
      await Promise.all(
        events.map(event => 
          Promise.race([
            handleEvent(event),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Event timeout')), 15000)
            )
          ])
        )
      );
      return res.json({ status: 'ok' });
    } catch (err) {
      console.error('Webhook error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});