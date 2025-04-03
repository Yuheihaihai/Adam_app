// test_airtable.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Airtable = require('airtable');
let airtableBase = null;
if (process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
  try {
    airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
      .base(process.env.AIRTABLE_BASE_ID);
    console.log("Airtable base initialized for test.");
  } catch (error) {
      console.error("Failed to initialize Airtable Base:", error);
      process.exit(1);
  }
} else {
  console.error("Airtable credentials missing in .env file!");
  process.exit(1);
}

// Mimic saveMessageToAirtable from conversationHistory.js
async function saveToAirtable(userId, message) {
  if (!airtableBase) return;
   try {
    const data = {
        UserID: userId,
        Role: message.role,
        Content: message.content,
        Timestamp: new Date().toISOString(), // Use current time
        Mode: 'test', 
        MessageType: 'text'
    };
    console.log(`[Test] Attempting to save to Airtable:`, data);
    // Assuming ConversationHistory table exists with these fields
    await airtableBase('ConversationHistory').create([{ fields: data }]);
    console.log(`[Test] Saved message to Airtable for user ${userId}`);
  } catch (err) {
    console.error('[Test] Error saving to Airtable:', err.message || err);
    console.error('Stack:', err.stack);
    // Provide details on expected table/fields if a common error occurs
    if (err.statusCode === 404 || (err.message && err.message.includes('could not be found'))) {
        console.error('Ensure the table \'ConversationHistory\' exists in your Airtable base.');
    } else if (err.statusCode === 422) { // Unprocessable Entity - often field issues
        console.error('Ensure the table \'ConversationHistory\' has the correct fields (UserID, Role, Content, Timestamp, Mode, MessageType) with appropriate types.');
    }
    throw err; // Re-throw the error to fail the test
  }
}

// Mimic loadConversationHistoryFromAirtable from conversationHistory.js
async function loadFromAirtable(userId, limit = 5) {
  if (!airtableBase) return [];
  try {
    console.log(`[Test] Attempting to load last ${limit} messages for user ${userId} from Airtable...`);
    const records = await airtableBase('ConversationHistory')
      .select({
        filterByFormula: `{UserID} = "${userId}"`,
        sort: [{ field: 'Timestamp', direction: 'desc' }],
        maxRecords: limit
      })
      .all();
      
    const history = records.map(record => ({
        // Ensure field names match exactly what's in Airtable
        role: record.get('Role'), 
        content: record.get('Content'),
        timestamp: record.get('Timestamp') 
    })).reverse(); // Put back in chronological order
    
    console.log(`[Test] Loaded ${history.length} messages from Airtable for user ${userId}`);
    return history;
  } catch (err) {
     console.error('[Test] Error loading from Airtable:', err.message || err);
     console.error('Stack:', err.stack);
     if (err.statusCode === 404 || (err.message && err.message.includes('could not be found'))) {
        console.error('Ensure the table \'ConversationHistory\' exists in your Airtable base.');
    }
     throw err; // Re-throw the error
  }
}


// Test execution
async function runAirtableTest() {
  const testUserId = `test-airtable-${Date.now()}`;
  const testMessage = { role: 'user', content: 'Airtableのテストメッセージです。' };

  console.log(`Test User ID: ${testUserId}`);

  try {
    console.log("--- Testing Airtable Save ---");
    await saveToAirtable(testUserId, testMessage);
    console.log("Save function executed (or threw error).");

    // Wait a moment for Airtable to process
    console.log("Waiting 2 seconds for Airtable to process...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("\n--- Testing Airtable Load ---");
    const loadedHistory = await loadFromAirtable(testUserId, 5);
    console.log("Load function executed (or threw error).");

    if (loadedHistory.length > 0 && loadedHistory[0].content === testMessage.content) {
      console.log("\nSUCCESS: Message saved and loaded successfully!");
      console.log("Loaded messages:", JSON.stringify(loadedHistory, null, 2));
    } else if (loadedHistory.length > 0) {
        console.error("\nFAILURE: Loaded message content does not match or wrong message loaded!");
        console.log("Expected content:", testMessage.content);
        console.log("Loaded messages:", JSON.stringify(loadedHistory, null, 2));
    }
     else {
      console.error("\nFAILURE: Failed to load any messages after saving. Check Airtable base and table directly.");
    }

  } catch (error) {
    console.error("\n--- Test Failed Due to Error ---");
    // Error details were likely printed by the function that threw it
  }
}

runAirtableTest(); 