/**
 * PostgreSQL本番環境検証スクリプト
 * - データ読み書きテスト
 * - スキーマ確認
 * - 移行データ検証
 */

const db = require('./db');

async function verifyPostgreSQLProduction() {
  console.log('🔍 PostgreSQL本番環境検証開始...\n');
  
  try {
    // 1. 基本接続テスト
    console.log('=== 1. データベース接続テスト ===');
    const connectionTest = await db.query('SELECT NOW() as current_time');
    if (connectionTest && connectionTest.rows && connectionTest.rows.length > 0) {
      console.log('✅ 接続成功:', connectionTest.rows[0].current_time);
    } else {
      console.log('❌ 接続テスト: 結果が空です');
      return;
    }
    
    // 2. テーブル存在確認
    console.log('\n=== 2. テーブル存在確認 ===');
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    const tables = await db.query(tablesQuery);
    if (tables && tables.rows) {
      console.log('✅ 存在するテーブル:');
      tables.rows.forEach(row => console.log(`   - ${row.table_name}`));
    }
    
    // 3. user_messagesテーブル詳細確認
    console.log('\n=== 3. user_messagesテーブル構造 ===');
    const columnsQuery = `
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'user_messages' 
      ORDER BY ordinal_position
    `;
    const columns = await db.query(columnsQuery);
    if (columns && columns.rows) {
      console.log('✅ user_messagesカラム構造:');
      columns.rows.forEach(row => 
        console.log(`   - ${row.column_name}: ${row.data_type} (null: ${row.is_nullable})`)
      );
    }
    
    // 4. データ件数確認
    console.log('\n=== 4. データ件数確認 ===');
    const countQuery = 'SELECT COUNT(*) as total FROM user_messages';
    const countResult = await db.query(countQuery);
    if (countResult && countResult.rows && countResult.rows[0]) {
      console.log(`✅ user_messagesレコード数: ${countResult.rows[0].total}`);
    }
    
    // 5. 最新データサンプル
    console.log('\n=== 5. 最新データサンプル（復号化前） ===');
    const sampleQuery = `
      SELECT user_id, role, LENGTH(content) as content_length, timestamp 
      FROM user_messages 
      ORDER BY timestamp DESC 
      LIMIT 5
    `;
    const samples = await db.query(sampleQuery);
    if (samples && samples.rows) {
      samples.rows.forEach((row, i) => {
        console.log(`   ${i+1}. UserID: ${row.user_id ? row.user_id.substring(0,12) + '...' : 'N/A'}`);
        console.log(`      Role: ${row.role || 'N/A'}`);
        console.log(`      Content Length: ${row.content_length || 0} chars`);
        console.log(`      Time: ${row.timestamp || 'N/A'}`);
      });
    }
    
    // 6. 実際のLINE形式UserIDでのテスト（安全なテスト）
    console.log('\n=== 6. LINE形式UserIDテスト ===');
    const testUserId = 'U' + 'test'.padEnd(32, '0'); // LINE形式のテストID
    const testMessage = '動作確認テストメッセージ';
    
    console.log('書き込みテスト実行中...');
    try {
      await db.storeSecureUserMessage(
        testUserId, 
        'test-msg-' + Date.now(),
        testMessage,
        'user',
        'general',
        'text'
      );
      console.log('✅ 書き込み成功');
      
      // 読み込みテスト
      console.log('読み込みテスト実行中...');
      const history = await db.fetchSecureUserHistory(testUserId, 1);
      if (history && Array.isArray(history)) {
        console.log(`✅ 読み込み成功: ${history.length}件取得`);
        if (history.length > 0 && history[0].content) {
          console.log(`   内容: "${history[0].content}"`);
        }
      }
      
    } catch (testError) {
      console.log('❌ 読み書きテスト失敗:', testError.message);
    }
    
    // 7. 環境変数確認
    console.log('\n=== 7. 重要な環境変数確認 ===');
    console.log(`USE_POSTGRESQL: ${process.env.USE_POSTGRESQL || 'Not set'}`);
    console.log(`DATABASE_URL存在: ${process.env.DATABASE_URL ? 'Yes' : 'No'}`);
    console.log(`ENCRYPTION_KEY存在: ${process.env.ENCRYPTION_KEY ? 'Yes' : 'No'}`);
    
    // 8. 過去1時間の実際のアクティビティ確認
    console.log('\n=== 8. 実際のユーザーアクティビティ（過去1時間） ===');
    const recentQuery = `
      SELECT user_id, role, timestamp 
      FROM user_messages 
      WHERE timestamp > NOW() - INTERVAL '1 hour' 
      ORDER BY timestamp DESC 
      LIMIT 10
    `;
    try {
      const recentActivity = await db.query(recentQuery);
      if (recentActivity && recentActivity.rows) {
        if (recentActivity.rows.length === 0) {
          console.log('   過去1時間にアクティビティなし');
        } else {
          console.log(`✅ 過去1時間のアクティビティ: ${recentActivity.rows.length}件`);
          recentActivity.rows.forEach((row, i) => {
            const userIdDisplay = row.user_id ? row.user_id.substring(0,10) + '...' : 'N/A';
            console.log(`   ${i+1}. UserID: ${userIdDisplay} Role: ${row.role || 'N/A'} Time: ${row.timestamp || 'N/A'}`);
          });
        }
      }
    } catch (recentError) {
      console.log('⚠️ 過去1時間のアクティビティ確認エラー:', recentError.message);
    }
    
    console.log('\n🎉 PostgreSQL本番環境検証完了');
    
  } catch (error) {
    console.error('❌ 検証中にエラー発生:', error.message);
    console.error('詳細:', error);
  }
}

// スクリプト直接実行時
if (require.main === module) {
  verifyPostgreSQLProduction()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { verifyPostgreSQLProduction }; 