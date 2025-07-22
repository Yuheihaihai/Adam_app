require('dotenv').config();
const { Pool } = require('pg');

async function fixDatabaseSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔧 データベーススキーマ修正開始...');
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // message_idフィールドの長さ制限を拡張
      console.log('📏 message_idフィールドの長さ制限を拡張中...');
      await client.query(`
        ALTER TABLE user_messages 
        ALTER COLUMN message_id TYPE VARCHAR(255)
      `);
      
      // mode フィールドの長さ制限を拡張
      console.log('📏 modeフィールドの長さ制限を拡張中...');
      await client.query(`
        ALTER TABLE user_messages 
        ALTER COLUMN mode TYPE VARCHAR(100)
      `);
      
      // message_type フィールドの長さ制限を拡張
      console.log('📏 message_typeフィールドの長さ制限を拡張中...');
      await client.query(`
        ALTER TABLE user_messages 
        ALTER COLUMN message_type TYPE VARCHAR(100)
      `);
      
      // 既存のテストデータ確認・削除
      console.log('🧹 テストデータのクリーンアップ中...');
      const testDataResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM user_messages 
        WHERE user_id LIKE '%test%' OR message_id LIKE '%test%'
      `);
      
      if (testDataResult.rows[0].count > 0) {
        console.log(`   検出されたテストデータ: ${testDataResult.rows[0].count}件`);
        
        await client.query(`
          DELETE FROM user_messages 
          WHERE user_id LIKE '%test%' OR message_id LIKE '%test%'
        `);
        
        console.log('   ✅ テストデータを削除しました');
      } else {
        console.log('   ℹ️ テストデータは見つかりませんでした');
      }
      
      // スキーマ情報確認
      console.log('📋 修正後のスキーマ情報:');
      const schemaInfo = await client.query(`
        SELECT column_name, data_type, character_maximum_length, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'user_messages' 
        AND column_name IN ('message_id', 'mode', 'message_type')
        ORDER BY column_name
      `);
      
      for (const row of schemaInfo.rows) {
        console.log(`   ${row.column_name}: ${row.data_type}(${row.character_maximum_length || 'unlimited'})`);
      }
      
      await client.query('COMMIT');
      console.log('✅ データベーススキーマ修正完了');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('❌ スキーマ修正エラー:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// 実行
if (require.main === module) {
  (async () => {
    try {
      await fixDatabaseSchema();
      process.exit(0);
    } catch (error) {
      console.error('Fatal error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = fixDatabaseSchema; 