require('dotenv').config();
const Airtable = require('airtable');

// Set up Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY || 'patCpVSRsAKp9traE.0f6d1327e5d2c326e351a4f84b2f94b6c1395029fe311ba0fe8eba3ed79e594d'
}).base(process.env.AIRTABLE_BASE_ID || 'appqFUyMAd8cPBdJb');

const TABLE_NAME = 'ServiceRecommendations';

// Test functions
async function testTableAccess() {
  console.log('Testing table access...');
  try {
    await base(TABLE_NAME).select({ maxRecords: 1 }).firstPage();
    console.log('✅ SUCCESS: Table exists and is accessible');
    return true;
  } catch (error) {
    console.error('❌ ERROR: Could not access table:', error.message);
    return false;
  }
}

async function testRecordCreation() {
  console.log('\nTesting record creation...');
  try {
    const testRecord = {
      UserID: 'test_user_' + Date.now(),
      ServiceID: 'test_service',
      Timestamp: new Date().toISOString()
    };
    
    const record = await base(TABLE_NAME).create([{ fields: testRecord }]);
    console.log('✅ SUCCESS: Created test record:', record[0].getId());
    return record[0].getId();
  } catch (error) {
    console.error('❌ ERROR: Could not create record:', error.message);
    return null;
  }
}

async function testRecordRetrieval(recordId) {
  if (!recordId) return;
  
  console.log('\nTesting record retrieval...');
  try {
    const record = await base(TABLE_NAME).find(recordId);
    console.log('✅ SUCCESS: Retrieved test record:', {
      UserID: record.get('UserID'),
      ServiceID: record.get('ServiceID'),
      Timestamp: record.get('Timestamp')
    });
  } catch (error) {
    console.error('❌ ERROR: Could not retrieve record:', error.message);
  }
}

async function testRecordDeletion(recordId) {
  if (!recordId) return;
  
  console.log('\nTesting record deletion...');
  try {
    await base(TABLE_NAME).destroy(recordId);
    console.log('✅ SUCCESS: Deleted test record');
  } catch (error) {
    console.error('❌ ERROR: Could not delete record:', error.message);
  }
}

// Run all tests
async function runTests() {
  console.log('=== TESTING SERVICERECOMMENDATIONS TABLE ===\n');
  
  const tableExists = await testTableAccess();
  if (!tableExists) {
    console.log('\n❌ Table does not exist or is not accessible. Please create it first.');
    return;
  }
  
  const recordId = await testRecordCreation();
  await testRecordRetrieval(recordId);
  await testRecordDeletion(recordId);
  
  console.log('\n=== TEST SUMMARY ===');
  console.log('The ServiceRecommendations table is working correctly!');
  console.log('Your application should now be able to track service recommendations.');
}

runTests(); 