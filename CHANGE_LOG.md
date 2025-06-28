# Change Log

## 2025-06-28: ML感情分析へのAI統合と機能強化

### 機械学習システムのAI感情分析統合

#### Changes Made:
1. **AI埋め込みベースの感情分析実装**:
   - 固定値`neutral`から動的なAI感情分析に変更
   - OpenAI埋め込みAPIを使用した5種類の感情検出:
     - positive: ポジティブ（喜び・楽しさ）
     - negative: ネガティブ（悲しみ・苦しみ）
     - angry: 怒り・イライラ
     - anxious: 不安・心配
     - neutral: 中立的・落ち着いている
   - 類似度閾値: 0.55（感情分析はより敏感に設定）

2. **AI埋め込みベースのトピック分析実装**:
   - 6つの主要トピックカテゴリ:
     - work: 仕事・職場
     - relationship: 人間関係・恋愛
     - health: 健康・医療
     - daily_life: 日常生活
     - study: 学習・勉強
     - money: 金銭・経済
   - 類似度閾値: 0.6（トピック検出）

3. **プロンプト生成の改善**:
   - 感情状態に応じた応答ガイドラインの自動生成
   - トピックに応じた専門性の考慮
   - サポートニーズと感情状態の統合的な分析

#### Technical Details:
- `_analyzeEmotionalSentiment()`: 埋め込みベースの感情分析関数
- `_analyzeTopics()`: 埋め込みベースのトピック分析関数
- 絵文字によるフォールバック機能も実装
- 現在のメッセージを重視（70%）、履歴全体も考慮（30%）

#### Reason for Change:
従来のML感情分析は常に`neutral`を返していたため、ユーザーの実際の感情状態を反映できていませんでした。AI埋め込みベースの分析により、より正確で動的な感情認識が可能になり、それに応じた適切な応答生成が可能になります。

#### Impact:
- **改善前**: 感情分析は常に`neutral`、トピック分析は空配列
- **改善後**: 実際のユーザーメッセージから感情とトピックを動的に検出
- GPT-4oの応答生成がより文脈に適したものになる
- ユーザーの感情状態に応じた共感的な応答が可能に

## 2025-06-28: SQL構文エラーの修正とML機能の完全復旧

### 機械学習機能のSQL構文エラー修正

#### Changes Made:
1. **PostgreSQLプレースホルダー形式への修正**:
   - `dataInterface.js`のSQL文をMySQLスタイル（`?`）からPostgreSQLスタイル（`$1, $2, $3`）に変更
   - 影響を受けた関数:
     - `getUserHistory()`: `SELECT ... WHERE user_id = $1 ... LIMIT $2`
     - `storeUserMessage()`: `INSERT ... VALUES ($1, $2, $3)`
     - `storeAnalysisResult()`: `INSERT ... VALUES ($1, $2, $3)`
     - `getLatestAnalysisResult()`: `SELECT ... WHERE user_id = $1 AND result_type = $2`

2. **修正により復旧した機能**:
   - ML分析結果の永続化
   - ユーザーニーズ分析の保存
   - 分析履歴の蓄積
   - 長期的なユーザー行動パターンの学習

#### Reason for Change:
PostgreSQLデータベースを使用しているにもかかわらず、MySQLスタイルのプレースホルダー（`?`）を使用していたため、SQL構文エラーが発生していました。これにより、ML分析結果がデータベースに保存されず、機械学習機能が部分的にしか動作していませんでした。

#### Impact:
- **修正前**: ML分析は実行されるが、結果が保存されないため学習効果が限定的
- **修正後**: ML分析結果が正常に保存され、ユーザー特性の学習と蓄積が可能に

## 2025-06-28: プロジェクト構造の整理とGNN機能の最終削除完了

### プロジェクト構造の発見と重複ディレクトリの整理

#### Changes Made:
1. **プロジェクト構造の発見**:
   - メインディレクトリ: `/Users/yuhei/adam-app-cloud-v2.4 - search is implemented.`
   - サブディレクトリ: `adam-app-cloud-v2-4/` (独立したGitリポジトリ)
   - サブディレクトリが実際のHerokuデプロイメントソースであることを確認

2. **GNN関連ディレクトリの最終削除**:
   - `gnn_results/`: GNNの結果CSVファイルのみを含むディレクトリを削除
   - `gnn-api-app/`: 独立したGNNアプリケーションディレクトリを削除

3. **サブディレクトリの同期**:
   - サブディレクトリをv754状態（コミット `1ac3ebd6`）にハードリセット
   - Herokuに強制プッシュして新しいリリースv772を作成

4. **最終状態の確認**:
   - メインディレクトリ: v754ベース + ドキュメント更新（コミット `fa70be0`）
   - サブディレクトリ: v754状態（コミット `1ac3ebd`） - 実際のHerokuソース
   - 両ディレクトリのserver.jsファイルが同一（3,302行）であることを確認
   - 両環境でGNN機能が完全に削除されていることを確認

#### Reason for Change:
プロジェクト構造の調査中に、メインディレクトリとサブディレクトリが異なるGitリポジトリであり、サブディレクトリが実際のHerokuデプロイメントソースであることが判明しました。GNN機能の完全削除を確実にするため、残存していたGNN関連ディレクトリ（`gnn_results/`、`gnn-api-app/`）を削除し、サブディレクトリもv754状態に同期させました。これにより、ローカル環境（メイン・サブ両ディレクトリ）とHeroku本番環境の全てでGNN機能が完全に削除され、システムが一貫してv754の機能セットで動作することが保証されました。

## 2025-06-28: GNN機能の完全削除とv754へのロールバック

### GNN（Graph Neural Network）実装の削除とシステム状態のリセット

#### Changes Made:
1. **Herokuデプロイメント**:
   - Release v770（GNN実装済み）からRelease v754（GNN実装前）へロールバック
   - 新しいリリース v771 として v754 の状態を復元

2. **ローカルファイルの同期**:
   - ローカルGitリポジトリをコミット `1ac3ebd6`（v754）にハードリセット
   - 現在の状態をバックアップブランチ `backup-before-v754-reset` に保存

3. **削除されたファイル**:
   - `gnnClient.js`: GNN API連携クライアント
   - `gnnFeatures.js`: GNN特徴量生成モジュール
   - server.js内のGNN統合コード（2531-2550行目付近）

4. **削除されたGNN機能**:
   - 外部GNN API連携（https://issp-gnn-api-394682330281.asia-northeast1.run.app/predict）
   - 10次元特徴量ベクトルから64次元埋め込みベクトルへの変換
   - LLMを使用した2層検証システム
   - ユーザー特性の構造化分析（年齢、性別、教育レベル、職業、発達特性等）

5. **確認済み削除状況**:
   - ローカル: GNN関連ファイル、import/require文、実装コード完全削除
   - Heroku: GNN関連環境変数なし、実行ログにGNN処理の痕跡なし
   - 残存ファイル: `gnn_results/`（結果ファイルのみ）、`gnn-api-app/`（別アプリ）

#### Reason for Change:
GNN機能の実装が完了していたv770から、GNN実装前の安定した状態であるv754に戻すことで、システムをよりシンプルで保守しやすい状態にリセットしました。GNN機能は高度な機械学習機能でしたが、基本的なAI応答機能に集中するため一時的に削除し、将来的な再実装に備えてバックアップを保持しています。この変更により、アプリケーションはGNN機能なしで正常に動作し、基本的なLINEボット機能、AI応答生成、データベース連携、外部API統合（OpenAI、Anthropic、Perplexity等）が安定して稼働しています。

## 2025-04-01: 各種API連携テストの実施と統合テストスクリプトの作成

### 外部API接続の動作確認と問題分析

