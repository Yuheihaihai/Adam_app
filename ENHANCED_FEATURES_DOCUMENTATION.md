# Enhanced Features Documentation

## オリジナル機能の強化と改善 (Enhancement of Original Features)

このドキュメントでは、AIアシスタントアプリケーションの強化された機能について説明します。

### 1. 強化された推薦トリガーシステム (Enhanced Recommendation Trigger System)

**ファイル:** `enhancedRecommendationTrigger.js`, `server.js`

サービス推薦機能を強化し、ユーザーのメッセージ内容からサービスのニーズをより正確に検出します。LLMを使用して、ユーザーの質問や状況から最適なサービスを特定します。

**主な機能:**
- 高度なLLMベースのサービス分析（LLM応答解析の脆弱性を修正）
- キャッシュシステムによるAPI呼び出しの最適化（無限キャッシュ増大リスクを修正）
- 動的な信頼度閾値によるサービス推薦の精度向上
- マルチバイト文字（日本語）の安全な処理
- OpenAI APIレート制限への対応強化（タイムアウト設定とリトライロジック）
- モデル可用性の問題に対するフォールバック機構
- **[更新]** トリガーワードを使わずGPT-4o-miniモデルによる純粋な文脈理解での推薦判断

**改善点:**
- **[更新]** キーワードに依存しない高度な文脈理解
- **[更新]** ユーザーの暗黙的なニーズも理解し、適切なタイミングでサービスを推薦
- **[更新]** より自然な対話体験の提供（特定のキーワードを使う必要がない）

**技術的詳細:**
- **[更新]** `detectAdviceRequestWithLLM`関数でGPT-4o-miniモデルを使用して、ユーザーがアドバイスやサービスの推薦を求めているか、困った状況にあるかを判断
- **[更新]** 非同期処理による高速なレスポンス
- **[更新]** 障害時のフォールバック処理

**使用例:**
```javascript
const enhancedRecommendationTrigger = require('./enhancedRecommendationTrigger');

// サービスニーズの分析
const analysis = await enhancedRecommendationTrigger.analyzeServiceNeed(userMessage, conversationHistory);

if (analysis.trigger) {
  console.log(`推奨サービス: ${analysis.service}, 信頼度: ${analysis.confidence}`);
  // サービス推薦UIを表示
}
```

### 2. 強化された混乱検出システム (Enhanced Confusion Detection System)

**ファイル:** `enhancedConfusionDetector.js`

ユーザーが混乱している状態をより正確に検出し、適切なタイミングで視覚的な説明を提供するための機能を強化します。

**主な機能:**
- 強化された混乱キーワードとパターン認識
- キャッシュクリーンアップメカニズムによるメモリ使用量の最適化
- マルチバイト文字（日本語）の安全な部分文字列処理
- OpenAI APIレート制限とタイムアウト処理の改善
- モデル不可用時のフォールバック機構
- エラーログからの機密情報の除外

**使用例:**
```javascript
const enhancedConfusionDetector = require('./enhancedConfusionDetector');

// ユーザーの混乱状態を検出
const shouldGenerateImage = await enhancedConfusionDetector.shouldGenerateImage(userMessage, previousAIResponse);

if (shouldGenerateImage) {
  // 視覚的な説明画像を生成して表示
  generateExplanatoryImage();
}
```

### 3. LLMを活用したX共有機能 (LLM-Powered X Sharing Feature)

**ファイル:** `server.js`

ユーザーがアプリに対してポジティブなフィードバックを表現した際のX（旧Twitter）への共有機能を強化しました。キーワードベースの単純なマッチングから、LLMを活用した高度な文脈理解による共有意図の検出に進化させました。

**主な機能:**
- LLMによるユーザーの共有意図の高精度検出
- 簡易検出とLLM分析を組み合わせた2段階判定プロセス
- 自然でパーソナライズされた共有メッセージ
- OpenAI API障害時のフォールバックメカニズム（元のキーワードベース検出にフォールバック）
- パフォーマンスを考慮した軽量モデル（GPT-4o-mini）の使用

