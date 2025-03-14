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