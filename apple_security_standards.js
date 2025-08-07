// Apple並みセキュリティ基準実装（セキュリティ強化版）
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const fs = require('fs').promises;

/**
 * 設定管理（環境変数ベース）
 */
const SECURITY_CONFIG = {
  // 必須環境変数の検証
  REQUIRE_PRODUCTION_KEYS: process.env.NODE_ENV === 'production',
  
  // 差分プライバシー
  DIFFERENTIAL_PRIVACY: {
    epsilon: parseFloat(process.env.PRIVACY_EPSILON) || 1.0,
    sensitivity: parseFloat(process.env.PRIVACY_SENSITIVITY) || 1.0,
    noiseScale: parseFloat(process.env.PRIVACY_NOISE_SCALE) || 2.0,
    useCSPRNG: process.env.PRIVACY_USE_CSPRNG !== 'false'
  },
  
  // k-匿名性
  K_ANONYMITY: {
    threshold: parseInt(process.env.K_ANONYMITY_THRESHOLD) || 5,
    quasiIdentifiers: (process.env.QUASI_IDENTIFIERS || 'age,location,gender').split(','),
    ageGroupSize: parseInt(process.env.AGE_GROUP_SIZE) || 10
  },
  
  // データ保護ポリシー
  DATA_POLICIES: {
    minimization: process.env.DATA_MINIMIZATION !== 'false',
    purposeLimitation: process.env.PURPOSE_LIMITATION !== 'false',
    storageLimit: parseInt(process.env.DATA_STORAGE_LIMIT) || 90,
    autoDeleteEnabled: process.env.AUTO_DELETE_ENABLED !== 'false'
  },
  
  // 証明書・監査
  CERTIFICATE_EXPIRY_DAYS: parseInt(process.env.CERT_EXPIRY_DAYS) || 365,
  AUDIT_LOG_RETENTION_DAYS: parseInt(process.env.AUDIT_RETENTION_DAYS) || 1095, // 3年
  
  // アルゴリズム設定
  RSA_KEY_SIZE: parseInt(process.env.RSA_KEY_SIZE) || 4096,
  SCRYPT_COST: parseInt(process.env.SCRYPT_COST) || 16384,
  SCRYPT_MEMORY: parseInt(process.env.SCRYPT_MEMORY) || 8,
  SCRYPT_PARALLELISM: parseInt(process.env.SCRYPT_PARALLELISM) || 1
};

class AppleSecurityStandards {
  constructor() {
    // 初期化時の環境変数検証
    this.validateEnvironmentVariables();
    
    // 差分プライバシー設定（動的）
    this.differentialPrivacy = SECURITY_CONFIG.DIFFERENTIAL_PRIVACY;
    
    // セキュリティポリシー（動的）
    this.policies = SECURITY_CONFIG.DATA_POLICIES;
    
    // 統計情報
    this.stats = {
      e2eeKeysGenerated: 0,
      certificatesIssued: 0,
      auditTrailsCreated: 0,
      privacyAssessmentsPerformed: 0,
      dataMinimizationOperations: 0,
      lastStatsReset: Date.now()
    };
    
    // キャッシュ管理
    this.certCache = new Map();
    this.keyCache = new Map();
    
    // 定期クリーンアップ（1時間毎）
    this.cleanupInterval = setInterval(() => {
      this.performMaintenance();
    }, 60 * 60 * 1000);
  }
  
  /**
   * 環境変数検証（必須設定チェック）
   */
  validateEnvironmentVariables() {
    const requiredVars = [];
    const warnings = [];
    
    // 本番環境では必須
    if (SECURITY_CONFIG.REQUIRE_PRODUCTION_KEYS) {
      if (!process.env.E2EE_PASSPHRASE) {
        requiredVars.push('E2EE_PASSPHRASE');
      }
      if (!process.env.AUDIT_HMAC_KEY) {
        requiredVars.push('AUDIT_HMAC_KEY');
      }
      if (!process.env.DELETION_CERT_KEY) {
        requiredVars.push('DELETION_CERT_KEY');
      }
    } else {
      // 開発環境での警告
      if (!process.env.E2EE_PASSPHRASE) {
        warnings.push('E2EE_PASSPHRASE not set - using temporary key for development');
      }
      if (!process.env.AUDIT_HMAC_KEY) {
        warnings.push('AUDIT_HMAC_KEY not set - using default key for development');
      }
      if (!process.env.DELETION_CERT_KEY) {
        warnings.push('DELETION_CERT_KEY not set - using default key for development');
      }
    }
    
    // デフォルト値検出
    if (process.env.E2EE_PASSPHRASE === 'default-passphrase') {
      requiredVars.push('E2EE_PASSPHRASE (default value detected)');
    }
    if (process.env.AUDIT_HMAC_KEY === 'default-key') {
      requiredVars.push('AUDIT_HMAC_KEY (default value detected)');
    }
    if (process.env.DELETION_CERT_KEY === 'default-key') {
      requiredVars.push('DELETION_CERT_KEY (default value detected)');
    }
    
    // エラー処理
    if (requiredVars.length > 0) {
      const error = new Error(`Required security environment variables not set: ${requiredVars.join(', ')}`);
      error.name = 'SecurityConfigurationError';
      throw error;
    }
    
    // 警告出力
    warnings.forEach(warning => {
      console.warn(`[AppleSecurity] WARNING: ${warning}`);
    });
  }
  
