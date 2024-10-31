// Import necessary libraries
const express = require('express');
const line = require('@line/bot-sdk');

const { Configuration, OpenAIApi } = require('openai');

const { OpenAIApi, Configuration } = require('openai');
　　　 d62a8cc4b8e22a5624c5ae4a585e02989a4d1137

// Load environment variables
require('dotenv').config();


// Initialize OpenAI with API key

// Initialize OpenAI with the correct configuration
    d62a8cc4b8e22a5624c5ae4a585e02989a4d1137
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
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

    const openaiResponse = await openai.chat.completions.create({
         d62a8cc4b8e22a5624c5ae4a585e02989a4d1137
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: userMessage }],
    });


    const replyText = openaiResponse.data.choices[0].message.content;

    const replyText = openaiResponse.choices[0].message.content;
        d62a8cc4b8e22a5624c5ae4a585e02989a4d1137

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

app.listen(PORT, () => {

app.listen(PORT, '0.0.0.0', () => {
        d62a8cc4b8e22a5624c5ae4a585e02989a4d1137
  console.log(`Server is running on port ${PORT}`);
});