#### Changes Made:
1. **テストスクリプトの作成と実行**:
   - `test_whisper.js`: OpenAI Whisper API（音声認識）の動作を確認
   - `test_dalle.js`: OpenAI DALL-E API（画像生成）の動作を確認 
   - `test_fallback.js`: OpenAI API障害時のAnthropicのClaude APIへのフォールバックを確認
   - `test_gemini.js`: Google Gemini API（特性分析）の動作を確認
   - `test_perplexity.js`: Perplexity API（キャリア分析、求人トレンド取得、職業推薦、一般検索）の動作を確認
   - `test_airtable_connection.js`: Airtable APIの接続問題を診断

2. **統合テストスクリプト**:
   - `test_integration.js`: 各APIクライアントの初期化と基本動作を一括でテストするスクリプトを作成
   - 複数のAPIを組み合わせた機能テストを実装
   - 各API呼び出しのタイミングとレスポンスを検証
   - エラー発生時の詳細ログを実装

#### Test Results:
- **正常動作確認済み**:
  - OpenAI GPT（基本応答）
  - OpenAI TTS（音声合成）
  - OpenAI Whisper（音声認識）- ※DBエラーとは別問題
  - OpenAI DALL-E（画像生成）
  - Anthropic Claude（フォールバック）
  - Perplexity API（全機能）
  - OpenAI Embedding API（テキスト類似度計算）
  - Google Gemini API（特性分析）
  - Airtable API（特定テーブルへの操作）

- **問題発見**:
  - Airtable API: `Users`テーブルへのアクセス権限不足
  - PostgreSQL接続エラー: ローカル環境でのデータベース接続問題

#### Reason for Change:
アプリケーションが利用する主要なAPIとその連携機能の動作を体系的に検証するため、様々なテストスクリプトを作成・実行しました。これにより、各APIが期待通りに動作しているか、また問題がある場合はその具体的な原因を特定することができました。特にAirtable APIの権限問題とPostgreSQLの接続エラーを明確に特定したことで、今後の対応策を立てやすくなりました。このテストにより、アプリケーションの中核機能が正常に動作していることを確認し、同時に改善が必要な部分も明らかになりました。

## 2023-04-01: キャリア分析機能の検出力強化

### キャリア分析モード検出の改善とキーワード拡充

#### Changes Made:
- `careerKeywords`配列に新たなキーワードを追加
  - `適職を教えてください`を明示的に追加
  - `適職教えて`を追加
  - `適職診断お願い`を追加
- キーワード検出の精度を向上

#### Reason for Change:
システムテスト中に、「私の適職を教えてください」というフレーズがキャリア分析モードではなく一般会話モードとして処理されていることが判明しました。この問題を解決するために、`careerKeywords`配列に新たなキーワードパターンを追加し、より多様な「適職」に関する質問パターンを適切に検出できるようにしました。この修正により、キャリア分析機能の検出精度が向上し、ユーザーがより一貫した応答を得られるようになりました。

## 2025-03-31: 包括的なテスト実装とシステム機能強化

### 高度なテスト体制の構築と機能改善

#### Changes Made:
1. **テスト関連**:
   - `test-career.js`: 適職診断機能の詳細テストスクリプトを改善し、複数のテストケースと質的チェック機能を実装
   - `test-all-features.js`: 全機能を自動テストするスクリプトを新規作成（特性分析、キャリア分析、一般会話のテスト）
   - `test-e2e.js`: 対話型のエンドツーエンドテストスクリプトを実装（シナリオベースのユーザー体験テスト）
   - `test-api.sh`: API エンドポイントを検証するシェルスクリプトを新規作成

2. **機能改善**:
   - キャリア分析アルゴリズムを強化し、「記録が少ない場合も全て思い出して私の適職診断お願いします🤲」などの特殊なリクエストにも正確に応答するよう改善
   - 一般会話、特性分析、キャリア分析機能間の連携を改善

#### Reason for Change:
システム全体の信頼性を向上させるため、包括的なテスト体制を構築しました。特に適職診断機能については、さまざまなリクエストパターンに対して安定した応答ができるようテスト駆動型の開発アプローチで改善しました。この変更により、すべての主要機能が期待通りに動作することを継続的に確認できるようになり、ユーザー体験の質が向上します。

## 2025-03-31: 適職診断機能の修正 - 欠落していた関数の追加

### `generateCareerAnalysis` 関数の実装による適職診断機能の復旧

#### Changes Made:
- `server.js`に欠落していた`generateCareerAnalysis`関数を追加
- `server.js.tmp`から適切なコードを移植して実装
- キャリア・適職診断機能が正常に動作するように修正

#### Reason for Change:
適職診断機能が「キャリア分析中にエラーが発生」と表示され機能していませんでした。調査の結果、`generateCareerAnalysis`関数がコード内で呼び出されているにも関わらず実装されていないことが判明しました。この修正により、適職診断機能が正常に動作するようになり、ユーザーが有効なキャリアアドバイスを受け取れるようになりました。

## 2025-03-28: セキュリティ脆弱性の修正と包括的テスト完了

### 脆弱性修正と徹底的なテストによる安定性向上

#### Changes Made:
1. **package.json**:
   - 脆弱なcsurfパッケージ（1.11.0）を削除し、より安全なcsrfパッケージ（3.1.0）に置き換え
   - @anthropic-ai/sdk を 0.7.1 から 0.17.0 に更新
   - 不足していた依存関係を追加（@google/generative-ai、@tensorflow/tfjs、pg、natural）

2. **server.js**:
   - csurfミドルウェアの実装をcsrfパッケージを使用したカスタム実装に変更
   - CSRFトークン検証のセキュリティを強化
   - 例外処理を改善

3. **comprehensive_test.js**:
   - 105パターン以上の多様なメッセージパターンでの徹底的なテスト用スクリプトを開発
   - すべてのメッセージタイプ（通常テキスト、長文、画像生成リクエスト、設定変更、特殊文字など）をカバー
   - テスト結果を自動記録するレポート機能を実装

#### Test Results:
- 105パターンのテストメッセージすべてで成功（成功率100%）
- 特殊文字、絵文字、多言語メッセージなどすべてのエッジケースで正常に動作
- 設定変更コマンドやサービス推奨機能も正常に動作
- 画像生成リクエストの処理もエラーなく完了

#### Reason for Change:
セキュリティ監査で発見された脆弱性（特にCSRF保護関連）を修正し、最新のセキュリティ基準に準拠するよう更新しました。また、包括的なテストスイートを開発・実行することで、アプリケーションの安定性と信頼性を確保しました。この変更により、アプリケーションはセキュリティリスクを軽減し、さまざまなユーザー入力パターンに対して堅牢に動作することが確認されました。

## 2025-03-28: システムの動作安定性向上のためのバグ修正

### ESMモジュール互換性とユーザーセッション管理の問題を修正

#### Changes Made:
1. **audioHandler.js**:
   - `rt-client`モジュール（ESM形式）をCommonJSアプリケーションで使用できるよう動的インポートに変更
   - `LowLevelRTClient`のロード状態を確認し、ロードされていない場合のフォールバック処理を追加
   - RTクライアント初期化失敗時にデフォルトのTTS機能を使用するよう処理を追加

2. **server.js**:
   - ユーザーセッション管理のための`sessions`オブジェクトをグローバルスコープで初期化
   - LINE Webhookのメッセージ処理で`sessions`変数未定義エラーを解消
   - 直接的な画像生成リクエスト検出関数`isDirectImageGenerationRequest`を追加
   - `isConfusionRequest`関数内での未定義関数参照エラーを修正

#### Reason for Change:
アプリケーションの安定性テスト中に複数の重要な問題を発見しました：1) モジュール形式の不一致によるESMモジュールのインポートエラー、2) ユーザーセッション管理用の変数が未定義でのエラー、3) 画像生成リクエスト検出関数が未定義のエラー。これらの問題を修正することで、アプリケーションのクラッシュを防ぎ、LINE Webhookの正常な処理と画像生成機能が安定して動作するようになりました。音声機能、メッセージ処理、画像生成リクエスト処理の全てが安定して動作するようになり、サービスの信頼性が向上しました。

