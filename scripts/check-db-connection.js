// check-db-connection.js
require('dotenv').config();
const { Pool } = require('pg');
const Airtable = require('airtable');

async function checkDatabaseConnection() {
  console.log('Checking database connection...');
  
  // PostgreSQL接続プール
  let poolConfig;
  
  try {
    if (process.env.DATABASE_URL) {
      // Heroku環境の場合、DATABASE_URL環境変数を使用
      poolConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      };
      console.log('Database configuration: Using DATABASE_URL');
    } else {
      console.log('No DATABASE_URL found');
      process.exit(1);
    }
    
    // 接続プールの作成
    const pool = new Pool(poolConfig);
    console.log('Database pool created successfully');
    
    // データベース接続のテスト
    const client = await pool.connect();
    try {
      // 簡単なクエリを実行してDBが応答することを確認
      const result = await client.query('SELECT NOW()');
      console.log('Database connection successful');
      console.log('Current database time:', result.rows[0].now);
      
      // テーブル一覧を取得
      const tablesResult = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      
      console.log('\nDatabase tables:');
      tablesResult.rows.forEach(row => {
        console.log(`- ${row.table_name}`);
      });
      
      // user_messagesテーブルのレコード数を確認
      try {
        const countResult = await client.query('SELECT COUNT(*) FROM user_messages');
        console.log(`\nuser_messages table record count: ${countResult.rows[0].count}`);
      } catch (err) {
        console.log('\nCould not count user_messages records:', err.message);
      }
      
      // テストデータの挿入（コマンドライン引数で指定された場合のみ）
      if (process.argv.includes('--insert-test-data')) {
        console.log('\nInserting test data into database...');
        
        try {
          // テスト用のユーザーメッセージを挿入
          const testUserId = 'TEST_USER_' + Date.now();
          const testMessage = 'TEST_MESSAGE_' + Date.now() + ': This is a test message for database verification';
          
          await client.query(`
            INSERT INTO user_messages (user_id, content, role, timestamp)
            VALUES ($1, $2, $3, NOW())
          `, [testUserId, testMessage, 'user']);
          
          console.log('Test user message inserted successfully:');
          console.log(`- User ID: ${testUserId}`);
          console.log(`- Message: ${testMessage}`);
          
          // 挿入したデータを確認
          const verifyResult = await client.query(`
            SELECT * FROM user_messages WHERE user_id = $1
          `, [testUserId]);
          
          if (verifyResult.rows.length > 0) {
            console.log('Verification successful - data was properly stored in database');
          } else {
            console.log('Verification failed - data was not found in database');
          }
        } catch (insertErr) {
          console.error('Error inserting test data:', insertErr.message);
        }
      }
      
      // storeInteraction関数のテスト（コマンドライン引数で指定された場合のみ）
      if (process.argv.includes('--test-store-interaction')) {
        console.log('\nTesting storeInteraction function...');
        
        try {
          // Airtableの設定を確認
          if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
            console.log('Airtable credentials not found. Cannot test storeInteraction function.');
          } else {
            // Airtableの接続を設定
            const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
              .base(process.env.AIRTABLE_BASE_ID);
            
            // テスト用のデータ
            const testUserId = 'TEST_USER_STORE_' + Date.now();
            const testContent = 'TEST_STORE_INTERACTION_' + Date.now() + ': Testing storeInteraction function';
            const testRole = 'user';
            
            // storeInteraction関数の実装
            console.log('Calling storeInteraction with test data...');
            await storeInteraction(testUserId, testRole, testContent);
            
            // Airtableからデータを確認
            console.log('Verifying data in Airtable...');
            const records = await base(process.env.INTERACTIONS_TABLE || 'Interactions')
              .select({
                filterByFormula: `AND({UserID} = "${testUserId}", {Content} = "${testContent}")`,
                maxRecords: 1
              })
              .all();
            
            if (records && records.length > 0) {
              console.log('storeInteraction verification successful - data was properly stored in Airtable');
              console.log('Record ID:', records[0].id);
            } else {
              console.log('storeInteraction verification failed - data was not found in Airtable');
            }
          }
        } catch (storeErr) {
          console.error('Error testing storeInteraction:', storeErr.message);
        }
      }
      
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return false;
  }
}

// storeInteraction関数の実装（server.jsからコピー）
async function storeInteraction(userId, role, content) {
  try {
    console.log(
      `Storing interaction => userId: ${userId}, role: ${role}, content: ${content}`
    );
    
    // Airtableの設定を確認
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      console.log('Airtable credentials not found. Cannot store interaction.');
      return;
    }
    
    // Airtableの接続を設定
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
      .base(process.env.AIRTABLE_BASE_ID);
    
    // テーブル名を環境変数から取得、またはデフォルト値を使用
    const tableName = process.env.INTERACTIONS_TABLE || 'Interactions';
    
    await base(tableName).create([
      {
        fields: {
          UserID: userId,
          Role: role,
          Content: content,
          Timestamp: new Date().toISOString(),
        },
      },
    ]);
    
    console.log('Interaction stored successfully in Airtable');
  } catch (err) {
    console.error('Error storing interaction:', err);
  }
}

// 実行
checkDatabaseConnection().then(result => {
  console.log('\nDatabase check completed with result:', result ? 'SUCCESS' : 'FAILURE');
  process.exit(result ? 0 : 1);
});
