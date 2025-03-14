/**
 * テスト: データベース統合機能のテスト
 * 
 * このスクリプトは、PostgreSQLとAirtableの両方にデータを保存し、
 * 両方のデータソースからデータを取得する機能をテストします。
 */

require('dotenv').config();

// 環境変数の確認
const USE_DATABASE = process.env.USE_DATABASE === 'true';
if (!USE_DATABASE) {
  console.log('警告: USE_DATABASE環境変数が有効になっていません。PostgreSQLテストはスキップされます。');
}

// Airtable設定の確認
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('エラー: Airtableの設定が不足しています。AIRTABLE_API_KEYとAIRTABLE_BASE_IDを確認してください。');
  process.exit(1);
}

// 必要なモジュールのインポート
const Airtable = require('airtable');
const db = USE_DATABASE ? require('../database') : null;
const { v4: uuidv4 } = require('uuid');

// Airtableの設定
const airtableBase = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
const INTERACTIONS_TABLE = 'UserMessages';

/**
 * テスト用のメッセージデータを生成
 */
function generateTestMessage(userId) {
  const timestamp = new Date().toISOString();
  const messageId = uuidv4();
  
  return {
    userId,
    messageId,
    role: 'user',
    content: `これはテストメッセージです。タイムスタンプ: ${timestamp}`,
    timestamp,
    mode: 'test',
    messageType: 'text'
  };
}

/**
 * メッセージをAirtableとPostgreSQLに保存
 */
async function storeInteraction(message) {
  console.log('メッセージを保存しています...');
  
  // PostgreSQLに保存（有効な場合）
  if (USE_DATABASE) {
    try {
      await db.query(
        'INSERT INTO user_messages (user_id, message_id, role, content, timestamp, mode, message_type) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [message.userId, message.messageId, message.role, message.content, message.timestamp, message.mode, message.messageType]
      );
      console.log('PostgreSQLにメッセージを保存しました');
    } catch (error) {
      console.error('PostgreSQLへの保存中にエラーが発生しました:', error);
    }
  }
  
  // Airtableに保存
  try {
    await airtableBase(INTERACTIONS_TABLE).create({
      UserID: message.userId,
      MessageID: message.messageId,
      Role: message.role,
      Content: message.content,
      Timestamp: message.timestamp,
      Mode: message.mode,
      MessageType: message.messageType
    });
    console.log('Airtableにメッセージを保存しました');
  } catch (error) {
    console.error('Airtableへの保存中にエラーが発生しました:', error);
  }
}

/**
 * ユーザーの会話履歴を取得
 */
async function fetchUserHistory(userId, limit = 20) {
  console.log(`ユーザー ${userId} の会話履歴を取得しています...`);
  let messages = [];
  
  // PostgreSQLからデータを取得（有効な場合）
  if (USE_DATABASE) {
    try {
      const result = await db.query(
        'SELECT * FROM user_messages WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2',
        [userId, limit]
      );
      
      if (result.rows.length > 0) {
        console.log(`PostgreSQLから ${result.rows.length} 件のメッセージを取得しました`);
        messages = result.rows.map(row => ({
          role: row.role,
          content: row.content,
          timestamp: row.timestamp,
          mode: row.mode,
          messageType: row.message_type
        })).reverse(); // 古い順に並べ替え
      } else {
        console.log('PostgreSQLにメッセージが見つかりませんでした');
      }
    } catch (error) {
      console.error('PostgreSQLからの取得中にエラーが発生しました:', error);
    }
  }
  
  // Airtableからデータを取得（PostgreSQLにデータがない場合）
  if (messages.length === 0) {
    try {
      const records = await airtableBase(INTERACTIONS_TABLE)
        .select({
          filterByFormula: `{UserID} = '${userId}'`,
          sort: [{ field: 'Timestamp', direction: 'desc' }],
          maxRecords: limit
        })
        .all();
      
      if (records.length > 0) {
        console.log(`Airtableから ${records.length} 件のメッセージを取得しました`);
        messages = records.map(record => ({
          role: record.get('Role'),
          content: record.get('Content'),
          timestamp: record.get('Timestamp'),
          mode: record.get('Mode'),
          messageType: record.get('MessageType')
        })).reverse(); // 古い順に並べ替え
      } else {
        console.log('Airtableにメッセージが見つかりませんでした');
      }
    } catch (error) {
      console.error('Airtableからの取得中にエラーが発生しました:', error);
    }
  }
  
  return messages;
}

/**
 * メインのテスト関数
 */
async function runTest() {
  console.log('データベース統合テストを開始します...');
  
  // テスト用のユーザーID
  const testUserId = `test-user-${Date.now()}`;
  console.log(`テスト用ユーザーID: ${testUserId}`);
  
  // テストメッセージを生成
  const testMessage = generateTestMessage(testUserId);
  console.log('テストメッセージ:', testMessage);
  
  // メッセージを保存
  await storeInteraction(testMessage);
  
  // 少し待機してデータが確実に保存されるようにする
  console.log('データが保存されるのを待機しています...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 会話履歴を取得
  const history = await fetchUserHistory(testUserId);
  console.log('取得した会話履歴:', history);
  
  // テスト結果の検証
  if (history.length > 0) {
    console.log('テスト成功: メッセージが正常に保存され、取得されました');
    
    // 内容の検証
    const retrievedMessage = history[0];
    if (retrievedMessage.content === testMessage.content) {
      console.log('内容の検証: 成功');
    } else {
      console.log('内容の検証: 失敗 - 内容が一致しません');
      console.log('期待値:', testMessage.content);
      console.log('実際の値:', retrievedMessage.content);
    }
  } else {
    console.log('テスト失敗: メッセージが取得できませんでした');
  }
  
  console.log('データベース統合テストが完了しました');
  
  // データベース接続を閉じる（PostgreSQLを使用している場合）
  if (USE_DATABASE && db.end) {
    await db.end();
    console.log('PostgreSQL接続を閉じました');
  }
}

// テストを実行
runTest().catch(error => {
  console.error('テスト実行中にエラーが発生しました:', error);
  process.exit(1);
}); 