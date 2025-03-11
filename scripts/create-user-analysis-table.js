/**
 * UserAnalysisテーブルを作成するスクリプト
 * 
 * 使用方法：
 * node scripts/create-user-analysis-table.js
 */

require('dotenv').config();
const Airtable = require('airtable');

async function createUserAnalysisTable() {
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
    console.error('Error: AIRTABLE_API_KEY and AIRTABLE_BASE_ID are required in .env file');
    process.exit(1);
  }

  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
    .base(process.env.AIRTABLE_BASE_ID);

  console.log('Checking if UserAnalysis table already exists...');
  
  try {
    // テーブルが存在するかチェック（直接アクセスしてみる）
    await base('UserAnalysis').select({
      maxRecords: 1,
      view: 'Grid view'
    }).firstPage();
    
    console.log('UserAnalysis table already exists!');
    
    // テスト用サンプルレコードの作成
    console.log('Would you like to create a test record in the UserAnalysis table? (yes/no)');
    process.stdin.once('data', async (input) => {
      const answer = input.toString().trim().toLowerCase();
      
      if (answer === 'yes' || answer === 'y') {
        try {
          console.log('Attempting to create a test record...');
          
          const testData = {
            UserID: 'test_user_123',
            Mode: 'general',
            AnalysisData: JSON.stringify({
              traits: {
                communication_style: 'direct',
                formality_level: 'somewhat_casual'
              },
              topics: {
                primary_interests: ['technology', 'science']
              },
              response_preferences: {
                length: 'detailed',
                tone: 'friendly'
              }
            }),
            LastUpdated: new Date().toISOString()
          };
          
          await base('UserAnalysis').create([{ fields: testData }]);
          console.log('Successfully created a test record in the UserAnalysis table!');
        } catch (err) {
          console.error('Error creating test record:', err);
        }
        process.exit(0);
      } else {
        console.log('Skipping test record creation.');
        process.exit(0);
      }
    });
  } catch (err) {
    // テーブルが存在しない場合
    if (err.statusCode === 404 || err.error === 'NOT_FOUND' || 
        (err.message && err.message.includes('could not be found'))) {
      console.log('\nUserAnalysis table does not exist.');
      console.log('\n=== IMPORTANT MANUAL ACTION REQUIRED ===');
      console.log('Please create the UserAnalysis table in your Airtable base with the following fields:');
      console.log('1. UserID (Single line text)');
      console.log('2. Mode (Single line text)');
      console.log('3. AnalysisData (Long text)');
      console.log('4. LastUpdated (Date with time)');
      console.log('\nAirtable API does not support automatic table creation.');
      console.log('After creating the table, the application will be able to store and retrieve user analysis data.');
      console.log('===================================\n');
      
      console.log('\nWould you like to open Airtable website to create this table? (yes/no)');
      process.stdin.once('data', (input) => {
        const answer = input.toString().trim().toLowerCase();
        if (answer === 'yes' || answer === 'y') {
          console.log('Please visit: https://airtable.com/');
          console.log('Navigate to your base, and create a table named "UserAnalysis" with the fields listed above.');
        } else {
          console.log('You can create the table later in the Airtable web interface.');
        }
        process.exit(0);
      });
    } else {
      console.error('Error:', err);
      process.exit(1);
    }
  }
}

createUserAnalysisTable(); 