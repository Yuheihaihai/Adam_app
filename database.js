/**
 * database.js
 * PostgreSQLデータベース接続と操作のためのモジュール
 */

require('dotenv').config();
const { Pool } = require('pg');
const db = require('./db');

// db.jsからプールとメソッドをエクスポート
const pool = db.pool;

/**
 * SQLクエリを実行する
 * @param {string} text - SQLクエリ文字列
 * @param {Array} params - クエリパラメータ
 * @returns {Promise<Object>} クエリ結果
 */
async function query(text, params = []) {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  }
}

/**
 * データベース接続をテストする
 * @returns {Promise<boolean>} 接続が成功したかどうか
 */
async function testConnection() {
  return db.testConnection();
}

/**
 * データベーステーブルを初期化する
 * @returns {Promise<boolean>} 初期化が成功したかどうか
 */
async function initializeTables() {
  return db.initializeTables();
}

/**
 * データベース接続を終了する
 * @returns {Promise<void>}
 */
async function end() {
  try {
    await pool.end();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error closing database connection:', error.message);
  }
}

// user_messagesテーブルにメッセージを保存する
async function storeMessage(userId, messageId, role, content, timestamp, mode, messageType) {
  try {
    const result = await query(
      'INSERT INTO user_messages (user_id, message_id, role, content, timestamp, mode, message_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [userId, messageId, role, content, timestamp, mode, messageType]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error storing message:', error.message);
    throw error;
  }
}

// user_messagesテーブルからユーザーのメッセージを取得する
async function getUserMessages(userId, limit = 20) {
  try {
    const result = await query(
      'SELECT * FROM user_messages WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2',
      [userId, limit]
    );
    return result.rows;
  } catch (error) {
    console.error('Error retrieving user messages:', error.message);
    throw error;
  }
}

// テーブル内のレコード数を取得する
async function getTableCount(tableName) {
  try {
    const result = await query(`SELECT COUNT(*) FROM ${tableName}`);
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    console.error(`Error getting count for table ${tableName}:`, error.message);
    return 0;
  }
}

// データベース内のテーブル一覧を取得する
async function listTables() {
  try {
    const result = await query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    return result.rows.map(row => row.table_name);
  } catch (error) {
    console.error('Error listing tables:', error.message);
    return [];
  }
}

module.exports = {
  query,
  testConnection,
  initializeTables,
  end,
  storeMessage,
  getUserMessages,
  getTableCount,
  listTables
}; 