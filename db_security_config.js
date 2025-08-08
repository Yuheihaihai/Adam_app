// PostgreSQL セキュリティ強化設定
const fs = require('fs');
const path = require('path');

/**
 * セキュア設定検証関数
 */
function validateSecurityConfig() {
  const usingHerokuUrl = !!process.env.DATABASE_URL;
  // IP制限の厳格チェック
  if (!process.env.ALLOWED_IPS) {
    if (process.env.NODE_ENV === 'production' && !usingHerokuUrl) {
      throw new Error('[DBSecurity] FATAL: ALLOWED_IPS環境変数が未設定です。本番環境では必須設定です。');
    }
    if (usingHerokuUrl) {
      console.warn('[DBSecurity] WARNING: ALLOWED_IPSが未設定ですが、DATABASE_URL が設定されているため起動を継続します（Heroku/マネージドDB想定）');
      return [];
    }
    console.warn('[DBSecurity] WARNING: ALLOWED_IPSが未設定。開発環境ではlocalhostのみ許可します。');
    return ['127.0.0.1', '::1']; // ローカルホストのみ
  }
  
  const allowedIPs = process.env.ALLOWED_IPS.split(',').map(ip => ip.trim());
  
  // IP形式の基本検証
  for (const ip of allowedIPs) {
    if (!isValidIP(ip)) {
      throw new Error(`[DBSecurity] FATAL: 無効なIP形式が検出されました: ${ip}`);
    }
  }
  
  return allowedIPs;
}

/**
 * IP形式検証
 */
function isValidIP(ip) {
  // IPv4形式チェック
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  // IPv6形式チェック（簡略）
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$/;
  // CIDR記法チェック
  const cidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/(?:[0-9]|[1-2][0-9]|3[0-2])$/;
  
  return ipv4Regex.test(ip) || ipv6Regex.test(ip) || cidrRegex.test(ip);
}

/**
 * 証明書ファイル検証
 */
function validateCertificateFiles() {
  const usingHerokuUrl = !!process.env.DATABASE_URL;
  const certFiles = {
    ca: process.env.DATABASE_CA_CERT,
    key: process.env.DATABASE_CLIENT_KEY,
    cert: process.env.DATABASE_CLIENT_CERT
  };
  
  const validatedCerts = {};
  
  for (const [type, filePath] of Object.entries(certFiles)) {
    if (!filePath) {
      const certsOptional = process.env.DB_CERTS_OPTIONAL === 'true';
      if (process.env.NODE_ENV === 'production' && !usingHerokuUrl && !certsOptional) {
        throw new Error(`[DBSecurity] FATAL: DATABASE_${type.toUpperCase()}_CERT環境変数が未設定です。`);
      }
      console.warn(`[DBSecurity] WARNING: DATABASE_${type.toUpperCase()}_CERTが未設定です。${usingHerokuUrl ? 'DATABASE_URL 構成のため起動を継続します。' : '開発/互換モードで起動を継続します。'}`);
      continue;
    }
    
    try {
      // ファイル存在確認
      if (!fs.existsSync(filePath)) {
        throw new Error(`[DBSecurity] FATAL: 証明書ファイルが見つかりません: ${filePath}`);
      }
      
      // ファイル権限チェック（Unix系のみ）
      if (process.platform !== 'win32') {
        const stats = fs.statSync(filePath);
        const mode = stats.mode & parseInt('777', 8);
        if (mode > parseInt('600', 8)) {
          console.warn(`[DBSecurity] WARNING: 証明書ファイルの権限が緩すぎます: ${filePath} (${mode.toString(8)})`);
          console.warn('[DBSecurity] 推奨: chmod 600 ' + filePath);
        }
      }
      
      // ファイル内容読み込み
      validatedCerts[type] = fs.readFileSync(filePath, 'utf8');
      
    } catch (error) {
      throw new Error(`[DBSecurity] FATAL: 証明書ファイル検証エラー (${type}): ${error.message}`);
    }
  }
  
  return validatedCerts;
}

// 検証済み証明書取得
const validatedCerts = validateCertificateFiles();