**改善点:**
- ユーザーの感情と意図をより正確に理解し、適切なタイミングでのみ共有を促進
- 単なるキーワードマッチではなく、文脈や言外の意味も考慮した判定
- より自然で説得力のあるシェアメッセージでユーザーエクスペリエンスを向上
- システム障害に強い冗長設計

**技術的詳細:**
- `checkEngagementWithLLM` 関数で OpenAI の GPT-4o-mini モデルを使用して会話文脈を分析
- prompt エンジニアリングによる正確な共有意図検出 (感謝表現と機能評価の区別)
- JSON フォーマットでの応答解析により、LLM からの明確な判断結果を取得
- エラーハンドリングとタイムアウト管理を実装し、パフォーマンスへの影響を最小化
- キャッシュメカニズムによるAPIコール数の最適化

**使用例:**
```javascript
// 潜在的な共有意図の検出（第一段階）
const { mode, limit } = determineModeAndLimit(userMessage);

// シェアモードが検出された場合のLLM検証（第二段階）
if (mode === 'share') {
  const history = await fetchUserHistory(userId, 10);
  const isHighEngagement = await checkHighEngagement(userMessage, history);
  
  if (isHighEngagement) {
    // X共有URLを含むメッセージを送信
    const shareMessage = `お褒めの言葉をいただき、ありがとうございます！😊
    
    Adamをお役立ていただけているようで、開発チーム一同とても嬉しく思います。もしよろしければ、下記のリンクからX(Twitter)でシェアしていただけると、より多くの方にAIカウンセラー「Adam」を知っていただけます。
    
    ${SHARE_URL}
    
    通常の会話に戻る場合は、そのまま質問や相談を続けていただければと思います。`;
    
    // メッセージを送信
  }
}
```

**実装の詳細:**
```javascript
async function checkEngagementWithLLM(userMessage, conversationHistory) {
  try {
    // LLMに送信するプロンプト
    const prompt = {
      messages: [
        {
          role: 'system',
          content: `あなたはユーザーのメッセージからポジティブなエンゲージメントを検出する専門家です。
            メッセージが単なる感謝ではなく、以下の条件を満たす場合にのみtrueを返してください：
            1. ユーザーが「Adam」やサービスについて具体的に言及している
            2. 明確なポジティブな評価や満足度を表現している
            JSON形式で{"isHighEngagement": true/false, "reason": "判断理由"}を返してください。`
        },
        { role: 'user', content: userMessage }
      ]
    };

    // LLM呼び出し
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: prompt.messages,
      temperature: 0.1,
      max_tokens: 150,
      response_format: { type: 'json_object' }
    });

    // 応答解析
    const content = response.choices[0].message.content;
    const parsedResponse = JSON.parse(content);
    return parsedResponse.isHighEngagement;
  } catch (error) {
    console.error('LLMによる高エンゲージメントチェック中にエラー:', error);
    return false; // エラー時はfalseを返す
  }
}
```

### セキュリティと性能の強化 (Security and Performance Improvements)

最新の改善では、以下のセキュリティと性能の向上が実装されています：

1. **LLM応答解析の堅牢化**
   - JSON応答の厳格な検証と型チェック
   - 誤ったレスポンス形式に対するグレースフルエラーハンドリング
   - モデル可用性の問題に対するフォールバックロジック

2. **キャッシュ管理の最適化**
   - 定期的なキャッシュクリーンアップによるメモリリーク防止
   - 最大キャッシュサイズの制限（1000エントリ）
   - エントリの有効期限管理の改善

3. **マルチバイト文字処理の安全性向上**
   - 日本語などのマルチバイト文字に対する安全な部分文字列処理
   - 文字列長計算のバイト数ではなく文字数ベースでの処理

4. **APIリクエスト管理の強化**
   - タイムアウト設定の実装（10-15秒）
   - 自動リトライロジックの追加（2-3回）
   - APIレート制限に対する適切なバックオフ戦略

