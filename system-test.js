// Simple system test for the test/message endpoint
const axios = require('axios');

// Configuration
const baseUrl = 'https://adam-app-cloud-v2-4-40ae2b8ccd08.herokuapp.com'; // Production Heroku URL
const testApiEndpoint = '/test/message';
const userId = `test-user-${Date.now()}`;

// Test cases
const testCases = [
  {
    name: '一般会話',
    text: 'こんにちは、元気ですか？',
    expectedMode: 'general'
  },
  {
    name: '特性分析',
    text: '特性分析をお願いします。',
    expectedMode: 'characteristics'
  },
  {
    name: 'キャリア分析',
    text: '私の適職を教えてください。',
    expectedMode: 'career'
  },
  {
    name: 'キャリア分析（詳細）',
    text: '記録が少ない場合も全て思い出して私の適職診断お願いします🤲',
    expectedMode: 'career'
  }
];

// Test function
async function runTest(testCase) {
  console.log(`\n===== テスト: ${testCase.name} =====`);
  console.log(`リクエスト: ${testCase.text}`);
  
  try {
    console.log('APIリクエスト送信中...');
    
    const startTime = Date.now();
    const response = await axios.post(`${baseUrl}${testApiEndpoint}`, {
      userId: userId,
      text: testCase.text
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30-second timeout
    });
    const endTime = Date.now();
    
    // Check response
    const responseData = response.data;
    console.log(`応答時間: ${(endTime - startTime)/1000}秒`);
    console.log(`モード: ${responseData.mode}`);
    
    // レスポンスのサマリー表示を安全に処理
    let responseSummary = "応答なし";
    if (responseData.response) {
      if (typeof responseData.response === 'string') {
        responseSummary = responseData.response.substring(0, 100) + "...";
      } else if (typeof responseData.response === 'object') {
        responseSummary = JSON.stringify(responseData.response).substring(0, 100) + "...";
      }
    } else if (responseData.text) {
      responseSummary = responseData.text.substring(0, 100) + "...";
    } else if (responseData.content) {
      responseSummary = responseData.content.substring(0, 100) + "...";
    }
    console.log(`応答サマリー: ${responseSummary}`);
    
    // レスポンスの有効性を確認
    const hasValidResponse = responseData && 
                           (responseData.response || responseData.text || responseData.content);
    
    // Validate response
    const isSuccess = hasValidResponse && responseData.mode === testCase.expectedMode;
    
    console.log(`テスト結果: ${isSuccess ? '成功 ✓' : '失敗 ✗'}`);
    
    // レスポンスの長さを安全に取得
    let responseLength = 0;
    if (responseData.response) {
      if (typeof responseData.response === 'string') {
        responseLength = responseData.response.length;
      } else if (typeof responseData.response === 'object') {
        responseLength = JSON.stringify(responseData.response).length;
      }
    } else if (responseData.text) {
      responseLength = responseData.text.length;
    } else if (responseData.content) {
      responseLength = responseData.content.length;
    }
    
    return {
      success: isSuccess,
      mode: responseData.mode,
      responseLength: responseLength,
      responseTime: (endTime - startTime)/1000
    };
    
  } catch (error) {
    console.error('テストエラー:', error.message);
    if (error.response) {
      console.error('応答データ:', error.response.data);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Run all tests
async function runAllTests() {
  console.log(`\n===== システムテスト開始 =====`);
  console.log(`エンドポイント: ${baseUrl}${testApiEndpoint}`);
  console.log(`テストユーザーID: ${userId}`);
  console.log(`テストケース数: ${testCases.length}`);
  
  const startTime = Date.now();
  const results = [];
  
  for (const testCase of testCases) {
    const result = await runTest(testCase);
    results.push({
      name: testCase.name,
      ...result
    });
  }
  
  const endTime = Date.now();
  
  // Print summary
  console.log(`\n===== テスト結果サマリー =====`);
  
  const successCount = results.filter(r => r.success).length;
  console.log(`成功: ${successCount}/${testCases.length} (${Math.round(successCount/testCases.length*100)}%)`);
  console.log(`総実行時間: ${(endTime - startTime)/1000}秒`);
  
  // Table format
  console.log('\n詳細結果:');
  console.log('名前\t\t結果\tモード\t応答時間\t応答長');
  
  results.forEach(r => {
    const resultSymbol = r.success ? '✓' : '✗';
    const mode = r.mode || 'N/A';
    const responseTime = r.responseTime ? `${r.responseTime.toFixed(2)}s` : 'N/A';
    const responseLength = r.responseLength || 'N/A';
    
    console.log(`${r.name}\t${resultSymbol}\t${mode}\t${responseTime}\t${responseLength}`);
  });
  
  console.log(`\n===== システムテスト終了 =====\n`);
}

// Run the tests
runAllTests(); 