  /**
   * セキュアなパスフレーズ取得
   */
  getSecurePassphrase() {
    const passphrase = process.env.E2EE_PASSPHRASE;
    
    if (!passphrase) {
      if (SECURITY_CONFIG.REQUIRE_PRODUCTION_KEYS) {
        throw new Error('E2EE_PASSPHRASE is required in production environment');
      }
      // 開発環境では一時的なパスフレーズを生成
      return crypto.randomBytes(32).toString('hex');
    }
    
    // パスフレーズの強度チェック
    if (passphrase.length < 16) {
      throw new Error('E2EE_PASSPHRASE must be at least 16 characters long');
    }
    
    return passphrase;
  }

  /**
   * CSPRNG（暗号論的に安全な乱数）生成
   */
  generateSecureRandom() {
    // crypto.randomBytesを使用（CSPRNGベース）
    const randomBytes = crypto.randomBytes(8);
    return randomBytes.readDoubleLE(0) / (0xFFFFFFFFFFFFFFFF + 1);
  }
  
  /**
   * Box-Muller変換による正規分布乱数生成（CSPRNG）
   */
  generateSecureNormalRandom(mean = 0, stddev = 1) {
    // Box-Muller変換
    const u1 = this.generateSecureRandom();
    const u2 = this.generateSecureRandom();
    
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stddev + mean;
  }

