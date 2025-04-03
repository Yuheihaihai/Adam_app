// test_airtable_connection.js
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const Airtable = require('airtable');

let airtableBase;
let airtableConfigured = false;

console.log("--- Initializing Airtable ---");
if (process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
    try {
        airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
        if (airtableBase && airtableBase.getId()) {
             console.log(`✅ Airtable configured (Base ID: ${airtableBase.getId()}).`);
             airtableConfigured = true;
        } else {
             throw new Error("Airtable base initialization returned invalid object.");
        }
    } catch (error) {
        console.error("❌ Airtable initialization failed:", error.message);
    }
} else {
    console.warn("⚠️ Airtable API Key or Base ID missing in .env file.");
}

async function testAirtableConnection() {
    console.log("\n--- Running Airtable Connection Test (Read Only) ---");
    if (!airtableConfigured || !airtableBase) {
        console.log("SKIPPED: Airtable not configured or initialization failed.");
        return;
    }
    try {
        const startTime = Date.now();
        // Attempt to read 1 record from 'Users' table, 'Grid view'
        console.log("Attempting to read from table 'Users', view 'Grid view'...");
        const records = await airtableBase('Users').select({ maxRecords: 1, view: 'Grid view' }).firstPage();
        const timeTaken = Date.now() - startTime;
        console.log(`✅ SUCCESS: Airtable connection verified via read in ${timeTaken} ms (read ${records.length} record(s)).`);
        if (records.length > 0) {
            console.log("   Sample record ID:", records[0].id); // Log ID for confirmation
        }
    } catch (error) {
         if (error.message.includes('NOT_FOUND')) {
             console.error(`❌ FAILURE: Airtable connection failed - Table 'Users' or View 'Grid view' not found. Please double-check names (case-sensitive).`);
         } else if (error.statusCode === 401 || error.statusCode === 403) {
             console.error(`❌ FAILURE: Airtable connection failed - Authentication error (API Key invalid or insufficient permissions for 'Users' table read).`);
         } else {
             console.error(`❌ FAILURE: Airtable connection failed: ${error.message}`);
             // Log stack trace for other errors
              console.error(error.stack);
         }
    }
}

// --- Execute Test ---
testAirtableConnection(); 