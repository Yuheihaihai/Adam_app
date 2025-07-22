require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkMySQLData() {
  console.log('🔍 === MySQL データベース確認 ===\n');
  
  try {
    // 接続設定確認
    console.log('📋 MySQL接続設定:');
    console.log(`  Host: ${process.env.DB_HOST || '未設定'}`);
    console.log(`  User: ${process.env.DB_USER || '未設定'}`);
    console.log(`  Database: ${process.env.DB_DATABASE || '未設定'}`);
    console.log(`  Password: ${process.env.DB_PASSWORD ? '設定済み' : '未設定'}`);
    
    if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_DATABASE) {
      console.log('\n❌ MySQL接続設定が不完全です');
      return;
    }
    
    console.log('\n🔌 MySQL接続テスト中...');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE
    });
    
    console.log('✅ MySQL接続成功');
    
    // テーブル一覧取得
    console.log('\n📋 MySQLテーブル一覧:');
    const [tables] = await connection.execute('SHOW TABLES');
    
    if (tables.length === 0) {
      console.log('  テーブルが見つかりません');
    } else {
      tables.forEach((table, i) => {
        const tableName = Object.values(table)[0];
        console.log(`  ${i+1}. ${tableName}`);
      });
    }
    
    // 各テーブルのデータ件数確認
    console.log('\n📊 各テーブルのデータ件数:');
    for (const table of tables) {
      const tableName = Object.values(table)[0];
      try {
        const [rows] = await connection.execute(`SELECT COUNT(*) as count FROM \`${tableName}\``);
        console.log(`  📈 ${tableName}: ${rows[0].count}件`);
      } catch (error) {
        console.log(`  ❌ ${tableName}: エラー - ${error.message}`);
      }
    }
    
    await connection.end();
    console.log('\n✅ MySQL確認完了');
    
  } catch (error) {
    console.error('\n❌ MySQL接続/確認エラー:', error.message);
  }
}

checkMySQLData().catch(console.error);
