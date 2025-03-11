/**
 * Airtable Setup Script
 * 
 * This script checks if the ServiceRecommendations table exists and creates it if necessary.
 * It uses environment variables for credentials and provides detailed error information.
 */

const axios = require('axios');
require('dotenv').config();

// Get credentials from environment or provide instructions if missing
const API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_NAME = 'ServiceRecommendations';

if (!API_KEY || !BASE_ID) {
  console.error('ERROR: Missing Airtable credentials in environment variables.');
  console.error('Please set the following environment variables:');
  console.error('  AIRTABLE_API_KEY - Your Airtable Personal Access Token');
  console.error('  AIRTABLE_BASE_ID - Your Airtable Base ID');
  console.error('\nOr add them to your .env file with these names.');
  process.exit(1);
}

// Function to check if the table exists
async function checkTableExists() {
  try {
    const url = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const tables = response.data.tables;
    return tables.some(table => table.name === TABLE_NAME);
  } catch (error) {
    console.error('Error checking tables:', error.response ? error.response.data : error.message);
    if (error.response && error.response.status === 403) {
      console.error('PERMISSION ERROR: Your API key does not have schema access.');
      console.error('You need to create a Personal Access Token with "data.records:read" and "schema.bases:read" scopes.');
      console.error('See https://airtable.com/developers/web/guides/personal-access-tokens for more information.');
    }
    return false;
  }
}

// Create table with required fields
async function createTable() {
  try {
    console.log('Attempting to create ServiceRecommendations table...');
    const url = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`;
    
    const data = {
      name: TABLE_NAME,
      description: 'Tracks service recommendations made to users',
      fields: [
        {
          name: 'UserID',
          type: 'singleLineText',
          description: 'The LINE user ID'
        },
        {
          name: 'ServiceID',
          type: 'singleLineText',
          description: 'The service identifier'
        },
        {
          name: 'Timestamp',
          type: 'dateTime',
          description: 'When the recommendation was made'
        }
      ]
    };
    
    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Table created successfully:', response.data.id);
    return true;
  } catch (error) {
    console.error('Error creating table:', error.response ? error.response.data : error.message);
    
    if (error.response && error.response.status === 403) {
      console.error('\nPERMISSION ERROR: Your API key does not have schema creation access.');
      console.error('You need to create a Personal Access Token with "schema.bases:write" scope.');
      console.error('See https://airtable.com/developers/web/guides/personal-access-tokens');
      
      console.log('\nAlternative: Create the table manually in the Airtable UI with these fields:');
      console.log('- UserID (Single line text)');
      console.log('- ServiceID (Single line text)');
      console.log('- Timestamp (Date/Time)');
    }
    
    return false;
  }
}

// Main function
async function main() {
  console.log('Checking if ServiceRecommendations table exists...');
  
  const exists = await checkTableExists();
  
  if (exists) {
    console.log('ServiceRecommendations table already exists.');
  } else {
    console.log('ServiceRecommendations table does not exist.');
    const created = await createTable();
    
    if (created) {
      console.log('Setup completed successfully!');
    } else {
      console.log('Table creation failed. See errors above for details.');
    }
  }
}

// Run the script
main().catch(error => {
  console.error('Unexpected error:', error);
}); 