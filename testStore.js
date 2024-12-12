console.log("testStore.js script started");

require('dotenv').config();
const Airtable = require('airtable');

// Check environment variables
if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
  console.error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID in .env file.");
  process.exit(1);
}

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const INTERACTIONS_TABLE = process.env.INTERACTIONS_TABLE || "ConversationHistory";

console.log("Attempting to store a test record in table:", INTERACTIONS_TABLE);

async function testStore() {
  try {
    console.log("Creating a test record...");
    // Since Timestamp is single line text, we can store any string, including ISO date/time.
    const record = await base(INTERACTIONS_TABLE).create([
      {
        fields: {
          UserID: "TestUser",
          Role: "user",
          Content: "Test message",
          Timestamp: new Date().toISOString() // Storing full ISO string in a text field
        }
      }
    ]);

    console.log("Test record stored successfully!", record);
    console.log("Check your Airtable base to see the new record.");
  } catch (err) {
    console.error("Error in testStore:", err);
  }
}

testStore();