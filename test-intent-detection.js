// test-intent-detection.js
require('dotenv').config();
const IntentDetectionModel = require('./intentDetectionModel');

// テストケース
const testCases = [
  {
    text: 'こんにちは、はじめまして。',
    expectedIntent: 'greeting'
  },
  {
    text: 'この問題の解決方法についてアドバイスをください。',
    expectedIntent: 'advice_seeking'
  },
  {
    text: '発達障害についての情報を教えてください。',
    expectedIntent: 'information_request'
  },
  {
    text: '仕事でストレスを感じていて困っています。',
    expectedIntent: 'problem_sharing'
  },
  {
    text: 'どっちの選択肢が良いと思いますか？',
    expectedIntent: 'decision_support'
  },
  {
    text: 'ありがとうございました！',
    expectedIntent: 'gratitude'
  }
];

// 意図検出モデルのテスト実行
async function runTest() {
  console.log('意図検出モデルのテストを開始します...');
  
  // モデルのインスタンス作成
  const intentModel = new IntentDetectionModel();
  
  try {
    // モデルの初期化
    await intentModel.initialize();
    console.log('モデルの初期化が完了しました。\n');
    
    // 各テストケースを実行
    for (const testCase of testCases) {
      console.log(`テストテキスト: "${testCase.text}"`);
      console.log(`期待される意図: ${testCase.expectedIntent}`);
      
      // 意図検出の実行
      const result = await intentModel.detectIntent(testCase.text);
      
      console.log(`検出された主要な意図: ${result.primary} (信頼度: ${result.confidence.toFixed(2)})`);
      if (result.secondary) {
        console.log(`検出された二次的な意図: ${result.secondary}`);
      }
      
      // 期待される意図と一致するかチェック
      const isMatch = result.primary === testCase.expectedIntent;
      console.log(`テスト結果: ${isMatch ? '成功 ✓' : '失敗 ✗'}`);
      
      // スコアの詳細を表示
      console.log('意図スコアの詳細:');
      Object.entries(result.scores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)  // 上位5つのみ表示
        .forEach(([intent, score]) => {
          console.log(`  - ${intent}: ${score.toFixed(2)}`);
        });
      
      console.log('-----------------------------------\n');
    }
    
    // API動作確認用のエクストラテスト
    console.log('APIで使用するための追加テスト:');
    const extraTest = '最近不安で眠れないことがあります。どうすればいいでしょうか？';
    console.log(`テキスト: "${extraTest}"`);
    
    const extraResult = await intentModel.detectIntent(extraTest);
    console.log('検出結果:');
    console.log(JSON.stringify(extraResult, null, 2));
    
    console.log('\nテストが完了しました。');
    
  } catch (error) {
    console.error('テスト中にエラーが発生しました:', error);
  }
}

// テストの実行
runTest(); 