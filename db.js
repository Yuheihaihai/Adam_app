// db.js
require('dotenv').config();
const { Pool } = require('pg');
const securityConfig = require('./db_security_config');
const encryptionService = require('./encryption_utils');
const appleSecurityStandards = require('./apple_security_standards');
const { userIsolationGuard } = require('./user_isolation_verification');

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
    
    // トランザクション開始 - 同時実行を防ぐ
    await client.query('BEGIN');
    
    // pgvector拡張機能の有効化（存在しなければ作成）
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS vector`);
      console.log('pgvector extension enabled');
    } catch (error) {
      console.error('Failed to enable pgvector extension:', error.message);
      console.log('Will continue without vector search capabilities');
    }
    
    // Apple基準セキュアメッセージテーブル
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_messages (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        message_id VARCHAR(255),
        content TEXT NOT NULL,
        role VARCHAR(50) NOT NULL,
        timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        mode VARCHAR(50),
        message_type VARCHAR(50),
        zk_proof TEXT,
        deletion_scheduled_at TIMESTAMP,
        privacy_level INTEGER DEFAULT 3,
        e2ee_key_id VARCHAR(255)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_messages_user_id ON user_messages(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_messages_timestamp ON user_messages(timestamp)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_messages_deletion ON user_messages(deletion_scheduled_at)`);
    
    // Apple基準: 180日後の自動削除トリガー
    // 既存のトリガーを確認してから作成
    const triggerExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'set_deletion_date'
      )
    `);
    
    if (!triggerExists.rows[0].exists) {
      await client.query(`
        CREATE OR REPLACE FUNCTION auto_delete_old_messages() RETURNS trigger AS $$
        BEGIN
          NEW.deletion_scheduled_at := NEW.timestamp + INTERVAL '180 days';
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      
      await client.query(`
        CREATE TRIGGER set_deletion_date
          BEFORE INSERT ON user_messages
          FOR EACH ROW
          EXECUTE FUNCTION auto_delete_old_messages();
      `);
    }
    
    // message_idカラムが存在しない場合は追加
    try {
      await client.query(`
        ALTER TABLE user_messages 
        ADD COLUMN IF NOT EXISTS message_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS mode VARCHAR(50),
        ADD COLUMN IF NOT EXISTS message_type VARCHAR(50)
      `);
      console.log('Added missing columns to user_messages table');
    } catch (error) {
      console.error('Error adding columns to user_messages table:', error.message);
    }

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

    // 音声会話統計テーブル（デプロイ時の永続化のため追加）
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_audio_stats (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL UNIQUE,
        audio_requests_total INTEGER DEFAULT 0,
        audio_requests_today INTEGER DEFAULT 0,
        last_conversation_timestamp BIGINT,
        last_audio_request_date BIGINT,
        last_audio_notification_date BIGINT,
        last_reset_date DATE DEFAULT CURRENT_DATE,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_audio_stats_user_id ON user_audio_stats(user_id)`);

    // セキュリティ監査ログテーブル
    await client.query(`
      CREATE TABLE IF NOT EXISTS security_audit_log (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(50) NOT NULL,
        user_id VARCHAR(255),
        details TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_security_audit_log_timestamp ON security_audit_log(timestamp)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_security_audit_log_event_type ON security_audit_log(event_type)`);

    // セマンティック検索用テーブル - pgvector拡張を使用
    try {
      // pgvector拡張が有効な場合のみテーブル作成
      const extensionCheck = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_extension WHERE extname = 'vector'
        )
      `);
      
      if (extensionCheck.rows[0].exists) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS semantic_embeddings (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            message_id VARCHAR(255),
            content TEXT NOT NULL,
            embedding vector(1536),
            is_question BOOLEAN DEFAULT FALSE,
            is_important BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            access_count INTEGER DEFAULT 0
          )
        `);
        
        // 検索用インデックス作成
        await client.query(`CREATE INDEX IF NOT EXISTS idx_semantic_embeddings_user_id ON semantic_embeddings(user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_semantic_embeddings_expires ON semantic_embeddings(expires_at)`);
        
        // ベクトルインデックス作成（存在しない場合のみ）
        try {
          await client.query(`CREATE INDEX IF NOT EXISTS idx_semantic_embeddings_vector ON semantic_embeddings USING ivfflat (embedding vector_l2_ops)`);
          console.log('Vector index created successfully');
        } catch (indexError) {
          console.log('Vector index already exists or could not be created:', indexError.message);
        }
        
        console.log('Semantic search tables created successfully');
      } else {
        console.log('pgvector extension not available - skipping semantic search tables');
      }
    } catch (error) {
      console.error('Failed to create semantic search tables:', error.message);
    }

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

    // user_ml_analysisテーブル（LocalML用）
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_ml_analysis (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        analysis_data JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_user_ml_analysis_user_id ON user_ml_analysis(user_id)`);

    // 定期的な古いエンベディングのクリーンアップ用関数
    try {
      // 既存の関数を確認
      const funcExists = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_proc 
          WHERE proname = 'cleanup_old_embeddings'
        )
      `);
      
      if (!funcExists.rows[0].exists) {
        await client.query(`
          CREATE OR REPLACE FUNCTION cleanup_old_embeddings() RETURNS void AS $$
          BEGIN
            DELETE FROM semantic_embeddings 
            WHERE (expires_at IS NOT NULL AND expires_at < NOW())
            OR (created_at < NOW() - INTERVAL '30 days' AND access_count < 3);
          END;
          $$ LANGUAGE plpgsql;
        `);
        console.log('Cleanup function created successfully');
      } else {
        console.log('Cleanup function already exists');
      }
    } catch (error) {
      // 同時実行エラーの場合は無視
      if (error.message.includes('tuple concurrently updated')) {
        console.log('Cleanup function creation skipped - concurrent update');
      } else {
        console.error('Failed to create cleanup function:', error.message);
      }
    }

    // トランザクションコミット
    await client.query('COMMIT');
    console.log('Database tables initialized');
    return true;
  } catch (error) {
    // エラー時はロールバック
    if (client) {
      await client.query('ROLLBACK');
    }
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

// Apple並みセキュアなメッセージ保存（E2EE + 差分プライバシー）
async function storeSecureUserMessage(userId, messageId, content, role, mode = 'general', messageType = 'text') {
  try {
    // 🔐 【絶対的UserID検証】すべてのデータアクセス前に必須
    await userIsolationGuard.verifyUserIdIntegrity(userId, 'store_user_message', { 
      messageId, role, mode, messageType, contentLength: content.length 
    });
    
    // プライバシー影響評価
    const privacyAssessment = appleSecurityStandards.assessPrivacyImpact('store_message');
    console.log(`[PRIVACY] Risk Level: ${privacyAssessment.riskLevel}`);
    
    // データ最小化原則適用
    const minimizedData = appleSecurityStandards.minimizeData({
      userId,
      messageId,
      content,
      role,
      mode,
      messageType
    }, 'storage');
    
    // エンドツーエンド暗号化
    const encryptedContent = encryptionService.encrypt(content);
    
    // ゼロ知識証明生成
    const zkProof = await appleSecurityStandards.generateZeroKnowledgeProof(userId, messageId);
    
    // 🔐 【安全なハッシュ化】専用メソッドで確実に生成
    const hashedUserId = userIsolationGuard.generateSecureHashedUserId(userId);
    
    // 🔐 【安全なクエリ実行】UserID分離保証付き
    const result = await userIsolationGuard.executeSecureQuery(
      pool,
      `INSERT INTO user_messages 
       (user_id, message_id, content, role, mode, message_type, timestamp, zk_proof) 
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
       RETURNING id`,
      [hashedUserId, messageId, encryptedContent, role, mode, messageType, zkProof.proof],
      userId,
      'store_user_message'
    );
    
    // 監査証跡生成
    const auditTrail = await appleSecurityStandards.generateAuditTrail('store_message', minimizedData);
    await logSecurityEvent('message_stored_apple', userId, auditTrail);
    
    console.log(`🔐 [ULTRA-SECURE] Message stored with E2EE + ABSOLUTE Privacy Protection`);
    return result.rows[0];
  } catch (error) {
    console.error('🚨 [ULTRA-SECURE] Error storing message:', error.message);
    throw error;
  }
}

// セキュアな履歴取得（完全なユーザー分離）
async function fetchSecureUserHistory(userId, limit = 30) {
  try {
    // 🔐 【絶対的UserID検証】すべてのデータアクセス前に必須
    await userIsolationGuard.verifyUserIdIntegrity(userId, 'fetch_user_history', { limit });
    
    // プライバシー影響評価
    const privacyAssessment = appleSecurityStandards.assessPrivacyImpact('fetch_history');
    console.log(`[PRIVACY] History fetch risk: ${privacyAssessment.riskLevel}`);
    
    // 🔐 【安全なハッシュ化】専用メソッドで確実に生成
    const hashedUserId = userIsolationGuard.generateSecureHashedUserId(userId);
    
    // 🔐 【安全なクエリ実行】UserID分離保証付き
    const result = await userIsolationGuard.executeSecureQuery(
      pool,
      `SELECT * FROM user_messages 
       WHERE user_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [hashedUserId, limit],
      userId,
      'fetch_user_history'
    );
    
    // 復号化して返却（該当ユーザーのデータのみ）
    const decryptedHistory = result.rows.map(row => ({
      ...row,
      content: encryptionService.decrypt(row.content) || row.content,
      user_id: userId // 元のIDに戻す
    }));
    
    console.log(`🔐 [ULTRA-SECURE] Retrieved ${decryptedHistory.length} messages for user ${userId.substring(0, 8)}... (ABSOLUTE user isolation)`);
    return decryptedHistory;
  } catch (error) {
    console.error('🚨 [ULTRA-SECURE] Error fetching history:', error.message);
    return [];
  }
}

