const crypto = require('crypto');
const logger = require('./logger');

/**
 * LRUキャッシュ実装（TTL付き）- nextGenSecuritySystemから移植
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
    
    has(key) {
        return this.get(key) !== null;
    }
    
    delete(key) {
        this.cache.delete(key);
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
    
    getAllEntries() {
        const entries = {};
        for (const [key, entry] of this.cache.entries()) {
            entries[key] = entry.value;
        }
        return entries;
    }
}

// セキュリティ設定
const SECURITY_CONFIG = {
    // レート制限
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15分
        maxRequests: 100, // 15分間に100リクエストまで
        blockDuration: 60 * 60 * 1000 // 1時間ブロック
    },
    // DDoS検知
    ddos: {
        threshold: 50, // 1分間に50リクエスト以上でDDoSと判定
        windowMs: 60 * 1000, // 1分間のウィンドウ
        blockDuration: 30 * 60 * 1000 // 30分ブロック
    },
    // ブルートフォース検知
    bruteForce: {
        maxAttempts: 5, // 5回失敗でブロック
        windowMs: 10 * 60 * 1000, // 10分間のウィンドウ
        blockDuration: 60 * 60 * 1000 // 1時間ブロック
    },
    // 異常アクセスパターン
    anomaly: {
        suspiciousPatterns: [
            /admin/i,
            /login/i,
            /wp-admin/i,
            /phpmyadmin/i,
            /\.env/i,
            /config/i,
            /backup/i,
            /\.sql/i,
            /\.php/i
        ]
    }
};

// セキュリティ状態管理（LRU・TTL強化版）
const securityState = {
    blockedIPs: new LRUCache(1000, 60 * 60 * 1000), // 1000件、1時間TTL
    rateLimitCounts: new LRUCache(2000, 15 * 60 * 1000), // 2000件、15分TTL  
    ddosCounts: new LRUCache(1500, 60 * 1000), // 1500件、1分TTL
    bruteForceAttempts: new LRUCache(1000, 10 * 60 * 1000), // 1000件、10分TTL
    suspiciousActivities: new LRUCache(500, 24 * 60 * 60 * 1000), // 500件、24時間TTL
    attackLogs: new LRUCache(1000, 24 * 60 * 60 * 1000) // 1000件、24時間TTL（配列から変更）
};

// 定期クリーンアップ（5分ごと）
setInterval(() => {
    securityState.blockedIPs.cleanup();
    securityState.rateLimitCounts.cleanup();
    securityState.ddosCounts.cleanup();
    securityState.bruteForceAttempts.cleanup();
    securityState.suspiciousActivities.cleanup();
    securityState.attackLogs.cleanup();
}, 5 * 60 * 1000);



/**
 * PIIマスキング関数
 */
function maskSensitiveData(data) {
    if (typeof data === 'string') {
        // LINEユーザーIDマスキング
        data = data.replace(/U[a-f0-9]{32}/g, 'U****[MASKED]');
        // メールアドレスマスキング
        data = data.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '***@$2');
        // IPアドレス部分マスキング
        data = data.replace(/(\d+\.\d+\.\d+\.)\d+/g, '$1***');
        // 電話番号マスキング
        data = data.replace(/(\d{3})-?(\d{4})-?(\d{4})/g, '$1-****-****');
        // セッション・トークンマスキング
        data = data.replace(/[a-zA-Z0-9]{20,}/g, (match) => {
            return match.substring(0, 4) + '****[MASKED]';
        });
        // 長い文字列を制限
        if (data.length > 200) {
            data = data.substring(0, 200) + '...[TRUNCATED]';
        }
    } else if (typeof data === 'object' && data !== null) {
        const masked = {};
        for (const [key, value] of Object.entries(data)) {
            if (['url', 'userAgent', 'pattern', 'content', 'message', 'payload'].includes(key)) {
                masked[key] = maskSensitiveData(value);
            } else if (['ip', 'userId', 'email', 'phone'].includes(key)) {
                masked[key] = maskSensitiveData(value);
            } else {
                masked[key] = value;
            }
        }
        return masked;
    }
    return data;
}

/**
 * セキュリティログを記録（PIIマスキング強化版）
 */
