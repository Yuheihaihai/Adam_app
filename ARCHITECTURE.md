# Adam AI アプリケーションアーキテクチャ v2.4

## 全体構成

Adam AIアプリケーションは、発達障害を持つユーザーをサポートするチャットボットアプリケーションで、以下のコンポーネントで構成されています：

1. サーバーサイド (Node.js)
2. AI応答生成 (OpenAI API)
3. データベース (Airtable & PostgreSQL)
4. 機械学習コンポーネント (TensorFlow.js + localML)
5. サービス推薦システム
6. 画像生成・分析機能 (DALL-E 3)
7. 音声処理機能 (Whisper + TTS)
8. テスト自動化フレームワーク
9. セキュリティ・制御システム

## 主要コンポーネント詳細

### 1. サーバーサイド

- **主要ファイル**: `server.js`
- **フレームワーク**: Express.js
- **主な機能**:
  - Webhookエンドポイント提供
  - ユーザーメッセージの処理
  - AIモデルとの連携
  - 会話履歴の管理
  - 特殊モード (deep exploration, confusion mode) の検出と処理
  - メッセージのセキュリティフィルタリング
  - 画像・音声処理の統合
  - ユーザーセッション管理（`sessions`オブジェクト）

### 2. AI応答生成

- **使用モデル**: OpenAI `chatgpt-4o-latest` (GPT-4o最新版)
- **フォールバックモデル**: Claude 3 Sonnet
- **代替モデル**: Google Gemini 1.5 Pro (キャリア分析機能)
- **主な機能**:
  - ユーザーメッセージへの応答生成
  - 会話文脈の理解
  - ユーザーのニーズと特性の把握
  - 専門的な発達障害関連の情報提供
  - 二段階レビュー機能による応答品質の向上
  - 適職診断と職業推奨 (`generateCareerAnalysis`関数)
    - 具体的な職業推奨（5つ以上の候補）
    - 推奨職業の説明と適性理由
    - 理想的な職場環境と社風の特定
    - キャリア向上のためのスキル推奨
    - Google Gemini 1.5 ProをメインモデルとしてOpenAIにフォールバック

### 3. データベース

- **プライマリ**: PostgreSQL [[memory:2202586]]
  - 会話履歴（64,184件以上のメッセージ）
  - ユーザー分析データ（411人のユーザー）
  - サービス情報
  - 機械学習データ
  - セマンティック検索用エンベディング
  - 意図検出トレーニングデータ

- **レガシー/フォールバック**: Airtable
  - PostgreSQLエラー時の自動フォールバック
  - 移行期間中の読み取り専用アクセス
  - 一部の管理機能での使用

- **セキュリティ機能**:
  - エンドツーエンド暗号化（AES-256-GCM）
  - ユーザーID分離（SHA-256ハッシュ化）
  - ゼロ知識証明
  - 180日自動削除ポリシー
  - 差分プライバシー（ε=1.0）

### 4. 機械学習コンポーネント

#### 4.1 概要
本システムの機械学習機能は、外部の高度な AI/ML API と、ローカルで実行される TensorFlow.js モデルを組み合わせたハイブリッド構成です。

#### 4.2 外部 AI/ML API の利用
多様なタスクに対応するため、複数の外部 API を活用しています。

- **主要な応答生成・分析:**
  - **OpenAI GPT (GPT-4o Latest):** ユーザーとの対話応答生成のコア (`server.js` 内 `processWithAI` など)
  - **Google Gemini AI:** 会話履歴からのユーザー特性分析 (`enhancedCharacteristicsAnalyzer.js`)。OpenAI へのフォールバックあり
  - **Anthropic Claude:** 特定コマンド (`Claudeモードで〜`) による直接呼び出し、API フォールバック (`server.js`)
- **特定タスク向け API:**
  - **Perplexity AI:** Web 検索、情報収集、適職診断サポート (`perplexitySearch.js`)
  - **OpenAI DALL-E 3:** テキストからの画像生成 (`imageGenerator.js`)
  - **OpenAI Whisper:** 音声メッセージのテキスト変換 (`audioHandler.js`)
  - **OpenAI TTS:** テキスト応答の音声合成 (`audioHandler.js`)
  - **OpenAI Embeddings:** 意味的類似度計算、感情分析、トピック分析 (`localML.js`, `embeddingService.js`)

#### 4.3 ローカル TensorFlow.js モデル
特定のタスクについては、ローカルで実行可能なモデルを実装しています。

