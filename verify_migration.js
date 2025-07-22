const sqlite3 = require('sqlite3').verbose();

async function verifyMigration() {
  console.log('🔍 === SQLite移行データ検証 ===\n');
  
  const db = new sqlite3.Database('airtable_migration.db');
  
  // 各テーブルのデータ件数確認
  const tables = ['user_messages', 'user_analysis', 'job_analysis'];
  
  for (const table of tables) {
    await new Promise((resolve) => {
      db.get(`SELECT COUNT(*) as count FROM ${table}`, (err, row) => {
        if (err) {
          console.error(`❌ ${table}: エラー - ${err.message}`);
        } else {
          console.log(`✅ ${table}: ${row.count}件`);
        }
        resolve();
      });
    });
  }
  
  // サンプルデータの確認
  console.log('\n📋 サンプルデータ確認:');
  
  await new Promise((resolve) => {
    db.all('SELECT user_id, role, substr(content, 1, 50) as content_sample FROM user_messages LIMIT 5', (err, rows) => {
      if (err) {
        console.error('エラー:', err.message);
      } else {
        console.log('\nConversationHistoryサンプル:');
        rows.forEach((row, index) => {
          console.log(`  ${index + 1}. UserID: ${row.user_id.substring(0, 12)}...`);
          console.log(`     Role: ${row.role}`);
          console.log(`     Content: ${row.content_sample}...`);
          console.log();
        });
      }
      resolve();
    });
  });
  
  db.close();
  console.log('✅ 検証完了');
}

verifyMigration();
