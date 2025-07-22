// Airtableフィールド確認スクリプト
require('dotenv').config();
const Airtable = require('airtable');

async function checkAirtableFields() {
  console.log('🔍 Airtableフィールド確認開始...\n');
  
  try {
    // Airtable接続
    const base = new Airtable({ 
      apiKey: process.env.AIRTABLE_API_KEY 
    }).base(process.env.AIRTABLE_BASE_ID);
    
    const table = base('ConversationHistory');
    
    // 最初の1件だけ取得してフィールド構造を確認
    console.log('📋 最初の1件を取得してフィールド構造確認...');
    
    const records = await table.select({
      maxRecords: 1
    }).firstPage();
    
    if (records.length > 0) {
      const record = records[0];
      console.log('\n✅ レコード発見！');
      console.log('📋 Record ID:', record.id);
      console.log('📋 Available fields:');
      
      // すべてのフィールドを表示
      const fields = record.fields;
      Object.keys(fields).forEach(fieldName => {
        const value = fields[fieldName];
        const valuePreview = typeof value === 'string' ? value.substring(0, 50) + '...' : value;
        console.log(`   - ${fieldName}: ${valuePreview}`);
      });
      
      console.log('\n📊 フィールド数:', Object.keys(fields).length);
      
    } else {
      console.log('❌ レコードが見つかりません');
    }
    
  } catch (error) {
    console.error('❌ エラー:', error.message);
    console.error('   Error type:', error.error);
    console.error('   Status code:', error.statusCode);
  }
}

// 実行
if (require.main === module) {
  checkAirtableFields()
    .then(() => {
      console.log('\n🎉 フィールド確認完了！');
      process.exit(0);
    })
    .catch(error => {
      console.error('致命的エラー:', error);
      process.exit(1);
    });
}

module.exports = { checkAirtableFields }; 