5. **エラーログの安全性向上**
   - 機密情報を含まないエラーログ
   - 構造化されたエラー情報の記録

これらの改善により、アプリケーションの安定性、セキュリティ、およびパフォーマンスが向上しています。

## 概要

このアップデートでは、既存のコードを変更せずに、以下の2つの拡張機能を追加しました：

1. **サービス推薦機能の強化**: トリガーワードとローカルLLMを組み合わせて、より自然なサービス推薦の提案を実現します。
2. **画像生成トリガーの強化**: ユーザーの混乱をより精確に検出し、説明用の画像生成を適切なタイミングで提案します。

これらの機能は既存システムと並行して動作し、既存システムが検出できない場合のみ追加の分析を行います。

## ファイル構成

- `enhancedRecommendationTrigger.js`: サービス推薦の拡張検出ロジック
- `enhancedConfusionDetector.js`: 混乱検出の拡張ロジック
- `enhancedFeatures.js`: 上記2つのモジュールをまとめた統合インターフェース
- `enhancedFeaturesUsage.js`: 使用例（参考用）
- `testEnhancedFeatures.js`: 機能テスト用スクリプト

## 1. サービス推薦機能の強化

### 機能説明

サービス推薦機能を以下の2段階の検出方法で強化しています：

1. **トリガーワード検出**:
   - 「オススメ」「サービス」などの直接的な推薦要求を検出
   - 高速で信頼性の高い検出が可能
   - 既存の`detectAdviceRequest`関数と連携

2. **ローカルLLM分析**:
   - より間接的な推薦要求や曖昧な表現を理解
   - 「私の状況に合ったものはありますか？」などの表現も検出可能
   - GPT-4o-miniモデルを使用

### 使用方法

```javascript
// enhancedFeaturesをインポート
const enhancedFeatures = require('./enhancedFeatures');

// 既存システムで検出
const isExplicitAdviceRequest = detectAdviceRequest(userMessage, history);

// 既存システムで検出されなかった場合のみ拡張検出を実行
if (!isExplicitAdviceRequest) {
  const shouldShowRecommendations = await enhancedFeatures.shouldShowServiceRecommendations(userMessage);
  // shouldShowRecommendationsがtrueの場合、サービス推薦を表示
}
```

## 2. 画像生成トリガーの強化

### 機能説明

ユーザーの混乱検出とそれに伴う画像生成提案を以下の2段階で強化しています：

1. **キーワード検出**:
   - 「わからない」「もっと詳しく」などの混乱表現を検出
   - 高速で信頼性の高い検出が可能
   - 既存の`isConfusionRequest`関数と連携

2. **ローカルLLM分析**:
   - 暗黙的な混乱表現や文脈依存の理解困難を検出
   - 「違う言い方で説明できますか？」などの間接的表現も検出
   - 前回のアシスタント応答も考慮して分析

### 使用方法

```javascript
// enhancedFeaturesをインポート
const enhancedFeatures = require('./enhancedFeatures');

// 既存システムで検出
const isConfused = isConfusionRequest(userMessage);

// 既存システムで検出されなかった場合のみ拡張検出を実行
if (!isConfused) {
  const previousResponse = lastAssistantMessage ? lastAssistantMessage.content : null;
  const shouldGenerateImage = await enhancedFeatures.shouldGenerateImage(userMessage, previousResponse);
  // shouldGenerateImageがtrueの場合、画像生成を提案
}
```

## パフォーマンスと効率性

- **キャッシュ機構**: LLM APIコールの結果をキャッシュし、類似リクエストに対する応答時間を短縮
- **段階的検出**: 高速なキーワード検出を最初に実施し、必要な場合のみLLM分析を実行
- **エラー処理**: LLM APIの障害発生時は既存システムにフォールバック
- **軽量モデル**: GPT-4o-miniを使用して応答時間とコストを抑制

## テスト方法

テストスクリプト`testEnhancedFeatures.js`を実行して機能を検証できます：

