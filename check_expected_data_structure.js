require('dotenv').config();
const Airtable = require('airtable');

async function analyzeExpectedStructure() {
  console.log('🔍 === 期待されるデータ構造分析 ===\n');
  
  // Airtableの現在のデータ構造を詳細に確認
  const base = new Airtable({ 
    apiKey: process.env.AIRTABLE_API_KEY 
  }).base(process.env.AIRTABLE_BASE_ID);
  
  const tables = ['ConversationHistory', 'UserAnalysis', 'JobAnalysis'];
  
  for (const tableName of tables) {
    console.log(`\n📋 ${tableName} 詳細分析:`);
    
    try {
      let recordCount = 0;
      let fieldStructure = new Set();
      let sampleData = [];
      
      await base(tableName).select({
        maxRecords: 10 // サンプル分析のため
      }).eachPage((records, fetchNextPage) => {
        
        records.forEach((record, i) => {
          recordCount++;
          
          // フィールド名を収集
          Object.keys(record.fields).forEach(field => {
            fieldStructure.add(field);
          });
          
          // 最初の3件をサンプルとして保存
          if (i < 3) {
            sampleData.push({
              id: record.id,
              fields: record.fields,
              createdTime: record._createdTime
            });
          }
        });
        
        fetchNextPage();
      });
      
      console.log(`  📊 レコード数: ${recordCount}件`);
      console.log(`  🏗️  フィールド構造:`);
      Array.from(fieldStructure).sort().forEach(field => {
        console.log(`    - ${field}`);
      });
      
      console.log(`  📝 サンプルデータ:`);
      sampleData.forEach((sample, i) => {
        console.log(`    ${i+1}. ID: ${sample.id}`);
        console.log(`       作成日: ${sample.createdTime}`);
        console.log(`       フィールド例:`);
        Object.entries(sample.fields).slice(0, 5).forEach(([key, value]) => {
          const displayValue = typeof value === 'string' ? 
            (value.length > 50 ? value.substring(0, 50) + '...' : value) : 
            value;
          console.log(`         ${key}: ${displayValue}`);
        });
        console.log('');
      });
      
    } catch (error) {
      console.error(`❌ ${tableName} 分析エラー:`, error.message);
    }
  }
  
  // 現在のSQLiteとの比較
  console.log('\n🔄 === SQLiteテーブルとのマッピング確認 ===');
  console.log('📨 ConversationHistory → user_messages:');
  console.log('  必要フィールド: user_id, content, role, timestamp, message_id, mode, message_type');
  
  console.log('\n📊 UserAnalysis → analysis_results:');
  console.log('  必要フィールド: user_id, result_type="user_analysis", data(JSONB), timestamp');
  
  console.log('\n💼 JobAnalysis → analysis_results:');
  console.log('  必要フィールド: user_id, result_type="job_analysis", data(JSONB), timestamp');
  
  console.log('\n✅ 分析完了');
}

analyzeExpectedStructure().catch(console.error);
