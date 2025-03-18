// local-test.js - Script to test server functionality locally
require('dotenv').config({ path: '.env.local' });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Set TEST_MODE environment variable
process.env.TEST_MODE = 'true';

// Import main server code functions (without starting the LINE webhook)
const { 
  processMessage, 
  getSystemPromptForMode,
  determineModeAndLimit,
  processUserMessage,
  fetchUserHistory,
  analyzeHistoryContent,
  fetchPastAiMessages
} = require('./server.js');

// Create a simple Express server for testing
const app = express();
app.use(express.json());
app.use(cors());

// Simple HTML interface for testing
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-interface.html'));
});

// API endpoint to process messages
app.post('/api/test-message', async (req, res) => {
  try {
    const { userId, message } = req.body;
    
    if (!userId || !message) {
      return res.status(400).json({ error: 'Missing userId or message' });
    }
    
    console.log(`Processing test message from ${userId}: ${message}`);
    
    // Process the message using the main server logic
    const response = await processMessage(userId, message);
    
    return res.json({ success: true, response });
  } catch (error) {
    console.error('Error processing test message:', error);
    return res.status(500).json({ error: error.message || 'Unknown error' });
  }
});

// Test endpoint to directly process a message with AI
app.post('/api/test-ai', async (req, res) => {
  try {
    const { userId, message } = req.body;
    
    if (!userId || !message) {
      return res.status(400).json({ error: 'Missing userId or message' });
    }
    
    console.log(`Testing AI processing for ${userId}: ${message}`);
    
    // Get mode and system prompt
    const { mode, limit } = determineModeAndLimit(message);
    const systemPrompt = getSystemPromptForMode(mode);
    
    // Fetch user conversation history
    const history = await fetchUserHistory(userId, 10);
    const metadata = {};
    
    // Analyze history content to get additional context
    analyzeHistoryContent(history, metadata);
    
    // Create history data object with fetched history
    const historyData = { history, metadata };
    
    // Process with AI
    const response = await processUserMessage(userId, message, historyData, mode);
    
    return res.json({ 
      success: true, 
      mode,
      historyLength: history.length,
      response 
    });
  } catch (error) {
    console.error('Error in AI test:', error);
    return res.status(500).json({ error: error.message || 'Unknown error' });
  }
});

// History endpoint to view past chat messages
app.get('/api/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    
    // Fetch history
    const history = await fetchUserHistory(userId, limit);
    
    // Also fetch AI messages
    const aiMessages = await fetchPastAiMessages(userId, limit);
    
    return res.json({
      success: true,
      history,
      aiMessages
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    return res.status(500).json({ error: error.message || 'Unknown error' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log(`Visit http://localhost:${PORT} to access the test interface`);
}); 