- **感情分析モデル (`emotionAnalysisModel.js`):**
  - **ステータス:** **アクティブ（v2.4で統合完了）**
  - **実装:** TensorFlow.js を使用したBidirectional LSTM + 埋め込み層
  - **感情カテゴリ:** 8種類（喜び、悲しみ、怒り、不安、驚き、混乱、中立、その他）
  - **利用箇所:** `localML.js`の`_analyzeEmotionalSentiment()`メソッドで統合
  - **ハイブリッド方式:** TensorFlow.js結果と埋め込みベース分析を組み合わせ
  - **バックエンド:** Heroku本番環境でTensorFlow.js Node native backendを使用

- **意図検出モデル (`intentDetectionModel.js`):**
  - **ステータス:** **アクティブ**
  - **実装:** TensorFlow.js を使用
  - **利用箇所:** `/api/intent/*` エンドポイント (`routes/api/intent.js`) 経由で利用
  - **機能:** テキストの意図を分類し、フィードバックによる再学習機能

- **主要ファイル**: `localML.js` (TensorFlow.js統合とEmbeddings API利用), `emotionAnalysisModel.js` (アクティブ), `intentDetectionModel.js` (アクティブ)

#### 4.4 LocalML統合システム
- **ハイブリッド感情分析:**
  - 第1段階: TensorFlow.jsモデルによる感情分析
  - 第2段階: 強度が0.6未満の場合、埋め込みベース分析を併用
  - 第3段階: 両結果を比較して最適な感情を選択
  - フォールバック: エラー時は正規表現ベースの分析

- **3つの分析モード:**
  - general: 一般的な会話分析
  - mental_health: メンタルヘルス特化分析
  - analysis: 詳細な特性分析

### 5. サービス推薦システム

- **主要ファイル**: `serviceRecommender.js`
- **データソース**: Airtable ServiceInfoテーブル
- **主な機能**:
  - ユーザーニーズの分析
  - 適切なサービスの推薦
  - 地域に基づいたサービスのフィルタリング
  - サービス情報の取得と整形

### 6. 画像生成・分析機能

- **画像生成**: OpenAI DALL-E 3モデル
- **画像分析**: OpenAI GPT-4 Vision
- **混乱検出システム**: 
  - パターンベース検出とLLMベース検出の二段階システム
  - 「わからない」「説明して」等の表現を自動検出
  - 混乱検出時に画像による説明を提案
- **主な機能**:
  - 説明的な画像の生成（1024x1024、高品質）
  - アップロードされた画像の分析
  - 視覚的な説明と教育コンテンツの提供
  - 画像安全性チェック
  - 一時ファイル管理とLINE配信

### 7. 音声処理機能

- **主要ファイル**: `audioHandler.js`
- **音声認識**: OpenAI Whisper
- **音声合成**: OpenAI TTS
- **リアルタイム音声**: Azure RT Client (ESMモジュールによる動的インポート)
- **主な機能**:
  - 音声メッセージの文字起こし
  - 音声での応答生成
  - 音声特性のカスタマイズ（声タイプ、速度など）
  - 音声利用制限の管理（ユーザー日次上限：3回、グローバル月間上限：2000回）
  - 障害時のフォールバック処理（代替音声合成）

### 8. テスト自動化フレームワーク

- **主要ファイル**: 
  - `comprehensive-feature-test-full-services.js`: 全機能統合テスト
  - `test-career.js`: 適職診断機能のテスト
  - `test-all-features.js`: 全機能統合テスト
  - `test-e2e.js`: エンドツーエンドのシナリオベーステスト
  - `test-api.sh`: APIエンドポイントテスト
  - `system-test.js`: 本番環境へのAPIテスト

- **テスト構成**:
  - 基本会話 (一般的な質問応答)
  - 発達障害に関する質問 (情報提供機能)
  - 特性分析 (個人特性の分析機能)
  - キャリア分析 (適職診断機能)
  - 画像生成リクエスト
  - 音声機能関連
  - TensorFlow.js感情分析機能
  - エラーケース

- **主な機能**:
  - 全機能の自動テスト実行
  - 質的チェック (応答の内容が適切かどうか)
  - 会話履歴を活用したシナリオテスト
  - 対話型テストとバッチテスト両方のサポート
  - API検証と応答分析
  - 本番環境への負荷テスト
  - 単体テストと統合テスト
  - API構造の整合性チェック
  - テスト結果のレポーティング

### 9. セキュリティ・制御システム

- **セキュリティ機能**:
  - XSSフィルタリング: 悪意のあるスクリプト除去
  - CSRFトークン: リクエスト偽造防止（csrf 3.1.0使用）
  - レート制限: API乱用防止
  - 入力検証: メッセージ長制限とサニタイゼーション

