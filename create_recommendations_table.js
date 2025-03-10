const axios = require('axios');

// Airtable API credentials
const API_KEY = 'patCpVSRsAKp9traE.0f6d1327e5d2c326e351a4f84b2f94b6c1395029fe311ba0fe8eba3ed79e594d';
const BASE_ID = 'appqFUyMAd8cPBdJb';
const TABLE_NAME = 'ServiceRecommendations';

// Create table with required fields
async function createTable() {
  try {
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
    
    console.log('Table created successfully:', response.data);
  } catch (error) {
    console.error('Error creating table:', error.response ? error.response.data : error.message);
  }
}

createTable(); 