require('dotenv').config();

console.log('🔍 環境変数確認:');
console.log(`AIRTABLE_API_KEY: ${process.env.AIRTABLE_API_KEY ? '設定済み' : '未設定'}`);
console.log(`AIRTABLE_BASE_ID: ${process.env.AIRTABLE_BASE_ID ? '設定済み' : '未設定'}`);
console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? '設定済み' : '未設定'}`);

// 追加の設定確認
const requiredVars = [
  'AIRTABLE_API_KEY',
  'AIRTABLE_BASE_ID', 
  'DATABASE_URL'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.log('\n❌ 不足している環境変数:');
  missingVars.forEach(varName => console.log(`  - ${varName}`));
  console.log('\n💡 これらの環境変数を.envファイルに設定してください');
} else {
  console.log('\n✅ 必要な環境変数は全て設定されています');
}
