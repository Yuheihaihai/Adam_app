/**
 * fetch-messages.js
 * 
 * A utility script to fetch messages from both PostgreSQL and Airtable
 * using the enhanced fetchUserHistory function.
 */

// Import required modules
const Airtable = require('airtable');

// Import the server.js module to access fetchUserHistory
// Note: This assumes fetchUserHistory is exported from server.js
// If it's not exported, you'll need to modify server.js to export it
let fetchUserHistory;
try {
  // Try to import from server.js
  const server = require('../server');
  fetchUserHistory = server.fetchUserHistory;
} catch (error) {
  console.error('Error importing fetchUserHistory from server.js:', error.message);
  console.error('Make sure fetchUserHistory is exported from server.js');
  process.exit(1);
}

/**
 * Fetch messages from both PostgreSQL and Airtable
 * @param {string} userId - The user ID to fetch messages for
 * @param {number} limit - Maximum number of messages to retrieve (default: 20)
 * @returns {Array} - Combined array of messages from both sources
 */
async function fetchMessages(userId, limit = 20) {
  try {
    // Call the enhanced fetchUserHistory function
    // This function is already set up to fetch from both PostgreSQL and Airtable
    const messages = await fetchUserHistory(userId, limit);
    
    console.log(`Retrieved ${messages.length} messages for user ${userId}`);
    return messages;
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
}

// Example usage
async function main() {
  if (process.argv.length < 3) {
    console.log('Usage: node fetch-messages.js <userId> [limit]');
    process.exit(1);
  }

  const userId = process.argv[2];
  const limit = process.argv[3] ? parseInt(process.argv[3]) : 20;

  console.log(`Fetching messages for user ${userId} with limit ${limit}...`);
  const messages = await fetchMessages(userId, limit);
  
  console.log('Messages:');
  console.log(JSON.stringify(messages, null, 2));
}

// Run the main function if this script is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Error in main function:', error);
    process.exit(1);
  });
}

// Export the fetchMessages function for use in other modules
module.exports = {
  fetchMessages
}; 