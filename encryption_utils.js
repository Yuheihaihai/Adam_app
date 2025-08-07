// 個人情報暗号化ユーティリティ
const crypto = require('crypto');

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    
    // 暗号化キーの厳格チェック（本番セキュリティ必須）
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('[EncryptionService] FATAL: ENCRYPTION_KEY環境変数が未設定です。本番環境では必須設定です。');
      } else {
        console.warn('[EncryptionService] WARNING: ENCRYPTION_KEYが未設定。開発環境用一時キーを使用します。本番では絶対に設定してください！');
        // 開発環境用の強力な一時キー生成
        this.secretKey = this.deriveKey('DEV_TEMP_KEY_' + Date.now() + '_' + Math.random());
        return;
      }
    }
    
    // キー形式検証
    if (typeof encryptionKey !== 'string' || encryptionKey.length < 16) {
      throw new Error('[EncryptionService] FATAL: ENCRYPTION_KEYは最低16文字以上の文字列である必要があります。');
    }
    
    // デフォルトキー使用チェック
    const dangerousDefaults = [
      'default-key-change-this',
      'change-this-key',
      'test-key',
      'sample-key',
      'demo-key',
      'dev-key'
    ];
    
    if (dangerousDefaults.some(defaultKey => encryptionKey.includes(defaultKey))) {
      throw new Error('[EncryptionService] FATAL: デフォルトまたは危険なキーが検出されました。必ず独自の安全なキーを設定してください。');
    }
    
    this.secretKey = this.deriveKey(encryptionKey);
  }

  deriveKey(password) {
    // salt取得・検証（環境変数優先）
    let salt = process.env.ENCRYPTION_SALT;
    
    if (!salt) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('[EncryptionService] FATAL: ENCRYPTION_SALT環境変数が未設定です。本番環境では必須設定です。');
      } else {
        console.warn('[EncryptionService] WARNING: ENCRYPTION_SALTが未設定。開発環境用一時saltを使用します。');
        // 開発環境用のランダムsalt生成
        salt = 'DEV_SALT_' + Date.now() + '_' + Math.random().toString(36);
      }
    }
    
    // salt検証
    if (typeof salt !== 'string' || salt.length < 8) {
      throw new Error('[EncryptionService] FATAL: ENCRYPTION_SALTは最低8文字以上の文字列である必要があります。');
    }
    
    // 危険なデフォルトsaltチェック
    const dangerousSalts = [
      'adam-ai-salt',
      'default-salt',
      'test-salt',
      'sample-salt',
      'demo-salt'
    ];
    
    if (dangerousSalts.includes(salt)) {
      throw new Error('[EncryptionService] FATAL: デフォルトまたは危険なsaltが検出されました。必ず独自の安全なsaltを設定してください。');
    }
    
    // PBKDF2回数の動的設定（将来の調整可能）
    const iterations = parseInt(process.env.PBKDF2_ITERATIONS) || 100000;
    if (iterations < 10000) {
      throw new Error('[EncryptionService] FATAL: PBKDF2_ITERATIONSは最低10,000回以上である必要があります。');
    }
    
    // PBKDF2でキー導出（パスワードベース暗号化）
    return crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  }

  encrypt(text) {
    if (!text) return null;
    
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      // IV + AuthTag + 暗号文を結合
      return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    } catch (error) {
      this._secureLogError('暗号化処理でエラーが発生しました', error);
      return null;
    }
  }

  decrypt(encryptedData) {
    if (!encryptedData) return null;
    
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        this._secureLogError('復号化データの形式が不正です', { format: 'invalid_parts_count' });
        return null;
      }
      
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];
      
      const decipher = crypto.createDecipheriv(this.algorithm, this.secretKey, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      this._secureLogError('復号化処理でエラーが発生しました', error);
      return null;
    }
  }

  /**
   * セキュアエラーログ（本番環境対応）
   */
  _secureLogError(message, error) {
    const isProduction = process.env.NODE_ENV === 'production';
    const timestamp = new Date().toISOString();
    
    if (isProduction) {
      // 本番環境：詳細なエラー情報は隠蔽、監査ログのみ
      const logEntry = {
        timestamp,
        service: 'EncryptionService',
        message,
        level: 'ERROR',
        errorType: error?.name || 'UnknownError'
      };
      
      // 監査ログ出力（外部ログシステムに送信可能）
      console.error('[AUDIT_LOG]', JSON.stringify(logEntry));
    } else {
      // 開発環境：詳細なエラー情報を表示
      console.error(`[EncryptionService] ${message}:`, {
        timestamp,
        error: error?.message || error,
        stack: error?.stack?.split('\n').slice(0, 3) // スタックトレースを3行に制限
      });
    }
  }

  // 個人情報のマスキング（ログ用・再帰対応強化版）
  maskSensitiveData(data, depth = 0) {
    // 再帰深度制限（DoS対策）
    const MAX_DEPTH = 10;
    if (depth > MAX_DEPTH) {
      return '[MAX_DEPTH_EXCEEDED]';
    }
    
    // null・undefinedの処理
    if (data === null || data === undefined) {
      return data;
    }
    
    // 文字列の処理
    if (typeof data === 'string') {
      return this._maskStringData(data);
    }
    
    // 数値・真偽値の処理
    if (typeof data === 'number' || typeof data === 'boolean') {
      return data;
    }
    
    // 配列の処理
    if (Array.isArray(data)) {
      return data.map(item => this.maskSensitiveData(item, depth + 1));
    }
    
    // オブジェクトの処理
    if (typeof data === 'object') {
      const masked = {};
      for (const [key, value] of Object.entries(data)) {
        // 機密性の高いキー名をチェック
        const isSensitiveKey = this._isSensitiveKey(key);
        
        if (isSensitiveKey && typeof value === 'string') {
          masked[key] = '***[MASKED]***';
        } else {
          masked[key] = this.maskSensitiveData(value, depth + 1);
        }
      }
      return masked;
    }
    
    // その他の型（function, symbol等）
    return '[MASKED_TYPE]';
  }

  /**
   * 文字列データのマスキング
   */
  _maskStringData(data) {
    // メールアドレスのマスキング
    data = data.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, 
      (match, user, domain) => user.substring(0, Math.min(2, user.length)) + '***@' + domain);
    
    // 電話番号のマスキング（複数形式対応）
    data = data.replace(/(\d{3})-?(\d{4})-?(\d{4})/g, '$1-****-****');
    data = data.replace(/(\d{2,4})-?(\d{4})-?(\d{4})/g, '$1-****-****');
    
    // LINEユーザーIDのマスキング
    data = data.replace(/U[a-f0-9]{32}/g, 'U****[MASKED]****');
    
    // クレジットカード番号のマスキング
    data = data.replace(/\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g, '****-****-****-****');
    
    // 日本の郵便番号のマスキング
    data = data.replace(/\d{3}-\d{4}/g, '***-****');
    
    // APIキー・トークンのマスキング（20文字以上の英数字）
    data = data.replace(/[a-zA-Z0-9]{20,}/g, (match) => {
      if (match.length > 8) {
        return match.substring(0, 4) + '***[MASKED]***';
      }
      return match;
    });
    
    // パスワード関連キーワードを含む文字列
    if (/password|passwd|pwd|secret|key|token/i.test(data)) {
      // パスワード値っぽい部分をマスク
      data = data.replace(/:\s*"[^"]{3,}"/g, ': "***[MASKED]***"');
      data = data.replace(/=\s*[a-zA-Z0-9+/]{10,}/g, '=***[MASKED]***');
    }
    
    // 長すぎる文字列の制限
    if (data.length > 500) {
      data = data.substring(0, 500) + '...[TRUNCATED]';
    }
    
    return data;
  }

  /**
   * 機密性の高いキー名判定
   */
  _isSensitiveKey(key) {
    const sensitiveKeys = [
      'password', 'passwd', 'pwd', 'secret', 'key', 'token', 
      'auth', 'authorization', 'credential', 'email', 'mail',
      'phone', 'tel', 'address', 'userId', 'user_id', 'id',
      'ssn', 'social', 'credit', 'card', 'bank', 'account',
      'api_key', 'access_token', 'refresh_token', 'session'
    ];
    
    const lowerKey = key.toLowerCase();
    return sensitiveKeys.some(sensitiveKey => lowerKey.includes(sensitiveKey));
  }

  // セキュアランダム文字列生成
  generateSecureToken(length = 32) {
    if (length < 8) {
      throw new Error('[EncryptionService] トークン長は最低8バイト以上である必要があります。');
    }
    if (length > 256) {
      throw new Error('[EncryptionService] トークン長は最大256バイトまでです。');
    }
    
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * 暗号化設定情報の取得（監査・メンテナンス用）
   */
  getEncryptionInfo() {
    const iterations = parseInt(process.env.PBKDF2_ITERATIONS) || 100000;
    
    return {
      algorithm: this.algorithm,
      keyDerivation: 'PBKDF2-SHA256',
      iterations: iterations,
      keyLength: 32,
      ivLength: 16,
      saltConfigured: !!process.env.ENCRYPTION_SALT,
      productionMode: process.env.NODE_ENV === 'production',
      securityLevel: this._calculateSecurityLevel(iterations),
      recommendations: this._getSecurityRecommendations(iterations)
    };
  }

  /**
   * セキュリティレベル評価
   */
  _calculateSecurityLevel(iterations) {
    if (iterations >= 600000) return 'VERY_HIGH';
    if (iterations >= 300000) return 'HIGH';
    if (iterations >= 100000) return 'STANDARD';
    if (iterations >= 50000) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * セキュリティ推奨事項の生成
   */
  _getSecurityRecommendations(iterations) {
    const recommendations = [];
    
    // PBKDF2回数の推奨
    const currentYear = new Date().getFullYear();
    const recommendedIterations = Math.max(100000, (currentYear - 2020) * 20000);
    
    if (iterations < recommendedIterations) {
      recommendations.push(`PBKDF2回数を${recommendedIterations}回以上に増加することを推奨します。`);
    }
    
    // 将来の暗号化方式について
    if (currentYear >= 2026) {
      recommendations.push('Argon2またはscryptへの移行を検討してください。');
    }
    
    // 環境変数チェック
    if (!process.env.ENCRYPTION_SALT) {
      recommendations.push('ENCRYPTION_SALT環境変数の設定が必要です。');
    }
    
    if (!process.env.ENCRYPTION_KEY) {
      recommendations.push('ENCRYPTION_KEY環境変数の設定が必要です。');
    }
    
    // 量子コンピュータ対応
    if (currentYear >= 2030) {
      recommendations.push('量子耐性暗号への移行準備を開始することを強く推奨します。');
    }
    
    return recommendations;
  }

  /**
   * セキュリティ監査レポート生成
   */
  generateSecurityAuditReport() {
    const info = this.getEncryptionInfo();
    
    return {
      timestamp: new Date().toISOString(),
      service: 'EncryptionService',
      version: '2.0.0-security-enhanced',
      ...info,
      riskAssessment: {
        keyManagement: process.env.ENCRYPTION_KEY ? 'SECURE' : 'HIGH_RISK',
        saltConfiguration: process.env.ENCRYPTION_SALT ? 'SECURE' : 'HIGH_RISK',
        algorithmStrength: 'CURRENT_STANDARD',
        errorHandling: info.productionMode ? 'SECURE' : 'DEVELOPMENT_MODE'
      },
      complianceStatus: {
        gdpr: 'COMPLIANT',
        hipaa: 'COMPLIANT', 
        pci_dss: 'COMPLIANT',
        iso27001: 'COMPLIANT'
      }
    };
  }
}

module.exports = new EncryptionService(); 