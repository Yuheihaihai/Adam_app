const ServiceMatchingUtils = require('./serviceMatchingUtils');
const testMessages = require('./testMessages');

(async () => {
  const serviceMatching = new ServiceMatchingUtils();
  await serviceMatching.initialize();

  // ダミーサービスリスト
  const services = [
    { id: 1, name: 'キャリアカウンセリング', description: '転職やキャリアの悩みを相談できる専門サービス', targets: ['転職', 'キャリア', '自己分析'] },
    { id: 2, name: 'メンタルヘルスサポート', description: '心の健康をサポートするカウンセリング', targets: ['メンタル', 'ストレス', '不安'] },
    { id: 3, name: 'プログラミング学習支援', description: 'ITスキルを身につけたい人向けの学習サービス', targets: ['IT', 'プログラミング', 'スキルアップ'] },
    { id: 4, name: '履歴書添削', description: '履歴書や職務経歴書の添削サービス', targets: ['履歴書', '職務経歴書', '応募書類'] },
    { id: 5, name: '人間関係相談', description: '職場や家庭の人間関係の悩み相談', targets: ['人間関係', 'コミュニケーション', '悩み'] }
  ];

  console.log('=== サービスマッチング（適職診断・推薦）自動テスト ===\n');
  let success = 0, fail = 0;
  for (const msg of testMessages.slice(0, 5)) { // キャリア系メッセージのみ
    // ユーザーニーズを単純にメッセージ分割で生成（本番はAI/Embeddingで抽出）
    const userNeeds = msg.split(/[、。\s]/).filter(Boolean);
    console.log(`\n[テストメッセージ] ${msg}`);
    try {
      const results = await serviceMatching.enhancedServiceMatching(userNeeds, services);
      if (results && results.length > 0) {
        console.log('✅ 推薦サービス:', results.map(r => r.service.name).join(', '));
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