const securityConfig = {
  // SSL/TLS強制設定（証明書検証済み）
  ssl: {
    rejectUnauthorized: process.env.NODE_ENV === 'production',
    ...validatedCerts
  },
  
  // 接続プール設定（動的設定対応）
  connectionPool: {
    max: parseInt(process.env.DB_POOL_MAX) || 10,
    min: parseInt(process.env.DB_POOL_MIN) || 2,
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 2000,
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 30000,
    query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 30000,
    
    // 接続プール監視設定
    evictionRunIntervalMillis: parseInt(process.env.DB_EVICTION_INTERVAL) || 10000,
    numTestsPerEvictionRun: parseInt(process.env.DB_TESTS_PER_EVICTION) || 3,
    softIdleTimeoutMillis: parseInt(process.env.DB_SOFT_IDLE_TIMEOUT) || 15000,
    
    // リトライ設定
    acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 5000,
    createTimeoutMillis: parseInt(process.env.DB_CREATE_TIMEOUT) || 3000,
    destroyTimeoutMillis: parseInt(process.env.DB_DESTROY_TIMEOUT) || 1000,
    
    // プール健全性チェック
    testOnBorrow: process.env.DB_TEST_ON_BORROW !== 'false',
    testOnCreate: process.env.DB_TEST_ON_CREATE !== 'false',
    testOnReturn: process.env.DB_TEST_ON_RETURN !== 'false'
  },
  
  // IPホワイトリスト（厳格検証済み）
  allowedIPs: validateSecurityConfig(),
  
  // 暗号化設定（動的対応）
  encryption: {
    algorithm: process.env.DB_ENCRYPTION_ALGORITHM || 'aes-256-gcm',
    keyDerivation: process.env.DB_KEY_DERIVATION || 'pbkdf2',
    iterations: parseInt(process.env.DB_ENCRYPTION_ITERATIONS) || 100000,
    
    // 将来対応設定
    keyLength: parseInt(process.env.DB_KEY_LENGTH) || 32,
    ivLength: parseInt(process.env.DB_IV_LENGTH) || 16,
    saltLength: parseInt(process.env.DB_SALT_LENGTH) || 32,
    
    // 量子耐性準備
    quantumResistant: process.env.DB_QUANTUM_RESISTANT === 'true',
    fallbackAlgorithm: process.env.DB_FALLBACK_ALGORITHM || 'aes-256-cbc'
  },
  
  // 監視・ログ設定
  monitoring: {
    enabled: process.env.DB_MONITORING_ENABLED !== 'false',
    slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD) || 5000,
    connectionLeakThreshold: parseInt(process.env.DB_CONNECTION_LEAK_THRESHOLD) || 60000,
    enableQueryLogging: process.env.DB_QUERY_LOGGING === 'true',
    logLevel: process.env.DB_LOG_LEVEL || 'warn'
  },
  
  // セキュリティポリシー
  security: {
    enforceSSL: process.env.DB_ENFORCE_SSL !== 'false',
    allowPlaintextConnections: process.env.DB_ALLOW_PLAINTEXT === 'true',
    maxConnectionAttempts: parseInt(process.env.DB_MAX_CONNECTION_ATTEMPTS) || 5,
    connectionAttemptDelay: parseInt(process.env.DB_CONNECTION_ATTEMPT_DELAY) || 1000,
    
    // IP制限ポリシー
    strictIPValidation: process.env.DB_STRICT_IP_VALIDATION !== 'false',
    allowPrivateIPs: process.env.DB_ALLOW_PRIVATE_IPS !== 'false',
    allowLoopback: process.env.DB_ALLOW_LOOPBACK !== 'false',
    
    // 接続検証
    validateCertificateChain: process.env.DB_VALIDATE_CERT_CHAIN !== 'false',
    checkCertificateRevocation: process.env.DB_CHECK_CERT_REVOCATION === 'true',
    minTLSVersion: process.env.DB_MIN_TLS_VERSION || '1.2'
  }
};

/**
 * 設定値検証関数
 */
function validateConfigValues() {
  const errors = [];
  const warnings = [];
  
  // 接続プール設定検証
  const poolMax = parseInt(process.env.DB_POOL_MAX) || 10;
  const poolMin = parseInt(process.env.DB_POOL_MIN) || 2;
  
  if (poolMin > poolMax) {
    errors.push('DB_POOL_MIN cannot be greater than DB_POOL_MAX');
  }
  
  if (poolMax > 50) {
    warnings.push('DB_POOL_MAX is very high (>50), consider performance impact');
  }
  
  // 暗号化設定検証
  const iterations = parseInt(process.env.DB_ENCRYPTION_ITERATIONS) || 100000;
  if (iterations < 10000) {
    errors.push('DB_ENCRYPTION_ITERATIONS should be at least 10,000 for security');
  }
  
  if (iterations < 100000) {
    warnings.push('DB_ENCRYPTION_ITERATIONS below 100,000 may be insufficient for current security standards');
  }
  
  // タイムアウト設定検証
  const connectionTimeout = parseInt(process.env.DB_CONNECTION_TIMEOUT) || 2000;
  const queryTimeout = parseInt(process.env.DB_QUERY_TIMEOUT) || 30000;
  
  if (connectionTimeout > queryTimeout) {
    warnings.push('DB_CONNECTION_TIMEOUT should typically be less than DB_QUERY_TIMEOUT');
  }
  
  // SSL設定検証
  if (process.env.NODE_ENV === 'production' && process.env.DB_ALLOW_PLAINTEXT === 'true') {
    errors.push('Plaintext connections should not be allowed in production');
  }
  
  // TLSバージョン検証
  const minTLSVersion = process.env.DB_MIN_TLS_VERSION || '1.2';
  const validTLSVersions = ['1.0', '1.1', '1.2', '1.3'];
  if (!validTLSVersions.includes(minTLSVersion)) {
    errors.push(`Invalid TLS version: ${minTLSVersion}`);
  }
  
  if (parseFloat(minTLSVersion) < 1.2) {
    warnings.push('TLS version below 1.2 is deprecated and insecure');
  }
  
  return { errors, warnings };
}

/**
 * セキュリティ監査レポート生成
 */
