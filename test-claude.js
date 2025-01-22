require('dotenv').config();
const { Anthropic } = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function testClaude() {
  try {
    console.log('Testing Claude connection...');
    console.log('API Key exists:', !!process.env.ANTHROPIC_API_KEY);
    
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      temperature: 0.7,
      system: "You are a helpful assistant.",
      messages: [{
        role: 'user',
        content: 'Hello, this is a test message. Please respond in Japanese.'
      }]
    });

    console.log('Claude Response:', response.content[0].text);
  } catch (err) {
    console.error('Claude Test Error:', err);
    console.error('Error details:', {
      name: err.name,
      message: err.message,
      status: err.status,
      type: err.type
    });
  }
}

testClaude();