function logSecurityEvent(type, details) {
    const timestamp = new Date().toISOString();
    
    // 機密情報をマスキング
    const maskedDetails = maskSensitiveData(details);
    
    const logEntry = {
        timestamp,
        type,
        details: maskedDetails,
        severity: getSeverityLevel(type)
    };
    
    // LRUキャッシュに保存（配列から変更）
    const logId = `${timestamp}-${type}-${Math.random().toString(36).substr(2, 9)}`;
    securityState.attackLogs.set(logId, logEntry);
    
    // ダイジェスト情報のみでログ出力（詳細は避ける）
    const logSummary = {
        type,
        severity: logEntry.severity,
        ip: maskedDetails.ip || 'unknown',
        timestamp
    };
    
    // ログファイルにも記録
    logger.warn('AdvancedSecuritySystem', `${type} detected`, logSummary);
}

/**
 * 攻撃タイプに基づいて重要度を判定
 */
function getSeverityLevel(attackType) {
    const severityLevels = {
        'DDoS_ATTACK': 'CRITICAL',
        'BRUTE_FORCE': 'HIGH',
        'RATE_LIMIT_VIOLATION': 'MEDIUM',
        'SUSPICIOUS_ACCESS': 'LOW',
        'SQL_INJECTION': 'HIGH',
        'XSS_ATTACK': 'MEDIUM',
        'COMMAND_INJECTION': 'HIGH',
        'PATH_TRAVERSAL': 'MEDIUM'
    };
    return severityLevels[attackType] || 'LOW';
}

/**
 * DDoS攻撃を検知（LRUキャッシュ対応版）
 */
function detectDDoS(ip) {
    const normalizedIP = normalizeIP(ip);
    const now = Date.now();
    
    let requests = securityState.ddosCounts.get(normalizedIP);
    if (!requests) {
        requests = [];
    }
    
    requests.push(now);
    
    // 古いリクエストを削除（ウィンドウ外）
    const windowStart = now - SECURITY_CONFIG.ddos.windowMs;
    const recentRequests = requests.filter(time => time > windowStart);
    
    // DoS対策：リクエスト配列が大きくなりすぎないよう制限
    if (recentRequests.length > 100) {
        recentRequests.splice(0, recentRequests.length - 100);
    }
    
    securityState.ddosCounts.set(normalizedIP, recentRequests);
    
    if (recentRequests.length >= SECURITY_CONFIG.ddos.threshold) {
        logSecurityEvent('DDoS_ATTACK', {
            ip: normalizedIP,
            requestCount: recentRequests.length,
            threshold: SECURITY_CONFIG.ddos.threshold
        });
        
        // IPをブロック
        securityState.blockedIPs.set(normalizedIP, {
            reason: 'DDoS_ATTACK',
            blockedUntil: now + SECURITY_CONFIG.ddos.blockDuration
        });
        
        return true;
    }
    
    return false;
}

/**
 * ブルートフォース攻撃を検知（LRUキャッシュ対応版）
 */
function detectBruteForce(ip, success = false) {
    const normalizedIP = normalizeIP(ip);
    const now = Date.now();
    
    let data = securityState.bruteForceAttempts.get(normalizedIP);
    if (!data) {
        data = {
            attempts: [],
            lastSuccess: null
        };
    }
    
    if (success) {
        data.lastSuccess = now;
        data.attempts = []; // 成功したらリセット
    } else {
        data.attempts.push(now);
        
        // 古い試行を削除
        const windowStart = now - SECURITY_CONFIG.bruteForce.windowMs;
        data.attempts = data.attempts.filter(time => time > windowStart);
        
        // DoS対策：試行配列が大きくなりすぎないよう制限
        if (data.attempts.length > 50) {
            data.attempts.splice(0, data.attempts.length - 50);
        }
        
        if (data.attempts.length >= SECURITY_CONFIG.bruteForce.maxAttempts) {
            logSecurityEvent('BRUTE_FORCE', {
                ip: normalizedIP,
                attempts: data.attempts.length,
                maxAttempts: SECURITY_CONFIG.bruteForce.maxAttempts
            });
            
            // IPをブロック
            securityState.blockedIPs.set(normalizedIP, {
                reason: 'BRUTE_FORCE',
                blockedUntil: now + SECURITY_CONFIG.bruteForce.blockDuration
            });
            
            return true;
        }
    }
    
    // データを更新
    securityState.bruteForceAttempts.set(normalizedIP, data);
    
    return false;
}

/**
 * レート制限違反を検知（LRUキャッシュ対応版）
 */
