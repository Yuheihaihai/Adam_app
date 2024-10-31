// Import necessary libraries
const express = require('express');
const line = require('@line/bot-sdk');
const { OpenAIApi, Configuration } = require('openai');

// Load environment variables
require('dotenv').config();

// Initialize OpenAI with the correct configuration
const configuration = {
  apiKey: process.env.OPENAI_API_KEY,
};
const openai = new OpenAIApi(configuration); // Directly pass the configuration object

// LINE bot configuration
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// Create an Express application
const app = express();

// Setup webhook route for LINE events
app.post('/webhook', line.middleware(config), (req, res) => {
  if (!Array.isArray(req.body.events)) {
    return res.status(500).send('No events found');
  }

  // Process each event from LINE
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('Error handling events:', err);
      res.status(500).end();
    });
});

// Function to handle incoming LINE events
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    // Ignore non-text messages
    return Promise.resolve(null);
  }

  const userMessage = event.message.text;

  try {
    // Get a response from OpenAI based on the user's message
    const openaiResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: userMessage }],
    });

    const replyText = openaiResponse.choices[0].message.content;

    // Reply to the user using LINE API
    const client = new line.Client(config);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: replyText,
    });
  } catch (error) {
    console.error('Error with OpenAI request:', error);
    return Promise.resolve(null);
  }
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
