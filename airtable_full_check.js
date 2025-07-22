require('dotenv').config();
const Airtable = require('airtable');

async function checkAllAirtableData() {
  console.log('📊 === Airtable全データ確認 ===\n');
  
  try {
    const base = new Airtable({ 
      apiKey: process.env.AIRTABLE_API_KEY 
    }).base(process.env.AIRTABLE_BASE_ID);
    
    const tables = ['ConversationHistory', 'UserAnalysis', 'JobAnalysis'];
    
    for (const tableName of tables) {
      console.log(`🔍 ${tableName}テーブル:"`);
      
      try {
        let totalCount = 0;
        let sampleRecords = [];
        
        await base(tableName).select({
          maxRecords: 1000 // 最大1000件まで確認
        }).eachPage((records, fetchNextPage) => {
          totalCount += records.length;
          
          // 最初の5件をサンプルとして保存
          if (sampleRecords.length < 5) {
            sampleRecords.push(...records.slice(0, 5 - sampleRecords.length));
          }
          
          console.log(`  📥 取得中: ${totalCount}件...`);
          fetchNextPage();
        });
        
        console.log(`  ✅ 総件数: ${totalCount}件`);
        
        if (sampleRecords.length > 0) {
          console.log(`  📋 サンプルデータ:`);
          sampleRecords.slice(0, 3).forEach((record, index) => {
            const fields = record.fields;
            console.log(`    ${index + 1}. ID: ${record.id}`);
            
            // フィールドを表示
            const fieldNames = Object.keys(fields).slice(0, 5); // 最初の5フィールドのみ
            fieldNames.forEach(fieldName => {
              let value = fields[fieldName];
              if (typeof value === 'string' && value.length > 50) {
                value = value.substring(0, 50) + '...';
              }
              console.log(`       ${fieldName}: ${value}`);
            });
            console.log();
          });
        }
        
      } catch (error) {
        if (error.statusCode === 404) {
          console.log(`  ⚠️ ${tableName}: テーブルが見つかりません`);
        } else {
          console.log(`  ❌ ${tableName}: エラー - ${error.message}`);
        }
      }
      
      console.log();
    }
    
  } catch (error) {
    console.error('❌ Airtable接続エラー:', error.message);
  }
}

checkAllAirtableData();
