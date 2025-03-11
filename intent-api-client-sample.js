const axios = require('axios');

// サンプルテキスト配列
const sampleTexts = [
  'こんにちは、Adamさん。はじめまして！',
  '発達障害についての情報を教えていただけますか？',
  '最近仕事で集中力が続かず困っています。何か対策はありますか？',
  'この症状は発達障害の特徴なのでしょうか？ASDとADHDの違いを教えてください',
  '薬を飲むべきか迷っています。どう思いますか？',
  '人間関係でつらい思いをすることが多くて悩んでいます',
  'おすすめの本はありますか？',
  'この前のアドバイスはとても役に立ちました。ありがとう！',
  'アプリの使い方がわかりません',
  'それでは、また明日話しましょう。さようなら'
];

// テキストから意図を検出するAPIを呼び出す関数
async function detectIntent(text) {
  try {
    const response = await axios.post('http://localhost:3000/api/intent/detect', {
      text
    });
    
    return response.data;
  } catch (error) {
    console.error('意図検出APIの呼び出しに失敗しました:', error.message);
    return null;
  }
}

// 意図カテゴリ一覧を取得する関数
async function getIntentCategories() {
  try {
    const response = await axios.get('http://localhost:3000/api/intent/categories');
    return response.data;
  } catch (error) {
    console.error('意図カテゴリAPIの呼び出しに失敗しました:', error.message);
    return null;
  }
}

// メイン実行関数
async function main() {
  console.log('意図検出APIクライアントのサンプル実行');
  console.log('=====================================\n');
  
  // カテゴリ一覧の取得
  console.log('利用可能な意図カテゴリを取得中...');
  const categoriesResponse = await getIntentCategories();
  
  if (categoriesResponse && categoriesResponse.success) {
    console.log('利用可能な意図カテゴリ:');
    const categories = categoriesResponse.categories;
    
    // カテゴリ一覧を表示
    categories.forEach(category => {
      console.log(`- ${category.id}: ${category.name} (${category.description})`);
    });
    
    // カテゴリIDと日本語名のマッピングを作成
    const categoryNames = {};
    categories.forEach(category => {
      categoryNames[category.id] = category.name;
    });
    
    console.log('\n各サンプルテキストの意図検出:');
    console.log('---------------------------\n');
    
    // 各サンプルテキストで意図検出を実行
    for (const text of sampleTexts) {
      console.log(`テキスト: "${text}"`);
      
      const result = await detectIntent(text);
      
      if (result && result.success) {
        const intent = result.intent;
        
        console.log(`主要な意図: ${categoryNames[intent.primary] || intent.primary} (${intent.primary}, 信頼度: ${intent.confidence.toFixed(2)})`);
        
        if (intent.secondary) {
          console.log(`二次的な意図: ${categoryNames[intent.secondary] || intent.secondary} (${intent.secondary})`);
        }
        
        // 上位3つのスコアを表示
        console.log('上位スコア:');
        Object.entries(intent.scores)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .forEach(([category, score]) => {
            console.log(`  - ${categoryNames[category] || category}: ${score.toFixed(2)}`);
          });
      } else {
        console.log('意図検出に失敗しました');
      }
      
      console.log('-----------------------\n');
    }
  } else {
    console.log('カテゴリ一覧の取得に失敗しました');
  }
}

// サンプルの実行
// 注意: サーバーが起動していないと動作しません
console.log('このサンプルを実行する前に、サーバーを起動してください:');
console.log('  node server.js');
console.log('\n実行するには、上記コマンドを別ターミナルで実行し、その後このスクリプトを実行してください:');
console.log('  node intent-api-client-sample.js\n');

// サーバーを起動せずにこのサンプルコードをそのまま実行すると、APIエラーになります
// main(); 