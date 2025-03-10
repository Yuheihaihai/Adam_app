const axios = require('axios');

// Airtable API credentials
const API_KEY = 'patCpVSRsAKp9traE.0f6d1327e5d2c326e351a4f84b2f94b6c1395029fe311ba0fe8eba3ed79e594d';
const BASE_ID = 'appqFUyMAd8cPBdJb';
const TABLE_NAME = 'ServiceRecommendations';

// Check if table exists
async function checkTable() {
  try {
    // Try to access the table
    const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_NAME}`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      params: {
        maxRecords: 1
      }
    });
    
    console.log('Table exists! Response:', response.status);
    return true;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.error('Table does not exist');
    } else {
      console.error('Error checking table:', error.response ? error.response.data : error.message);
    }
    return false;
  }
}

checkTable(); 