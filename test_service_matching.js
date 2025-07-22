const ServiceMatchingUtils = require('./serviceMatchingUtils');
const testMessages = require('./testMessages');
const services = require('./services'); // 実際のサービスリストを読み込み

(async () => {
  const serviceMatching = new ServiceMatchingUtils();
  await serviceMatching.initialize();

  console.log('=== サービスマッチング（適職診断・推薦）自動テスト ===\n');
  console.log(`📋 使用サービス数: ${services.length}件`);
  console.log(`📋 主要サービス: ${services.slice(0, 3).map(s => s.name).join(', ')}等\n`);
  
  let success = 0, fail = 0;
  for (const msg of testMessages.slice(0, 5)) { // キャリア系メッセージのみ
    // ユーザーニーズを単純にメッセージ分割で生成（本番はAI/Embeddingで抽出）
    const userNeeds = msg.split(/[、。\s]/).filter(Boolean);
    console.log(`\n[テストメッセージ] ${msg}`);
    try {
      const results = await serviceMatching.enhancedServiceMatching(userNeeds, services);
      if (results && results.length > 0) {
        console.log('✅ 推薦サービス:', results.map(r => `${r.service.name}(${(r.score * 100).toFixed(1)}%)`).join(', '));
        success++;
      } else {
        console.log('❌ 推薦サービスなし');
        fail++;
      }
    } catch (e) {
      console.error('❌ エラー:', e.message);
      fail++;
    }
  }
  console.log(`\n=== サービスマッチングテスト結果: ${success}件成功 / ${success+fail}件 ===`);
})(); 