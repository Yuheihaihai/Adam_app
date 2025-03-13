# Enhanced Features Documentation

## オリジナル機能の強化と改善 (Enhancement of Original Features)

このドキュメントでは、AIアシスタントアプリケーションの強化された機能について説明します。

### 1. 強化された推薦トリガーシステム (Enhanced Recommendation Trigger System)

**ファイル:** `enhancedRecommendationTrigger.js`

サービス推薦機能を強化し、ユーザーのメッセージ内容からサービスのニーズをより正確に検出します。LLMを使用して、ユーザーの質問や状況から最適なサービスを特定します。

**主な機能:**
- 高度なLLMベースのサービス分析（LLM応答解析の脆弱性を修正）
- キャッシュシステムによるAPI呼び出しの最適化（無限キャッシュ増大リスクを修正）
- 動的な信頼度閾値によるサービス推薦の精度向上
- マルチバイト文字（日本語）の安全な処理
- OpenAI APIレート制限への対応強化（タイムアウト設定とリトライロジック）
- モデル可用性の問題に対するフォールバック機構

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