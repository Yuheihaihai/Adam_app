// 既存のテーブルにAppleセキュリティカラムを追加
require('dotenv').config();
const db = require('./db');

async function addAppleSecurityColumns() {
  console.log('🔧 既存テーブルにAppleセキュリティカラムを追加...\n');
  
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // user_messagesテーブルに新しいカラムを追加
    console.log('📋 user_messagesテーブルを更新中...');
    
    // カラムが存在しない場合のみ追加
    const columnsToAdd = [
      { name: 'zk_proof', type: 'TEXT' },
      { name: 'deletion_scheduled_at', type: 'TIMESTAMP' },
      { name: 'privacy_level', type: 'INTEGER DEFAULT 3' },
      { name: 'e2ee_key_id', type: 'VARCHAR(255)' }
    ];
    
    for (const column of columnsToAdd) {
      try {
        await client.query(`ALTER TABLE user_messages ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}`);
        console.log(`✅ カラム追加: ${column.name}`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⚠️  カラム既存: ${column.name}`);
        } else {
          throw error;
        }
      }
    }
    
    // 自動削除トリガーの作成
    console.log('\n📋 自動削除トリガーを設定中...');
    
    // トリガー関数
    await client.query(`
      CREATE OR REPLACE FUNCTION auto_delete_old_messages() RETURNS trigger AS $$
      BEGIN
        NEW.deletion_scheduled_at := NEW.timestamp + INTERVAL '90 days';
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ トリガー関数作成');
    
    // トリガー
    await client.query(`
      DROP TRIGGER IF EXISTS set_deletion_date ON user_messages;
      CREATE TRIGGER set_deletion_date
        BEFORE INSERT ON user_messages
        FOR EACH ROW
        EXECUTE FUNCTION auto_delete_old_messages();
    `);
    console.log('✅ 自動削除トリガー設定');
    
    // セキュリティ監査ログテーブル（存在しない場合のみ作成）
    console.log('\n📋 セキュリティ監査ログテーブルを確認中...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS security_audit_log (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(50) NOT NULL,
        user_id VARCHAR(255),
        details TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_security_audit_log_timestamp ON security_audit_log(timestamp)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_security_audit_log_event_type ON security_audit_log(event_type)`);
    console.log('✅ セキュリティ監査ログテーブル準備完了');
    
    await client.query('COMMIT');
    console.log('\n✨ テーブル更新完了！');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ エラー:', error.message);
    throw error;
  } finally {
    client.release();
    await db.pool.end();
  }
}

// 実行
if (require.main === module) {
  addAppleSecurityColumns()
    .then(() => {
      console.log('\n🎉 Appleセキュリティカラム追加完了！');
      process.exit(0);
    })
    .catch(error => {
      console.error('致命的エラー:', error);
      process.exit(1);
    });
}

module.exports = { addAppleSecurityColumns }; 