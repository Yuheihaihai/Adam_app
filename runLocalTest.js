const axios = require('axios');
const testMessages = require('./testMessages'); // 上記のファイルからメッセージを読み込む

// ローカルサーバーのエンドポイントURL (ポート番号はご自身の環境に合わせてください)
const testEndpoint = 'http://localhost:3000/test/message';
// テスト対象のユーザーID (ダミーでOK)
const testUserId = 'test-user-local-001';
// 繰り返し回数 (必要に応じて変更)
const numberOfTests = 100; // ユーザー指定の100回

async function runTest() {
  console.log(`🚀 Starting local test for determineModeAndLimit...`);
  console.log(`Target Endpoint: ${testEndpoint}`);
  console.log(`Number of Tests: ${numberOfTests}`);

  let successCount = 0;
  let errorCount = 0;

  // numberOfTests 回、ランダムにメッセージを選んでテスト
  for (let i = 0; i < numberOfTests; i++) {
    // testMessages 配列からランダムにメッセージを選択
    const messageContent = testMessages[Math.floor(Math.random() * testMessages.length)];
    console.log(`\n🧪 Test ${i + 1}/${numberOfTests} - Sending message: "${messageContent}"`);

    try {
      const startTime = Date.now();
      const response = await axios.post(testEndpoint, {
        userId: testUserId,
        text: messageContent,
      });
      const endTime = Date.now();
      const duration = endTime - startTime;

      // エンドポイントからの応答（モードやログはサーバーコンソールに出力されるはず）
      console.log(`✅ Test ${i + 1} Success (Duration: ${duration}ms)`);
      // console.log('Server Response:', response.data); // 必要ならサーバー応答も表示
      successCount++;

      // 意図的に少し待機（API負荷軽減とログ確認のため）
      await new Promise(resolve => setTimeout(resolve, 200)); // 200ミリ秒待機

    } catch (error) {
      console.error(`❌ Test ${i + 1} Failed for message: "${messageContent}"`);
      if (error.response) {
        console.error(`  Error Status: ${error.response.status}`);
        console.error('  Error Data:', error.response.data);
      } else {
        console.error('  Error Message:', error.message);
      }
      errorCount++;
    }
  }

  console.log(`\n🏁 Test finished.`);
  console.log(`Total Tests: ${numberOfTests}`);
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
}

// テストを実行
runTest();