function detectRateLimitViolation(ip) {
    const normalizedIP = normalizeIP(ip);
    const now = Date.now();
    
    let data = securityState.rateLimitCounts.get(normalizedIP);
    if (!data) {
        data = {
            count: 0,
            resetTime: now + SECURITY_CONFIG.rateLimit.windowMs
        };
    }
    
    // リセット時間を過ぎていたらカウントをリセット
    if (now > data.resetTime) {
        data.count = 0;
        data.resetTime = now + SECURITY_CONFIG.rateLimit.windowMs;
    }
    
    data.count++;
    
    // データを更新
    securityState.rateLimitCounts.set(normalizedIP, data);
    
    if (data.count > SECURITY_CONFIG.rateLimit.maxRequests) {
        logSecurityEvent('RATE_LIMIT_VIOLATION', {
            ip: normalizedIP,
            count: data.count,
            maxRequests: SECURITY_CONFIG.rateLimit.maxRequests
        });
        
        // IPをブロック
        securityState.blockedIPs.set(normalizedIP, {
            reason: 'RATE_LIMIT_VIOLATION',
            blockedUntil: now + SECURITY_CONFIG.rateLimit.blockDuration
        });
        
        return true;
    }
    
    return false;
}

/**
 * URL正規化による難読化解除
 */
function normalizeUrl(url) {
    if (!url || typeof url !== 'string') return url;
    
    let normalized = url;
    
    try {
        // URLデコード（複数回）
        for (let i = 0; i < 3; i++) {
            const decoded = decodeURIComponent(normalized);
            if (decoded === normalized) break;
            normalized = decoded;
        }
    } catch (e) {
        // デコードエラーは無視
    }
    
    // 正規化：空白・改行・タブの統一
    normalized = normalized.replace(/\s+/g, ''); // 空白削除
    normalized = normalized.replace(/[\r\n\t]/g, ''); // 改行・タブ削除
    
    // 全角・半角の統一
    normalized = normalized.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => {
        return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
    });
    
    // 大小文字統一
    normalized = normalized.toLowerCase();
    
    return normalized;
}

/**
 * 不審なアクセスパターンを検知（正規化強化版）
 */
function detectSuspiciousAccess(req) {
    const ip = normalizeIP(req.ip);
    const originalUrl = req.originalUrl || req.url;
    const normalizedUrl = normalizeUrl(originalUrl);
    const userAgent = req.headers['user-agent'] || '';
    
    // 不審なパターンをチェック（正規化済みURLと元URLの両方）
    for (const pattern of SECURITY_CONFIG.anomaly.suspiciousPatterns) {
        if (pattern.test(normalizedUrl) || pattern.test(originalUrl)) {
            logSecurityEvent('SUSPICIOUS_ACCESS', {
                ip,
                url: originalUrl,
                normalizedUrl: normalizedUrl.substring(0, 100), // 長さ制限
                userAgent,
                pattern: pattern.source
            });
            return true;
        }
    }
    
    // 追加の疑わしいパターン（正規化対応）
    const additionalPatterns = [
        /\.\.[\\/]/, // パストラバーサル
        /<script/i, // XSS
        /union.*select/i, // SQLインジェクション
        /\bexec\b/i, // コマンドインジェクション
        /\beval\b/i, // コード実行
    ];
    
    for (const pattern of additionalPatterns) {
        if (pattern.test(normalizedUrl)) {
            logSecurityEvent('SUSPICIOUS_PATTERN', {
                ip,
                url: originalUrl,
                normalizedUrl: normalizedUrl.substring(0, 100),
                pattern: pattern.source
            });
            return true;
        }
    }
    
    // 不審なUser-Agent（より詳細な検知）
    const suspiciousUserAgents = [
        /bot/i,
        /crawler/i,
        /spider/i,
        /scanner/i,
        /nmap/i,
        /nikto/i,
        /sqlmap/i,
        /curl/i,
        /wget/i,
        /python/i,
        /perl/i,
        /ruby/i,
        /^$/  // 空のUser-Agent
    ];
    
    // User-Agentの正規化
    const normalizedUserAgent = userAgent.toLowerCase().replace(/\s+/g, '');
    
    for (const pattern of suspiciousUserAgents) {
        if (pattern.test(normalizedUserAgent) || pattern.test(userAgent)) {
            // ただし、正当なブラウザと思われるものは除外
            const legitimateIndicators = ['mozilla', 'webkit', 'chrome', 'safari', 'firefox', 'edge'];
            const hasLegitimateIndicator = legitimateIndicators.some(indicator => 
                userAgent.toLowerCase().includes(indicator));
            
            if (!hasLegitimateIndicator) {
                logSecurityEvent('SUSPICIOUS_USER_AGENT', {
                    ip,
                    userAgent,
                    pattern: pattern.source
                });
                return true;
            }
        }
    }
    
    return false;
}

