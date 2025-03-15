# 記憶と知識の分離について

## 概要

このシステムでは、AIの会話処理において「記憶」と「知識」を明確に分離しています。この分離によって、AIがより自然な会話を実現し、ユーザーとの対話の質を向上させることができます。

## 記憶と知識の定義

### 記憶（Memory）
- **定義**: 過去の会話履歴など、時系列に基づいた個人的な体験データ
- **特徴**: いつ、どこで、何が起きたかという文脈を含む
- **保存場所**: Airtableのデータベース（ConversationHistory）
- **用途**: 会話の連続性を維持し、以前の対話内容を参照するために使用

### 知識（Knowledge）
- **定義**: 会話から抽出された一般的な情報や分析結果
- **特徴**: 文脈から独立した情報、分析データ
- **生成方法**: ML（機械学習）による分析や外部APIからの情報取得
- **用途**: より豊かな応答を生成するための補足情報として使用

## システム内での実装

### 記憶の処理
1. `fetchUserHistory` 関数によって、Airtableから会話履歴（記憶）を取得
2. 取得された履歴データは、そのままAIへの入力として使用
3. 会話履歴はロールと内容を保持し、時系列順に処理

### 知識の処理
1. `userNeedsAnalyzer.analyzeUserNeeds` - ユーザーのニーズを分析
2. `extractConversationContext` - 会話の文脈から感情や興味関心を抽出
3. Perplexity APIなどの外部ソースから情報を取得（キャリアモード）
4. これらの分析結果は「知識」として扱われ、AIの応答生成を補助

## 実装上の注意点

1. 記憶と知識は常に別々に処理し、明確に区別する
2. AI応答生成において、記憶はそのままの形で使用し、知識は補足情報として使用
3. GPT-4とClaudeモデルでは処理方法が異なるため、それぞれに適した形式で記憶と知識を提供

## 効果

この分離によって、以下の効果が期待できます：

1. 会話の自然な流れの維持（記憶の活用）
2. 豊かな情報に基づいた応答（知識の活用）
3. ユーザーの過去の発言と現在のニーズの両方を考慮した応答

## 実装例

```javascript
// 記憶（Airtableからのチャット履歴）の取得
const historyData = await fetchUserHistory(userId, limit);
const history = historyData.history || [];

// 知識（ML分析）の生成
const conversationContext = extractConversationContext(history, userMessage);
const userNeeds = await userNeedsAnalyzer.analyzeUserNeeds(userMessage, history);

// 記憶の活用（会話履歴をそのまま使用）
messages = [
  { role: 'system', content: systemPrompt },
  ...history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.content
  }))
];

// 知識の活用（ML分析結果を追加情報として使用）
messages.push({
  role: 'system',
  content: mlSystemPrompt
});
```

## 変更履歴

- 2023-07-10: 記憶と知識の分離概念を導入
- 2023-07-15: GPT-4とClaude用の異なる処理方法を実装
- 2023-07-20: 知識の活用方法を改善（ML影響分析の追加） 