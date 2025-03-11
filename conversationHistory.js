/**
 * Conversation History Module
 * 
 * Provides functionality to store and retrieve user conversation history
 * Used by localML.js for analyzing conversation patterns
 */

// In-memory storage for conversation history
const conversationStore = {};

/**
 * Add a message to a user's conversation history
 * @param {string} userId - The user's unique identifier
 * @param {Object} message - The message object containing role and content
 */
async function addToConversationHistory(userId, message) {
  if (!conversationStore[userId]) {
    conversationStore[userId] = [];
  }
  
  conversationStore[userId].push({
    ...message,
    timestamp: new Date().toISOString()
  });
  
  // Limit history size (optional)
  if (conversationStore[userId].length > 100) {
    conversationStore[userId] = conversationStore[userId].slice(-100);
  }
}

/**
 * Get a user's conversation history
 * @param {string} userId - The user's unique identifier
 * @param {number} limit - Maximum number of messages to retrieve (default: 20)
 * @returns {Array} - Array of conversation messages
 */
async function getUserConversationHistory(userId, limit = 20) {
  if (!conversationStore[userId]) {
    return [];
  }
  
  // Return the most recent messages up to the limit
  return conversationStore[userId].slice(-limit);
}

/**
 * Clear a user's conversation history
 * @param {string} userId - The user's unique identifier
 */
async function clearConversationHistory(userId) {
  conversationStore[userId] = [];
}

module.exports = {
  addToConversationHistory,
  getUserConversationHistory,
  clearConversationHistory
}; 