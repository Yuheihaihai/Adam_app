/**
 * test-fetch-messages.js
 * 
 * A simple test script to verify that the fetch-messages.js implementation works.
 */

// Import the fetchMessages function
const { fetchMessages } = require('./fetch-messages');

// Generate a test user ID
const testUserId = `test-user-${Date.now()}`;

// Main test function
async function runTest() {
  console.log('=== Testing fetchMessages function ===');
  console.log(`Using test user ID: ${testUserId}`);
  
  try {
    // Fetch messages for the test user
    console.log('Fetching messages...');
    const messages = await fetchMessages(testUserId, 10);
    
    // Log the results
    console.log(`Retrieved ${messages.length} messages`);
    if (messages.length > 0) {
      console.log('First message:');
      console.log(JSON.stringify(messages[0], null, 2));
    } else {
      console.log('No messages found for this user ID.');
      console.log('This is expected for a new test user ID.');
    }
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Error during test:', error);
    process.exit(1);
  }
}

// Run the test
runTest().catch(error => {
  console.error('Unhandled error in test:', error);
  process.exit(1);
}); 