```bash
node testEnhancedFeatures.js
```

このスクリプトは以下を検証します：
- 直接的な推薦/混乱表現の検出
- 間接的な推薦/混乱表現の検出
- 非推薦/非混乱表現の正しい判別
- キーワード検出とLLM検出の連携

## 統合のポイント

1. **既存機能を尊重**: 既存システムの結果を優先し、既存検出で十分な場合は拡張機能を使用しない
2. **追加のみ**: 既存コードを変更せず、追加の判断ロジックとして実装
3. **フォールバック**: エラー時は既存システムの結果を使用
4. **性能を維持**: 効率的な実装で応答時間への影響を最小化

## 注意点

1. OpenAI APIキーが必要です（既存システムと共有）
2. LLM関連の機能は、APIキーが設定されていない場合は自動的にキーワード検出のみにフォールバックします
3. 本番環境では、拡張機能の呼び出しタイミングとエラーハンドリングに特に注意してください

---

## 技術的詳細

### EnhancedRecommendationTrigger

推薦トリガー検出の内部実装は以下の3つのメソッドを持ちます：

- `hasRecommendationTrigger()`: キーワードベースの検出（同期）
- `isRequestingRecommendationsWithLLM()`: LLMベースの検出（非同期）
- `shouldShowRecommendations()`: 両方を組み合わせた判断（非同期）

### EnhancedConfusionDetector

混乱検出の内部実装は以下の3つのメソッドを持ちます：

- `hasConfusionKeywords()`: キーワードベースの検出（同期）
- `isConfusedWithLLM()`: LLMベースの検出（非同期）
- `shouldGenerateImage()`: 両方を組み合わせた判断（非同期）

### LLMプロンプト設計

両機能のLLMプロンプトは以下のように設計されています：

1. 専門家ペルソナを設定
2. 具体的な例を提示
3. 明確な判断基準を指定
4. 出力形式を限定（「RECOMMENDATION_REQUESTED」や「CONFUSED」のみ）

### パフォーマンス最適化とWebhook処理

リクエスト処理のパフォーマンスを最適化するため、以下の改善を実装しています：

- **即時レスポンス戦略**: Webhookエンドポイントがメッセージを受信後、即座に200 OKレスポンスを返し、実際の処理はバックグラウンドで行います
- **非同期イベント処理**: `Promise.all`と`async/await`を使用して複数のイベントを並行処理し、全体のレスポンスタイムを短縮
- **拡張タイムアウト設定**: 内部タイムアウト設定を120秒に延長し、AIモデルによる応答生成などの時間のかかる処理を確実に完了
- **エラー隔離**: 個別イベントの処理エラーが他のイベント処理に影響しないように隔離

**コード例:**
```javascript
// Webhook処理の最適化例
app.post('/webhook', rawBodyParser, line.middleware(config), (req, res) => {
  // 即座に200 OKを返す
  res.status(200).json({
    message: 'Webhook received, processing in background'
  });
  
  // 処理をバックグラウンドで継続
  (async () => {
    try {
      // 各イベントを非同期で処理
      const results = await Promise.all(req.body.events.map(event => {
        return Promise.resolve().then(() => handleEvent(event))
          .catch(err => {
            console.error(`Error handling event:`, err);
            return null; // エラーを隔離して処理を継続
          });
      }));
      
      console.log(`Webhook processing completed for ${results.filter(r => r !== null).length} events`);
    } catch (err) {
      console.error('Webhook background processing error:', err);
    }
  })();
});
```

この実装により、Herokuの30秒タイムアウト制限に関係なく、すべてのユーザーメッセージが確実に処理されるようになりました。 

## 強化されたMLリポジトリについて

コードは予測可能性と理解しやすさを重視して実装され、以下の原則に従っています：

1. エラー処理: すべての非同期関数はエラー処理を持ち、適切なフォールバックを提供
2. カプセル化: 各モジュールは内部の詳細を隠蔽し、明確なインターフェースを提供
3. パフォーマンス: キャッシングとリクエスト最小化で効率的な実行を保証
4. 堅牢性: エッジケースや障害に強い設計
5. 拡張性: 容易に新しい機能を追加可能な構造

