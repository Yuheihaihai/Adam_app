# Adam AI アプリケーションアーキテクチャ

## 全体構成

Adam AIアプリケーションは、発達障害を持つユーザーをサポートするチャットボットアプリケーションで、以下のコンポーネントで構成されています：

1. サーバーサイド (Node.js)
2. AI応答生成 (OpenAI API)
3. データベース (Airtable & PostgreSQL)
4. 機械学習コンポーネント (localML)
5. サービス推薦システム
6. 画像生成・分析機能
7. 音声処理機能
8. テスト自動化フレームワーク

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

- **プライマリ**: Airtable
  - 会話履歴
  - ユーザー分析データ
  - サービス情報
  - 機械学習データ

- **セカンダリ**: PostgreSQL
  - 会話履歴のバックアップ
  - 高速クエリのサポート

### 4. 機械学習コンポーネント

#### 4.1 概要
本システムの機械学習機能は、外部の高度な AI/ML API と、ローカルで実行される特定のタスクに特化した TensorFlow.js モデルを組み合わせたハイブリッド構成です。

#### 4.2 外部 AI/ML API の利用
多様なタスクに対応するため、複数の外部 API を活用しています。

- **主要な応答生成・分析:**
  - **OpenAI GPT (GPT-3.5, GPT-4oなど):** ユーザーとの対話応答生成のコア (`server.js` 内 `processWithAI` など)。
  - **Google Gemini AI:** 会話履歴からのユーザー特性分析 (`enhancedCharacteristicsAnalyzer.js`)。OpenAI へのフォールバックあり。
  - **Anthropic Claude:** 特定コマンド (`Claudeモードで〜`) による直接呼び出し、API フォールバック (`server.js`)。
- **特定タスク向け API:**
  - **Perplexity AI:** Web 検索、情報収集、適職診断サポート (`perplexitySearch.js`)。
  - **OpenAI DALL-E:** テキストからの画像生成 (`imageGenerator.js`)。
  - **OpenAI Whisper:** 音声メッセージのテキスト変換 (`audioHandler.js`)。
  - **OpenAI TTS:** テキスト応答の音声合成 (`audioHandler.js`)。
  - **OpenAI Embeddings:** 意味的類似度計算など (主に `localML.js` で利用される想定)。
- **利用箇所:** 主に `server.js`, `enhancedCharacteristicsAnalyzer.js`, `perplexitySearch.js`, `imageGenerator.js`, `audioHandler.js` から呼び出されます。

#### 4.3 ローカル TensorFlow.js モデル
特定のタスクについては、ローカルで実行可能なモデルを実装しています。

- **意図検出モデル (`intentDetectionModel.js`):**
  - **ステータス:** **アクティブ**
  - **実装:** TensorFlow.js を使用。
  - **利用箇所:** `/api/intent/*` エンドポイント (`routes/api/intent.js`) 経由で利用。テキストの意図を分類し、フィードバックによる再学習機能も持つ。
- **感情分析モデル (`emotionAnalysisModel.js`):**
  - **ステータス:** **非アクティブ (またはデッドコード)**
  - **実装:** TensorFlow.js を使用したモデルファイルは存在する。
  - **利用箇所:** 現在のコードベースでは、**このモデルを呼び出している箇所は確認されていません。**

- **主要ファイル**: `localML.js` (Embeddings API利用やその他のローカル処理を担当する可能性あり), `intentDetectionModel.js` (アクティブ), `emotionAnalysisModel.js` (非アクティブ)

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
- **主な機能**:
  - 説明的な画像の生成
  - アップロードされた画像の分析
  - 視覚的な説明と教育コンテンツの提供
  - 画像安全性チェック

### 7. 音声処理機能

