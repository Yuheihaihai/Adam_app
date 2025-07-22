// データ保持期間を180日に更新
require('dotenv').config();
const db = require('./db');

async function updateRetentionPeriod() {
  console.log('📅 データ保持期間を180日に更新...\n');
  
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. トリガー関数を180日に更新
    console.log('🔧 自動削除トリガー関数を更新中...');
    await client.query(`
      CREATE OR REPLACE FUNCTION auto_delete_old_messages() RETURNS trigger AS $$
      BEGIN
        NEW.deletion_scheduled_at := NEW.timestamp + INTERVAL '180 days';
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ トリガー関数更新: 90日 → 180日');
    
    // 2. 既存データの削除予定日を更新
    console.log('\n📋 既存データの削除予定日を更新中...');
    const updateResult = await client.query(`
      UPDATE user_messages 
      SET deletion_scheduled_at = timestamp + INTERVAL '180 days'
      WHERE deletion_scheduled_at IS NOT NULL
    `);
    console.log(`✅ 既存データ更新: ${updateResult.rowCount}件`);
    
    // 3. スケジュールされていない古いデータにも適用
    console.log('\n📋 未設定データに削除予定日を設定中...');
    const scheduleResult = await client.query(`
      UPDATE user_messages 
      SET deletion_scheduled_at = timestamp + INTERVAL '180 days'
      WHERE deletion_scheduled_at IS NULL
    `);
    console.log(`✅ 未設定データ更新: ${scheduleResult.rowCount}件`);
    
    await client.query('COMMIT');
    console.log('\n✨ データ保持期間更新完了！');
    
    // 4. 現在の設定確認
    console.log('\n📊 更新後の状況確認...');
    const statusCheck = await client.query(`
      SELECT 
        COUNT(*) as total_messages,
        COUNT(deletion_scheduled_at) as scheduled_deletions,
        MIN(deletion_scheduled_at) as earliest_deletion,
        MAX(deletion_scheduled_at) as latest_deletion
      FROM user_messages
    `);
    
    const stats = statusCheck.rows[0];
    console.log(`📋 総メッセージ数: ${stats.total_messages}件`);
    console.log(`🗓️  削除予定設定済み: ${stats.scheduled_deletions}件`);
    console.log(`⏰ 最早削除予定: ${stats.earliest_deletion ? new Date(stats.earliest_deletion).toLocaleDateString('ja-JP') : 'なし'}`);
    console.log(`⏰ 最遅削除予定: ${stats.latest_deletion ? new Date(stats.latest_deletion).toLocaleDateString('ja-JP') : 'なし'}`);
    
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
  updateRetentionPeriod()
    .then(() => {
      console.log('\n🎉 データ保持期間更新完了！');
      console.log('💡 環境変数 DATA_RETENTION_DAYS=180 の設定もお忘れなく');
      process.exit(0);
    })
    .catch(error => {
      console.error('致命的エラー:', error);
      process.exit(1);
    });
}

module.exports = { updateRetentionPeriod }; 