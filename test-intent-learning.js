// test-intent-learning.js
require('dotenv').config();
const axios = require('axios');
const readline = require('readline');

// 対話型のコンソールインターフェイスを作成
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 学習テスト用サンプルデータ
const sampleData = [
  {
    text: 'こんにちは、調子はどうですか？',
    expectedIntent: 'greeting'
  },
  {
    text: '発達障害の特徴について詳しく教えてください。',
    expectedIntent: 'information_request'
  },
  {
    text: '人間関係で悩んでいます。どうしたらいいでしょうか？',
    expectedIntent: 'advice_seeking'
  },
  {
    text: '仕事でミスが多くて落ち込んでいます。',
    expectedIntent: 'problem_sharing'
  },
  {
    text: '薬を飲むべきか迷っています。どう思いますか？',
    expectedIntent: 'decision_support'
  },
  {
    text: '今日はとても悲しい気持ちです。',
    expectedIntent: 'emotional_support'
  },
  {
    text: 'コミュニケーションが上手くなる本を教えてください。',
    expectedIntent: 'recommendation_request'
  },
  {
    text: 'アプリの使い方がわかりにくいです。',
    expectedIntent: 'complaint'
  },
  {
    text: 'アドバイスありがとうございました！',
    expectedIntent: 'gratitude'
  },
  {
    text: 'それでは、またお話ししましょう。さようなら。',
    expectedIntent: 'farewell'
  }
];

// APIリクエストのベースURL
const API_BASE_URL = 'http://localhost:3000/api';

/**
 * 意図を検出する
 * @param {string} text テキスト
 * @returns {Promise<Object>} 検出結果
 */
async function detectIntent(text) {
  try {
    const response = await axios.post(`${API_BASE_URL}/intent/detect`, { text });
    return response.data;
  } catch (error) {
    console.error('意図検出に失敗しました:', error.message);
    return null;
  }
}

/**
 * フィードバックを送信する
 * @param {string} text テキスト
 * @param {string} predictedIntent 予測された意図
 * @param {string} correctIntent 正しい意図
 * @param {string} feedbackType フィードバックタイプ
 * @returns {Promise<Object>} レスポンス
 */
async function sendFeedback(text, predictedIntent, correctIntent, feedbackType) {
  try {
    const response = await axios.post(`${API_BASE_URL}/intent/feedback`, {
      text,
      predictedIntent,
      correctIntent,
      feedbackType,
      userId: 'test-user',
      context: { source: 'test-script' }
    });
    return response.data;
  } catch (error) {
    console.error('フィードバック送信に失敗しました:', error.message);
    if (error.response) {
      console.error('エラーレスポンス:', error.response.data);
    }
    return null;
  }
}

/**
 * モデルをトレーニングする
 * @returns {Promise<Object>} レスポンス
 */
async function trainModel() {
  try {
    const response = await axios.post(`${API_BASE_URL}/intent/train`);
    return response.data;
  } catch (error) {
    console.error('モデルトレーニングに失敗しました:', error.message);
    return null;
  }
}

/**
 * トレーニングステータスを取得する
 * @returns {Promise<Object>} ステータス
 */
async function getTrainingStatus() {
  try {
    const response = await axios.get(`${API_BASE_URL}/intent/training-status`);
    return response.data;
  } catch (error) {
    console.error('トレーニングステータスの取得に失敗しました:', error.message);
    return null;
  }
}

// 対話型のメインメニュー
function showMainMenu() {
  console.log('\n===== 意図検出モデル学習テスト =====');
  console.log('1. サンプルデータでフィードバックを送信');
  console.log('2. モデルをトレーニング');
  console.log('3. トレーニングステータスを確認');
  console.log('4. カスタムテキストで意図を検出');
  console.log('5. 終了');
  
  rl.question('\n選択してください (1-5): ', async (answer) => {
    switch (answer.trim()) {
      case '1':
        await sendSampleFeedback();
        break;
      case '2':
        await startTraining();
        break;
      case '3':
        await checkTrainingStatus();
        break;
      case '4':
        await detectCustomIntent();
        break;
      case '5':
        console.log('テストを終了します。');
        rl.close();
        return;
      default:
        console.log('無効な選択です。1から5の数字を入力してください。');
    }
    
    // メインメニューに戻る（終了以外の選択肢）
    showMainMenu();
  });
}

// サンプルデータを使用して一つずつフィードバックを送信
async function sendSampleFeedback() {
  console.log('\n=== サンプルデータでフィードバックを送信 ===');
  
  for (let i = 0; i < sampleData.length; i++) {
    const sample = sampleData[i];
    console.log(`\n[${i + 1}/${sampleData.length}] テキスト: "${sample.text}"`);
    console.log(`期待される意図: ${sample.expectedIntent}`);
    
    // 意図を検出
    const result = await detectIntent(sample.text);
    
    if (result && result.success) {
      const intent = result.intent;
      console.log(`検出された意図: ${intent.primary} (信頼度: ${intent.confidence.toFixed(2)})`);
      
      // 予測が正しいか確認
      const isCorrect = intent.primary === sample.expectedIntent;
      console.log(`予測結果: ${isCorrect ? '正解 ✓' : '不正解 ✗'}`);
      
      // フィードバックタイプ
      const feedbackType = isCorrect ? 'confirmation' : 'correction';
      
      // フィードバックを送信
      console.log('フィードバックを送信中...');
      const feedback = await sendFeedback(
        sample.text,
        intent.primary,
        sample.expectedIntent,
        feedbackType
      );
      
      if (feedback && feedback.success) {
        console.log('フィードバック送信成功 ✓');
      } else {
        console.log('フィードバック送信失敗 ✗');
      }
    } else {
      console.log('意図検出に失敗しました');
    }
    
    // 最後のサンプル以外は一時停止
    if (i < sampleData.length - 1) {
      await new Promise(resolve => {
        rl.question('\nEnterキーを押して次のサンプルに進む...', () => {
          resolve();
        });
      });
    }
  }
  
  console.log('\nすべてのサンプルデータのフィードバック送信が完了しました');
}