- **主要ファイル**: `audioHandler.js`
- **音声認識**: OpenAI Whisper
- **音声合成**: テキスト読み上げAPI
- **リアルタイム音声**: Azure RT Client (ESMモジュールによる動的インポート)
- **主な機能**:
  - 音声メッセージの文字起こし
  - 音声での応答生成
  - 音声特性のカスタマイズ（声タイプ、速度など）
  - 音声利用制限の管理（ユーザー日次上限、グローバル月間上限）
  - 障害時のフォールバック処理（代替音声合成）

### 8. テスト自動化フレームワーク

- **主要ファイル**: 
  - `test-career.js`: 適職診断機能のテスト
  - `test-all-features.js`: 全機能統合テスト
  - `test-e2e.js`: エンドツーエンドのシナリオベーステスト
  - `test-api.sh`: APIエンドポイントテスト
  - `system-test.js`: 本番環境へのAPIテスト
  - `standalone-career-test.js`: キャリア分析機能の単体テスト
  - `test-structure.js`: API構造検証テスト

- **テスト構成**:
  - 基本会話 (一般的な質問応答)
  - 発達障害に関する質問 (情報提供機能)
  - 特性分析 (個人特性の分析機能)
  - キャリア分析 (適職診断機能)
  - 画像生成リクエスト
  - 音声機能関連
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

- **テストカバレッジ**:
  - サーバーAPI (generateCareerAnalysis, generateAIResponse, handleText, handleImage, handleAudio)
  - 音声処理API (transcribeAudio, generateAudioResponse, detectVoiceChangeRequest, getUserVoicePreferences)
  - 特性分析API (analyzeCharacteristics, getRecentCharacteristics)
  - エンドポイント (`/test/message`, `/api/audio`)
  - 会話モード判定 (general, characteristics, career, deep-exploration)

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
   - 機械学習による分析
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
   - 音声の文字起こし
   - テキストとして処理（上記のテキスト処理フロー）
   - 応答テキストの音声合成
   - 音声ファイルのユーザーへの送信

## 拡張性と変更点

1. **最新モデルへの更新**:
   - OpenAI GPT-4oの最新版を利用
   - 常に最新版を使うためのバージョン指定方法を採用

2. **データベース拡張**:
   - PostgreSQLとAirtableの併用
   - 冗長性確保とクエリパフォーマンス向上

3. **意味理解の強化**:
   - OpenAI Embeddings APIによる意味的テキスト理解
   - キーワードマッチングから意味ベースの分析へ

4. **エラー処理の強化**:
   - フォールバックメカニズムの実装
   - 詳細なエラーログ
   - ユーザー体験を損なわないエラー対応

5. **テスト自動化**:
   - 包括的なテストスイートの実装
   - 全機能をカバーする100パターンのテスト
   - 継続的な品質保証と回帰テスト

## セキュリティ対策

1. **入力検証**:
   - ユーザー入力の検証
   - 悪意のあるコードとXSSの防止
   - 入力の長さ制限

2. **レート制限**:
   - 過剰なリクエストの制限
   - DoS攻撃からの保護
   - 音声メッセージAPIへの専用レート制限

3. **CSRF保護**:
   - 安全なcsrfパッケージ（3.1.0）を使用したトークンベースの保護
   - CSRFトークン検証のカスタム実装
   - Webhookエンドポイント以外のすべてのPOSTリクエストを保護
   - 正規ホストからのリクエスト確認

4. **安全性チェック**:
   - 画像の安全性審査
   - テキストコンテンツの不適切検出
   - 安全でないコンテンツのブロック

5. **データ保護**:
   - 個人を特定できる情報の保護
   - 会話データのセキュアな保存
   - 暗号化通信（HTTPS）の強制

6. **依存関係の管理**:
   - 最新かつセキュアなパッケージバージョンの使用
   - 定期的な脆弱性スキャンと修正
   - 不要な依存関係の削除

## デプロイメント

- **ホスティング**: Heroku
- **環境変数**: 設定はすべて環境変数で管理
- **スケーリング**: 自動スケールによる負荷対応
- **監視**: エラーログとパフォーマンスの監視 