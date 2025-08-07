/**
 * 音声メッセージAPI用レート制限ミドルウェア（セキュリティ強化版）
 * 
 * Express.jsのミドルウェアとして使用し、APIリクエストのレート制限を実装します。
 * 月間の総量制限と1日あたりのユーザー制限を監視します。
 * 
 * セキュリティ機能:
 * - 認証必須化（なりすまし防止）
 * - IP・ユーザー複合制限
 * - メモリDoS対策
 * - 偵察情報最小化
 */

const insightsService = require('./insightsService');
const crypto = require('crypto');

/**
 * LRUキャッシュ実装（TTL付き）- メモリDoS対策
 */
class LRUCache {
    constructor(maxSize = 1000, ttlMs = 60000) {
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
        this.cache = new Map();
    }
    
    set(key, value) {
        const now = Date.now();
        const entry = { value, timestamp: now };
        
        // 既存のエントリがあれば削除（LRU更新のため）
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        
        // サイズ制限チェック
        if (this.cache.size >= this.maxSize) {
            // 最も古いエントリを削除
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, entry);
    }
    
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        
        const now = Date.now();
        // TTLチェック
        if (now - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return null;
        }
        
        // LRU更新（再挿入）
        this.cache.delete(key);
        this.cache.set(key, entry);
        
        return entry.value;
    }
    
    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.ttlMs) {
                this.cache.delete(key);
            }
        }
    }
    
    size() {
        return this.cache.size;
    }
}

// セキュリティ強化設定
const SECURITY_CONFIG = {
    MAX_TRACKED_USERS: parseInt(process.env.RATE_LIMIT_MAX_USERS) || 10000,
    MAX_TRACKED_IPS: parseInt(process.env.RATE_LIMIT_MAX_IPS) || 5000,
    CACHE_TTL: parseInt(process.env.RATE_LIMIT_CACHE_TTL) || 24 * 60 * 60 * 1000, // 24時間
    IP_RATE_LIMIT: parseInt(process.env.RATE_LIMIT_IP_DAILY) || 100, // IP単位の日次制限
    ANONYMOUS_RATE_LIMIT: parseInt(process.env.RATE_LIMIT_ANONYMOUS_DAILY) || 5, // 匿名の日次制限
    REQUIRE_AUTH: process.env.RATE_LIMIT_REQUIRE_AUTH !== 'false',
    ENABLE_IP_TRACKING: process.env.RATE_LIMIT_IP_TRACKING !== 'false',
    LOG_RATE_LIMIT_EVENTS: process.env.RATE_LIMIT_LOG_EVENTS !== 'false',
    EXPOSE_DETAILED_HEADERS: process.env.RATE_LIMIT_EXPOSE_HEADERS === 'true'
};

// ユーザーごとのリクエスト追跡（LRU・TTL対応）
const requestTracker = new LRUCache(SECURITY_CONFIG.MAX_TRACKED_USERS, SECURITY_CONFIG.CACHE_TTL);

// IP単位のレート制限追跡
const ipTracker = new LRUCache(SECURITY_CONFIG.MAX_TRACKED_IPS, SECURITY_CONFIG.CACHE_TTL);

// 統計情報
const rateLimitStats = {
    totalRequests: 0,
    blockedRequests: 0,
    blockedByUser: 0,
    blockedByIP: 0,
    blockedByAuth: 0,
    lastReset: Date.now()
};

/**
 * クライアントIPアドレス取得（プロキシ対応）
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         'unknown';
}

/**
 * ユーザーID検証・取得（認証強化版）
 */
function validateAndGetUserId(req) {
  // 認証が必須の場合
  if (SECURITY_CONFIG.REQUIRE_AUTH) {
    // セッション・JWT・認証ミドルウェアからの取得を優先
    if (req.user && req.user.id) {
      return { userId: req.user.id, authenticated: true, trustLevel: 'high' };
    }
    
    if (req.session && req.session.userId) {
      return { userId: req.session.userId, authenticated: true, trustLevel: 'medium' };
    }
    
    // 認証が必要だが未認証
    return { error: 'authentication_required', authenticated: false };
  }
  
  // 認証不要モード（開発・テスト用）
  const requestUserId = req.body.userId || req.query.userId;
  
  if (requestUserId) {
    // リクエスト由来のUserIDは低信頼度
    return { userId: requestUserId, authenticated: false, trustLevel: 'low' };
  }
  
  // 完全匿名
  return { userId: 'anonymous', authenticated: false, trustLevel: 'anonymous' };
}

/**
 * IP単位のレート制限チェック
 */
