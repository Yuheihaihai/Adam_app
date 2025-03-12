// db.js
require('dotenv').config();
const { Pool } = require('pg');

// PostgreSQL接続プール
let poolConfig;
let pool;

try {
  if (process.env.DATABASE_URL) {
    // Heroku環境の場合、DATABASE_URL環境変数を使用
    poolConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    };
    console.log('Database configuration: Using DATABASE_URL');
  } else if (process.env.DB_HOST && process.env.DB_USER && process.env.DB_DATABASE) {
    // ローカル環境の場合、個別の環境変数を使用（必須項目がある場合のみ）
    poolConfig = {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      port: process.env.DB_PORT || 5432,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    };
    console.log('Database configuration: Using individual config params');
  } else {
    console.warn('⚠️ WARNING: Incomplete database configuration. Some features may not work.');
    // 最小限の設定を提供
    poolConfig = {
      // デフォルト値や環境変数がある場合はそれを使用
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_DATABASE || 'postgres'
    };
  }

  // 接続プールの作成
  pool = new Pool(poolConfig);
  console.log('Database pool created successfully');

} catch (error) {
  console.error('⚠️ ERROR initializing database pool:', error.message);
  // フォールバックとして空のプールオブジェクトを作成し、基本的な関数を持たせる
  pool = {
    query: async () => { throw new Error('Database connection not available'); },
    connect: async () => { throw new Error('Database connection not available'); }
  };
}

// データベース接続のテスト
async function testConnection() {
  try {
    const client = await pool.connect();
    try {
      // 簡単なクエリを実行してDBが応答することを確認
      await client.query('SELECT NOW()');
      console.log('Database connection successful');
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return false;
  }
}

// テーブルを初期化（存在しない場合は作成）
async function initializeTables() {
  let client;
  
  try {
    client = await pool.connect();
    
    // ユーザーメッセージテーブル
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_messages (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        role VARCHAR(50) NOT NULL,
        timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_messages_user_id ON user_messages(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_messages_timestamp ON user_messages(timestamp)`);

    // 分析結果テーブル
    await client.query(`
      CREATE TABLE IF NOT EXISTS analysis_results (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        result_type VARCHAR(50) NOT NULL,
        data JSONB NOT NULL,
        timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_analysis_results_user_id ON analysis_results(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_analysis_results_result_type ON analysis_results(result_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_analysis_results_timestamp ON analysis_results(timestamp)`);

    // インテントトレーニングデータテーブル
    await client.query(`
      CREATE TABLE IF NOT EXISTS intent_training_data (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        predicted_intent VARCHAR(50),
        correct_intent VARCHAR(50) NOT NULL,
        feedback_type VARCHAR(50) NOT NULL,
        user_id VARCHAR(255),
        context JSONB,
        trained BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_intent_training_data_intent ON intent_training_data(correct_intent)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_intent_training_data_trained ON intent_training_data(trained)`);

    // インテントモデルバージョンテーブル
    await client.query(`
      CREATE TABLE IF NOT EXISTS intent_model_versions (
        id SERIAL PRIMARY KEY,
        version VARCHAR(20) NOT NULL,
        description TEXT,
        model_path TEXT NOT NULL,
        training_samples INTEGER NOT NULL,
        accuracy FLOAT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT FALSE
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_intent_model_versions_active ON intent_model_versions(is_active)`);
    
    // インテント語彙テーブル
    await client.query(`
      CREATE TABLE IF NOT EXISTS intent_vocabulary (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        token_id INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_intent_vocabulary_token ON intent_vocabulary(token)`);

    console.log('Database tables initialized');
    return true;
  } catch (error) {
    console.error('Failed to initialize tables:', error.message);
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}

// クエリを実行するラッパー関数
async function query(sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (error) {
    console.error('Query error:', error.message);
    throw error;
  }
}

module.exports = {
  pool,
  query,
  testConnection,
  initializeTables
}; 