// モデルのトレーニングを開始
async function startTraining() {
  console.log('\n=== モデルトレーニングの開始 ===');
  
  // トレーニングステータスを確認
  const status = await getTrainingStatus();
  
  if (status && status.success) {
    console.log(`未学習データ: ${status.untrainedSamples}件`);
    console.log(`現在のバージョン: ${status.currentVersion}`);
    
    if (status.trainingInProgress) {
      console.log('トレーニングは既に進行中です');
      return;
    }
    
    if (status.untrainedSamples === 0) {
      console.log('トレーニングデータがありません。先にフィードバックを送信してください。');
      return;
    }
    
    // トレーニング開始
    console.log('トレーニングを開始します...');
    const result = await trainModel();
    
    if (result && result.success) {
      console.log(`トレーニング成功: 新しいモデルバージョン: ${result.version}`);
    } else {
      console.log('トレーニングに失敗しました');
    }
  } else {
    console.log('トレーニングステータスの取得に失敗しました');
  }
}

// トレーニングステータスを確認
async function checkTrainingStatus() {
  console.log('\n=== トレーニングステータスの確認 ===');
  
  const status = await getTrainingStatus();
  
  if (status && status.success) {
    console.log(`未学習データ: ${status.untrainedSamples}件`);
    console.log(`トレーニング中: ${status.trainingInProgress ? 'はい' : 'いいえ'}`);
    console.log(`現在のモデルバージョン: ${status.currentVersion}`);
    
    if (status.recentVersions && status.recentVersions.length > 0) {
      console.log('\n最近のモデルバージョン:');
      status.recentVersions.forEach(version => {
        console.log(`- バージョン: ${version.version}, 作成日時: ${new Date(version.created_at).toLocaleString()}`);
        console.log(`  説明: ${version.description}`);
        console.log(`  学習サンプル数: ${version.training_samples}, 精度: ${(version.accuracy * 100).toFixed(2)}%`);
        console.log(`  アクティブ: ${version.is_active ? 'はい' : 'いいえ'}`);
      });
    }
  } else {
    console.log('トレーニングステータスの取得に失敗しました');
  }
}

// カスタムテキストで意図を検出
async function detectCustomIntent() {
  console.log('\n=== カスタムテキストで意図を検出 ===');
  
  await new Promise(resolve => {
    rl.question('\n検出するテキストを入力してください: ', async (text) => {
      if (!text.trim()) {
        console.log('テキストが入力されていません');
        resolve();
        return;
      }
      
      // 意図を検出
      const result = await detectIntent(text);
      
      if (result && result.success) {
        const intent = result.intent;
        console.log(`\n検出された主要な意図: ${intent.primary} (信頼度: ${intent.confidence.toFixed(2)})`);
        
        if (intent.secondary) {
          console.log(`検出された二次的な意図: ${intent.secondary}`);
        }
        
        // 上位3つのスコアを表示
        console.log('上位スコア:');
        Object.entries(intent.scores)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .forEach(([category, score]) => {
            console.log(`  - ${category}: ${score.toFixed(2)}`);
          });
        
        // フィードバックを送信するかどうか
        await new Promise(innerResolve => {
          rl.question('\nこの結果に対してフィードバックを送信しますか？ (y/n): ', async (answer) => {
            if (answer.toLowerCase() === 'y') {
              // 正しい意図を入力
              await new Promise(innerResolve2 => {
                rl.question('正しい意図を入力してください: ', async (correctIntent) => {
                  if (!correctIntent.trim()) {
                    console.log('入力がありません。フィードバックはキャンセルされました。');
                    innerResolve2();
                    return;
                  }
                  
                  // フィードバックを送信
                  const feedbackType = correctIntent === intent.primary ? 'confirmation' : 'correction';
                  const feedback = await sendFeedback(text, intent.primary, correctIntent, feedbackType);
                  
                  if (feedback && feedback.success) {
                    console.log('フィードバック送信成功 ✓');
                  } else {
                    console.log('フィードバック送信失敗 ✗');
                  }
                  
                  innerResolve2();
                });
              });
            }
            innerResolve();
          });
        });
      } else {
        console.log('意図検出に失敗しました');
      }
      
      resolve();
    });
  });
}

// メインメニューを表示して開始
console.log('意図検出モデル学習テストを開始します。');
console.log('注意: サーバーが起動していることを確認してください。');

// サーバーが起動しているか確認
axios.get(`${API_BASE_URL}/intent/categories`)
  .then(() => {
    console.log('サーバー接続成功！テストを開始します。');
    showMainMenu();
  })
  .catch(error => {
    console.error('サーバーに接続できません。サーバーが起動しているか確認してください:', error.message);
    console.log('\nサーバー起動方法:');
    console.log('  node server.js');
    rl.close();
  });

// 終了時のイベント
rl.on('close', () => {
  console.log('\nテストを終了します。さようなら。');
  process.exit(0);
}); 