- **特殊モード検出**:
  - Deep Exploration: 深掘り質問モード
  - Confusion Mode: 混乱検出と画像生成提案
  - Admin Command: 管理者コマンド処理
  - Direct Image Request: 直接的な画像生成要求

## 処理フロー

1. **ユーザーメッセージの受信**:
   - LINE Webhook、または他のチャネルからメッセージを受信
   - メッセージの種類（テキスト、画像、音声）を判別

2. **メッセージの処理**:
   - テキストメッセージの場合: `handleText`関数で処理
   - 画像メッセージの場合: `handleImage`関数で処理
   - 音声メッセージの場合: `handleAudio`関数で処理

3. **テキストメッセージ処理フロー**:
   - セキュリティフィルタリング
   - 特殊コマンドの検出（履歴クリア、ヘルプなど）
   - モード判定（通常、Deep Exploration、Confusion Mode）
   - ユーザー履歴の取得
   - **TensorFlow.js機械学習による分析**:
     - LocalMLクラスによる感情分析（TensorFlow.js + 埋め込みベース）
     - ユーザー特性の抽出と分析
     - 分析結果のAirtable保存
   - 適切なシステムプロンプトの構築
   - AI応答の生成
   - 応答の後処理（サービス推薦の挿入など）
   - 会話の保存
   - ユーザーへの応答送信

4. **画像処理フロー**:
   - 画像の安全性チェック
   - 画像の分析（GPT-4 Vision）
   - 分析結果に基づく応答生成
   - 会話履歴への保存
   - ユーザーへの応答送信

5. **音声処理フロー**:
   - 音声の文字起こし（Whisper）
   - テキストとして処理（上記のテキスト処理フロー）
   - 応答テキストの音声合成（TTS）
   - 音声ファイルのユーザーへの送信

6. **混乱検出・画像生成フロー**:
   - 混乱表現の検出（パターンベース + LLMベース）
   - 画像による説明の提案
   - ユーザー同意後のDALL-E 3による画像生成
   - 生成画像のLINE配信

## 技術スタック

### 主要技術
```json
{
  "Backend": "Node.js + Express.js",
  "AI/ML": "TensorFlow.js + OpenAI APIs + Google Gemini + Anthropic Claude",
  "Database": "Airtable + PostgreSQL",
  "Image": "DALL-E 3 + GPT-4 Vision",
  "Audio": "OpenAI Whisper + TTS",
  "Security": "Helmet + XSS + CSRF (csrf 3.1.0)",
  "Testing": "Jest + Custom Framework",
  "ML Framework": "TensorFlow.js Node (Native Backend)"
}
```

### API統合
- **OpenAI**: GPT-4o Latest, DALL-E 3, Whisper, TTS, Embeddings
- **Anthropic**: Claude 3 Sonnet（フォールバック）
- **Google**: Gemini 1.5 Pro（キャリア分析）
- **Perplexity**: Web検索・情報収集
- **LINE**: Messaging API
- **Airtable**: データ永続化
- **PostgreSQL**: 高速クエリ

## デプロイメント情報

- **ホスティング**: Heroku
- **現在のバージョン**: v2.4 (Heroku Release v778)
- **TensorFlow.js**: Node native backend（本番環境で高性能）
- **環境変数**: 設定はすべて環境変数で管理
- **スケーリング**: 自動スケールによる負荷対応
- **監視**: エラーログとパフォーマンスの監視

## 最新の改善点（v2.4）

1. **TensorFlow.js感情分析の統合**:
   - 8種類の感情分析（喜び、悲しみ、怒り、不安、驚き、混乱、中立、その他）
   - ハイブリッド方式（TensorFlow.js + 埋め込みベース）
   - 本番環境でNative Backend使用による高性能化

2. **LocalMLシステムの強化**:
   - TensorFlow.js感情分析モデルの統合
   - 感情強度に基づく適応的分析手法
   - 分析結果の永続化とユーザー特性学習

3. **画像生成機能の高度化**:
   - DALL-E 3による高品質画像生成
   - 混乱検出システムの二段階実装
   - 自動的な画像説明提案機能

4. **音声機能の制限管理**:
   - 日次・月次制限による使用量管理
   - 環境変数による制限値設定
   - レート制限ミドルウェアの実装

5. **セキュリティの強化**:
   - 最新のcsrfパッケージ（3.1.0）への更新
   - XSS・CSRF保護の強化
   - 包括的な入力検証

6. **テスト体制の充実**:
   - 105パターン以上の包括的テスト
   - TensorFlow.js機能のテストカバレッジ
   - 本番環境での動作確認 