#!/usr/bin/env node
/**
 * 会話文脈理解機能のテストスクリプト
 * 「あります！！！」のような短い応答に対する文脈理解を検証
 */

const { processMessage } = require('./fixed_server');

async function testConversationContext() {
  console.log('=== 会話文脈理解テスト開始 ===\n');
  
  // テストユーザーID
  const testUserId = 'test-context-user-001';
  
  try {
    // シナリオ1: 通常の質問
    console.log('1. 通常の質問テスト');
    const response1 = await processMessage(testUserId, '今日はどんな一日でしたか？');
    console.log(`応答1: ${response1.substring(0, 100)}...\n`);
    
    // シナリオ2: 短い肯定的応答（問題のケース）
    console.log('2. 短い応答テスト（「あります！！！」）');
    const response2 = await processMessage(testUserId, 'あります！！！');
    console.log(`応答2: ${response2.substring(0, 100)}...\n`);
    
    // シナリオ3: 指示語を含む応答
    console.log('3. 指示語テスト（「それはいいですね」）');
    const response3 = await processMessage(testUserId, 'それはいいですね');
    console.log(`応答3: ${response3.substring(0, 100)}...\n`);
    
    // シナリオ4: 文脈継続確認
    console.log('4. 文脈継続テスト（「詳しく教えて」）');
    const response4 = await processMessage(testUserId, '詳しく教えて');
    console.log(`応答4: ${response4.substring(0, 100)}...\n`);
    
    console.log('=== テスト完了 ===');
    
    // 結果評価
    console.log('\n=== 結果評価 ===');
    
    if (response2.includes('何かお困りのことや相談したいことがあるのでしょうか')) {
      console.log('❌ 問題継続: 「あります！！！」に対して依然として一般的な応答');
    } else {
      console.log('✅ 改善確認: 「あります！！！」に対して文脈を考慮した応答');
    }
    
  } catch (error) {
    console.error('テストエラー:', error.message);
    console.log('エラー詳細:', error);
  }
}

// スクリプトが直接実行された場合のみテストを実行
if (require.main === module) {
  testConversationContext()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('テスト実行エラー:', error);
      process.exit(1);
    });
}

module.exports = { testConversationContext };
