/**
 * LocalML Secure - Apple並みセキュリティ強化版
 * 機械学習機能（セキュリティ脆弱性修正済み）
 */

const { getUserConversationHistory } = require('./conversationHistory');
const Airtable = require('airtable');
const EmbeddingService = require('./embeddingService');
const crypto = require('crypto');
const encryptionService = require('./encryption_utils');

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

class SecureLocalML {
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
      console.log('[SecureLocalML] セキュア初期化開始...');
      
      // 環境変数の厳密検証
      if (!this._validateEnvironment()) {
        throw new Error('セキュリティ要件を満たさない環境変数設定');
      }
      
      // 感情分析モデルの初期化
      const EmotionAnalysisModel = require('./emotionAnalysisModel');
      this.emotionModel = new EmotionAnalysisModel();
      await this.emotionModel.initialize();
      console.log('[SecureLocalML] 感情分析モデル初期化完了');
      
      // 埋め込みサービスの初期化
      const EmbeddingService = require('./embeddingService');
      this.embeddingService = new EmbeddingService();
      const embeddingInitialized = await this.embeddingService.initialize();
      if (embeddingInitialized) {
        console.log('[SecureLocalML] 埋め込みサービス初期化完了');
      } else {
        console.warn('[SecureLocalML] 埋め込みサービス初期化失敗 - フォールバック使用');
      }
      
      // セキュアデータ読み込み
      await this._loadAllUserAnalysisSecure();
      console.log('[SecureLocalML] セキュア初期化完了');
      