/**
 * IPがブロックされているかチェック（LRUキャッシュ対応版）
 */
function isIPBlocked(ip) {
    const normalizedIP = normalizeIP(ip);
    const blockData = securityState.blockedIPs.get(normalizedIP);
    
    if (blockData && Date.now() < blockData.blockedUntil) {
        return {
            blocked: true,
            reason: blockData.reason,
            remainingTime: blockData.blockedUntil - Date.now()
        };
    }
    
    // ブロック期間が終了していたら削除
    if (blockData && Date.now() >= blockData.blockedUntil) {
        securityState.blockedIPs.delete(normalizedIP);
    }
    
    return { blocked: false };
}

/**
 * 包括的なセキュリティチェック
 */
function comprehensiveSecurityCheck(req) {
    const ip = req.ip;
    const normalizedIP = normalizeIP(ip);
    
    // 1. IPブロックチェック
    const blockStatus = isIPBlocked(ip);
    if (blockStatus.blocked) {
        return {
            allowed: false,
            reason: 'IP_BLOCKED',
            details: blockStatus
        };
    }
    
    // 2. DDoS攻撃検知
    if (detectDDoS(ip)) {
        return {
            allowed: false,
            reason: 'DDoS_ATTACK_DETECTED'
        };
    }
    
    // 3. レート制限違反検知
    if (detectRateLimitViolation(ip)) {
        return {
            allowed: false,
            reason: 'RATE_LIMIT_VIOLATION'
        };
    }
    
    // 4. 不審なアクセスパターン検知
    if (detectSuspiciousAccess(req)) {
        return {
            allowed: true, // 警告のみ、ブロックはしない
            warning: 'SUSPICIOUS_ACCESS_DETECTED'
        };
    }
    
    return { allowed: true };
}

/**
 * 簡易管理者認証
 */
function validateAdminAuth(authToken) {
    // 本番では適切なJWT認証などを実装
    const validToken = process.env.ADMIN_AUTH_TOKEN || 'secure_admin_token_2024';
    return authToken === validToken;
}

/**
 * セキュリティ統計を取得（認証必須・情報制限版）
 */
function getSecurityStats(authToken = null) {
    // 管理者認証チェック
    if (!validateAdminAuth(authToken)) {
        return {
            error: 'Unauthorized',
            message: 'Admin authentication required'
        };
    }
    
    const now = Date.now();
    
    // 攻撃ログからの統計（IPは含めない）
    const attackLogs = securityState.attackLogs.getAllEntries();
    const recentAttacks = Object.values(attackLogs).filter(log => 
        now - new Date(log.timestamp).getTime() < 24 * 60 * 60 * 1000
    );
    
    // 攻撃タイプ別の集計
    const attackTypes = {};
    recentAttacks.forEach(log => {
        attackTypes[log.type] = (attackTypes[log.type] || 0) + 1;
    });
    
    return {
        overview: {
            blockedIPs: securityState.blockedIPs.size(),
            totalRecentAttacks: recentAttacks.length,
            attackTypes: attackTypes
        },
        statistics: {
            ddosRequests: securityState.ddosCounts.size(),
            bruteForceAttempts: securityState.bruteForceAttempts.size(),
            rateLimitViolations: securityState.rateLimitCounts.size(),
            suspiciousActivities: securityState.suspiciousActivities.size()
        },
        systemHealth: {
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        }
        // 注意：個別のIPアドレスや詳細な攻撃内容は含めない
    };
}

/**
 * セキュリティミドルウェア
 */
function advancedSecurityMiddleware(req, res, next) {
    const securityCheck = comprehensiveSecurityCheck(req);
    
    if (!securityCheck.allowed) {
        logSecurityEvent('ACCESS_BLOCKED', {
            ip: req.ip,
            reason: securityCheck.reason,
            url: req.originalUrl,
            userAgent: req.headers['user-agent']
        });
        
        return res.status(403).json({
            error: 'Access denied',
            reason: securityCheck.reason,
            message: 'Your request has been blocked due to security concerns.'
        });
    }
    
    if (securityCheck.warning) {
        logSecurityEvent('SECURITY_WARNING', {
            ip: req.ip,
            warning: securityCheck.warning,
            url: req.originalUrl
        });
    }
    
    next();
}

module.exports = {
    advancedSecurityMiddleware,
    detectDDoS,
    detectBruteForce,
    detectRateLimitViolation,
    detectSuspiciousAccess,
    isIPBlocked,
    comprehensiveSecurityCheck,
    getSecurityStats,
    logSecurityEvent
}; 