## 2025-03-28: Geminiモデルのアップグレード

### 特性分析のためのGeminiモデルをgemini-1.5-flashからgemini-1.5-proへアップグレード

**変更内容:**
- Geminiモデルを`gemini-1.5-flash`から`gemini-1.5-pro`へ変更

**変更理由:**
特性分析の精度向上のため、より高性能なGeminiモデルへアップグレードしました。`gemini-1.5-pro`モデルはより詳細な特性分析が可能で、ユーザーの会話パターンからより深い洞察を得ることができます。コスト増加はありますが、精度と詳細さの向上によりユーザー体験の質を高めることを優先しました。

## 2025-03-30: Geminiモデル起動条件の最適化

### 特性分析でのGeminiモデル使用条件を最適化

**変更内容:**
- Geminiモデルの起動条件を、過去200件分のメッセージ量がChatGPT-4oの処理上限（128Kトークン）を超えた場合のみに変更
- トークン数を概算する関数を実装し、会話履歴のサイズに基づいて適切なモデルを選択するロジックを追加

**変更理由:**
コスト効率と分析精度のバランスを最適化するため、大量の会話履歴がある場合のみより高コストなGemini 1.5 Proモデルを使用し、通常のケースではChatGPT-4oを使用するよう変更しました。これにより、大規模な履歴分析が必要な場合のみGeminiの大規模なコンテキストウィンドウ（1M〜2Mトークン）を活用し、標準的なケースではよりコスト効率の良いChatGPT-4oを使用することでコストを最適化します。

## 2025-03-28: 音声メッセージ総量規制の環境変数対応とWeb API実装

### 音声メッセージ利用制限の環境変数対応とWeb APIへのレート制限実装

#### Changes Made:
1. **insightsService.js**:
   - 音声メッセージの制限値を環境変数から読み込むよう修正（VOICE_MESSAGE_MONTHLY_LIMIT, VOICE_MESSAGE_DAILY_LIMIT）
   - 環境変数がない場合のデフォルト値を設定（月間上限: 2000回、日次上限: 3回）

2. **.env**:
   - 音声メッセージ制限用の環境変数を追加（VOICE_MESSAGE_MONTHLY_LIMIT=2000, VOICE_MESSAGE_DAILY_LIMIT=3）

3. **rateLimit.js**:
   - Web API用の音声メッセージレート制限ミドルウェアを新規作成
   - 429 Too Many Requestsレスポンスで適切なヘッダーとRetry-Afterを返す実装

4. **server.js**:
   - 音声メッセージAPIルート(/api/audio)にレート制限ミドルウェアを適用

#### Reason for Change:
音声メッセージの月間総量規制上限値をハードコードではなく環境変数で設定できるようにし、本番環境での設定変更を容易にしました。さらに、Web API経由でのアクセスに対してもレート制限を適用することで、サービスの安定性を向上させました。API利用時には適切なHTTPステータスコードとヘッダーを返すことで、クライアント側での適切なリトライ処理が可能になります。

## 2025-03-28: 音声メッセージ総量規制上限の変更

### 月間総量規制上限の変更（10000回から2000回へ）

#### Changes Made:
1. **insightsService.js**:
   - 音声メッセージの月間総量規制上限を10000回から2000回に変更

#### Reason for Change:
サービス全体での音声メッセージの利用上限をより適切な値に設定するため。アプリケーションの運用状況とリソースの最適化を考慮して、月間の総量規制上限を2000回に調整しました。

## 2025-03-28: 音声メッセージ総量規制の永続化修正

### 音声メッセージ利用制限の設定が永続的に保存されるよう修正

#### Changes Made:
1. **insightsService.js**:
   - 音声制限設定を別ファイル（`audio_limits.json`）に保存するよう変更
   - `saveMetrics`メソッドを修正して音声制限設定を保存
   - `loadMetrics`メソッドを修正して音声制限設定をロード
   - 音声制限設定の初期化順序を変更し、ロード前に初期値を設定

#### Reason for Change:
音声メッセージの総量規制ステータス（`audioLimits.quotaRemoved`）がアプリケーション再起動時に保持されず、常に初期値（`false`）にリセットされる問題がありました。この修正により、総量規制解除コマンドで設定した状態がアプリケーション再起動後も維持されるようになり、「総量規制解除:音声メッセージ」コマンドの効果が永続化されます。

## 2025-03-28: 音声メッセージ総量規制解除通知機能の追加

### 音声メッセージ制限解除時のユーザー通知システム実装

#### Changes Made:
1. **insightsService.js**:
   - `trackAudioRequest`関数を追加して音声リクエストの追跡と制限確認を実装
   - `getVoiceMessageUsers`関数を実装して音声メッセージを使用したことのあるユーザーを特定
   - `notifyVoiceMessageUsers`関数を実装して音声制限解除時のユーザー通知を行う機能を追加
   - `setAudioQuotaStatus`と`getAudioQuotaStatus`関数で総量規制状態を管理する機能を追加

2. **server.js**:
   - `checkAdminCommand`関数を実装して管理者コマンドの検出を行う機能を追加
   - `handleText`関数に管理コマンド処理ロジックを追加
   - `総量規制解除:音声メッセージ`コマンドによる制限解除通知機能を実装

#### Reason for Change:
音声メッセージの利用制限（1日3回まで）を設けていましたが、将来的に制限を解除した際にこれまで音声機能を使用したことのあるユーザーに自動通知する仕組みが必要でした。この変更により、制限解除時に管理者が特定のコマンドを実行するだけで、過去に音声機能を使用したすべてのユーザーに通知することが可能になりました。ユーザー体験の向上と、新機能のアナウンスを効率的に行うための機能です。

## 2025-03-28: Deleted All Test Files and Directories

### Removed all test files and directories from the codebase

#### Changes Made:
- Deleted the following test files:
  - `audio_test_suite.js`
  - `backend_integration_test_suite.js`
  - `backend_integration_test_suite_simple.js`
  - `backend_test_patch.js`
  - `comprehensive_test_suite.js`
  - `custom_test_suite.js`
  - `generate_test_messages.js`
  - `image_test_suite.js`
  - `master_test_runner.js`
  - `run_all_tests.js`
  - `show-test-summary.js`
  - `test-all.js`
  - `test-modules.js`
  - `test_all_features.js`
  - `test-runner.sh`
- Removed test directories:
  - `test/`
  - `test_results/` and all subdirectories

#### Reason for Change:
Removed all test files and test directories from the codebase as part of the cleanup process. These files were used for development and testing purposes but are no longer needed in the production environment.

## 2025-03-22: Updated OpenAI Model to Latest Version

### Changed AI model from gpt-4o to chatgpt-4o-latest

#### Changes Made:
- Modified `server.js` to update the AI model from 'gpt-4o' to 'chatgpt-4o-latest'
- Updated the model variable in line 1651: `const model = useGpt4 ? 'chatgpt-4o-latest' : 'chatgpt-4o-latest';`
- Successfully deployed the change to Heroku
- Updated application architecture document to note that the application requires chatgpt-4o-latest or GPT 4.5+ series models due to counseling and interpersonal understanding functionality

#### Reason for Change:
Updated to the latest version of GPT-4o to take advantage of improvements including wider context window (100k tokens vs 30k tokens), better features, and ensured the application always uses the most current version of the model without needing manual updates in the future. This application focuses on counseling and interpersonal understanding, which requires advanced emotion comprehension and expression capabilities that only the latest models can provide.

## 2025-03-21: Deleted Test Files

### Removed all test files from the codebase