function checkIPRateLimit(clientIP) {
  if (!SECURITY_CONFIG.ENABLE_IP_TRACKING) return { allowed: true };
  
  const today = new Date().toISOString().split('T')[0];
  const ipKey = `${clientIP}:${today}`;
  
  let ipCount = ipTracker.get(ipKey) || 0;
  ipCount++;
  ipTracker.set(ipKey, ipCount);
  
  const allowed = ipCount <= SECURITY_CONFIG.IP_RATE_LIMIT;
  
  return {
    allowed,
    count: ipCount,
    limit: SECURITY_CONFIG.IP_RATE_LIMIT,
    remaining: Math.max(0, SECURITY_CONFIG.IP_RATE_LIMIT - ipCount)
  };
}

/**
 * セキュアログ出力
 */
function logRateLimitEvent(event, details) {
  if (!SECURITY_CONFIG.LOG_RATE_LIMIT_EVENTS) return;
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    userId: details.userId ? hashUserId(details.userId) : 'unknown',
    clientIP: details.clientIP ? hashIP(details.clientIP) : 'unknown',
    reason: details.reason,
    authenticated: details.authenticated || false,
    trustLevel: details.trustLevel || 'unknown'
  };
  
  console.warn('[RateLimit]', JSON.stringify(logEntry));
}

/**
 * UserId・IPハッシュ化（プライバシー保護）
 */
function hashUserId(userId) {
  return crypto.createHash('sha256').update(userId + 'rate_limit_salt').digest('hex').substring(0, 8);
}

function hashIP(ip) {
  return crypto.createHash('sha256').update(ip + 'ip_rate_limit_salt').digest('hex').substring(0, 8);
}

/**
 * 音声メッセージAPIレート制限ミドルウェア（セキュリティ強化版）
 * @param {Object} req - Expressリクエストオブジェクト
 * @param {Object} res - Expressレスポンスオブジェクト
 * @param {Function} next - 次のミドルウェア関数
 */
function voiceRateLimiter(req, res, next) {
  try {
    rateLimitStats.totalRequests++;
    
    // クライアントIP取得
    const clientIP = getClientIP(req);
    
    // ユーザーID検証・取得
    const userValidation = validateAndGetUserId(req);
    
    if (userValidation.error) {
      rateLimitStats.blockedByAuth++;
      
      logRateLimitEvent('auth_required', {
        clientIP,
        reason: 'authentication_required',
        authenticated: false
      });
      
      return res.status(401).json({
        error: 'authentication_required',
        message: '認証が必要です。ログインしてからAPIを使用してください。'
      });
    }
    
    const { userId, authenticated, trustLevel } = userValidation;
    
    // IP単位のレート制限チェック
    const ipResult = checkIPRateLimit(clientIP);
    if (!ipResult.allowed) {
      rateLimitStats.blockedByIP++;
      
      logRateLimitEvent('ip_rate_limit_exceeded', {
        userId,
        clientIP,
        reason: 'ip_daily_limit',
        authenticated,
        trustLevel,
        ipCount: ipResult.count,
        ipLimit: ipResult.limit
      });
      
      return res.status(429).json({
        error: 'rate_limit_exceeded',
        message: 'IPアドレス単位の日次制限に達しました。',
        reason: 'ip_daily_limit',
        retryAfter: getSecondsUntilTomorrow()
      });
    }
    
    // 信頼度による制限調整
    let adjustedUserId = userId;
    if (trustLevel === 'anonymous' || trustLevel === 'low') {
      adjustedUserId = `${userId}:${clientIP}`; // IP込みで制限
    }
    
    // 音声メッセージリクエストを追跡
    const result = insightsService.trackAudioRequest(adjustedUserId);
    
    if (!result.allowed) {
      rateLimitStats.blockedByUser++;
      
      logRateLimitEvent('user_rate_limit_exceeded', {
        userId,
        clientIP,
        reason: result.reason,
        authenticated,
        trustLevel,
        userCount: result.userDailyCount,
        userLimit: result.userDailyLimit
      });
      
      // レスポンスヘッダー設定（用途に応じて制御）
      if (SECURITY_CONFIG.EXPOSE_DETAILED_HEADERS || req.headers['x-admin-access']) {
        res.setHeader('X-RateLimit-Limit-Daily', result.userDailyLimit);
        res.setHeader('X-RateLimit-Remaining-Daily', Math.max(0, result.userDailyLimit - result.userDailyCount));
        res.setHeader('X-RateLimit-Limit-Monthly', result.globalMonthlyLimit);
        res.setHeader('X-RateLimit-Remaining-Monthly', Math.max(0, result.globalMonthlyLimit - result.globalMonthlyCount));
      } else {
        // 最小限の情報のみ
        res.setHeader('X-RateLimit-Retry-After', result.reason === 'user_daily_limit' ? 
          getSecondsUntilTomorrow() : 
          getSecondsUntilNextMonth());
      }
      
      // 429 Too Many Requestsエラー
      return res.status(429).json({
        error: 'rate_limit_exceeded',
        message: result.message,
        reason: result.reason,
        retryAfter: result.reason === 'user_daily_limit' ? 
          getSecondsUntilTomorrow() : 
          getSecondsUntilNextMonth()
      });
    }
    
    // 成功ログ（低頻度）
    if (Math.random() < 0.01) { // 1%の確率
      logRateLimitEvent('request_allowed', {
        userId,
        clientIP,
        authenticated,
        trustLevel
      });
    }
    
    // 制限内なのでリクエストを処理
    next();
    
  } catch (error) {
    console.error('[RateLimit] Error:', error.message);
    
    // エラー時はfail-closeの原則に従い、拒否
    rateLimitStats.blockedRequests++;
    
    return res.status(503).json({
      error: 'rate_limit_service_unavailable',
      message: 'レート制限サービスが一時的に利用できません。'
    });
  }
}

