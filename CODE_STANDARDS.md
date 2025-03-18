# アダムアプリケーション コーディング規約と設計ガイドライン

このドキュメントは、アダムアプリケーションの開発においてコードの一貫性を保ち、頻繁な修正を減らすための指針を提供します。

## 目次
1. [コード変更の優先順位と変更禁止事項](#コード変更の優先順位と変更禁止事項)
2. [変数とデータ構造](#変数とデータ構造)
3. [データベース接続](#データベース接続)
4. [エラー処理](#エラー処理)
5. [ロギング](#ロギング)
6. [非同期処理](#非同期処理)
7. [機能実装のチェックリスト](#機能実装のチェックリスト)

## コード変更の優先順位と変更禁止事項

このセクションでは、絶対に変更してはいけないコードコンポーネントと、変更を検討する際の優先順位を定義します。

### 変更禁止事項 (DO NOT CHANGE)

以下のコードコンポーネントは、アプリケーションの中核を構成しており、変更すると重大な互換性問題を引き起こす可能性があります。変更が絶対に必要な場合は、慎重な計画と広範なテストが必要です。

1. **データ構造の定義**
   - Airtableテーブル構造（フィールド名、データ型）
   - ユーザーとの会話履歴データ形式
   - AIとのやり取りに使用されるプロンプト構造

2. **外部APIインターフェース**
   - LINE Messaging APIとの統合コード
   - OpenAI/GPT APIとの統合部分
   - Airtable APIの基本的な呼び出し方法

3. **認証と環境設定**
   - 環境変数の命名と使用パターン
   - APIキーと認証情報の処理方法
   - セキュリティ関連のコード

4. **グローバル変数の初期化**
   - `airtableBase`などの接続オブジェクト
   - LINEクライアント初期化
   - OpenAI/GPTクライアント初期化

### 変更の優先順位 (CHANGE PRIORITY)

機能追加やバグ修正を行う際は、以下の優先順位に従ってコードの変更を検討してください。

**優先度A（最小限の変更）**:
- バグ修正は、問題のある部分のみを最小限に変更する
- ログの追加や改善（既存コードの動作を変えない）
- コメントの追加や改善
- 変数名の修正（ローカルスコープ内のみ）

**優先度B（限定的な変更）**:
- エラー処理の追加や改善
- パフォーマンス最適化（アルゴリズムの改善）
- コード重複の排除
- 関数のリファクタリング（外部インターフェースを変えない）

**優先度C（注意が必要な変更）**:
- 新しい依存関係の追加
- 新しい関数や機能の追加
- データフローの変更
- 非同期処理の変更

**優先度D（慎重な計画が必要）**:
- データベーススキーマの変更
- APIインターフェースの変更
- グローバル変数の変更または追加
- 認証メカニズムの変更

### 変更を行う際のルール

1. **変更の影響範囲を明確にする**
   - 変更がどのコンポーネントに影響するか文書化する
   - 副作用の可能性を検討する

2. **小さな変更を段階的に行う**
   - 大きな変更は小さな変更に分割する
   - 各ステップを完了したら動作を確認する

3. **変更前後で同じテストを行う**
   - 変更前の動作を文書化し、変更後も同じ結果になることを確認する
   - エッジケースのテストを忘れない

4. **ロールバック計画を用意する**
   - 問題が発生した場合のロールバック手順を準備する
   - 変更前のコードバックアップを保持する

## 変数とデータ構造

### 変数のスコープと初期化

✅ **正しい方法**:
- グローバル変数は明確に宣言し、アプリケーション起動時に初期化する
```javascript
// グローバル変数としてairtableBaseを初期化
let airtableBase = null;
if (process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
  try {
    airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
      .base(process.env.AIRTABLE_BASE_ID);
    console.log('Airtable接続が初期化されました');
  } catch (error) {
    console.error('Airtable接続の初期化に失敗しました:', error);
  }
} else {
  console.warn('Airtable認証情報が不足しているため、履歴機能は制限されます');
}
```

❌ **避けるべき方法**:
- 関数内で同じ外部リソースに接続するローカル変数を作成しない
```javascript
function someFunction() {
  // 関数内でローカル変数としてAirtable接続を初期化（避けるべき）
  const airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
    .base(process.env.AIRTABLE_BASE_ID);
  
  // 処理...
}
```

### データ構造の一貫性

✅ **正しい方法**:
- データ構造を明確に定義し、アプリケーション全体で一貫して使用する
```javascript
// 画像生成リクエストの標準フォーマット
const imageRequest = {
  content: messageText,          // 画像生成の元となるテキスト
  timestamp: Date.now(),         // リクエスト時刻
  source: 'user_confirmation'    // リクエストの発生源
};
pendingImageExplanations.set(userId, imageRequest);
```

- 型チェックと互換性のための分岐を実装する
```javascript
const pendingData = pendingImageExplanations.get(userId);
if (pendingData) {
  // オブジェクト形式の場合
  if (typeof pendingData === 'object' && pendingData.content) {
    promptText = pendingData.content;
  } 
  // 文字列形式の場合（後方互換性）
  else if (typeof pendingData === 'string') {
    promptText = pendingData;
  }
}
```

❌ **避けるべき方法**:
- 一貫性のないデータ形式を使用する
```javascript
// あるところでは文字列を保存
pendingImageExplanations.set(userId, messageText);

// 別のところではオブジェクトを保存
pendingImageExplanations.set(userId, { text: messageText });
```

## データベース接続

### 接続の初期化と検証

✅ **正しい方法**:
- アプリケーション起動時に接続を初期化し、エラーを適切に処理する
- 接続状態を確認してから操作を行う
```javascript
// 接続の初期化と確認
if (!airtableBase) {
  console.error('Airtable接続が初期化されていないため、履歴を取得できません');
  historyMetadata.insufficientReason = 'airtable_not_initialized';
  return { history: [], metadata: historyMetadata };
}

// その後の処理
try {
  const records = await airtableBase('ConversationHistory')
    .select({...})
    .all();
  // 処理...
} catch (error) {
  console.error(`ConversationHistory table error: ${error.message}`);
  // エラー処理...
}
```

❌ **避けるべき方法**:
- 接続確認なしに操作を行う
- エラー処理が不十分なコード
```javascript
// 接続確認なしで直接操作（避けるべき）
const records = await airtableBase('ConversationHistory')
  .select({...})
  .all();
```

### データ取得と保存のパターン

✅ **正しい方法**:
- フィールド名を明示的に指定する
- データの存在確認とエラー処理を行う
```javascript
// 明示的なフィールド指定
const columns = ['UserID', 'Role', 'Content', 'Timestamp', 'Mode', 'MessageType'];
const records = await airtableBase('ConversationHistory')
  .select({
    filterByFormula: `{UserID} = "${userId}"`,
    sort: [{ field: 'Timestamp', direction: 'desc' }],
    fields: columns,
    maxRecords: limit * 2
  })
  .all();

// データの存在確認
if (records && records.length > 0) {
  // データ処理...
} else {
  console.log(`No records found for user ${userId}`);
}
```

❌ **避けるべき方法**:
- フィールド名を暗黙的に使用する
- 値の存在確認が不十分
```javascript
// フィールド指定なし（避けるべき）
const records = await airtableBase('ConversationHistory')
  .select({
    filterByFormula: `{UserID} = "${userId}"`
  })
  .all();

// データの存在確認が不十分（避けるべき）
const content = record.get('Content'); // contentがnullの場合のチェックなし
```

## エラー処理

### 例外のキャプチャと処理

✅ **正しい方法**:
- 具体的なエラーメッセージとコンテキスト情報を記録する
- リソースのクリーンアップを確実に行う
- エラー後も安全に続行できるようにする
```javascript
try {
  // 処理...
} catch (err) {
  console.error(`Error fetching user history: ${err.message}`);
  console.error(`Error details: ${err.stack}`);
  console.error(`User ID: ${userId}, Limit: ${limit}`);
  
  // リソースクリーンアップ
  if (imageGenerationInProgress.has(userId)) {
    imageGenerationInProgress.delete(userId);
  }
  
  // エラー後も安全に続行
  return { history: [], metadata: { totalRecords: 0, insufficientReason: 'error' } };
}
```

❌ **避けるべき方法**:
- 情報不足のエラーメッセージ
- リソースが適切にクリーンアップされない
```javascript
try {
  // 処理...
} catch (err) {
  console.error('Error occurred'); // 情報不足（避けるべき）
  // リソースクリーンアップなし（避けるべき）
  return null; // エラー後の安全な続行のための情報なし（避けるべき）
}
```

### ユーザー向けエラーメッセージ

✅ **正しい方法**:
- 技術的なエラーを適切にユーザーフレンドリーなメッセージに変換する
- 否定的な表現を避け、前向きなトーンを維持する
```javascript
// 技術的なエラーをユーザーフレンドリーに変換
if (error) {
  // デバッグ用に詳細をログに記録
  console.error(`Image generation error: ${error.message}`);
  
  // ユーザー向けメッセージ
  return client.replyMessage(replyToken, {
    type: 'text',
    text: '申し訳ありません、画像生成中に問題が発生しました。別の表現で試してみてください。'
  });
}
```

❌ **避けるべき方法**:
- 技術的なエラーをそのままユーザーに表示する
- 否定的なトーンのメッセージ
```javascript
// 技術的なエラーをそのまま表示（避けるべき）
if (error) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: `エラーが発生しました: ${error.message}`
  });
}
```

## ロギング

### ログレベルとコンテキスト

✅ **正しい方法**:
- 適切なログレベルを使用する（info, warn, error）
- 十分なコンテキスト情報を含める
- デバッグ目的のログはラベル付けする
```javascript
// 情報ログ
console.log(`Fetching history for user ${userId}, limit: ${limit}`);

// 警告ログ
console.warn('Airtable認証情報が不足しているため、履歴機能は制限されます');

// エラーログ（コンテキスト情報付き）
console.error(`レコード処理エラー: ${recordErr.message}`, { recordId: record.id });

// デバッグログ
console.log(`[DEBUG] Analyzing if user understands AI response: "${messageText}"`);
```

❌ **避けるべき方法**:
- 一貫性のないログレベルの使用
- コンテキスト情報が不足しているログ
```javascript
// コンテキスト情報不足（避けるべき）
console.log('Error occurred');
console.error('Fetching data'); // 適切なログレベルではない
```

### 構造化ロギング

✅ **正しい方法**:
- 複雑なデータ構造をログに記録する場合は`JSON.stringify`を使用する
- セクション分けと視覚的な区切りを使用する
```javascript
// 複雑なデータ構造のログ
console.log(`レコード構造: ${JSON.stringify(record.fields, null, 2)}`);

// セクション分けされたログ
console.log('\n===== レコード構造サンプル =====');
console.log(`  レコードID: ${record.id}`);
console.log(`  フィールド: ${JSON.stringify(record.fields)}`);
console.log('===== レコード構造サンプル終了 =====\n');
```

❌ **避けるべき方法**:
- 構造化されていないオブジェクトの直接出力
- 区切りのないログ
```javascript
// 構造化されていないオブジェクト出力（避けるべき）
console.log(record.fields);
```

## 非同期処理

### async/awaitパターン

✅ **正しい方法**:
- 非同期関数には常に`async`キーワードを使用する
- Promiseを返す呼び出しには`await`を使用する
- Promise.allを使用して並列処理を行う
```javascript
// 正しい非同期パターン
async function fetchUserHistory(userId, limit) {
  try {
    const records = await airtableBase('ConversationHistory')
      .select({...})
      .all();
    
    // 処理...
    return { history, metadata };
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return { history: [], metadata: {} };
  }
}

// 並列処理
async function fetchMultipleData(userId) {
  try {
    const [history, preferences] = await Promise.all([
      fetchUserHistory(userId, 10),
      fetchUserPreferences(userId)
    ]);
    
    return { history, preferences };
  } catch (error) {
    console.error(`Error fetching data: ${error.message}`);
    return { history: [], preferences: {} };
  }
}
```

❌ **避けるべき方法**:
- コールバックの入れ子
- 非同期処理の混在
- エラー処理が不適切
```javascript
// 入れ子のコールバック（避けるべき）
function fetchData(userId, callback) {
  airtableBase('ConversationHistory')
    .select({...})
    .all(function(error, records) {
      if (error) {
        callback(error);
        return;
      }
      // 処理...
      callback(null, result);
    });
}
```

### タイムアウト処理

✅ **正しい方法**:
- 明示的なタイムアウト処理を実装する
- タイムアウト後のクリーンアップを確実に行う
```javascript
// タイムアウト処理
async function fetchWithTimeout(userId, timeoutMs = 5000) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Request timed out')), timeoutMs);
  });
  
  try {
    const result = await Promise.race([
      fetchData(userId),
      timeoutPromise
    ]);
    
    return result;
  } catch (error) {
    console.error(`Fetch error: ${error.message}`);
    
    // クリーンアップ
    if (pendingRequests.has(userId)) {
      pendingRequests.delete(userId);
    }
    
    throw error;
  }
}
```

❌ **避けるべき方法**:
- タイムアウト処理がない
- リソースのクリーンアップが行われない
```javascript
// タイムアウト処理がない（避けるべき）
async function fetchData(userId) {
  const result = await someSlowOperation();
  return result;
}
```

## 機能実装のチェックリスト

新機能の実装やバグ修正を行う際は、以下のチェックリストを使用して一貫性を確保してください。

### 1. 変数とデータ構造
- [ ] グローバル変数とローカル変数の適切な使い分け
- [ ] 一貫したデータ構造の使用
- [ ] データ型のチェックと変換が適切

### 2. データベース操作
- [ ] 接続状態の確認
- [ ] 明示的なフィールド指定
- [ ] エラーケースの処理
- [ ] トランザクションの適切な使用（必要な場合）

### 3. エラー処理
- [ ] try/catchによる例外処理
- [ ] 詳細なエラーログ
- [ ] リソースのクリーンアップ
- [ ] ユーザーフレンドリーなエラーメッセージ

### 4. ロギング
- [ ] 適切なログレベルの使用
- [ ] 十分なコンテキスト情報
- [ ] 構造化されたデータのログ
- [ ] デバッグ情報の適切なラベル付け

### 5. 非同期処理
- [ ] async/awaitの一貫した使用
- [ ] Promise.allによる並列処理（適切な場合）
- [ ] タイムアウト処理の実装
- [ ] 非同期状態のクリーンアップ

### 6. テスト
- [ ] エッジケースのテスト
- [ ] エラーケースのテスト
- [ ] 並列処理のテスト
- [ ] タイムアウトのテスト

---

このガイドラインに従うことで、コードの一貫性が保たれ、将来的なバグやメンテナンスの問題を減らすことができます。変更を行う前にこのドキュメントを参照し、コード品質を維持してください。 