## 4. 拡張機械学習データシステム (Enhanced ML Data System)

**ファイル:** `localML.js`, `conversationHistory.js`

ユーザーとの会話を分析し、時間の経過とともに変化するユーザー特性を追跡するための機械学習データシステムを強化しました。これにより、AIはユーザーの特性やトピック関心の変化を理解し、よりパーソナライズされた応答を生成できるようになりました。

**主な機能:**
- 機械学習データの履歴化（上書きせず新しいレコードとして保存）
- 分析パターン詳細情報の透明化（45種類のパターン情報をデータに含める）
- 拡張された会話分析（200件の会話履歴を対象に分析）
- Airtable互換の日付フォーマット処理（MM/DD/YYYY形式）
- 最適化された会話履歴取得ロジック

**改善点:**
- ユーザー特性の時系列変化の追跡が可能に
- 機械学習の内部動作の透明性向上（パターン検出の仕組みが可視化）
- より長期的なコンテキストに基づいた正確な特性分析
- 豊富なデータに基づくAIの理解度と応答の質の向上

**技術的詳細:**
- `pattern_details`フィールドに45種類のパターン情報（コミュニケーションスタイル、関心トピック、感情表現など）を保存
- `timestamp`フィールドによる時系列分析基盤の構築
- `_formatDateForAirtable`メソッドによるAirtable互換の日付フォーマット処理
- 会話履歴の拡張取得と効率的なソート処理

**データ構造:**
```javascript
{
  "traits": {
    "emotional_tone": "curious",
    // その他の特性情報
  },
  "topics": {
    "primary_interests": ["lifestyle"],
    // その他のトピック情報
  },
  "response_preferences": {
    "length": "balanced",
    "tone": "balanced"
  },
  "pattern_details": {
    // 45種類のパターン情報
    "communicationPatterns": { /* 詳細 */ },
    "interestPatterns": { /* 詳細 */ },
    "emotionalPatterns": { /* 詳細 */ }
  },
  "timestamp": "2025-03-13T14:10:12.977Z"
}
```

**使用例:**
```javascript
// 機械学習処理の実行
const analysisResult = await localML.enhanceResponse(userId, userMessage, 'general');

if (analysisResult) {
  console.log(`ユーザー特性: ${JSON.stringify(analysisResult.traits)}`);
  console.log(`関心トピック: ${JSON.stringify(analysisResult.topics)}`);
  console.log(`応答設定: ${JSON.stringify(analysisResult.response_preferences)}`);
  
  // 分析結果をAI応答生成に活用
  const aiPrompt = generateSystemPrompt(analysisResult);
  // AIに送信
}
```

**実装の詳細:**
```javascript
// 分析データの永続化（新規レコードとして保存）
async _saveUserAnalysis(userId, mode, analysisData) {
  try {
    // パターン検出の詳細情報を追加
    const enhancedAnalysisData = {
      ...analysisData,
      pattern_details: this._getPatternDetails(mode),
      timestamp: new Date().toISOString()
    };
    
    // 分析データをJSON文字列に変換
    const analysisDataString = JSON.stringify(enhancedAnalysisData);
    
    // 常に新しいレコードとして保存（履歴化）
    const data = {
      UserID: userId,
      Mode: mode,
      AnalysisData: analysisDataString,
      LastUpdated: this._formatDateForAirtable(new Date())
    };
    
    // 新規作成
    await this.base('UserAnalysis').create([{ fields: data }]);
    console.log(`    └─ 新しい分析データを作成しました: ユーザー ${userId}, モード ${mode}`);
  } catch (error) {
    // エラー処理
  }
}
```

この強化により、アプリケーションはユーザーとの対話を通じて学習し、時間の経過とともにユーザーへの理解を深め、より適切な応答を提供できるようになりました。 