require('dotenv').config();
const db = require('./db');

async function testDatabaseInit() {
  console.log('🗃️ データベース初期化テスト...');
  
  try {
    // データベース接続テスト
    const isConnected = await db.testConnection();
    console.log(`接続テスト: ${isConnected ? '成功' : '失敗'}`);
    
    if (isConnected) {
      // テーブル初期化
      const tablesInitialized = await db.initializeTables();
      console.log(`テーブル初期化: ${tablesInitialized ? '成功' : '失敗'}`);
      
      // 既存データ確認
      const userMessagesCount = await db.query('SELECT COUNT(*) as count FROM user_messages');
      console.log(`user_messages テーブル: ${userMessagesCount[0].count}件`);
    }
  } catch (error) {
    console.error('エラー:', error.message);
  }
}

testDatabaseInit();
