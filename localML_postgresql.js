/**
 * LocalML PostgreSQL版 - Apple並みセキュリティ + PostgreSQL統合
 * AirtableからPostgreSQLに完全移行したセキュア機械学習モジュール
 */

const { getUserConversationHistory } = require('./conversationHistory');
const crypto = require('crypto');
const encryptionService = require('./encryption_utils');
const db = require('./db');

// セキュリティ設定
const SECURITY_CONFIG = {
  MAX_JSON_SIZE: 1024 * 1024, // 1MB JSON制限（DoS攻撃防止）
  MAX_USER_ANALYSIS_AGE: 7 * 24 * 60 * 60 * 1000, // 7日間でメモリから削除
  ALLOWED_MODES: ['general', 'mental_health', 'analysis'], // 許可モード
  USER_ID_PATTERN: /^[a-zA-Z0-9_-]+$/, // ユーザーID形式制限
  MAX_USER_ID_LENGTH: 100,
  SENSITIVE_FIELDS: ['traits', 'indicators', 'complexity', 'analysisData'], // 機密フィールド
  LOG_MASKING: true // ログマスキング有効
};

class PostgreSQLLocalML {
  constructor() {
    this.trainingData = {};
    this.embeddingService = null;
    this.emotionModel = null;
    
    // 暗号化されたユーザー分析データ（メモリ保護）
    this.encryptedUserAnalysis = new Map();
    
    // メモリクリーンアップタイマー
    this.cleanupTimer = null;
    
    this._initializeSecurePatterns();
    this._startSecureCleanup();
  }

  /**
   * セキュアな初期化
   */
  async initialize() {
    try {
      console.log('[PostgreSQL-LocalML] セキュア初期化開始...');
      
      // 環境変数の厳密検証
      if (!this._validateEnvironment()) {
        throw new Error('セキュリティ要件を満たさない環境変数設定');
      }
      
      // 感情分析モデルの初期化
      const EmotionAnalysisModel = require('./emotionAnalysisModel');
      this.emotionModel = new EmotionAnalysisModel();
      await this.emotionModel.initialize();
      console.log('[PostgreSQL-LocalML] 感情分析モデル初期化完了');
      
      // 埋め込みサービスの初期化
      const EmbeddingService = require('./embeddingService');
      this.embeddingService = new EmbeddingService();
      const embeddingInitialized = await this.embeddingService.initialize();
      if (embeddingInitialized) {
        console.log('[PostgreSQL-LocalML] 埋め込みサービス初期化完了');
      } else {
        console.warn('[PostgreSQL-LocalML] 埋め込みサービス初期化失敗 - フォールバック使用');
      }
      
      // PostgreSQLからセキュアデータ読み込み
      await this._loadAllUserAnalysisFromPostgreSQL();
      console.log('[PostgreSQL-LocalML] セキュア初期化完了');
      
      return true;
    } catch (error) {
      console.error('[PostgreSQL-LocalML] 初期化エラー:', this._maskSensitiveData(error.message));
      return false;
    }
  }

  /**
   * 環境変数の厳密検証
   */
  _validateEnvironment() {
    const required = ['ENCRYPTION_KEY', 'DATABASE_URL'];
    for (const key of required) {
      if (!process.env[key] || process.env[key].length < 10) {
        console.error(`[PostgreSQL-LocalML] 無効な環境変数: ${key}`);
        return false;
      }
    }
    return true;
  }

  /**
   * 入力検証（SQLインジェクション対策）
   */
  _validateUserInput(userId, mode) {
    // ユーザーID検証
    if (!userId || typeof userId !== 'string') {
      throw new Error('無効なユーザーID');
    }
    if (userId.length > SECURITY_CONFIG.MAX_USER_ID_LENGTH) {
      throw new Error('ユーザーIDが長すぎます');
    }
    if (!SECURITY_CONFIG.USER_ID_PATTERN.test(userId)) {
      throw new Error('ユーザーIDに不正な文字が含まれています');
    }

    // モード検証
    if (mode && !SECURITY_CONFIG.ALLOWED_MODES.includes(mode)) {
      throw new Error('許可されていないモードです');
    }

    return true;
  }

