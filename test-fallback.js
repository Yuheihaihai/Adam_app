require('dotenv').config();
const { OpenAI } = require('openai');
const { Anthropic } = require('@anthropic-ai/sdk');

// Initialize with invalid OpenAI key to force fallback
const openai = new OpenAI({ apiKey: 'invalid_key_to_force_error' });
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function testFallback() {
  try {
    console.log('Testing fallback mechanism...');
    
    // Simulate the tryPrimaryThenBackup function from server.js
    async function tryPrimaryThenBackup(messages) {
      try {
        console.log('Attempting OpenAI (should fail)...');
        const resp = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: messages,
          temperature: 0.7,
        });
        return resp.choices[0].message.content;
      } catch (err) {
        console.error('OpenAI error (expected):', err.message);
        console.log('Attempting Claude fallback...');
        
        // Extract system prompt and user messages
        const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
        const userMessages = messages
          .filter(m => m.role !== 'system')
          .map(m => m.content)
          .join('\n\n');

        const claudeResponse = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          temperature: 0.7,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: userMessages
          }]
        });
        
        return claudeResponse.content[0].text;
      }
    }

    // Test messages
    const messages = [
      {
        role: 'system',
        content: 'あなたは「Adam」というアシスタントです。返答は日本語のみ。'
      },
      {
        role: 'user',
        content: '今日の気分はどうですか？'
      }
    ];

    console.log('Sending test message...');
    const response = await tryPrimaryThenBackup(messages);
    console.log('\nFinal Response:', response);

  } catch (err) {
    console.error('Test Failed:', err);
  }
}

testFallback(); 