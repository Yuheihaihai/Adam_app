/**
 * simple-fetch.js
 * 
 * A simplified script to fetch messages from PostgreSQL database
 */

// Import required modules
const { Pool } = require('pg');

// Create a database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

/**
 * Fetch messages from PostgreSQL database
 * @param {string} userId - The user ID to fetch messages for
 * @param {number} limit - Maximum number of messages to retrieve (default: 20)
 * @returns {Promise<Array>} - Array of messages
 */
async function fetchMessagesFromPostgres(userId, limit = 20) {
  try {
    console.log(`Fetching messages for user ${userId} with limit ${limit}...`);
    
    // Query the database
    const result = await pool.query(
      'SELECT * FROM user_messages WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2',
      [userId, limit]
    );
    
    if (result.rows && result.rows.length > 0) {
      console.log(`Retrieved ${result.rows.length} messages from PostgreSQL`);
      
      // Map the results to a more usable format
      const messages = result.rows.map(row => ({
        role: row.role,
        content: row.content,
        timestamp: row.timestamp,
        mode: row.mode,
        messageType: row.message_type
      }));
      
      return messages;
    } else {
      console.log('No messages found in PostgreSQL database');
      return [];
    }
  } catch (error) {
    console.error('Error fetching messages from PostgreSQL:', error);
    return [];
  } finally {
    // Close the database connection
    await pool.end();
  }
}

// Example usage
async function main() {
  if (process.argv.length < 3) {
    console.log('Usage: node simple-fetch.js <userId> [limit]');
    process.exit(1);
  }

  const userId = process.argv[2];
  const limit = process.argv[3] ? parseInt(process.argv[3]) : 20;

  try {
    const messages = await fetchMessagesFromPostgres(userId, limit);
    
    console.log('Messages:');
    console.log(JSON.stringify(messages, null, 2));
    
    console.log('\nFetch completed successfully!');
  } catch (error) {
    console.error('Error in main function:', error);
    process.exit(1);
  }
}

// Run the main function if this script is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error in main function:', error);
    process.exit(1);
  });
} 