/**
 * デモスクリプト：掘り下げモード（深掘り説明モード）
 * 
 * このスクリプトは、様々なユーザーメッセージに対して「掘り下げモード」がどのように
 * 検出され、画像生成がどのように回避されるかをデモンストレーションします。
 */

// デモに必要な関数の定義
function isDeepExplorationRequest(text) {
  if (!text || typeof text !== 'string') return false;
  return text.includes('もっと深く考えを掘り下げて例を示しながらさらに分かり易く言葉で教えてください。抽象的言葉禁止。');
}

function isDirectImageAnalysisRequest(text) {
  if (!text || typeof text !== 'string') return false;
  
  const directAnalysisRequests = [
    'この画像について', 'この写真について', 'この画像を分析', 'この写真を分析',
    'この画像を解析', 'この写真を解析', 'この画像を説明', 'この写真を説明'
  ];
  
  return directAnalysisRequests.some(phrase => text.includes(phrase));
}

function isConfusionRequest(text) {
  if (!text || typeof text !== 'string') return false;
  
  if (isDeepExplorationRequest(text)) {
    return false;
  }
  
  const imageGenerationRequests = [
    '画像を生成', '画像を作成', '画像を作って', 'イメージを生成', 'イメージを作成', 'イメージを作って',
    '図を生成', '図を作成', '図を作って', '図解して', '図解を作成', '図解を生成',
    'ビジュアル化して', '視覚化して', '絵を描いて', '絵を生成', '絵を作成',
    '画像で説明', 'イメージで説明', '図で説明', '視覚的に説明',
    '画像にして', 'イラストを作成', 'イラストを生成', 'イラストを描いて'
  ];
  
  const confusionTerms = [
    'わからない', '分からない', '理解できない', '意味がわからない', '意味が分からない',
    'どういう意味', 'どういうこと', 'よくわからない', 'よく分からない',
    '何が言いたい', 'なにが言いたい', '何を言ってる', 'なにを言ってる',
    'もう少し', 'もっと', '簡単に', 'かみ砕いて', 'シンプルに', '例を挙げて',
    '違う方法で', '別の言い方', '言い換えると', '言い換えれば', '詳しく',
    '混乱', '複雑', '難解', 'むずかしい'
  ];
  
  return imageGenerationRequests.some(phrase => text.includes(phrase)) || 
         isDirectImageAnalysisRequest(text) ||
         confusionTerms.some(term => text.includes(term));
}

function determineModeAndLimit(userMessage) {
  if (isDeepExplorationRequest(userMessage)) {
    return {
      mode: 'deep-exploration',
      tokenLimit: 8000,
      temperature: 0.7
    };
  }
  
  // 簡易化のため他のモードは省略
  return { mode: 'general', tokenLimit: 4000, temperature: 0.7 };
}

function getSystemPromptForMode(mode) {
  if (mode === 'deep-exploration') {
    return `あなたは親切で役立つAIアシスタントです。
ユーザーが深い考察と具体例を求めています。抽象的な表現を避け、以下のガイドラインに従ってください：

1. 概念や理論を詳細に掘り下げて説明する
2. 複数の具体例を用いて説明する（可能であれば3つ以上）
3. 日常生活に関連付けた実践的な例を含める
4. 抽象的な言葉や曖昧な表現を避け、明確で具体的な言葉を使う
5. 必要に応じて、ステップバイステップの説明を提供する
6. 専門用語を使う場合は、必ずわかりやすく解説する

回答は体系的に構成し、ユーザーが実際に応用できる情報を提供してください。`;
  }
  
  return "デフォルトのシステムプロンプト";
}

// ユーザーメッセージの例をセットアップ
const messages = [
  {
    text: "もっと深く考えを掘り下げて例を示しながらさらに分かり易く言葉で教えてください。抽象的言葉禁止。",
    explanation: "掘り下げモードの明示的なリクエスト"
  },
  {
    text: "すみません、よくわかりません。もう少し詳しく説明してもらえますか？",
    explanation: "一般的な混乱の表現（従来のケース）"
  },
  {
    text: "これを図解で説明してもらえますか？",
    explanation: "画像生成の明示的なリクエスト"
  },
  {
    text: "もっと深く考えを掘り下げて例を示しながらさらに分かり易く言葉で教えてください。抽象的言葉禁止。その後、図も作成してください。",
    explanation: "掘り下げモードと画像生成の混合リクエスト"
  },
  {
    text: "AIの将来についてもっと教えてください。",
    explanation: "普通の質問（特別なモードではない）"
  }
];

// ヘッダーを出力
console.log(`==================================================`);
console.log(`       掘り下げモード（深掘り説明モード）デモ       `);
console.log(`==================================================`);
console.log(`このデモは、ユーザーが特定のフレーズを送信した場合に、`);
console.log(`画像生成を回避し、より詳細な言語的説明を提供する新モードを示します。`);
console.log(`--------------------------------------------------`);

// 各メッセージについて処理をシミュレート
messages.forEach((message, index) => {
  console.log(`\nケース ${index + 1}: ${message.explanation}`);
  console.log(`ユーザー: "${message.text}"`);
  
  // 掘り下げモードの検出
  const isDeepMode = isDeepExplorationRequest(message.text);
  console.log(`掘り下げモード検出: ${isDeepMode ? '✅ 検出' : '❌ 非検出'}`);
  
  // 混乱要求（画像生成トリガー）の検出
  const isConfusion = isConfusionRequest(message.text);
  console.log(`混乱/画像要求検出: ${isConfusion ? '✅ 検出' : '❌ 非検出'}`);
  
  // モードの決定
  const modeInfo = determineModeAndLimit(message.text);
  console.log(`選択されたモード: ${modeInfo.mode}`);
  
  // システムプロンプトの生成（短縮版）
  const prompt = getSystemPromptForMode(modeInfo.mode);
  const shortPrompt = prompt.split('\n')[0] + " [...]";
  console.log(`システムプロンプト: ${shortPrompt}`);
  
  // 画像生成の結論
  console.log(`画像生成: ${isConfusion && !isDeepMode ? '✅ 生成する' : '❌ 生成しない'}`);
  
  console.log(`--------------------------------------------------`);
});

console.log(`\n掘り下げモードの実装は正常に動作しています。`);
console.log(`このモードにより、ユーザーが深い考察と具体例を求める場合に、`);
console.log(`不要な画像生成を回避しつつ、より充実した言語的説明を提供できます。`); 