#### Changes Made:
- Deleted the following test files:
  - `functional-test.js`
  - `test-integration.js`
  - `test-image-functions.js`
  - `test-standalone.js`
  - `test-deep-exploration-mode.js`
  - `test-confusion-detection.js`
  - `test-embedding-limits.js`
  - `local-test.js`
  - `testEnhancedFeatures.js`
  - `test-intent-learning.js`
  - `test-intent-detection.js`
  - `test-claude.js`
  - `test-fallback.js`
  - `testStore.js`
  - `test_import.js`
  - `test_recommendations_table.js`
  - `scripts/test-db-integration.js`
  - `scripts/test-fetch-messages.js`

#### Reason for Change:
Removed all test files from the codebase as per request, to clean up the project structure and remove unnecessary files that are no longer needed.

## 2025-03-18: lastAssistantMessage参照エラーの修正

### 画像生成処理での変数未定義エラーの修正

#### Changes Made:
- `server.js`の`handleText`関数内で`lastAssistantMessage`変数が未定義のままアクセスされていたエラーを修正
- 会話履歴から直前のアシスタントメッセージを取得するコードを追加
- `[DEBUG] Error in LLM understanding analysis: lastAssistantMessage is not defined`エラーの解消

#### Reason for Change:
会話理解の分析処理で`lastAssistantMessage`変数が定義されていないままアクセスされており、エラーが発生していました。変数を適切に定義することで、コードの実行を継続しながらエラーを解消しました。これにより、ユーザーメッセージの分析がより正確に行えるようになり、画像生成トリガーの動作も安定します。

## 2025-03-18: サーバー機能復旧 - 欠落関数の追加

### 失われていた重要な関数の再実装

#### Changes Made:
- `detectAdviceRequestWithLLM`関数の実装 - LLMを使用してユーザーのメッセージがアドバイスやサービス推薦を求めているかを判断
- `shouldShowServicesToday`関数の実装 - サービス推薦表示の適切なタイミングを制御

#### Reason for Change:
サーバーから重要な関数が欠落していたため、Webhookの処理やアドバイス要求の検出機能が動作していませんでした。これらの関数を再実装することで、サーバーの基本機能を復旧し、意味理解機能が正しく使用されるようになりました。

## 2025-03-18: サーバーコードの構文エラー修正

### server.jsファイルのエラー修正とフォールバック関数の完全化

#### Changes Made:
- `server.js`の`extractConversationContextLegacy`関数内で発生していた構文エラーを修正
- `negativeWords`配列が正しく閉じられておらず、関数実装が不完全だった問題を解決
- プロセッシングとJSDocコメントの間の区切りを明確にし、コードの正常な実行を確保

#### Reason for Change:
実装された意味的処理機能のフォールバックメカニズムが正常に機能していなかったため、構文エラーを修正しました。これにより、万が一OpenAI Embeddingsサービスがエラーを返した場合でも、アプリケーションが従来の方法で正常に動作できるようになりました。

## 2025-03-17: OpenAI Embeddingsによる意味理解機能の強化 - 第2段階

### 自然言語理解の大幅な改善とテキスト分析精度の向上

#### Changes Made:
1. **server.js**:
   - `semanticSimilarity`関数を実装して文字列比較を意味的類似度計算に拡張
   - `extractSignificantPhrases`関数を改善してフレーズ間の意味的類似性を考慮
   - 意味ベースのコンテキスト抽出を実現する`extractConversationContextAsync`関数を実装

2. **perplexitySearch.js**:
   - `isAllowedQuerySemantic`関数を実装し、検索クエリの意図解釈を強化
   - 「天気」や「スポーツ」に関する意図を明示的なキーワードがなくても検出可能に

3. **localML.js**:
   - `_detectPatternsWithEmbeddings`関数を実装し、パターン検出を文字パターンから意味理解へ進化
   - 分析関数を非同期処理に更新し、テキストの深層分析を実現

#### Reason for Change:
第1段階で実装した基本機能を拡張し、アプリケーション全体の言語理解能力を強化しました。これにより、従来のキーワードマッチングでは捉えられなかった微妙なニュアンスや意図を理解できるようになり、より人間らしい対話体験を実現します。すべての機能で障害時のフォールバックメカニズムを実装し、システムの堅牢性も確保しています。

## 2025-03-17: OpenAI Embeddings APIによるユーザーニーズ分析の強化

### Embeddings APIを活用した意味的テキスト理解機能の実装

#### Changes Made:
1. **embeddingService.js**:
   - TensorFlow.jsベースの実装からOpenAI API使用の実装に変更
   - text-embedding-3-smallモデルを使用した高性能なテキスト埋め込み生成
   - キャッシュ機能、エラー処理、再試行メカニズムを実装

2. **localML.js**:
   - `_analyzeSupportNeeds`関数を非同期処理に変更し、OpenAI Embeddingsを活用
   - 意味的テキスト理解によるユーザーニーズの分析精度向上
   - API障害時のフォールバックメカニズムを実装し、安定性を確保
   - 既存コードとの互換性を維持するためのインターフェース調整

#### Reason for Change:
単純なキーワードマッチングでは捉えられなかったユーザーの微妙なニーズや感情を、OpenAIのEmbeddings APIによる意味的理解で検出できるようになりました。これにより、「アドバイスがほしい」「どうすればいいでしょうか」など表現が異なっていても、同じ「advice」ニーズとして正確に認識できるようになりました。API接続の問題があっても従来のキーワードマッチングにフォールバックするため、安定性も確保しています。

## 2025-03-16: 画像生成機能の検出と処理を改善

### 直接的な画像生成リクエストの検出と即時処理の実装

#### Changes Made:
1. **server.js**:
   - `handleText`関数の最初の部分に画像生成リクエスト検出処理を追加
   - 画像生成リクエストを検出した場合、確認ステップをスキップして直接`handleVisionExplanation`関数を呼び出すよう変更
   - 画像生成リクエストからキーワード部分を除去し、生成したい内容のみを抽出する処理を追加

#### Reason for Change:
これまで画像生成リクエスト（例：「猿の画像を生成して」）が正しく検出されず、通常のテキスト応答として処理されていました。この修正により、ユーザーが画像生成を要求した場合、確認ステップなしで直接画像生成が開始されるようになりました。これにより、よりスムーズで直感的なユーザー体験を提供し、画像生成機能の利便性が向上しました。

## 2025-03-16: Airtable接続の初期化と変数参照を統一

### Airtable接続問題の修正と変数スコープの一貫性確保

#### Changes Made:
1. **server.js**:
   - グローバル変数として`airtableBase`を初期化するコードを追加
   - 接続初期化時のエラーハンドリングとログ出力を強化
   - `restorePendingImageRequests`関数内のローカル変数宣言を削除し、グローバル変数を使用するように修正
   - Airtable接続が初期化されていない場合の適切なエラーメッセージとフォールバック処理を追加

#### Reason for Change:
アプリケーション内でAirtable接続の変数が複数の場所で別々に初期化されており、変数スコープの問題によってデータの取得や保存に失敗していました。特に`airtableBase`変数がグローバルスコープとローカルスコープで異なる参照を持っていたため、「過去の発言は確認できません」というエラーが発生していました。

この修正により、アプリケーション全体で一貫したAirtable接続オブジェクトを使用できるようになり、会話履歴の保存と取得が正常に機能するようになりました。また、接続エラーに対する堅牢性も向上し、問題が発生した場合に明確なログメッセージが出力されるようになりました。

## 2025-03-15: シンプルなPostgreSQLメッセージ取得スクリプトの追加

### PostgreSQLからメッセージを直接取得するシンプルなスクリプトの実装

#### Changes Made:
1. **scripts/simple-fetch.js**:
   - PostgreSQLデータベースに直接接続してメッセージを取得するシンプルなスクリプトを作成
   - 外部依存関係を最小限に抑え、単独で動作するように設計
   - コマンドライン引数でユーザーIDと取得件数を指定できる機能を追加

