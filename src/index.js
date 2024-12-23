// Import necessary libraries
const express = require('express');
const line = require('@line/bot-sdk');
const { Configuration, OpenAIApi } = require('openai');

// Load environment variables
require('dotenv').config();

// Create OpenAI configuration
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize OpenAIApi using the configuration
const openai = new OpenAIApi(configuration);

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
    const openaiResponse = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: userMessage }],
    });

    const replyText = openaiResponse.data.choices[0].message.content;

    // Reply to the user using LINE API
    const client = new line.Client(config);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: replyText,
    });
  } catch (error) {