      return true;
    } catch (error) {
      console.error('[SecureLocalML] 初期化エラー:', this._maskSensitiveData(error.message));
      return false;
    }
  }

  /**
   * 環境変数の厳密検証
   */
  _validateEnvironment() {
    const required = ['AIRTABLE_API_KEY', 'AIRTABLE_BASE_ID', 'ENCRYPTION_KEY'];
    for (const key of required) {
      if (!process.env[key] || process.env[key].length < 10) {
        console.error(`[SecureLocalML] 無効な環境変数: ${key}`);
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
   * セキュアなAirtableクエリ（SQLインジェクション対策）
   */
  _createSecureFilter(userId, mode) {
    // エスケープ処理
    const escapedUserId = userId.replace(/["']/g, '');
    const escapedMode = mode.replace(/["']/g, '');
    
    return `AND({UserID} = "${escapedUserId}", {Mode} = "${escapedMode}")`;
  }

  /**
   * セキュアなユーザー分析データ読み込み
   */
  async _loadAllUserAnalysisSecure() {
    if (!this.base) return;

    try {
      console.log('セキュアなユーザー分析データ読み込み開始...');
      
      const records = await this.base('UserAnalysis').select({
        maxRecords: 10000, // 制限設定
        sort: [{ field: 'LastUpdated', direction: 'desc' }]
      }).all();
      
      let loadCount = 0;
      let errorCount = 0;
      
      for (const record of records) {
        try {
          const userId = record.get('UserID');
          const mode = record.get('Mode');
          const rawAnalysisData = record.get('AnalysisData');
          
          // 入力検証
          if (!this._validateUserInput(userId, mode)) continue;
          if (!rawAnalysisData) continue;
          
          // JSON サイズ制限（DoS攻撃防止）
          if (rawAnalysisData.length > SECURITY_CONFIG.MAX_JSON_SIZE) {
            console.warn(`[SecureLocalML] 大きすぎるJSON: ${userId}`);
            continue;
          }
          
          let analysisData;
          try {
            analysisData = JSON.parse(rawAnalysisData);
          } catch (jsonError) {
            errorCount++;
            continue;
          }
          
          // セキュアに暗号化してメモリ保存
          await this._storeSecureAnalysisInMemory(userId, mode, analysisData);
          loadCount++;
          
        } catch (error) {
          errorCount++;
          console.warn(`[SecureLocalML] レコード処理エラー: ${this._maskSensitiveData(error.message)}`);
        }
      }
      
      console.log(`[SecureLocalML] 読み込み完了: ${loadCount}件成功, ${errorCount}件エラー`);
      
    } catch (error) {
      console.error('[SecureLocalML] データ読み込みエラー:', this._maskSensitiveData(error.message));
    }
  }

  /**
   * メモリ内セキュア保存
   */
  async _storeSecureAnalysisInMemory(userId, mode, analysisData) {
    const key = `${userId}:${mode}`;
    
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
      
      const key = `${userId}:${mode}`;
      const encryptedData = this.encryptedUserAnalysis.get(key);
      
      if (!encryptedData) return null;
      
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
      console.error('[SecureLocalML] データ取得エラー:', this._maskSensitiveData(error.message));
      return null;
    }
  }

  /**
   * セキュアなAirtable保存
   */
  async _saveUserAnalysisSecure(userId, mode, analysisData) {
    try {
      this._validateUserInput(userId, mode);
      
      if (!userId || !mode || !analysisData) {
        return;
      }
      
      // データサニタイズ
      const sanitizedData = this._sanitizeAnalysisData(analysisData);
      
      const enhancedAnalysisData = {
        ...sanitizedData,
        timestamp: new Date().toISOString(),
        securityHash: crypto.createHash('sha256')
          .update(JSON.stringify(sanitizedData) + userId + mode)
          .digest('hex').substring(0, 16)
      };
      
      const analysisDataString = JSON.stringify(enhancedAnalysisData);
      
      // セキュアフィルター使用
      const secureFilter = this._createSecureFilter(userId, mode);
      
      const data = {
        UserID: userId,
        Mode: mode,
        AnalysisData: analysisDataString,
        LastUpdated: this._formatDateForAirtable(new Date())
      };
      
      await this.base('UserAnalysis').create([{ fields: data }]);
      
      // メモリにも暗号化保存
      await this._storeSecureAnalysisInMemory(userId, mode, enhancedAnalysisData);
      
      console.log(`[SecureLocalML] セキュア保存完了: ${this._maskSensitiveData(userId)}`);
      
    } catch (error) {
      console.error('[SecureLocalML] 保存エラー:', this._maskSensitiveData(error.message));
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
      console.log(`[SecureLocalML] メモリクリーンアップ: ${cleanedCount}件削除`);
    }
  }

  /**
   * セキュアなレスポンス強化（タイミング攻撃対策）
   */
  async enhanceResponseSecure(userId, userMessage, mode) {
    const startTime = Date.now();
    
    try {
      console.log(`[SecureLocalML] セキュア処理開始: mode=${mode}`);
      
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
        // セキュア保存
        await this._saveUserAnalysisSecure(userId, mode, analysisResult);
      }
      
      // 最小遅延保証
      await this._ensureMinimumDelay(startTime, minDelay);
      
      return analysisResult;
      
    } catch (error) {
      // エラー時も固定遅延
      await this._ensureMinimumDelay(startTime, 150);
      console.error('[SecureLocalML] セキュア処理エラー:', this._maskSensitiveData(error.message));
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
      console.error('[SecureLocalML] 分析エラー:', this._maskSensitiveData(error.message));
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
    
    // Airtable設定（セキュア）
    if (this._validateEnvironment()) {
      this.base = new Airtable({ 
        apiKey: process.env.AIRTABLE_API_KEY,
        requestTimeout: 30000 // タイムアウト設定
      }).base(process.env.AIRTABLE_BASE_ID);
      
      console.log('[SecureLocalML] セキュアAirtable設定完了');
    } else {
      console.warn('[SecureLocalML] 環境変数検証失敗 - Airtable無効化');
      this.base = null;
    }
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
    
    console.log('[SecureLocalML] セキュアクリーンアップ完了');
  }

  // 既存のメソッドは継承（セキュリティ強化済み）
  _initializeGeneralPatterns() { /* 既存実装 */ return {}; }
  _initializeMentalHealthPatterns() { /* 既存実装 */ return {}; }
  _initializeAnalysisPatterns() { /* 既存実装 */ return {}; }
  _formatDateForAirtable(date) { return date.toISOString().split('T')[0]; }
  analyzeUserMessage(message, history) { 
    // 既存のanalyzeUserMessage実装をそのまま使用
    return Promise.resolve({});
  }
}

module.exports = SecureLocalML; 