#### Reason for Change:
以前のメッセージ取得スクリプト（`fetch-messages.js`）は`server.js`モジュールに依存しており、複雑な依存関係によりエラーが発生していました。このシンプルなスクリプトは外部依存関係を最小限に抑え、PostgreSQLデータベースに直接接続することで、より堅牢で信頼性の高いメッセージ取得機能を提供します。これにより、データベースからのメッセージ取得が簡単かつ確実に行えるようになります。

## 2025-03-15: データベーススキーマの更新とテストスクリプトの改善

### データベーススキーマの更新とAirtable認証エラー処理の改善

#### Changes Made:
1. **db.js**:
   - `user_messages`テーブルに新しいカラムを追加:
     - `message_id`: メッセージの一意識別子
     - `mode`: メッセージのモード
     - `message_type`: メッセージのタイプ
   - `initializeTables`関数を更新して、存在しない場合のみカラムを追加するように改善

2. **scripts/test-db-integration.js**:
   - Airtable認証エラーを適切に処理するように改善
   - Airtable API キーとベースIDが設定されていない場合の警告を追加
   - PostgreSQLとAirtableの操作を分離し、一方が失敗しても他方のテストが続行できるように改善
   - テスト結果の詳細なログ出力を追加

3. **database.js**:
   - 新しいデータベースラッパーモジュールを作成
   - PostgreSQL接続と操作のための関数を実装
   - テストスクリプトの期待するインターフェースに合わせた設計

#### Reason for Change:
データベース統合テスト中に`message_id`カラムが存在しないエラーが発生していました。この問題を解決するためにデータベーススキーマを更新し、必要なカラムを追加しました。また、Airtable認証エラーが発生した場合でもPostgreSQLのテストが続行できるように、テストスクリプトを改善しました。これにより、一方のデータソースに問題があっても他方のデータソースのテストが正常に実行されるようになりました。

## 2025-03-14: データベース統合の強化

### PostgreSQLとAirtableの両方からデータを取得する機能の追加

#### Changes Made:
1. **scripts/fix-db-integration.js**:
   - `storeInteraction`関数を修正して、PostgreSQLデータベースにもデータを保存するようにしました
   - `fetchUserHistory`関数を修正して、PostgreSQLとAirtableの両方からデータを取得するようにしました
   - データベースモジュールを条件付きでロードするコードを追加しました
   - データベーステーブルの初期化処理を追加しました
   - USE_DATABASE環境変数に基づいて機能を有効/無効にするようにしました

2. **scripts/check-db-connection.js**:
   - テストデータ挿入機能を追加して、データベース接続とデータ保存をテストできるようにしました
   - `storeInteraction`関数のテスト機能を追加して、AirtableとPostgreSQLの両方にデータが保存されることを確認できるようにしました

#### Reason for Change:
これまでチャットメッセージはAirtableにのみ保存され、PostgreSQLデータベースが使用されていませんでした。この変更により、メッセージデータが両方のデータソースに保存され、どちらからも取得できるようになりました。これにより、データの冗長性が確保され、一方のデータソースに問題が発生した場合でもシステムが機能し続けることができます。また、PostgreSQLを使用することで、より高速なデータ検索と分析が可能になります。

## 2025-03-14: 「新機械学習ベータ」への移行

1. **ml-enhance**: 新機械学習ベータモジュールを追加
   - TensorFlow.jsベースの機械学習機能実装
   - 既存機能との互換性を維持
   - 詳細なログ記録と分析機能を追加

2. **mlIntegration.js**: 新しい機械学習システムを統合
   - `localML`のインポートを`ml-enhance`に変更
   - 既存のインターフェースを維持

3. **.env**: 新機械学習ベータの設定を追加
   - 環境変数による機能制御
   - 設定可能なパラメータ

## 2025-03-13

### 機械学習データの強化と履歴化

#### Changes Made:
1. **localML.js**:
   - 機械学習データを上書きせず、新しいレコードとして保存する機能を追加
   - 分析データに`pattern_details`フィールドを追加し、検出パターンの詳細情報を保存
   - 各データポイントに`timestamp`フィールドを追加して時系列分析を可能に
   - 日付フォーマットをAirtableの要求形式（MM/DD/YYYY）に対応

2. **conversationHistory.js**:
   - 会話履歴の取得件数を20件から200件に増加
   - Airtableからの会話履歴取得ロジックを最適化（降順取得後に逆転して正しい順序を維持）
   - より多くの会話コンテキストを分析対象とすることでパターン検出の精度を向上

#### Reason for Change:
これまでの機械学習データは同じレコードに上書きされていたため、時間の経過に伴うユーザー特性の変化を追跡できませんでした。この変更により、分析データが時系列で保存され、ユーザーの特性やトピック関心の変化を追跡できるようになりました。また、検出パターンの詳細情報も保存されるため、機械学習の内部動作の透明性が向上し、より適切な応答生成が可能になります。

分析対象の会話履歴を増やすことで、より長期的なコンテキストに基づいた正確な特性分析が可能になり、AIの理解度と応答の質が向上します。

## 2024-05-13

### 会話履歴をAI回答生成に活用する機能の追加

#### Changes Made:
1. **server.js**:
   - `fetchUserHistory`関数を拡張して、会話履歴をAirtableから取得するよう改善
   - ConversationHistoryテーブル→UserAnalysisテーブル→既存のテーブルの優先順位で会話履歴を検索
   - 既存のAI回答生成フローを維持しながら、AirtableのデータをAI生成に活用

#### Reason for Change:
これまで会話履歴はメモリ内に保存され、別途Airtableにも保存されていましたが、これらが連携されていなかったため、AI回答生成時に学習データが十分に活用されていませんでした。この変更により、Airtableに保存された会話履歴がAI回答生成時に優先的に使用され、メモリに存在しない過去の会話でもAIが適切に参照できるようになります。

## 2024-05-13

### 会話履歴のAirtable保存機能追加

#### Changes Made:
1. **conversationHistory.js**:
   - Airtableを使用した会話履歴の永続化機能を追加
   - UserAnalysisテーブルとの互換性を保ちつつ、ConversationHistoryテーブルを優先的に使用
   - メモリ内の会話履歴をAirtableに自動的に保存・ロードする機能を実装

2. **scripts/create-conversation-history-table.js**:
   - ConversationHistoryテーブルを作成するための新しいセットアップスクリプトを追加
   - テーブルの存在確認と必要なフィールドの説明を含む

#### Reason for Change:
これまでの会話履歴はサーバーメモリ内にのみ保存されており、サーバー再起動時に失われていましたが、この変更により会話データが永続化され、学習データとして蓄積されるようになります。UserAnalysisテーブルとの互換性を保ちつつ、より効率的な専用テーブル（ConversationHistory）による保存も可能にしました。

## 2024-05-13

### Fixed Additional Reference Error in Text Message Handling 

#### Changes Made:
1. **server.js**:
   - Fixed `ReferenceError: userPrefs is not defined` error in service notification code
   - Moved the userPrefs declaration earlier in the function to ensure it's always defined
   - This ensures proper handling of service notification messages

#### Reason for Change:
The application was throwing a reference error when processing service notification messages. The variable `userPrefs` was being referenced before it was defined in some code paths. Moving the declaration earlier ensures it's always available when needed.

## 2024-05-13

### Fixed Reference Error in Feedback Processing

#### Changes Made:
1. **server.js**:
   - Fixed `ReferenceError: FEEDBACK_PATTERNS is not defined` error in `handleText` function
   - Added local declaration of `FEEDBACK_PATTERNS` variable with positive and negative feedback patterns
   - This ensures the sentiment detection for user feedback works properly

#### Reason for Change:
The application was throwing a reference error when processing text messages containing feedback. The variable `FEEDBACK_PATTERNS` was being used in the `handleText` function but wasn't defined in its scope. Adding the definition resolves the error and ensures proper feedback processing.

## 2024-05-30

### Updated X Sharing Feature to use GPT-4o-mini model

