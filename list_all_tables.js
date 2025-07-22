const sqlite3 = require('sqlite3').verbose();

console.log('🗃️ SQLiteデータベース内の全テーブル確認...\n');

const db = new sqlite3.Database('airtable_migration.db');

// テーブル一覧取得
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) {
    console.error('エラー:', err.message);
    return;
  }
  
  console.log('📋 発見されたテーブル:');
  tables.forEach((table, i) => {
    console.log(`  ${i+1}. ${table.name}`);
  });
  
  console.log('\n📊 各テーブルのデータ件数:');
  
  let completed = 0;
  const total = tables.length;
  
  tables.forEach((table) => {
    db.get(`SELECT COUNT(*) as count FROM "${table.name}"`, (err, row) => {
      if (err) {
        console.log(`  ❌ ${table.name}: エラー - ${err.message}`);
      } else {
        console.log(`  📈 ${table.name}: ${row.count}件`);
      }
      
      completed++;
      if (completed === total) {
        console.log('\n✅ 全テーブル確認完了');
        db.close();
      }
    });
  });
});
