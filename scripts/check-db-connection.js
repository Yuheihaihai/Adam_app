// check-db-connection.js
require('dotenv').config();
const { Pool } = require('pg');

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
      
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return false;
  }
}

// 実行
checkDatabaseConnection().then(result => {
  console.log('\nDatabase check completed with result:', result ? 'SUCCESS' : 'FAILURE');
  process.exit(result ? 0 : 1);
});