/**
 * 翌日までの秒数を計算
 * @returns {number} 翌日までの秒数
 */
function getSecondsUntilTomorrow() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return Math.ceil((tomorrow - now) / 1000);
}

/**
 * 翌月までの秒数を計算
 * @returns {number} 翌月までの秒数
 */
function getSecondsUntilNextMonth() {
  const now = new Date();
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(1);
  nextMonth.setHours(0, 0, 0, 0);
  return Math.ceil((nextMonth - now) / 1000);
}

/**
 * レート制限統計取得
 */
function getRateLimitStats() {
  const now = Date.now();
  const uptimeMs = now - rateLimitStats.lastReset;
  
  return {
    timestamp: new Date().toISOString(),
    uptime: {
      ms: uptimeMs,
      hours: Math.round(uptimeMs / (1000 * 60 * 60) * 100) / 100
    },
    requests: {
      total: rateLimitStats.totalRequests,
      blocked: rateLimitStats.blockedRequests,
      blockedByAuth: rateLimitStats.blockedByAuth,
      blockedByUser: rateLimitStats.blockedByUser,
      blockedByIP: rateLimitStats.blockedByIP,
      allowed: rateLimitStats.totalRequests - rateLimitStats.blockedRequests,
      blockRate: rateLimitStats.totalRequests > 0 ? 
        Math.round((rateLimitStats.blockedRequests / rateLimitStats.totalRequests) * 10000) / 100 : 0
    },
    cache: {
      userTrackerSize: requestTracker.size(),
      ipTrackerSize: ipTracker.size(),
      maxUsers: SECURITY_CONFIG.MAX_TRACKED_USERS,
      maxIPs: SECURITY_CONFIG.MAX_TRACKED_IPS
    },
    config: {
      requireAuth: SECURITY_CONFIG.REQUIRE_AUTH,
      ipTracking: SECURITY_CONFIG.ENABLE_IP_TRACKING,
      ipRateLimit: SECURITY_CONFIG.IP_RATE_LIMIT,
      cacheTTL: SECURITY_CONFIG.CACHE_TTL
    }
  };
}

/**
 * メモリクリーンアップ・統計リセット
 */
function performMaintenance() {
  // キャッシュクリーンアップ
  requestTracker.cleanup();
  ipTracker.cleanup();
  
  // 統計情報の状況確認
  const stats = getRateLimitStats();
  
  if (stats.cache.userTrackerSize > SECURITY_CONFIG.MAX_TRACKED_USERS * 0.8) {
    console.warn('[RateLimit] User cache size approaching limit:', stats.cache.userTrackerSize);
  }
  
  if (stats.cache.ipTrackerSize > SECURITY_CONFIG.MAX_TRACKED_IPS * 0.8) {
    console.warn('[RateLimit] IP cache size approaching limit:', stats.cache.ipTrackerSize);
  }
  
  // 高いブロック率の警告
  if (stats.requests.blockRate > 50) {
    console.warn('[RateLimit] High block rate detected:', stats.requests.blockRate + '%');
  }
  
  return stats;
}

/**
 * セキュリティレポート生成
 */