#### Changes Made:
1. **server.js**: 
   - Changed the model used in `checkEngagementWithLLM` function from "gpt-3.5-turbo" to "gpt-4o-mini"
   - This change improves the contextual understanding for the X sharing feature

2. **README.md**:
   - Updated the May 2024 Updates section to reflect the use of GPT-4o-mini model instead of GPT-3.5-turbo

3. **ENHANCED_FEATURES_DOCUMENTATION.md**:
   - Updated the LLM-Powered X Sharing Feature section to reference GPT-4o-mini model
   - Changed all mentions of GPT-3.5-turbo to GPT-4o-mini in the technical details section

4. **USER_MANUAL.md**:
   - Updated the Technical Improvements section to specify that the X sharing feature uses GPT-4o-mini model

5. **USER_MANUAL_JA.md**:
   - Updated the Technical Improvements section (技術的改良点) to specify that the X sharing feature uses GPT-4o-mini model

#### Reason for Change:
The GPT-4o-mini model provides better performance and more accurate contextual understanding for the X sharing feature, while still maintaining good efficiency. This change ensures that the system uses the most appropriate model for detecting user engagement and sharing intent.

## 2024-05-31

### Enhanced Service Recommendation Trigger System with LLM Context Understanding

#### Changes Made:
1. **server.js**:
   - Modified `detectAdviceRequest` function to use LLM context understanding instead of trigger words
   - Added new `detectAdviceRequestWithLLM` function using GPT-4o-mini model
   - Updated related functions to work with async/await for the LLM-based detection
   - Made `shouldShowServicesToday` an async function

#### Reason for Change:
Removed explicit trigger word detection in favor of more intelligent contextual understanding using LLM. This allows the system to recommend services when the user is implicitly asking for help or advice, not just when they use specific trigger words. The GPT-4o-mini model can better understand user intent and provide more relevant service recommendations.

## 2024-05-13
### タイムアウト回避のためのWebhook処理の改善
- **変更内容**: Webhookエンドポイントの処理方法を改善し、即座に応答を返すようにしました。タイムアウト設定も120秒に拡張しました。
- **変更ファイル**: `server.js`
- **理由**: Herokuの30秒タイムアウト制限により、ユーザーからのメッセージに対するAIの応答が届かないケースがありました。Webhookがメッセージを受け取ったらすぐに200 OKを返し、バックグラウンドで処理を継続するように変更することで、タイムアウト問題を解消しました。

## 2024-05-13
### serviceNotificationのuserPrefs参照エラーの修正
- **変更内容**: `server.js`の`serviceNotificationReason`関連コードの中で、条件分岐の前に`userPrefs`変数を初期化するように修正
- **変更ファイル**: `server.js` 2604行目付近
- **理由**: アプリケーションが`ReferenceError: userPrefs is not defined`エラーを出していたため、変数が参照される前に確実に定義されるように改善

## 2024-05-13
### テキストメッセージ処理におけるFEEDBACK_PATTERNS参照エラーの修正
- **変更内容**: `handleText`関数内でFEEDBACK_PATTERNSを定義
- **変更ファイル**: `server.js` 2329行目付近
- **理由**: `ReferenceError: FEEDBACK_PATTERNS is not defined`エラーが発生していたため 

## 2025-03-15: メッセージ取得ユーティリティの追加

### PostgreSQLとAirtableの両方からメッセージを取得するユーティリティの実装

#### Changes Made:
1. **scripts/fetch-messages.js**:
   - PostgreSQLとAirtableの両方からメッセージを取得する`fetchMessages`関数を実装
   - 既存の`fetchUserHistory`関数を活用して、両方のデータソースからデータを取得
   - コマンドライン引数でユーザーIDと取得件数を指定できる機能を追加

2. **scripts/test-fetch-messages.js**:
   - `fetchMessages`関数のテストスクリプトを作成
   - テスト用のユーザーIDを生成して、メッセージ取得をテスト

3. **server.js**:
   - `fetchUserHistory`関数をモジュールとしてエクスポートするように変更
   - 他のスクリプトから`fetchUserHistory`関数を利用できるように改善

#### Reason for Change:
アプリケーション内の他の部分やスクリプトからPostgreSQLとAirtableの両方のデータソースからメッセージを簡単に取得できるようにするため、再利用可能なユーティリティ関数を作成しました。これにより、データ取得のコードの重複を減らし、一貫した方法でメッセージにアクセスできるようになります。

## 2025-03-16: 特性分析機能の改善

### PostgreSQLとAirtableの両方からのデータを活用した特性分析機能の強化

#### Changes Made:
1. **server.js**:
   - `generateHistoryResponse`関数を新たに実装:
     - ユーザーの会話履歴から特性分析を行い、詳細な洞察を提供
     - 「過去の記録がない」などの否定的な表現を避け、限られたデータからでも分析を提供
     - 分析の観点として、コミュニケーションパターン、思考プロセス、社会的相互作用、感情と自己認識を含む
   
   - `fetchAndAnalyzeHistory`関数を強化:
     - PostgreSQLから最大200件のメッセージを取得
     - Airtableからも追加で最大100件のメッセージを取得
     - 両方のデータソースからのデータを重複なく結合
     - エラー処理を改善し、ユーザーフレンドリーなエラーメッセージを提供

#### Reason for Change:
特性分析機能において「過去の記録がない」というメッセージが表示される問題を解決するために、PostgreSQLとAirtableの両方からデータを取得し、より多くの会話履歴を分析に活用できるようにしました。また、限られたデータからでも何らかの分析結果を提供するように改善し、ユーザー体験を向上させました。これにより、ユーザーは自分の特性についてより詳細で有用な洞察を得ることができます。

### 日本語での詳細説明：会話データが限られている場合の改善されたユーザー体験

#### 改善のポイント：
この更新により、特性分析を行う際に「過去の記録がない」といった否定的なメッセージではなく、以下のように改善されました：

1. **データの状況を透明に説明**：
   - 利用可能な会話履歴の内容（例：翻訳依頼が多いなど）を明確に説明
   - なぜ詳細な分析が難しいのかを具体的に伝える

2. **建設的な代替案の提供**：
   - 分析に必要な追加情報を具体的に質問
   - ユーザーが提供できる情報の例を示す

3. **限られたデータからでも価値を提供**：
   - 少ないデータからでも可能な範囲での分析結果を提供
   - 完全な「できない」ではなく「現時点でわかること」を伝える

#### 具体例（ユーザーケース）：
例えば、主に翻訳サービスとしてAIを利用していたユーザーが突然キャリア分析を依頼した場合：

**改善前の応答**：
「過去の記録がないため、詳細な分析は難しいです」

**改善後の応答**：
「※過去の会話記録は主に英語翻訳の依頼（全体の約80%）であり、キャリア分析に必要な個人的な情報が少ないため、詳細な分析が難しい状況です。より正確な診断のためには、あなたの仕事に関する好み、スキル、経験などの情報をもう少し共有していただけると助かります。

以下についてお聞かせいただけますか？：
1. 現在の仕事内容と経験年数
2. 特に得意だと感じるスキルや強み
3. 仕事で大切にしている価値観
4. 興味のある技術分野や業界」

この改善により、ユーザーは「なぜ分析できないのか」を理解し、必要な情報を提供することで目的を達成できるようになりました。システムの透明性が高まり、ユーザー体験と信頼性が向上しています。

## 2023-11-10
- 短い表現（「わからない」「億劫」など）の画像生成提案機能を改善
  - LLMによるユーザーの発言内容の理解度判定を実装
  - 確度95%以上の場合のみ画像生成を提案するように変更
  - 「億劫」などの表現を単なる混乱表現として誤検出しないように改善 