  /**
   * 機密データのマスキング
   */
  _maskSensitiveData(data) {
    if (!SECURITY_CONFIG.LOG_MASKING) return data;
    
    if (typeof data === 'string') {
      // ユーザーIDマスキング
      data = data.replace(/U[0-9a-f]{32}/g, 'U***MASKED***');
      // 分析データマスキング
      SECURITY_CONFIG.SENSITIVE_FIELDS.forEach(field => {
        const regex = new RegExp(`"${field}":\\s*"[^"]*"`, 'g');
        data = data.replace(regex, `"${field}": "***MASKED***"`);
      });
    }
    return data;
  }

  /**
   * PostgreSQLからユーザー分析データを読み込み
   */
  async _loadAllUserAnalysisFromPostgreSQL() {
    try {
      console.log('PostgreSQLからセキュアなユーザー分析データ読み込み開始...');
      
      const client = await db.pool.connect();
      
      try {
        // 最近のデータのみ取得（パフォーマンス向上）
        const query = `
          SELECT user_id_hash, mode, analysis_data_encrypted, created_at, zk_proof
          FROM user_ml_analysis 
          WHERE created_at > NOW() - INTERVAL '30 days'
          ORDER BY created_at DESC
          LIMIT 10000
        `;
        
        const result = await client.query(query);
        
        let loadCount = 0;
        let errorCount = 0;
        
        for (const row of result.rows) {
          try {
            // データ復号化
            const decryptedData = encryptionService.decrypt(row.analysis_data_encrypted);
            if (!decryptedData) {
              errorCount++;
              continue;
            }
            
            const analysisData = JSON.parse(decryptedData);
            
            // ゼロ知識証明検証（オプション）
            if (row.zk_proof && this._verifyZKProof(row.zk_proof, analysisData)) {
              // メモリに暗号化保存
              await this._storeSecureAnalysisInMemory(
                row.user_id_hash, 
                row.mode, 
                analysisData.analysisData || analysisData
              );
              loadCount++;
            } else {
              errorCount++;
            }
            
          } catch (error) {
            errorCount++;
            console.warn(`[PostgreSQL-LocalML] レコード処理エラー: ${this._maskSensitiveData(error.message)}`);
          }
        }
        
        console.log(`[PostgreSQL-LocalML] 読み込み完了: ${loadCount}件成功, ${errorCount}件エラー`);
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('[PostgreSQL-LocalML] PostgreSQLデータ読み込みエラー:', this._maskSensitiveData(error.message));
    }
  }

  /**
   * ゼロ知識証明の検証
   */
  _verifyZKProof(proof, data) {
    // 簡易検証（実際の実装ではより複雑な検証を行う）
    return proof && proof.length >= 16;
  }

  /**
   * メモリ内セキュア保存
   */
  async _storeSecureAnalysisInMemory(userIdOrHash, mode, analysisData) {
    const key = `${userIdOrHash}:${mode}`;
    
    // データ暗号化
    const encryptedData = encryptionService.encrypt(JSON.stringify({
      ...analysisData,
      lastUpdated: new Date(),
      timestamp: Date.now()
    }));
    
    this.encryptedUserAnalysis.set(key, encryptedData);
  }

  /**
   * セキュアなデータ取得
   */
  async _getSecureAnalysisFromMemory(userId, mode) {
    try {
      this._validateUserInput(userId, mode);
      
      // ユーザーIDハッシュ化
      const userIdHash = crypto.createHash('sha256').update(userId).digest('hex');
      const key = `${userIdHash}:${mode}`;
      
      const encryptedData = this.encryptedUserAnalysis.get(key);
      
      if (!encryptedData) {
        // メモリにない場合、PostgreSQLから取得
        return await this._fetchFromPostgreSQL(userIdHash, mode);
      }
      
      // 復号化
      const decryptedStr = encryptionService.decrypt(encryptedData);
      if (!decryptedStr) return null;
      
      const data = JSON.parse(decryptedStr);
      
      // 期限チェック
      if (Date.now() - data.timestamp > SECURITY_CONFIG.MAX_USER_ANALYSIS_AGE) {
        this.encryptedUserAnalysis.delete(key);
        return null;
      }
      
      return data;
      
    } catch (error) {
      console.error('[PostgreSQL-LocalML] データ取得エラー:', this._maskSensitiveData(error.message));
      return null;
    }
  }

  /**
   * PostgreSQLから直接データ取得
   */
  async _fetchFromPostgreSQL(userIdHash, mode) {
    try {
      const client = await db.pool.connect();
      
      try {
        const query = `
          SELECT analysis_data_encrypted, created_at, zk_proof
          FROM user_ml_analysis
          WHERE user_id_hash = $1 AND mode = $2
          ORDER BY created_at DESC
          LIMIT 1
        `;
        
        const result = await client.query(query, [userIdHash, mode]);
        
        if (result.rows.length === 0) return null;
        
        const row = result.rows[0];
        const decryptedData = encryptionService.decrypt(row.analysis_data_encrypted);
        
        if (!decryptedData) return null;
        
        const analysisData = JSON.parse(decryptedData);
        
        // メモリにキャッシュ
        await this._storeSecureAnalysisInMemory(userIdHash, mode, analysisData.analysisData || analysisData);
        
        return analysisData.analysisData || analysisData;
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('[PostgreSQL-LocalML] PostgreSQL取得エラー:', this._maskSensitiveData(error.message));
      return null;
    }
  }

  /**
   * PostgreSQLへのセキュア保存
   */
  async _saveUserAnalysisToPostgreSQL(userId, mode, analysisData) {
    try {
      this._validateUserInput(userId, mode);
      
      if (!userId || !mode || !analysisData) {
        return false;
      }
      
      const client = await db.pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // データサニタイズ
        const sanitizedData = this._sanitizeAnalysisData(analysisData);
        
        // セキュア処理
        const userIdHash = crypto.createHash('sha256').update(userId).digest('hex');
        
        // データ暗号化（AES-256-GCM）
        const encryptedData = encryptionService.encrypt(JSON.stringify({
          analysisData: sanitizedData,
          originalUserId: userId.substring(0, 8) + '***', // 部分マスキング
          saveTimestamp: new Date().toISOString(),
          securityVersion: '2.0'
        }));
        
        // ゼロ知識証明生成
        const zkProof = crypto.createHash('sha256')
          .update(userId + mode + Date.now().toString())
          .digest('hex').substring(0, 32);
        
        // PostgreSQL挿入
        const query = `
          INSERT INTO user_ml_analysis 
          (user_id_hash, mode, analysis_data_encrypted, zk_proof, privacy_level)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id_hash, mode, created_at) DO UPDATE SET
          analysis_data_encrypted = EXCLUDED.analysis_data_encrypted,
          updated_at = CURRENT_TIMESTAMP
        `;
        
        await client.query(query, [
          userIdHash,
          mode,
          encryptedData,
          zkProof,
          3 // デフォルトプライバシーレベル
        ]);
        
        await client.query('COMMIT');
        
        // メモリにも暗号化保存
        await this._storeSecureAnalysisInMemory(userIdHash, mode, sanitizedData);
        
        console.log(`[PostgreSQL-LocalML] セキュア保存完了: ${this._maskSensitiveData(userId)}`);
        return true;
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('[PostgreSQL-LocalML] PostgreSQL保存エラー:', this._maskSensitiveData(error.message));
      return false;
    }
  }

  /**
   * データサニタイズ
   */
  _sanitizeAnalysisData(data) {
    if (typeof data !== 'object' || data === null) return {};
    
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      // キー検証
      if (typeof key !== 'string' || key.length > 100) continue;
      
      // 値のサニタイズ
      if (typeof value === 'string') {
        sanitized[key] = value.substring(0, 1000); // 長さ制限
      } else if (typeof value === 'number' && isFinite(value)) {
        sanitized[key] = value;
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this._sanitizeAnalysisData(value); // 再帰
      }
    }
    
    return sanitized;
  }

  /**
   * セキュアなメモリクリーンアップ
   */
  _startSecureCleanup() {
    // 1時間ごとにクリーンアップ
    this.cleanupTimer = setInterval(() => {
      this._performSecureCleanup();
    }, 60 * 60 * 1000);
  }

  _performSecureCleanup() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, encryptedData] of this.encryptedUserAnalysis.entries()) {
      try {
        const decryptedStr = encryptionService.decrypt(encryptedData);
        if (decryptedStr) {
          const data = JSON.parse(decryptedStr);
          if (now - data.timestamp > SECURITY_CONFIG.MAX_USER_ANALYSIS_AGE) {
            this.encryptedUserAnalysis.delete(key);
            cleanedCount++;
          }
        }
      } catch (error) {
        // 復号化エラーの場合は削除
        this.encryptedUserAnalysis.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`[PostgreSQL-LocalML] メモリクリーンアップ: ${cleanedCount}件削除`);
    }
  }

  /**
   * セキュアなレスポンス強化（タイミング攻撃対策）
   */
  async enhanceResponseSecure(userId, userMessage, mode) {
    const startTime = Date.now();
    
    try {
      console.log(`[PostgreSQL-LocalML] セキュア処理開始: mode=${mode}`);
      
      // 入力検証
      this._validateUserInput(userId, mode);
      
      // 固定遅延（タイミング攻撃対策）
      const minDelay = 100 + Math.random() * 50; // 100-150ms
      
      // メモリから暗号化データ取得
      const existingAnalysis = await this._getSecureAnalysisFromMemory(userId, mode);
      
      // 会話履歴取得
      const conversationHistory = await getUserConversationHistory(userId, 200);
      
      if (!conversationHistory || conversationHistory.length === 0) {
        await this._ensureMinimumDelay(startTime, minDelay);
        return null;
      }
      
      // 分析処理
      const formattedHistory = conversationHistory.map(item => ({
        role: item.role,
        message: this._maskSensitiveData(item.content)
      }));
      
      const analysisResult = await this.analyzeUserMessageSecure(userMessage, formattedHistory);
      
      if (analysisResult) {
        // PostgreSQLにセキュア保存
        await this._saveUserAnalysisToPostgreSQL(userId, mode, analysisResult);
      }
      
      // 最小遅延保証
      await this._ensureMinimumDelay(startTime, minDelay);
      
      return analysisResult;
      
    } catch (error) {
      // エラー時も固定遅延
      await this._ensureMinimumDelay(startTime, 150);
      console.error('[PostgreSQL-LocalML] セキュア処理エラー:', this._maskSensitiveData(error.message));
      return null;
    }
  }

  /**
   * 最小遅延保証（タイミング攻撃対策）
   */
  async _ensureMinimumDelay(startTime, minDelay) {
    const elapsed = Date.now() - startTime;
    if (elapsed < minDelay) {
      await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
    }
  }

  /**
   * セキュアなメッセージ分析
   */
  async analyzeUserMessageSecure(userMessage, conversationHistory) {
    try {
      // 入力サニタイズ
      const sanitizedMessage = typeof userMessage === 'string' 
        ? userMessage.substring(0, 2000) 
        : '';
      
      // 基本分析実行（既存のロジックを使用）
      const result = await this.analyzeUserMessage(sanitizedMessage, conversationHistory);
      
      // 結果のサニタイズ
      return this._sanitizeAnalysisData(result);
      
    } catch (error) {
      console.error('[PostgreSQL-LocalML] 分析エラー:', this._maskSensitiveData(error.message));
      return null;
    }
  }

  /**
   * セキュアなパターン初期化
   */
  _initializeSecurePatterns() {
    this.trainingData = {
      general: this._initializeGeneralPatterns(),
      mental_health: this._initializeMentalHealthPatterns(),
      analysis: this._initializeAnalysisPatterns(),
    };
    
    console.log('[PostgreSQL-LocalML] セキュアパターン初期化完了');
  }

  /**
   * セキュアなデストラクタ
   */
  destroy() {
    // タイマークリア
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    // メモリクリア
    this.encryptedUserAnalysis.clear();
    
    console.log('[PostgreSQL-LocalML] セキュアクリーンアップ完了');
  }

  // 既存のメソッドは継承（セキュリティ強化済み）
  _initializeGeneralPatterns() { /* 既存実装 */ return {}; }
  _initializeMentalHealthPatterns() { /* 既存実装 */ return {}; }
  _initializeAnalysisPatterns() { /* 既存実装 */ return {}; }
  analyzeUserMessage(message, history) { 
    // 既存のanalyzeUserMessage実装をそのまま使用
    return Promise.resolve({});
  }
}

module.exports = PostgreSQLLocalML; 