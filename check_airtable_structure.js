require('dotenv').config();
const Airtable = require('airtable');

async function analyzeAirtableStructure() {
  console.log('🔍 === Airtableデータ構造の詳細分析 ===\n');
  
  const base = new Airtable({ 
    apiKey: process.env.AIRTABLE_API_KEY 
  }).base(process.env.AIRTABLE_BASE_ID);
  
  const tables = ['ConversationHistory', 'UserAnalysis', 'JobAnalysis'];
  
  for (const tableName of tables) {
    console.log(`\n📋 ${tableName} 構造分析:`);
    
    try {
      let fieldSet = new Set();
      let sampleData = [];
      
      await base(tableName).select({
        maxRecords: 5 // サンプル分析用
      }).eachPage((records, fetchNextPage) => {
        
        records.forEach((record, i) => {
          // フィールド名を収集
          Object.keys(record.fields).forEach(field => {
            fieldSet.add(field);
          });
          
          // サンプルデータ保存
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
      
      console.log(`  🏗️  フィールド一覧 (${fieldSet.size}個):`);
      Array.from(fieldSet).sort().forEach(field => {
        console.log(`    - ${field}`);
      });
      
      console.log(`  📝 サンプルデータ:`);
      sampleData.forEach((sample, i) => {
        console.log(`    ${i+1}. ID: ${sample.id.substring(0, 10)}...`);
        Object.entries(sample.fields).slice(0, 8).forEach(([key, value]) => {
          const displayValue = typeof value === 'string' ? 
            (value.length > 40 ? value.substring(0, 40) + '...' : value) : 
            value;
          console.log(`       ${key}: ${displayValue}`);
        });
        console.log('');
      });
      
    } catch (error) {
      console.error(`❌ ${tableName} 分析エラー:`, error.message);
    }
  }
}

analyzeAirtableStructure().catch(console.error);