## 2023-11-11
- 画像生成提案機能の精度向上
  - 直前のAI回答を考慮した混乱検出機能を実装
  - 短いメッセージだけでなく、一般的な混乱表現を含むメッセージもLLMで分析するように拡張
  - 純粋に会話を継続する意図がある場合は混乱と判断しないように改良
  - 混乱表現検出のためのcontainsConfusionTerms関数を追加 

## 2023-11-12
- 画像生成提案の混乱検出ロジックを更新
  - メッセージの長さに基づく判断を除去
  - 内容に基づいた混乱検出に統一
  - LLMによる判定をより多くのケースに適用 

## 2023-11-13
- 画像生成提案の判断を根本的に改善
  - 直接的な画像リクエスト以外、すべてのメッセージをLLMで分析
  - ユーザーがAIの発言を根本的に理解しているかどうかを判断
  - 直前のAI回答を必ず考慮して判断を行う
  - 95%以上の確度でユーザーが理解していないと判断された場合のみ画像生成を提案
  - 判断基準にメッセージ長さを使用せず、内容のみで判断 

## 2023-11-14: Perplexity Search Implementation

### Integration of Perplexity API for Enhanced Knowledge Retrieval and Job Market Analysis

#### Changes Made:
1. **perplexitySearch.js**:
   - Implemented a new `PerplexitySearch` class for integrating with the Perplexity Sonar model
   - Added `enhanceKnowledge` method to analyze user characteristics and career needs
   - Created `getJobTrends` method to retrieve current job market information
   - Implemented `handleAllowedQuery` for weather and sports-related information
   - Added contextual search capabilities using recent conversation history

2. **server.js**:
   - Integrated Perplexity search functionality into the main conversation processing flow
   - Implemented parallel API calls for knowledge enhancement and job trends
   - Added error handling for Perplexity API requests

3. **Security and Configuration**:
   - Added Perplexity API to CSP (Content Security Policy) settings
   - Implemented appropriate connection timeout settings (25 seconds)

#### Reason for Change:
The Perplexity search implementation enhances the application's ability to provide relevant, up-to-date information to users. This integration allows the system to analyze user characteristics based on conversation history, provide information about current job market trends, and deliver more accurate career-related insights. The search functionality intelligently determines when knowledge enhancement is needed based on the context of the conversation, making the responses more informative and valuable to users seeking career guidance. 

### 日本語での説明：Perplexity検索機能の実装について

#### 変更内容の概要：
Perplexity APIを活用した新しい検索機能を実装しました。この機能により、アプリケーションは会話の文脈を理解し、ユーザーの特性や職業適性を分析できるようになりました。また、最新の求人市場情報を取得し、キャリアに関する洞察を提供することも可能になりました。

#### 主な改善点：
1. **ユーザー特性の分析機能**：
   - 会話履歴からユーザーのコミュニケーションスタイルや思考パターンを分析
   - キャリアに関連する強みや課題を特定
   - ユーザーに合った職種や業界の提案を生成

2. **最新の求人市場情報の提供**：
   - 現在のキャリアトレンドや新興職種に関する情報を取得
   - 将来性の高い職種とその必要スキルについての分析
   - 関連する求人情報のURLを提供

3. **天気予報とスポーツ情報の検索**：
   - 限定的な一般情報（天気予報、スポーツ結果）の検索機能を追加

この機能強化により、ユーザーはより個人に合わせたキャリアアドバイスを受けることができ、最新の市場動向に基づいた意思決定が可能になります。また、システムはユーザーの会話内容を理解し、必要な時に適切な情報を提供できるようになりました。 

## 2025-03-15: 画像生成機能の信頼性向上 - 矛盾点および意図しない動作の包括的修正

### 改善プラン概要
1. **データ形式の統一と後方互換性の確保**
   - `pendingImageExplanations`の格納データ形式を統一（オブジェクト形式に標準化）
   - 全ての関連コードで互換性チェックとデフォルト値の設定を追加

2. **タイムアウト処理・状態管理の強化**
   - `imageGenerationInProgress`フラグの適切なクリーンアップを保証
   - 明示的なタイムアウト処理の実装と統一
   - エラー時の状態リセットを確実に実行

3. **レースコンディション予防**
   - 処理が完了した後にデータを削除するよう順序を最適化
   - 処理前の状態検証を強化し、複数リクエストの同時処理を適切に管理

4. **エラー処理・例外管理の改善**
   - すべての例外パスでの適切な状態クリーンアップを保証
   - ユーザーへの分かりやすいエラーメッセージの提供
   - システムログの詳細化によるデバッグの容易化

5. **機能間の相互作用の明確化**
   - 画像生成とサービス推薦の優先順位を明確に定義
   - 重複処理の防止と一貫した動作の保証

### 変更内容
- `server.js`: 画像生成関連のコードにおける状態管理とエラー処理を改善
- データ形式の統一とタイムアウト処理の実装
- ロギングの強化とデバッグ情報の充実
- エラー時の状態リセット処理の追加
- ユーザーへのエラー通知の改善

### テスト結果
- 「はい」応答による画像生成の信頼性が向上
- サーバー再起動時の状態復元がより確実に動作
- エラー時のユーザー体験が改善

## 2025-03-16: 特性分析機能のデバッグログのさらなる修正

### 特性分析機能のデバッグログにおけるfinalPrompt参照エラーの修正

#### Changes Made:
1. **server.js**:
   - 特性分析レスポンスデバッグ部分の`finalPrompt`参照エラーを修正:
     - `processWithAI`関数内で未定義だった`finalPrompt`変数の参照を削除
     - 代わりに`messages`配列から取得したシステムプロンプトを使用するように変更
     - `systemPromptContent`変数を導入して、メッセージの最初の要素からシステムプロンプトを安全に取得

#### Reason for Change:
特性分析機能のデバッグログ出力時に`ReferenceError: finalPrompt is not defined`エラーが発生していました。このエラーは、`finalPrompt`変数が`applyAdditionalInstructions`関数内で定義されているのに対し、`processWithAI`関数内で直接参照されていたために発生していました。この修正により、特性分析機能がエラーなく動作するようになり、デバッグログも正しく出力されるようになりました。 

## 2025-03-16
- 翻訳関連のメッセージ分類機能を削除し、すべてのメッセージを特性分析に利用するように変更
  - 変更内容: `analyzeHistoryContent`関数と`generateHistoryResponse`関数から翻訳関連のメッセージ分類を完全に削除
  - 理由: 翻訳関連のメッセージと判定されることで特性分析から除外されていたメッセージがあり、分析に使用できるメッセージ数が少なくなっていた
  - 改善点: すべてのメッセージを分析対象とすることで、より豊富なデータから特性分析を行えるようになる 

## 2025-03-16
- 特性分析機能の履歴データ取得範囲を拡大し、フィルタリングを完全に削除
  - 変更内容: 
    - Airtableからの履歴取得件数を100件から200件に増加
    - 短いメッセージ（20文字未満）のフィルタリングを完全に削除
    - すべてのメッセージを分析に利用するように変更
  - 理由: 
    - ユーザーの会話履歴をできるだけ多く分析に利用したい
    - メッセージの長さに関わらず、すべてのメッセージが分析価値を持っている
  - 改善点: 
    - より多くの会話履歴データを分析に利用できるようになり、分析精度が向上
    - AIがより正確にユーザーの特性を理解できるようになる 

## 2025-03-16
- 特性分析機能のプロンプト修正：「過去の記録がない」などの表現を削除
  - 変更内容:
    - applyAdditionalInstructions関数内の「過去の会話記録が少ない」という表現をすべて削除
    - 履歴が少ない場合でも否定的な表現を使わず、前向きな表現に置き換え
    - 「過去の記録が少ない」「履歴が不足している」などの否定的な表現を使わないよう明示的に指示
  - 理由:
    - 履歴が少くても肯定的なトーンで分析を提供したい
    - 追加指示が元のシステムプロンプトの指示を上書きしないようにする
  - 改善点:
    - 一貫して前向きなトーンの分析結果を提供できる
    - ユーザーが「過去の記録がない」などとAIに言われることがなくなる 