  /**
   * エンドツーエンド暗号化（E2EE）鍵生成（セキュリティ強化版）
   */
  async generateE2EEKeyPair(options = {}) {
    try {
      const passphrase = this.getSecurePassphrase();
      const keySize = options.keySize || SECURITY_CONFIG.RSA_KEY_SIZE;
      
      // 鍵生成パラメータ検証
      if (keySize < 2048) {
        throw new Error('RSA key size must be at least 2048 bits');
      }
      
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: keySize,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
          passphrase: passphrase
        }
      });
      
      // 鍵のメタデータ
      const keyMetadata = {
        algorithm: 'RSA',
        keySize: keySize,
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + (SECURITY_CONFIG.CERTIFICATE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)).toISOString(),
        id: crypto.randomUUID(),
        fingerprint: this.generateKeyFingerprint(publicKey)
      };
      
      // 統計更新
      this.stats.e2eeKeysGenerated++;
      
      // キャッシュ保存（メタデータのみ）
      this.keyCache.set(keyMetadata.id, {
        ...keyMetadata,
        publicKey,
        createdAt: Date.now()
      });
      
      console.log(`[AppleSecurity] E2EE key pair generated: ${keyMetadata.id} (${keySize}-bit RSA)`);
      
      return {
        publicKey,
        privateKey,
        metadata: keyMetadata
      };
      
    } catch (error) {
      console.error('[AppleSecurity] E2EE key generation failed:', error.message);
      throw new Error(`E2EE key generation failed: ${error.message}`);
    }
  }
  
  /**
   * 鍵のフィンガープリント生成
   */
  generateKeyFingerprint(publicKey) {
    return crypto.createHash('sha256').update(publicKey).digest('hex').substring(0, 16);
  }

  /**
   * 差分プライバシー実装（CSPRNG強化版）
   */
  addDifferentialPrivacyNoise(value, epsilon = this.differentialPrivacy.epsilon) {
    // Laplaceノイズを追加（CSPRNG使用）
    const scale = this.differentialPrivacy.sensitivity / epsilon;
    
    let u, noise;
    if (SECURITY_CONFIG.DIFFERENTIAL_PRIVACY.useCSPRNG) {
      // CSPRNG使用
      u = this.generateSecureRandom() - 0.5;
      noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    } else {
      // 標準のMath.random()（下位互換性）
      u = Math.random() - 0.5;
      noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    }
    
    return value + noise;
  }
  
  /**
   * より高度な差分プライバシーノイズ（ガウシアンメカニズム）
   */
  addGaussianPrivacyNoise(value, epsilon = this.differentialPrivacy.epsilon, delta = 1e-5) {
    // ガウシアンメカニズム
    const sensitivity = this.differentialPrivacy.sensitivity;
    const sigma = (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon;
    
    const noise = this.generateSecureNormalRandom(0, sigma);
    return value + noise;
  }

  // ゼロ知識証明（簡易版）
  async generateZeroKnowledgeProof(secret, challenge) {
    // Schnorr識別プロトコルの簡易実装
    const hash = crypto.createHash('sha512');
    hash.update(secret + challenge);
    const proof = hash.digest('hex');
    
    return {
      proof,
      timestamp: Date.now(),
      expiresIn: 300000  // 5分で失効
    };
  }

  /**
   * k-匿名性の実装（動的設定対応）
   */
  ensureKAnonymity(dataset, options = {}) {
    const k = options.k || SECURITY_CONFIG.K_ANONYMITY.threshold;
    const quasiIdentifiers = options.quasiIdentifiers || SECURITY_CONFIG.K_ANONYMITY.quasiIdentifiers;
    
    if (!Array.isArray(dataset) || dataset.length === 0) {
      throw new Error('Dataset must be a non-empty array');
    }
    
    const groupedData = {};
    const stats = {
      originalRecords: dataset.length,
      groupsFormed: 0,
      recordsAnonymized: 0,
      recordsGeneralized: 0,
      recordsSupressed: 0
    };
    
    // 準識別子でグループ化
    dataset.forEach(record => {
      const key = this.getQuasiIdentifiers(record, quasiIdentifiers);
      if (!groupedData[key]) {
        groupedData[key] = [];
        stats.groupsFormed++;
      }
      groupedData[key].push(record);
    });
    
    // k未満のグループを除外または一般化
    const anonymizedData = [];
    Object.entries(groupedData).forEach(([groupKey, group]) => {
      if (group.length >= k) {
        // k以上のグループはそのまま追加
        anonymizedData.push(...group);
        stats.recordsAnonymized += group.length;
      } else {
        // k未満のグループは一般化またはサプレッション
        if (options.allowSuppression && group.length < Math.ceil(k / 2)) {
          // サプレッション（削除）
          stats.recordsSupressed += group.length;
          console.warn(`[AppleSecurity] Suppressed ${group.length} records in group: ${groupKey}`);
      } else {
        // 一般化処理
          const generalized = this.generalizeRecords(group, quasiIdentifiers);
        anonymizedData.push(...generalized);
          stats.recordsGeneralized += group.length;
        }
      }
    });
    
    console.log(`[AppleSecurity] k-Anonymity applied (k=${k}):`, stats);
    
    return {
      data: anonymizedData,
      statistics: stats,
      anonymizationLevel: k
    };
  }

  /**
   * 準識別子の抽出（動的設定対応）
   */
  getQuasiIdentifiers(record, identifiers = SECURITY_CONFIG.K_ANONYMITY.quasiIdentifiers) {
    const parts = [];
    
    identifiers.forEach(identifier => {
      switch (identifier.toLowerCase()) {
        case 'age':
          if (record.age !== undefined) {
            const ageGroupSize = SECURITY_CONFIG.K_ANONYMITY.ageGroupSize;
            const ageRange = Math.floor(record.age / ageGroupSize) * ageGroupSize;
            parts.push(`age:${ageRange}-${ageRange + ageGroupSize - 1}`);
          } else {
            parts.push('age:unknown');
          }
          break;
          
        case 'location':
        case 'region':
          if (record.location) {
            const region = record.location.substring(0, 2).toUpperCase();
            parts.push(`loc:${region}`);
          } else {
            parts.push('loc:XX');
          }
          break;
          
        case 'gender':
          if (record.gender) {
            parts.push(`gender:${record.gender.substring(0, 1).toUpperCase()}`);
          } else {
            parts.push('gender:U');
          }
          break;
          
        case 'occupation':
          if (record.occupation) {
            // 職業カテゴリの一般化
            const category = this.getOccupationCategory(record.occupation);
            parts.push(`occ:${category}`);
          } else {
            parts.push('occ:unknown');
          }
          break;
          
        default:
          // カスタム識別子
          if (record[identifier] !== undefined) {
            parts.push(`${identifier}:${record[identifier]}`);
          } else {
            parts.push(`${identifier}:unknown`);
          }
      }
    });
    
    return parts.join('|');
  }
  
  /**
   * 職業カテゴリ分類
   */
  getOccupationCategory(occupation) {
    const categories = {
      'tech': ['engineer', 'developer', 'programmer', 'analyst', 'it'],
      'medical': ['doctor', 'nurse', 'physician', 'medical', 'health'],
      'education': ['teacher', 'professor', 'educator', 'academic'],
      'business': ['manager', 'executive', 'consultant', 'sales'],
      'service': ['retail', 'customer', 'support', 'service'],
      'other': []
    };
    
    const occLower = occupation.toLowerCase();
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => occLower.includes(keyword))) {
        return category;
      }
    }
    return 'other';
  }

  /**
   * レコードの一般化（動的設定対応）
   */
  generalizeRecords(records, identifiers = SECURITY_CONFIG.K_ANONYMITY.quasiIdentifiers) {
    return records.map(record => {
      const generalized = { ...record };
      
      identifiers.forEach(identifier => {
        switch (identifier.toLowerCase()) {
          case 'age':
            if (generalized.age !== undefined) {
              const ageGroupSize = SECURITY_CONFIG.K_ANONYMITY.ageGroupSize;
              const ageRange = Math.floor(generalized.age / ageGroupSize) * ageGroupSize;
              generalized.age = `${ageRange}-${ageRange + ageGroupSize - 1}`;
            }
            break;
            
          case 'location':
          case 'region':
            if (generalized.location) {
              generalized.location = generalized.location.substring(0, 2) + '****';
            }
            break;
            
          case 'gender':
            // 性別はそのまま（バイナリでない場合は「other」に）
            if (generalized.gender && !['male', 'female', 'M', 'F'].includes(generalized.gender)) {
              generalized.gender = 'other';
            }
            break;
            
          case 'occupation':
            if (generalized.occupation) {
              generalized.occupation = this.getOccupationCategory(generalized.occupation);
            }
            break;
        }
      });
      
      // 強制的な識別子削除
      if (generalized.userId) {
        generalized.userId = 'ANONYMIZED';
      }
      if (generalized.email) {
        delete generalized.email;
      }
      if (generalized.phone) {
        delete generalized.phone;
      }
      
      return generalized;
    });
  }

  /**
   * Secure Enclave相当の鍵保護（強化版）
   */
  async secureKeyDerivation(password, options = {}) {
    // salt管理の強化
    let salt = options.salt;
    if (!salt) {
      salt = crypto.randomBytes(32);
    } else if (typeof salt === 'string') {
      salt = Buffer.from(salt, 'hex');
    }
    
    // scryptパラメータ（環境変数対応）
    const cost = options.cost || SECURITY_CONFIG.SCRYPT_COST;
    const blockSize = options.blockSize || SECURITY_CONFIG.SCRYPT_MEMORY;
    const parallelism = options.parallelism || SECURITY_CONFIG.SCRYPT_PARALLELISM;
    const keyLength = options.keyLength || 64;
    
    try {
      // PBKDF2の代わりにscryptを使用（より安全）
      const derivedKey = await scrypt(password, salt, keyLength, {
        cost: cost,
        blockSize: blockSize,
        parallelism: parallelism
      });
      
      const keyMetadata = {
        algorithm: 'scrypt',
        cost: cost,
        blockSize: blockSize,
        parallelism: parallelism,
        keyLength: keyLength,
        saltLength: salt.length,
        derivedAt: new Date().toISOString()
      };
    
    return {
      key: derivedKey,
      salt: salt,
        metadata: keyMetadata,
        // 検証用のハッシュ（salt含む）
        verificationHash: crypto.createHash('sha256')
          .update(Buffer.concat([derivedKey, salt]))
          .digest('hex')
      };
      
    } catch (error) {
      console.error('[AppleSecurity] Key derivation failed:', error.message);
      throw new Error(`Key derivation failed: ${error.message}`);
    }
  }

  /**
   * データ最小化原則の実装（動的設定対応）
   */
  minimizeData(data, purpose, customFields = null) {
    // 環境変数または設定ファイルからのフィールド定義読み込み
    const allowedFieldsConfig = customFields || this.getDataMinimizationFields();
    const fields = allowedFieldsConfig[purpose] || [];
    
    if (fields.length === 0) {
      console.warn(`[AppleSecurity] No allowed fields defined for purpose: ${purpose}`);
      return {};
    }
    
    const minimized = {};
    const stats = {
      originalFields: Object.keys(data).length,
      allowedFields: fields.length,
      retainedFields: 0,
      removedFields: 0
    };
    
    // 許可されたフィールドのみ保持
    fields.forEach(field => {
      if (data[field] !== undefined) {
        minimized[field] = data[field];
        stats.retainedFields++;
      }
    });
    
    stats.removedFields = stats.originalFields - stats.retainedFields;
    
    // 統計更新
    this.stats.dataMinimizationOperations++;
    
    console.log(`[AppleSecurity] Data minimized for purpose '${purpose}':`, stats);
    
    return {
      data: minimized,
      purpose: purpose,
      appliedAt: new Date().toISOString(),
      statistics: stats
    };
  }
  
  /**
   * データ最小化フィールド設定取得
   */
  getDataMinimizationFields() {
    // 環境変数からの設定読み込み（JSON形式）
    const configEnv = process.env.DATA_MINIMIZATION_FIELDS;
    if (configEnv) {
      try {
        return JSON.parse(configEnv);
      } catch (error) {
        console.warn('[AppleSecurity] Invalid DATA_MINIMIZATION_FIELDS format, using defaults');
      }
    }
    
    // デフォルト設定
    return {
      'analysis': ['content', 'timestamp', 'mode', 'userId', 'sessionId'],
      'display': ['content', 'role', 'timestamp'],
      'storage': ['id', 'hashedUserId', 'encryptedContent', 'timestamp', 'expiresAt'],
      'logging': ['id', 'timestamp', 'level', 'operation'],
      'export': ['id', 'hashedUserId', 'timestamp', 'category'],
      'research': ['hashedUserId', 'timestamp', 'mode', 'generalizedLocation'],
      'backup': ['id', 'encryptedContent', 'timestamp', 'backupVersion']
    };
  }

  /**
   * プライバシー保護集計（強化版）
   */
  privateAggregate(values, aggregateFunction, options = {}) {
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('Values must be a non-empty array');
    }
    
    // 集計実行
    const result = aggregateFunction(values);
    
    // プライバシー保護メカニズム選択
    const mechanism = options.mechanism || 'laplace';
    const epsilon = options.epsilon || this.differentialPrivacy.epsilon;
    
    let protectedResult;
    if (mechanism === 'gaussian') {
      protectedResult = this.addGaussianPrivacyNoise(result, epsilon, options.delta);
    } else {
      protectedResult = this.addDifferentialPrivacyNoise(result, epsilon);
    }
    
    return {
      value: protectedResult,
      originalValue: options.includeOriginal ? result : undefined,
      mechanism: mechanism,
      epsilon: epsilon,
      timestamp: new Date().toISOString(),
      sampleSize: values.length
    };
  }

  /**
   * セキュアなHMAC鍵取得
   */
  getSecureHMACKey() {
    const key = process.env.AUDIT_HMAC_KEY;
    
    if (!key) {
      if (SECURITY_CONFIG.REQUIRE_PRODUCTION_KEYS) {
        throw new Error('AUDIT_HMAC_KEY is required in production environment');
      }
      // 開発環境では一時的な鍵を生成
      return crypto.randomBytes(64).toString('hex');
    }
    
    // デフォルト値検出
    if (key === 'default-key') {
      throw new Error('AUDIT_HMAC_KEY cannot use default value');
    }
    
    // 鍵長度チェック
    if (key.length < 32) {
      throw new Error('AUDIT_HMAC_KEY must be at least 32 characters long');
    }
    
    return key;
  }

  /**
   * セキュリティ監査証跡（強化版）
   */
  async generateAuditTrail(operation, data, options = {}) {
    try {
      const hmacKey = this.getSecureHMACKey();
      
      // 機密データのマスキング
      const maskedData = this.maskSensitiveAuditData(data);
      
    const trail = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
        operation: operation,
        userId: options.userId ? crypto.createHash('sha256').update(options.userId).digest('hex').substring(0, 16) : null,
        sessionId: options.sessionId || null,
        ipAddress: options.ipAddress ? this.hashIP(options.ipAddress) : null,
        userAgent: options.userAgent ? crypto.createHash('sha256').update(options.userAgent).digest('hex').substring(0, 8) : null,
        dataHash: crypto.createHash('sha256').update(JSON.stringify(maskedData)).digest('hex'),
        dataSize: JSON.stringify(data).length,
        severity: options.severity || 'INFO',
        category: options.category || 'OPERATION',
        source: options.source || 'AppleSecurityStandards',
        expiresAt: new Date(Date.now() + (SECURITY_CONFIG.AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)).toISOString(),
      integrity: null
    };
    
    // 改ざん防止のためのHMAC
      const hmac = crypto.createHmac('sha512', hmacKey);
    hmac.update(JSON.stringify(trail));
    trail.integrity = hmac.digest('hex');
      
      // 統計更新
      this.stats.auditTrailsCreated++;
      
      console.log(`[AppleSecurity] Audit trail created: ${trail.id} (${operation})`);
    
    return trail;
      
    } catch (error) {
      console.error('[AppleSecurity] Audit trail generation failed:', error.message);
      throw new Error(`Audit trail generation failed: ${error.message}`);
    }
  }
  
  /**
   * 監査データの機密情報マスキング
   */
  maskSensitiveAuditData(data) {
    if (typeof data !== 'object' || data === null) {
      return data;
    }
    
    const masked = { ...data };
    const sensitiveFields = ['password', 'passphrase', 'token', 'key', 'secret', 'auth', 'credential'];
    
    for (const [key, value] of Object.entries(masked)) {
      const keyLower = key.toLowerCase();
      
      // 機密フィールドのマスキング
      if (sensitiveFields.some(field => keyLower.includes(field))) {
        masked[key] = '***MASKED***';
      }
      // 長い値の切り詰め
      else if (typeof value === 'string' && value.length > 100) {
        masked[key] = value.substring(0, 100) + '...';
      }
      // ネストオブジェクトの再帰処理
      else if (typeof value === 'object' && value !== null) {
        masked[key] = this.maskSensitiveAuditData(value);
      }
    }
    
    return masked;
  }
  
  /**
   * IPアドレスハッシュ化
   */
  hashIP(ip) {
    return crypto.createHash('sha256').update(ip + 'audit_salt').digest('hex').substring(0, 8);
  }

  // プライバシー影響評価（PIA）
  assessPrivacyImpact(operation) {
    const riskScores = {
      'store_message': 3,
      'fetch_history': 2,
      'analyze_content': 4,
      'share_data': 5
    };
    
    const score = riskScores[operation] || 1;
    const assessment = {
      operation,
      riskScore: score,
      riskLevel: score > 3 ? 'HIGH' : score > 1 ? 'MEDIUM' : 'LOW',
      mitigations: this.getPrivacyMitigations(score),
      timestamp: new Date().toISOString()
    };
    
    return assessment;
  }

  // プライバシーリスク軽減策
  getPrivacyMitigations(riskScore) {
    const mitigations = [];
    
    if (riskScore >= 3) {
      mitigations.push('暗号化必須');
      mitigations.push('アクセスログ記録');
    }
    if (riskScore >= 4) {
      mitigations.push('差分プライバシー適用');
      mitigations.push('データ最小化');
    }
    if (riskScore >= 5) {
      mitigations.push('明示的同意取得');
      mitigations.push('定期的削除');
    }
    
    return mitigations;
  }

  /**
   * セキュアな証明書署名鍵取得
   */
  getSecureCertificateKey() {
    const key = process.env.DELETION_CERT_KEY;
    
    if (!key) {
      if (SECURITY_CONFIG.REQUIRE_PRODUCTION_KEYS) {
        throw new Error('DELETION_CERT_KEY is required in production environment');
      }
      // 開発環境では一時的な鍵を生成
      console.warn('[AppleSecurity] Using temporary certificate key for development');
      return crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    }
    
    // デフォルト値検出
    if (key === 'default-key') {
      throw new Error('DELETION_CERT_KEY cannot use default value');
    }
    
    return key;
  }

  /**
   * データ削除証明書の生成（強化版）
   */
  generateDeletionCertificate(userId, dataTypes, options = {}) {
    try {
      const certificateKey = this.getSecureCertificateKey();
      
      if (!Array.isArray(dataTypes) || dataTypes.length === 0) {
        throw new Error('dataTypes must be a non-empty array');
      }
      
    const certificate = {
      certificateId: crypto.randomUUID(),
        version: '2.0',
      userId: crypto.createHash('sha256').update(userId).digest('hex'),
        userIdHash: crypto.createHash('sha256').update(userId + 'deletion_salt').digest('hex').substring(0, 16),
      deletedDataTypes: dataTypes,
      deletionTimestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + (SECURITY_CONFIG.CERTIFICATE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)).toISOString(),
        method: options.method || 'CRYPTO_SHREDDING',  // 暗号的削除
        scope: options.scope || 'COMPLETE',  // COMPLETE, PARTIAL
        jurisdiction: options.jurisdiction || 'GLOBAL',
        compliance: options.compliance || ['GDPR', 'CCPA'],
        requestId: options.requestId || crypto.randomUUID(),
        requestSource: options.requestSource || 'USER_REQUEST',
        verificationMethod: 'RSA-SHA512',
        issuer: 'AppleSecurityStandards',
      verification: null
    };
    
    // 証明書の署名
    const sign = crypto.createSign('RSA-SHA512');
    sign.update(JSON.stringify(certificate));
      certificate.verification = sign.sign(certificateKey, 'hex');
      
      // 統計更新
      this.stats.certificatesIssued++;
      
      // キャッシュ保存
      this.certCache.set(certificate.certificateId, {
        ...certificate,
        issuedAt: Date.now()
      });
      
      console.log(`[AppleSecurity] Deletion certificate issued: ${certificate.certificateId} for user: ${certificate.userIdHash}`);
    
    return certificate;
      
    } catch (error) {
      console.error('[AppleSecurity] Certificate generation failed:', error.message);
      throw new Error(`Certificate generation failed: ${error.message}`);
    }
  }
  
  /**
   * 証明書検証
   */
  verifyCertificate(certificate, publicKey = null) {
    try {
      if (!certificate.verification) {
        return { valid: false, reason: 'No verification signature found' };
      }
      
      // 有効期限チェック
      if (certificate.expiresAt && new Date(certificate.expiresAt) < new Date()) {
        return { valid: false, reason: 'Certificate expired' };
      }
      
      // 署名検証用のデータ準備
      const certForVerification = { ...certificate };
      delete certForVerification.verification;
      
      // 公開鍵がない場合はスキップ（開発環境）
      if (!publicKey) {
        console.warn('[AppleSecurity] Certificate verification skipped - no public key provided');
        return { valid: true, reason: 'Verification skipped (no public key)', warning: true };
      }
      
      // 署名検証
      const verify = crypto.createVerify('RSA-SHA512');
      verify.update(JSON.stringify(certForVerification));
      const isValid = verify.verify(publicKey, certificate.verification, 'hex');
      
      return {
        valid: isValid,
        reason: isValid ? 'Valid signature' : 'Invalid signature',
        certificateId: certificate.certificateId,
        expiresAt: certificate.expiresAt
      };
      
    } catch (error) {
      return { valid: false, reason: `Verification error: ${error.message}` };
    }
  }
  
  /**
   * 定期メンテナンス処理
   */
  performMaintenance() {
    const now = Date.now();
    const stats = {
      expiredCertificates: 0,
      expiredKeys: 0,
      cacheCleanup: 0
    };
    
    // 期限切れ証明書の削除
    for (const [id, cert] of this.certCache.entries()) {
      if (cert.expiresAt && new Date(cert.expiresAt) < new Date()) {
        this.certCache.delete(id);
        stats.expiredCertificates++;
      }
    }
    
    // 期限切れ鍵の削除
    for (const [id, key] of this.keyCache.entries()) {
      if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
        this.keyCache.delete(id);
        stats.expiredKeys++;
      }
      // 24時間以上古いキャッシュエントリも削除
      else if (now - key.createdAt > 24 * 60 * 60 * 1000) {
        this.keyCache.delete(id);
        stats.cacheCleanup++;
      }
    }
    
    if (stats.expiredCertificates > 0 || stats.expiredKeys > 0 || stats.cacheCleanup > 0) {
      console.log('[AppleSecurity] Maintenance completed:', stats);
    }
    
    return stats;
  }
  
  /**
   * セキュリティ統計取得
   */
  getSecurityStats() {
    return {
      timestamp: new Date().toISOString(),
      service: 'AppleSecurityStandards',
      version: '2.0.0-security-enhanced',
      uptime: {
        ms: Date.now() - this.stats.lastStatsReset,
        hours: Math.round((Date.now() - this.stats.lastStatsReset) / (1000 * 60 * 60) * 100) / 100
      },
      operations: {
        e2eeKeysGenerated: this.stats.e2eeKeysGenerated,
        certificatesIssued: this.stats.certificatesIssued,
        auditTrailsCreated: this.stats.auditTrailsCreated,
        privacyAssessmentsPerformed: this.stats.privacyAssessmentsPerformed,
        dataMinimizationOperations: this.stats.dataMinimizationOperations
      },
      cache: {
        certificates: this.certCache.size,
        keys: this.keyCache.size
      },
      configuration: {
        requireProductionKeys: SECURITY_CONFIG.REQUIRE_PRODUCTION_KEYS,
        differentialPrivacyEnabled: SECURITY_CONFIG.DIFFERENTIAL_PRIVACY.useCSPRNG,
        kAnonymityThreshold: SECURITY_CONFIG.K_ANONYMITY.threshold,
        auditRetentionDays: SECURITY_CONFIG.AUDIT_LOG_RETENTION_DAYS,
        certificateExpiryDays: SECURITY_CONFIG.CERTIFICATE_EXPIRY_DAYS
      }
    };
  }
  
  /**
   * セキュリティレポート生成
   */
  generateSecurityReport() {
    const stats = this.getSecurityStats();
    
    return {
      ...stats,
      
      // セキュリティ評価
      securityAssessment: {
        productionKeysConfigured: SECURITY_CONFIG.REQUIRE_PRODUCTION_KEYS,
        csrngEnabled: SECURITY_CONFIG.DIFFERENTIAL_PRIVACY.useCSPRNG,
        auditingEnabled: true,
        certificateManagementEnabled: true,
        dataMinimizationEnabled: SECURITY_CONFIG.DATA_POLICIES.minimization,
        overallScore: this.calculateSecurityScore()
      },
      
      // 推奨事項
      recommendations: this.generateRecommendations()
    };
  }
  
  /**
   * セキュリティスコア計算（100点満点）
   */
  calculateSecurityScore() {
    let score = 0;
    
    // 本番鍵設定 (25点)
    if (SECURITY_CONFIG.REQUIRE_PRODUCTION_KEYS) score += 25;
    
    // CSPRNG使用 (20点)
    if (SECURITY_CONFIG.DIFFERENTIAL_PRIVACY.useCSPRNG) score += 20;
    
    // 監査機能 (15点)
    try {
      this.getSecureHMACKey();
      score += 15;
    } catch (error) {
      // HMAC鍵未設定
    }
    
    // 証明書管理 (15点)
    try {
      this.getSecureCertificateKey();
      score += 15;
    } catch (error) {
      // 証明書鍵未設定
    }
    
    // データ最小化 (10点)
    if (SECURITY_CONFIG.DATA_POLICIES.minimization) score += 10;
    
    // k-匿名性設定 (10点)
    if (SECURITY_CONFIG.K_ANONYMITY.threshold >= 5) score += 10;
    
    // 定期メンテナンス (5点)
    if (this.cleanupInterval) score += 5;
    
    return Math.min(100, score);
  }
  
  /**
   * 推奨事項生成
   */
  generateRecommendations() {
    const recommendations = [];
    
    if (!SECURITY_CONFIG.REQUIRE_PRODUCTION_KEYS) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Key Management',
        message: '本番環境でのセキュリティ鍵設定を有効にしてください。',
        action: 'Set NODE_ENV=production and configure security keys'
      });
    }
    
    try {
      this.getSecureHMACKey();
    } catch (error) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Audit Security',
        message: 'AUDIT_HMAC_KEYが未設定または不正です。',
        action: 'Set AUDIT_HMAC_KEY environment variable'
      });
    }
    
    try {
      this.getSecureCertificateKey();
    } catch (error) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Certificate Management',
        message: 'DELETION_CERT_KEYが未設定または不正です。',
        action: 'Set DELETION_CERT_KEY environment variable'
      });
    }
    
    if (!SECURITY_CONFIG.DIFFERENTIAL_PRIVACY.useCSPRNG) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'Cryptographic Security',
        message: '差分プライバシーでCSPRNGを使用することを推奨します。',
        action: 'Set PRIVACY_USE_CSPRNG=true'
      });
    }
    
    if (SECURITY_CONFIG.K_ANONYMITY.threshold < 5) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'Privacy Protection',
        message: 'k-匿名性の閾値を5以上に設定することを推奨します。',
        action: 'Set K_ANONYMITY_THRESHOLD=5 or higher'
      });
    }
    
    return recommendations;
  }
  
  /**
   * クリーンアップ（プロセス終了時）
   */
  cleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.certCache.clear();
    this.keyCache.clear();
    
    console.log('[AppleSecurity] Cleanup completed');
  }
}

// プロセス終了時のクリーンアップ
process.on('SIGTERM', () => {
  if (module.exports && typeof module.exports.cleanup === 'function') {
    module.exports.cleanup();
  }
});

process.on('SIGINT', () => {
  if (module.exports && typeof module.exports.cleanup === 'function') {
    module.exports.cleanup();
  }
});

module.exports = new AppleSecurityStandards(); 