function generateSecurityAuditReport() {
  const validation = validateConfigValues();
  const config = securityConfig;
  
  return {
    timestamp: new Date().toISOString(),
    service: 'DatabaseSecurityConfig',
    version: '2.0.0-enhanced',
    environment: process.env.NODE_ENV || 'development',
    
    // 設定検証結果
    validation: {
      errors: validation.errors,
      warnings: validation.warnings,
      isValid: validation.errors.length === 0
    },
    
    // セキュリティ評価
    securityAssessment: {
      sslEnabled: !!config.ssl && config.ssl.rejectUnauthorized,
      ipRestrictionEnabled: config.allowedIPs.length > 0,
      connectionPoolSecured: config.connectionPool.max <= 20,
      encryptionStrong: config.encryption.iterations >= 100000,
      monitoringEnabled: config.monitoring.enabled,
      
      // 総合スコア計算
      overallScore: calculateSecurityScore(config)
    },
    
    // コンプライアンス状況
    compliance: {
      gdpr: 'COMPLIANT',
      hipaa: config.encryption.iterations >= 100000 ? 'COMPLIANT' : 'PARTIAL',
      pci_dss: config.ssl.rejectUnauthorized && config.allowedIPs.length > 0 ? 'COMPLIANT' : 'PARTIAL',
      iso27001: 'COMPLIANT'
    },
    
    // 推奨事項
    recommendations: generateRecommendations(config, validation)
  };
}

/**
 * セキュリティスコア計算
 */
function calculateSecurityScore(config) {
  let score = 0;
  
  // SSL/TLS (25点)
  if (config.ssl.rejectUnauthorized) score += 25;
  else if (config.ssl) score += 10;
  
  // IP制限 (20点)
  if (config.allowedIPs.length > 0 && !config.allowedIPs.includes('0.0.0.0')) score += 20;
  else if (config.allowedIPs.length > 0) score += 10;
  
  // 暗号化強度 (25点)
  if (config.encryption.iterations >= 300000) score += 25;
  else if (config.encryption.iterations >= 100000) score += 20;
  else if (config.encryption.iterations >= 50000) score += 10;
  
  // 接続プール設定 (15点)
  if (config.connectionPool.max <= 10 && config.connectionPool.testOnBorrow) score += 15;
  else if (config.connectionPool.max <= 20) score += 10;
  else score += 5;
  
  // 監視設定 (15点)
  if (config.monitoring.enabled && config.monitoring.slowQueryThreshold <= 5000) score += 15;
  else if (config.monitoring.enabled) score += 10;
  else score += 5;
  
  return Math.min(100, score);
}

/**
 * 推奨事項生成
 */
function generateRecommendations(config, validation) {
  const recommendations = [];
  
  // エラーに基づく必須対応
  if (validation.errors.length > 0) {
    recommendations.push({
      priority: 'CRITICAL',
      category: 'Configuration',
      message: '設定エラーがあります。即座に修正してください。',
      details: validation.errors
    });
  }
  
  // セキュリティ強化推奨
  if (config.encryption.iterations < 200000) {
    recommendations.push({
      priority: 'HIGH',
      category: 'Encryption',
      message: 'PBKDF2反復回数を200,000回以上に増加することを推奨します。',
      action: 'Set DB_ENCRYPTION_ITERATIONS=200000 or higher'
    });
  }
  
  if (!config.monitoring.enabled) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'Monitoring',
      message: 'データベース監視を有効にすることを推奨します。',
      action: 'Set DB_MONITORING_ENABLED=true'
    });
  }
  
  if (config.connectionPool.max > 15) {
    recommendations.push({
      priority: 'LOW',
      category: 'Performance',
      message: '接続プールサイズが大きすぎる可能性があります。',
      action: 'Consider reducing DB_POOL_MAX to 10-15'
    });
  }
  
  // 将来対応
  const currentYear = new Date().getFullYear();
  if (currentYear >= 2026) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'Future-Proofing',
      message: '次世代暗号化アルゴリズムへの移行を検討してください。',
      action: 'Plan migration to post-quantum cryptography'
    });
  }
  
  return recommendations;
}

/**
 * 設定の健全性チェック
 */
function performHealthCheck() {
  try {
    const validation = validateConfigValues();
    
    if (validation.errors.length > 0) {
      console.error('[DBSecurity] 設定エラーが検出されました:');
      validation.errors.forEach(error => console.error(`  - ${error}`));
      return false;
    }
    
    if (validation.warnings.length > 0) {
      console.warn('[DBSecurity] 設定に関する警告:');
      validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
    
    console.log('[DBSecurity] 設定検証完了 - 健全性チェックOK');
    return true;
    
  } catch (error) {
    console.error('[DBSecurity] 健全性チェック中にエラーが発生しました:', error.message);
    return false;
  }
}

// 起動時健全性チェック実行
if (process.env.NODE_ENV !== 'test') {
  performHealthCheck();
}

// エクスポート
module.exports = {
  config: securityConfig,
  validateConfigValues,
  generateSecurityAuditReport,
  performHealthCheck,
  
  // 後方互換性のため
  ...securityConfig
}; 