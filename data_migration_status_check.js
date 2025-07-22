require('dotenv').config();
const Airtable = require('airtable');
const db = require('./db');

async function checkMigrationStatus() {
  console.log('🔍 === データ移行状況確認 ===\n');
  
  // 1. 環境変数確認
  console.log('📋 環境変数状況:');
  console.log(`  AIRTABLE_API_KEY: ${process.env.AIRTABLE_API_KEY ? '設定済み' : '未設定'}`);
  console.log(`  AIRTABLE_BASE_ID: ${process.env.AIRTABLE_BASE_ID ? '設定済み' : '未設定'}`);
  console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? '設定済み' : '未設定'}`);
  console.log();
  
  let airtableData = {};
  let postgresData = {};
  
  // 2. Airtableデータ確認
  if (process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
    console.log('📊 Airtableデータ確認中...');
    try {
      const base = new Airtable({ 
        apiKey: process.env.AIRTABLE_API_KEY 
      }).base(process.env.AIRTABLE_BASE_ID);
      
      // 主要テーブルのデータ件数を取得
      const tables = ['ConversationHistory', 'UserAnalysis', 'JobAnalysis'];
      
      for (const tableName of tables) {
        try {
          const records = await base(tableName).select({ maxRecords: 3 }).firstPage();
          airtableData[tableName] = records.length;
          console.log(`  ✅ ${tableName}: ${records.length}件（サンプル）`);
        } catch (error) {
          if (error.statusCode === 404) {
            airtableData[tableName] = 0;
            console.log(`  ⚠️ ${tableName}: テーブルが見つかりません`);
          } else {
            console.log(`  ❌ ${tableName}: エラー - ${error.message}`);
            airtableData[tableName] = 'エラー';
          }
        }
      }
    } catch (error) {
      console.log(`  ❌ Airtable接続エラー: ${error.message}`);
    }
  } else {
    console.log('  ⚠️ Airtable環境変数が設定されていません');
  }
  
  console.log();
  
  // 3. PostgreSQLデータ確認
  console.log('🗃️ PostgreSQLデータ確認中...');
  try {
    // データベース接続テスト
    const isConnected = await db.testConnection();
    
    if (isConnected) {
      // 各テーブルのデータ件数を取得
      const tables = [
        { name: 'user_messages', description: 'ユーザーメッセージ' },
        { name: 'user_ml_analysis', description: 'ユーザー分析' },
        { name: 'job_analysis', description: 'ジョブ分析' }
      ];
      
      for (const table of tables) {
        try {
          const result = await db.query(`SELECT COUNT(*) as count FROM ${table.name}`);
          postgresData[table.name] = result[0].count;
          console.log(`  ✅ ${table.description} (${table.name}): ${result[0].count}件`);
        } catch (error) {
          console.log(`  ⚠️ ${table.description} (${table.name}): テーブルが存在しません`);
          postgresData[table.name] = 0;
        }
      }
    } else {
      console.log('  ❌ PostgreSQL接続に失敗しました');
    }
  } catch (error) {
    console.log(`  ❌ PostgreSQLエラー: ${error.message}`);
  }
  
  console.log();
  
  // 4. 移行状況の判定と推奨事項
  console.log('📋 === 移行状況サマリー ===');
  
  const hasAirtableData = Object.values(airtableData).some(count => count > 0);
  const hasPostgresData = Object.values(postgresData).some(count => count > 0);
  
  if (hasAirtableData && !hasPostgresData) {
    console.log('🔄 状況: Airtableにデータあり、PostgreSQLにデータなし');
    console.log('💡 推奨: 完全なデータ移行が必要です');
  } else if (hasAirtableData && hasPostgresData) {
    console.log('🔄 状況: 両方にデータが存在');
    console.log('💡 推奨: 差分移行または同期確認が必要です');
  } else if (!hasAirtableData && hasPostgresData) {
    console.log('✅ 状況: PostgreSQLにデータあり、Airtableにデータなし');
    console.log('💡 推奨: 移行完了済みの可能性があります');
  } else {
    console.log('⚠️ 状況: 両方にデータが見つかりません');
    console.log('💡 推奨: 環境変数の設定を確認してください');
  }
  
  return {
    airtable: airtableData,
    postgres: postgresData,
    needsMigration: hasAirtableData && !hasPostgresData
  };
}

// スクリプト実行
if (require.main === module) {
  checkMigrationStatus()
    .then((result) => {
      console.log('\n✅ データ移行状況確認完了');
      if (result.needsMigration) {
        console.log('\n🚀 次のステップ: データ移行スクリプトを実行してください');
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 確認中にエラーが発生:', error);
      process.exit(1);
    });
}

module.exports = { checkMigrationStatus };
