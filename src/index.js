// Import required packages
const express = require('express');
const line = require('@line/bot-sdk');
const { Configuration, OpenAIApi } = require('openai');
require('dotenv').config(); // Load environment variables

// Create an instance of an Express app
const app = express();

// LINE SDK configuration using environment variables
const config = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET
};

// Create a LINE client
const client = new line.Client(config);

// Setup OpenAI configuration
const openaiConfig = new Configuration({
    apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(openaiConfig);

// Setup webhook route for LINE events
app.post('/webhook', line.middleware(config), (req, res) => {
    if (!Array.isArray(req.body.events)) {
        return res.status(500).send('No events found');
    }

    // Respond with status 200 to LINE server
    res.sendStatus(200);

    // Process each event
    req.body.events.forEach(event => {
        console.log('Event received:', event);

        if (event.type === 'message' && event.message.type === 'text') {
            handleTextMessage(event);
        }
    });
});

// Function to handle text messages
async function handleTextMessage(event) {
    try {
        // Generate a response using OpenAI API
        const response = await openai.createCompletion({
            model: 'text-davinci-003',
            prompt: event.message.text,
            max_tokens: 150
        });

        // Reply with the generated response
        const reply = {
            type: 'text',
            text: response.data.choices[0].text.trim()
        };

        client.replyMessage(event.replyToken, reply)
            .then(() => {
                console.log('Reply sent');
            })
            .catch(err => {
                console.error('Error sending reply:', err);
            });
    } catch (error) {
        console.error('Error handling text message:', error);
    }
}

// Set up the port for the server to listen on (Heroku port or default to 3000)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
