# Change Log

## 2024-05-13

### AIレスポンス生成にAirtableデータを活用する機能を追加

#### Changes Made:
1. **mlIntegration.js**:
   - Airtableからユーザー特性データを取得する`getUserTraitsFromAirtable`関数を追加
   - ユーザーニーズデータをAirtableデータで拡張する`enhanceUserNeedsWithAirtable`関数を追加
   - 会話モードに応じたMLデータ取得を統合する`getUserMlData`関数を追加
   - キャリアモードでもAirtableのデータを優先的に使用するよう改善

2. **server.js**:
   - `processWithAI`関数を修正し、新しいユーザーデータ処理関数を使用
   - 複数のデータソース（LocalML、Perplexity、Airtable）を統合する処理を実装
   - ログ出力を改善し、Airtableデータの使用状況を表示

#### Reason for Change:
以前の実装では会話履歴をAirtableに保存する機能を追加しましたが、保存したデータがAIの回答生成に活用されていませんでした。今回の変更により、Airtableに蓄積された学習データや会話履歴を、AIの回答生成時に自動的に取得して活用する機能を実装しました。ユーザーについての学習が継続的に行われ、回答の質が向上します。

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