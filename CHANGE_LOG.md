# Change Log

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