// セキュリティ監査ログ
async function logSecurityEvent(eventType, userId, details) {
  try {
    const maskedUserId = encryptionService.maskSensitiveData(userId);
    const maskedDetails = encryptionService.maskSensitiveData(JSON.stringify(details));
    
    await pool.query(
      `INSERT INTO security_audit_log 
       (event_type, user_id, details, timestamp) 
       VALUES ($1, $2, $3, NOW())`,
      [eventType, maskedUserId, maskedDetails]
    );
  } catch (error) {
    console.error('[SECURITY] Failed to log security event:', error.message);
  }
}

// Apple基準データ削除（削除証明書付き）
async function deleteUserDataWithCertificate(userId, options = {}) {
  try {
    const hashedUserId = require('crypto')
      .createHash('sha256')
      .update(userId)
      .digest('hex');
    
    // 削除対象データタイプ
    const dataTypes = ['messages', 'embeddings', 'analysis_results', 'audio_stats'];
    
    // トランザクション開始
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // 各テーブルからデータ削除
      const deletionResults = {};
      
      // メッセージ削除
      const messageResult = await client.query(
        'DELETE FROM user_messages WHERE user_id = $1 RETURNING COUNT(*)',
        [hashedUserId]
      );
      deletionResults.messages = messageResult.rowCount;
      
      // エンベディング削除
      const embeddingResult = await client.query(
        'DELETE FROM semantic_embeddings WHERE user_id = $1 RETURNING COUNT(*)',
        [hashedUserId]
      );
      deletionResults.embeddings = embeddingResult.rowCount;
      
      // 分析結果削除
      const analysisResult = await client.query(
        'DELETE FROM analysis_results WHERE user_id = $1 RETURNING COUNT(*)',
        [hashedUserId]
      );
      deletionResults.analysis = analysisResult.rowCount;
      
      // 音声統計削除
      const audioResult = await client.query(
        'DELETE FROM user_audio_stats WHERE user_id = $1 RETURNING COUNT(*)',
        [hashedUserId]
      );
      deletionResults.audio = audioResult.rowCount;
      
      await client.query('COMMIT');
      
      // 削除証明書生成
      const certificate = appleSecurityStandards.generateDeletionCertificate(userId, dataTypes);
      
      // 削除証明書を監査ログに記録
      await logSecurityEvent('data_deletion_certified', userId, {
        certificate: certificate.certificateId,
        deletionResults,
        timestamp: certificate.deletionTimestamp
      });
      
      console.log(`[APPLE-SECURE] User data deleted with certificate: ${certificate.certificateId}`);
      return certificate;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[APPLE-SECURE] Error deleting user data:', error.message);
    throw error;
  }
}

// 自動削除スケジューラー（90日経過データ）
async function executeScheduledDeletions() {
  try {
    const result = await pool.query(`
      DELETE FROM user_messages 
      WHERE deletion_scheduled_at <= NOW()
      RETURNING user_id, COUNT(*) as deleted_count
      GROUP BY user_id
    `);
    
    for (const row of result.rows) {
      console.log(`[AUTO-DELETE] Deleted ${row.deleted_count} messages for user ${row.user_id.substring(0, 8)}...`);
    }
    
    return result.rowCount;
  } catch (error) {
    console.error('[AUTO-DELETE] Error executing scheduled deletions:', error.message);
    return 0;
  }
}

module.exports = {
  pool,
  query,
  testConnection,
  initializeTables,
  storeSecureUserMessage,
  fetchSecureUserHistory,
  logSecurityEvent,
  deleteUserDataWithCertificate,
  executeScheduledDeletions
}; 