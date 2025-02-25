// Load environment variables
require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const { Client } = require('pg');

// Add early logging
console.log('Script started');
console.log('Environment variables loaded:', {
  host: process.env.AURORA_HOST,
  port: process.env.AURORA_PORT,
  database: process.env.AURORA_DATABASE,
  csvPath: process.env.CSV_FILE_PATH
});

// Create a PostgreSQL client using Aurora Serverless connection details
const pgClient = new Client({
  host: process.env.AURORA_HOST,
  port: process.env.AURORA_PORT,
  user: process.env.AURORA_USER,
  password: process.env.AURORA_PASSWORD,
  database: process.env.AURORA_DATABASE,
  ssl: { rejectUnauthorized: false }  // Adjust if needed
});

async function migrateData() {
  try {
    await pgClient.connect();
    console.log('Connected to Aurora Serverless.');
    const rows = [];

    // Add this to log the first row
    let firstRow = true;

    fs.createReadStream(process.env.CSV_FILE_PATH)
      .pipe(csv())
      .on('data', (data) => {
        if (firstRow) {
          console.log('First row structure:', data);
          firstRow = false;
        }
        
        // Handle potential timestamp format issues
        let timestamp;
        try {
          timestamp = data.Timestamp ? new Date(data.Timestamp).toISOString() : new Date().toISOString();
        } catch (e) {
          console.warn(`Invalid timestamp format, using current time instead`);
          timestamp = new Date().toISOString();
        }

        // Use a default user ID if the field is empty
        const userId = data.UserID && data.UserID.trim() !== '' ? data.UserID : 'default_user';
        
        // Make sure timestamp is unique for this user
        const key = `${userId}-${timestamp}`;
        if (usedTimestamps.has(key)) {
          // Add milliseconds to make it unique
          const count = usedTimestamps.get(key) + 1;
          usedTimestamps.set(key, count);
          
          // Parse the timestamp, add milliseconds, and convert back to ISO string
          const date = new Date(timestamp);
          date.setMilliseconds(date.getMilliseconds() + count);
          timestamp = date.toISOString();
        } else {
          usedTimestamps.set(key, 0);
        }
        
        rows.push({
          user_id: userId,
          role: data.Role || '',
          content: data.Content || '',
          timestamp: timestamp
        });
      })
      .on('end', async () => {
        console.log(`Migrating ${rows.length} records...`);
        const batchSize = 100; // Adjust based on your data size
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const queryText = `
            INSERT INTO conversation_history (user_id, role, content, timestamp)
            VALUES ${batch.map((_, idx) => `($${idx * 4 + 1}, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4})`).join(',')}
            ON CONFLICT (user_id, timestamp) DO NOTHING
          `;
          const values = batch.flatMap(row => [
            row.user_id, 
            row.role, 
            row.content, 
            row.timestamp
          ]);
          try {
            await pgClient.query(queryText, values);
            console.log(`Processed batch ${i/batchSize + 1}/${Math.ceil(rows.length/batchSize)}`);
          } catch (err) {
            console.error(`Error inserting batch starting at index ${i}:`, err);
          }
        }
        console.log('Migration complete.');
        await pgClient.end();
      });
  } catch (error) {
    console.error('Migration error:', error);
  }
}

migrateData().catch(console.error);