function generateSecurityReport() {
  const stats = getRateLimitStats();
  
  return {
    timestamp: new Date().toISOString(),
    service: 'RateLimitService',
    version: '2.0.0-security-enhanced',
    ...stats,
    
    // セキュリティ評価
    securityAssessment: {
      authenticationEnabled: SECURITY_CONFIG.REQUIRE_AUTH,
      ipTrackingEnabled: SECURITY_CONFIG.ENABLE_IP_TRACKING,
      memorySafe: stats.cache.userTrackerSize < SECURITY_CONFIG.MAX_TRACKED_USERS,
      blockRateHealthy: stats.requests.blockRate < 30,
      overallScore: calculateSecurityScore(stats)
    },
    
    // 推奨事項
    recommendations: generateRecommendations(stats)
  };
}

/**
 * セキュリティスコア計算
 */
function calculateSecurityScore(stats) {
  let score = 0;
  
  // 認証有効 (30点)
  if (SECURITY_CONFIG.REQUIRE_AUTH) score += 30;
  
  // IP追跡有効 (20点)
  if (SECURITY_CONFIG.ENABLE_IP_TRACKING) score += 20;
  
  // メモリ使用量健全性 (20点)
  const userCacheRatio = stats.cache.userTrackerSize / SECURITY_CONFIG.MAX_TRACKED_USERS;
  const ipCacheRatio = stats.cache.ipTrackerSize / SECURITY_CONFIG.MAX_TRACKED_IPS;
  
  if (userCacheRatio < 0.8 && ipCacheRatio < 0.8) score += 20;
  else if (userCacheRatio < 0.9 && ipCacheRatio < 0.9) score += 15;
  else score += 10;
  
  // ブロック率の適切性 (15点)
  if (stats.requests.blockRate > 0 && stats.requests.blockRate < 20) score += 15;
  else if (stats.requests.blockRate < 40) score += 10;
  else score += 5;
  
  // 設定の堅牢性 (15点)
  if (SECURITY_CONFIG.LOG_RATE_LIMIT_EVENTS && !SECURITY_CONFIG.EXPOSE_DETAILED_HEADERS) score += 15;
  else if (SECURITY_CONFIG.LOG_RATE_LIMIT_EVENTS || !SECURITY_CONFIG.EXPOSE_DETAILED_HEADERS) score += 10;
  else score += 5;
  
  return Math.min(100, score);
}

/**
 * 推奨事項生成
 */
function generateRecommendations(stats) {
  const recommendations = [];
  
  if (!SECURITY_CONFIG.REQUIRE_AUTH) {
    recommendations.push({
      priority: 'HIGH',
      category: 'Authentication',
      message: '認証を有効にすることを強く推奨します。',
      action: 'Set RATE_LIMIT_REQUIRE_AUTH=true'
    });
  }
  
  if (!SECURITY_CONFIG.ENABLE_IP_TRACKING) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'IP Tracking',
      message: 'IP追跡を有効にしてセキュリティを強化してください。',
      action: 'Set RATE_LIMIT_IP_TRACKING=true'
    });
  }
  
  if (stats.cache.userTrackerSize > SECURITY_CONFIG.MAX_TRACKED_USERS * 0.8) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'Memory Management',
      message: 'ユーザーキャッシュサイズが大きくなっています。',
      action: 'Consider increasing RATE_LIMIT_MAX_USERS or implementing cleanup'
    });
  }
  
  if (stats.requests.blockRate > 30) {
    recommendations.push({
      priority: 'LOW',
      category: 'Rate Limits',
      message: 'ブロック率が高すぎる可能性があります。制限値を見直してください。',
      action: 'Review rate limit values and user behavior'
    });
  }
  
  if (SECURITY_CONFIG.EXPOSE_DETAILED_HEADERS) {
    recommendations.push({
      priority: 'LOW',
      category: 'Information Disclosure',
      message: '詳細ヘッダー公開を無効にすることを推奨します。',
      action: 'Set RATE_LIMIT_EXPOSE_HEADERS=false'
    });
  }
  
  return recommendations;
}

// 定期メンテナンス（15分ごと）
const maintenanceInterval = setInterval(() => {
  performMaintenance();
}, 15 * 60 * 1000);

// プロセス終了時のクリーンアップ
process.on('SIGTERM', () => {
  clearInterval(maintenanceInterval);
});

process.on('SIGINT', () => {
  clearInterval(maintenanceInterval);
});

// エクスポート
module.exports = {
  // メイン関数
  middleware: voiceRateLimiter,
  
  // 統計・管理機能
  getRateLimitStats,
  performMaintenance,
  generateSecurityReport,
  
  // 後方互換性
  default: voiceRateLimiter
};

// 後方互換性のため、デフォルトエクスポートも設定
module.exports.default = voiceRateLimiter; 