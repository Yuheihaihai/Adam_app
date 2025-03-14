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
const USE_AIRTABLE = AIRTABLE_API_KEY && AIRTABLE_BASE_ID;
if (!USE_AIRTABLE) {
  console.log('警告: Airtableの設定が不足しています。Airtableテストはスキップされます。');
}

// 必要なモジュールのインポート
const Airtable = USE_AIRTABLE ? require('airtable') : null;
const db = USE_DATABASE ? require('../database') : null;
const { v4: uuidv4 } = require('uuid');

// Airtableの設定
let airtableBase = null;
if (USE_AIRTABLE) {
  try {
    airtableBase = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    console.log('Airtable接続を設定しました');
  } catch (error) {
    console.error('Airtable接続の設定に失敗しました:', error.message);
  }
}
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
  let postgresSuccess = false;
  let airtableSuccess = false;
  
  // PostgreSQLに保存（有効な場合）
  if (USE_DATABASE) {
    try {
      await db.query(
        'INSERT INTO user_messages (user_id, message_id, role, content, timestamp, mode, message_type) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [message.userId, message.messageId, message.role, message.content, message.timestamp, message.mode, message.messageType]
      );
      console.log('PostgreSQLにメッセージを保存しました');
      postgresSuccess = true;
    } catch (error) {
      console.error('PostgreSQLへの保存中にエラーが発生しました:', error);
    }
  }
  
  // Airtableに保存（有効な場合）
  if (USE_AIRTABLE && airtableBase) {
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
      airtableSuccess = true;
    } catch (error) {
      console.error('Airtableへの保存中にエラーが発生しました:', error);
    }
  }
  
  return { postgresSuccess, airtableSuccess };
}

/**
 * ユーザーの会話履歴を取得
 */
async function fetchUserHistory(userId, limit = 20) {
  console.log(`ユーザー ${userId} の会話履歴を取得しています...`);
  let messages = [];
  let postgresSuccess = false;
  let airtableSuccess = false;
  
  // PostgreSQLからデータを取得（有効な場合）
  if (USE_DATABASE) {
    try {
      const result = await db.query(
        'SELECT * FROM user_messages WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2',
        [userId, limit]
      );
      
      if (result.rows && result.rows.length > 0) {
        console.log(`PostgreSQLから ${result.rows.length} 件のメッセージを取得しました`);
        messages = result.rows.map(row => ({
          role: row.role,
          content: row.content,
          timestamp: row.timestamp,
          mode: row.mode,
          messageType: row.message_type
        })).reverse(); // 古い順に並べ替え
        postgresSuccess = true;
      } else {
        console.log('PostgreSQLにメッセージが見つかりませんでした');
      }
    } catch (error) {
      console.error('PostgreSQLからの取得中にエラーが発生しました:', error);
    }
  }
  
  // Airtableからデータを取得（PostgreSQLにデータがない場合かつAirtableが有効な場合）
  if (messages.length === 0 && USE_AIRTABLE && airtableBase) {
    try {
      const records = await airtableBase(INTERACTIONS_TABLE)
        .select({
          filterByFormula: `{UserID} = '${userId}'`,
          sort: [{ field: 'Timestamp', direction: 'desc' }],
          maxRecords: limit
        })
        .all();
      
      if (records && records.length > 0) {
        console.log(`Airtableから ${records.length} 件のメッセージを取得しました`);
        messages = records.map(record => ({
          role: record.get('Role'),
          content: record.get('Content'),
          timestamp: record.get('Timestamp'),
          mode: record.get('Mode'),
          messageType: record.get('MessageType')
        })).reverse(); // 古い順に並べ替え
        airtableSuccess = true;
      } else {
        console.log('Airtableにメッセージが見つかりませんでした');
      }
    } catch (error) {
      console.error('Airtableからの取得中にエラーが発生しました:', error);
    }
  }
  
  return { messages, postgresSuccess, airtableSuccess };
}

/**
 * データベーステーブルを初期化する
 */
async function initializeDatabaseTables() {
  if (USE_DATABASE) {
    try {
      await db.initializeTables();
      console.log('データベーステーブルを初期化しました');
      return true;
    } catch (error) {
      console.error('データベーステーブルの初期化に失敗しました:', error);
      return false;
    }
  }
  return false;
}

/**
 * メインのテスト関数
 */
async function runTest() {
  console.log('データベース統合テストを開始します...');
  
  // データベーステーブルを初期化
  await initializeDatabaseTables();
  
  // テスト用のユーザーID
  const testUserId = `test-user-${Date.now()}`;
  console.log(`テスト用ユーザーID: ${testUserId}`);
  
  // テストメッセージを生成
  const testMessage = generateTestMessage(testUserId);
  console.log('テストメッセージ:', testMessage);
  
  // メッセージを保存
  const saveResult = await storeInteraction(testMessage);
  
  // 少し待機してデータが確実に保存されるようにする
  console.log('データが保存されるのを待機しています...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 会話履歴を取得
  const { messages, postgresSuccess, airtableSuccess } = await fetchUserHistory(testUserId);
  console.log('取得した会話履歴:', messages);
  
  // テスト結果の検証
  let testPassed = false;
  
  if (messages.length > 0) {
    console.log('テスト成功: メッセージが正常に保存され、取得されました');
    
    // 内容の検証
    const retrievedMessage = messages[0];
    if (retrievedMessage.content === testMessage.content) {
      console.log('内容の検証: 成功');
      testPassed = true;
    } else {
      console.log('内容の検証: 失敗 - 内容が一致しません');
      console.log('期待値:', testMessage.content);
      console.log('実際の値:', retrievedMessage.content);
    }
  } else {
    console.log('テスト失敗: メッセージが取得できませんでした');
  }
  
  // テスト結果のサマリー
  console.log('\nテスト結果サマリー:');
  console.log('-------------------');
  console.log(`PostgreSQL保存: ${saveResult.postgresSuccess ? '成功' : '失敗'}`);
  console.log(`Airtable保存: ${saveResult.airtableSuccess ? '成功' : '失敗'}`);
  console.log(`PostgreSQL取得: ${postgresSuccess ? '成功' : '失敗'}`);
  console.log(`Airtable取得: ${airtableSuccess ? '成功' : '失敗'}`);
  console.log(`全体テスト結果: ${testPassed ? '成功' : '失敗'}`);
  console.log('-------------------');
  
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