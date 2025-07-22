require('dotenv').config();
const Airtable = require('airtable');
const db = require('./db');

class DataComparison {
  constructor() {
    this.base = new Airtable({ 
      apiKey: process.env.AIRTABLE_API_KEY 
    }).base(process.env.AIRTABLE_BASE_ID);
  }

  async checkPostgreSQLData() {
    console.log('🗃️ === PostgreSQL既存データ確認 ===\n');
    
    try {
      // データベース接続テスト
      const isConnected = await db.testConnection();
      if (!isConnected) {
        console.log('❌ PostgreSQL接続失敗');
        return null;
      }
      
      console.log('✅ PostgreSQL接続成功');
      
      // 各テーブルの件数確認
      const tables = ['user_messages', 'analysis_results', 'user_audio_stats'];
      const postgresData = {};
      
      for (const table of tables) {
        try {
          const result = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
          postgresData[table] = result[0].count;
          console.log(`📊 ${table}: ${result[0].count}件`);
        } catch (error) {
          console.log(`❌ ${table}: エラー - ${error.message}`);
          postgresData[table] = 'エラー';
        }
      }
      
      // 詳細データのサンプル確認
      console.log('\n📋 user_messages サンプル:');
      try {
        const sampleMessages = await db.query('SELECT user_id, role, substr(content, 1, 50) as content_preview, timestamp FROM user_messages LIMIT 5');
        sampleMessages.forEach((msg, i) => {
          console.log(`  ${i+1}. [${msg.role}] ${msg.user_id}: ${msg.content_preview}...`);
        });
      } catch (error) {
        console.log(`  サンプル取得エラー: ${error.message}`);
      }
      
      console.log('\n📋 analysis_results サンプル:');
      try {
        const sampleAnalysis = await db.query('SELECT user_id, result_type, timestamp FROM analysis_results LIMIT 5');
        sampleAnalysis.forEach((analysis, i) => {
          console.log(`  ${i+1}. ${analysis.user_id} [${analysis.result_type}] ${analysis.timestamp}`);
        });
      } catch (error) {
        console.log(`  サンプル取得エラー: ${error.message}`);
      }
      
      return postgresData;
      
    } catch (error) {
      console.error('PostgreSQL確認エラー:', error.message);
      return null;
    }
  }

  async checkAirtableData() {
    console.log('\n📊 === Airtable全データ確認 ===\n');
    
    const airtableData = {};
    const tables = ['ConversationHistory', 'UserAnalysis', 'JobAnalysis'];
    
    for (const tableName of tables) {
      console.log(`🔍 ${tableName}テーブル確認中...`);
      
      try {
        let totalCount = 0;
        let sampleRecords = [];
        
        await this.base(tableName).select({
          maxRecords: 1000 // 制限を設けて全体把握
        }).eachPage((records, fetchNextPage) => {
          totalCount += records.length;
          
          // 最初の3件をサンプルとして保存
          if (sampleRecords.length < 3) {
            sampleRecords.push(...records.slice(0, 3 - sampleRecords.length));
          }
          
          fetchNextPage();
        }, (err) => {
          if (err) {
            console.error(`❌ ${tableName}エラー:`, err.message);
            airtableData[tableName] = { count: 'エラー', samples: [] };
          } else {
            airtableData[tableName] = { count: totalCount, samples: sampleRecords };
            console.log(`✅ ${tableName}: ${totalCount}件`);
            
            // サンプルデータ表示
            console.log(`  📋 サンプル:`);
            sampleRecords.forEach((record, i) => {
              const fields = record.fields;
              if (tableName === 'ConversationHistory') {
                console.log(`    ${i+1}. ${fields.user_id || 'unknown'} [${fields.role || 'unknown'}]: ${(fields.content || fields.message || '').substring(0, 50)}...`);
              } else if (tableName === 'UserAnalysis') {
                console.log(`    ${i+1}. ${fields.user_id || 'unknown'} - ${fields.communication_style || 'N/A'}`);
              } else if (tableName === 'JobAnalysis') {
                console.log(`    ${i+1}. ${fields.job_title || 'N/A'} at ${fields.company || 'N/A'}`);
              }
            });
          }
        });
        
      } catch (error) {
        console.error(`❌ ${tableName}確認エラー:`, error.message);
        airtableData[tableName] = { count: 'エラー', samples: [] };
      }
    }
    
    return airtableData;
  }

  async compareData() {
    console.log('\n🔍 === データ比較分析 ===\n');
    
    const postgresData = await this.checkPostgreSQLData();
    const airtableData = await this.checkAirtableData();
    
    if (!postgresData) {
      console.log('❌ PostgreSQLデータが取得できないため、比較できません');
      return;
    }
    
    console.log('\n📊 === 比較結果 ===');
    
    // ConversationHistory vs user_messages
    console.log('\n📨 メッセージデータ比較:');
    const airtableMessages = airtableData.ConversationHistory?.count || 0;
    const postgresMessages = postgresData.user_messages || 0;
    console.log(`  Airtable ConversationHistory: ${airtableMessages}件`);
    console.log(`  PostgreSQL user_messages: ${postgresMessages}件`);
    
    if (airtableMessages > postgresMessages) {
      console.log(`  ⚠️  不足: ${airtableMessages - postgresMessages}件のメッセージが移行されていません`);
    } else if (airtableMessages < postgresMessages) {
      console.log(`  ✅ PostgreSQLにより多くのデータがあります`);
    } else {
      console.log(`  ✅ データ件数は一致しています`);
    }
    
    // UserAnalysis vs analysis_results
    console.log('\n📊 分析データ比較:');
    const airtableAnalysis = (airtableData.UserAnalysis?.count || 0) + (airtableData.JobAnalysis?.count || 0);
    const postgresAnalysis = postgresData.analysis_results || 0;
    console.log(`  Airtable分析データ合計: ${airtableAnalysis}件`);
    console.log(`  PostgreSQL analysis_results: ${postgresAnalysis}件`);
    
    if (airtableAnalysis > postgresAnalysis) {
      console.log(`  ⚠️  不足: ${airtableAnalysis - postgresAnalysis}件の分析データが移行されていません`);
    } else if (airtableAnalysis < postgresAnalysis) {
      console.log(`  ✅ PostgreSQLにより多くのデータがあります`);
    } else {
      console.log(`  ✅ データ件数は一致しています`);
    }
    
    // 総合判定
    console.log('\n🎯 === 総合判定 ===');
    const totalAirtable = airtableMessages + airtableAnalysis;
    const totalPostgres = (postgresMessages || 0) + (postgresAnalysis || 0);
    
    console.log(`Airtable総データ数: ${totalAirtable}件`);
    console.log(`PostgreSQL総データ数: ${totalPostgres}件`);
    
    if (totalAirtable > totalPostgres) {
      console.log(`\n❌ 移行不完全: ${totalAirtable - totalPostgres}件のデータが不足しています`);
      console.log('�� 完全移行が必要です');
      return false;
    } else {
      console.log('\n✅ データは十分に移行されています');
      return true;
    }
  }
}

// 実行
async function main() {
  const comparison = new DataComparison();
  await comparison.compareData();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DataComparison;