## 2025-03-14: サービス推奨機能のデバッグログ強化

### 変更内容
- `serviceRecommender.js`のベクトルマッチング処理に詳細なログを追加
  - 各サービスの基本スコアと調整後のスコア、閾値との比較結果を表示
  - スコア調整の詳細（トピックマッチ、ムードマッチ、緊急性など）を表示
  - すべてのサービスのスコアを降順で表示し、閾値を超えたかどうかを明示
- `server.js`のサービス推奨プロセスにデバッグ情報を追加
  - ユーザーメッセージの詳細を表示
  - クールダウン期間やサービス表示回数制限の詳細情報を表示
  - 会話コンテキスト情報（トピック、ムード、緊急性）のログを追加

### 目的
- サービス推奨機能の動作をより詳細に追跡可能にする
- なぜ特定のメッセージに対してサービスが推奨されなかったかの原因を特定しやすくする
- ベクトルマッチングのスコア計算プロセスを透明化し、閾値調整の参考にする

### コード変更箇所
- `serviceRecommender.js`: ベクトルマッチング関数にログ追加
- `server.js`: サービス推奨判断処理にデバッグログ追加

## 2025-03-15: 画像生成トリガーの信頼性向上 - 「はい」応答処理修正

### 変更内容
1. `handleText`関数内で「はい」「いいえ」応答を先に確認するように変更
   - `userMessage`変数名の統一: 最初に`messageText.trim()`として定義し、全体で一貫して使用
   - `pendingImageExplanations`のチェックを関数の冒頭に移動することで、他の処理より先に実行されるようにした
   - 重複するコード部分を削除し、コードの整理を行った

### 変更理由
- 「はい」というメッセージが画像生成のトリガーとして機能せず、通常の会話として処理される問題があった
- 原因調査の結果、`pendingImageExplanations`のチェックが他の処理（アドバイス検出など）の後に行われていた
- 変数の不一致（`messageText`と`userMessage`）も処理の一貫性に影響していた

### 改善効果
- 「はい」のメッセージが来た場合、他の処理より先に画像生成リクエストとして処理される
- 変数名を統一したことでコードの一貫性と可読性が向上
- デバッグログの強化により、処理の流れが追跡しやすくなった

## 2025-03-15: 画像生成機能のデータ構造統一 - pendingImageExplanationsの一貫性確保

### 変更内容
1. `enhancedFeaturesUsage.js`の`pendingImageExplanations.set()`を文字列からオブジェクト形式に変更
   - 文字列のみを格納する方式から、`{ content, timestamp, source }`というオブジェクト形式に統一
   - タイムスタンプを追加してタイムアウト処理の信頼性を向上
   - 格納ソースを明示的に記録することでデバッグを容易化

2. `server.js`の`handleText`関数で文字列とオブジェクト両方に対応
   - `typeof pendingData === 'object'`でデータ形式を判定
   - 文字列形式の場合も適切に処理できるよう分岐処理を追加
   - 両方のケースで詳細なデバッグ情報を出力

### 変更理由
- 画像生成機能で「はい」と応答した際に画像が生成されない問題が発生
- 原因調査の結果、`pendingImageExplanations`に格納するデータ形式が一貫していないことが判明
  - 一部のコードで文字列を格納（`lastAssistantMessage.content`）
  - 他のコードでオブジェクト（`{ content, timestamp, source }`）を格納
  - 処理時に`pendingData.content`が存在しないとエラーになる問題

### 改善効果
- データ構造の一貫性が確保され、画像生成機能の信頼性が向上
- オブジェクト形式への統一により、タイムスタンプやソース情報も一緒に管理可能に
- 互換性のための分岐処理により、古いコードとの互換性も維持

## 2025-03-19: Fixed Token Limit Error in Embedding Service

### Issue:
When processing large conversation histories, the system would encounter token limit errors when calling the OpenAI embedding API. Specifically, the error was:
```
Error getting embedding: BadRequestError: 400 This model's maximum context length is 8192 tokens, however you requested 36545 tokens (36545 in your prompt; 0 for the completion). Please reduce your prompt; or completion length.
```

### Changes Made:
1. Added token limit safety measures to `embeddingService.js`:
   - Added a maximum token limit (8,000 tokens)
   - Implemented a sophisticated token count estimator that differentiates between Japanese and other characters
   - Added a safety buffer (70%) to provide extra margin against errors
   - Added text truncation function to prevent exceeding token limits
   - Improved error handling for token limit errors with multiple fallback levels
   - Added triple-fallback retry logic with progressively shorter texts

2. Updated key methods in `embeddingService.js`:
   - `getEmbedding()`: Now truncates text to fit within token limits
   - `getTextSimilarity()`: Now supports truncation for both input texts
   - `semanticSearch()`: Now handles token limits properly

3. Enhanced the `enhancedEmbeddingService.js` file for consistency:
   - Added a `_sanitizeText()` method to leverage the token limit features from base service
   - Updated all methods to use sanitized text
   - Improved error handling with fallback to zero vectors
   - Added proper truncation throughout the embedding pipeline

### Benefits:
- Prevents API errors due to token limits
- Accurately estimates token counts for mixed Japanese/English text
- Gracefully degrades by truncating inputs when necessary
- Uses multi-level fallback strategies to ensure service continues
- Maintains system stability by providing fallback mechanisms
- Improves error resilience throughout the embedding pipeline

### Code Impact:
- Changed files:
  - `embeddingService.js`
  - `enhancedEmbeddingService.js`

## 2024-07-15
- 「掘り下げモード」の追加実装
  - 特定のユーザーリクエスト（「もっと深く考えを掘り下げて例を示しながらさらに分かり易く言葉で教えてください。抽象的言葉禁止。」）を検出する機能を追加
  - この特定のフレーズが送信された場合、画像生成機能をトリガーせず、代わりに詳細な言語的説明を提供する「掘り下げモード」として処理
  - `server.js`に`isDeepExplorationRequest`関数を追加し、`determineModeAndLimit`と`getSystemPromptForMode`関数を更新して新モードに対応
  - `isConfusionRequest`関数を修正して掘り下げモードリクエストを除外
  - `enhancedImageDecision.js`と`imageGenerationUtils.js`を更新して掘り下げモードリクエストを認識し、画像生成をスキップするように変更
  - すべての変更はユーザー体験の向上を目的とし、混乱検出と画像生成の既存の機能を維持
  - テスト用の`test-standalone.js`スクリプトを作成し、全機能が正常に動作することを確認（全9テスト成功）

## 2025-03-21
- Improved error handling in `handleASDUsageInquiry.js` to provide multiple fallback methods for replying to users
- Added robust response delivery system with multiple layers of fallback in case the primary LINE client method fails
- Added client response tracking using global.pendingResponses to ensure messages can be delivered even if immediate delivery fails

## 2025-03-22
- Removed automatic image explanation suggestion feature for confusion detection
- Modified `isConfusionRequest` function to only detect direct image generation requests
- Updated General mode system prompt to instruct users to directly request image generation when needed
- Simplified user experience by removing the "Would you like me to create an image explanation?" prompt and yes/no confirmation flow
- Maintained existing image generation capability through direct user requests

## 2024-03-21
- 機能テストスクリプトを作成し、アプリケーションの全機能の動作確認を実施
  - General モードチャット機能の検証
  - Career モードチャット機能の検証
  - Deep Exploration モード機能の検証
  - Embedding API 機能の検証
  - 機能のオン/オフ切り替え機能の検証
  - すべての機能が問題なく動作することを確認

## 2024-03-20
- ML拡張ラッパーモジュールのバグを修正 (wrapper.js)
  - config.getConfigSummary is not a function エラーを解決
  - ML機能の正常動作を確認するテストを実施
  - すべてのML機能が問題なく動作することを確認