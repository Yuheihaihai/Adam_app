const crypto = require('crypto');
const logger = require('./logger');

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

// セキュリティ状態管理
const securityState = {
    blockedIPs: new Map(), // ブロックされたIP
    rateLimitCounts: new Map(), // レート制限カウンター
    ddosCounts: new Map(), // DDoSカウンター
    bruteForceAttempts: new Map(), // ブルートフォース試行回数
    suspiciousActivities: new Map(), // 不審な活動
    attackLogs: [] // 攻撃ログ
};

/**
 * IPアドレスを正規化
 */
function normalizeIP(ip) {
    if (ip.includes(':')) {
        return ip.split(':')[0]; // IPv6の場合は最初の部分のみ
    }
    return ip;
}

/**
 * セキュリティログを記録
 */
function logSecurityEvent(type, details) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        type,
        details,
        severity: getSeverityLevel(type)
    };
    
    securityState.attackLogs.push(logEntry);
    
    // ログファイルにも記録
    logger.warn('SecuritySystem', `${type} detected`, details);
    
    // ログが1000件を超えたら古いものを削除
    if (securityState.attackLogs.length > 1000) {
        securityState.attackLogs = securityState.attackLogs.slice(-1000);
    }
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
 * DDoS攻撃を検知
 */
function detectDDoS(ip) {
    const normalizedIP = normalizeIP(ip);
    const now = Date.now();
    
    if (!securityState.ddosCounts.has(normalizedIP)) {
        securityState.ddosCounts.set(normalizedIP, []);
    }
    
    const requests = securityState.ddosCounts.get(normalizedIP);
    requests.push(now);
    
    // 古いリクエストを削除（ウィンドウ外）
    const windowStart = now - SECURITY_CONFIG.ddos.windowMs;
    const recentRequests = requests.filter(time => time > windowStart);
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
 * ブルートフォース攻撃を検知
 */
function detectBruteForce(ip, success = false) {
    const normalizedIP = normalizeIP(ip);
    const now = Date.now();
    
    if (!securityState.bruteForceAttempts.has(normalizedIP)) {
        securityState.bruteForceAttempts.set(normalizedIP, {
            attempts: [],
            lastSuccess: null
        });
    }
    
    const data = securityState.bruteForceAttempts.get(normalizedIP);
    
    if (success) {
        data.lastSuccess = now;
        data.attempts = []; // 成功したらリセット
    } else {
        data.attempts.push(now);
        
        // 古い試行を削除
        const windowStart = now - SECURITY_CONFIG.bruteForce.windowMs;
        data.attempts = data.attempts.filter(time => time > windowStart);
        
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
    
    return false;
}

/**
 * レート制限違反を検知
 */
function detectRateLimitViolation(ip) {
    const normalizedIP = normalizeIP(ip);
    const now = Date.now();
    
    if (!securityState.rateLimitCounts.has(normalizedIP)) {
        securityState.rateLimitCounts.set(normalizedIP, {
            count: 0,
            resetTime: now + SECURITY_CONFIG.rateLimit.windowMs
        });
    }
    
    const data = securityState.rateLimitCounts.get(normalizedIP);
    
    // リセット時間を過ぎていたらカウントをリセット
    if (now > data.resetTime) {
        data.count = 0;
        data.resetTime = now + SECURITY_CONFIG.rateLimit.windowMs;
    }
    
    data.count++;
    
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
 * 不審なアクセスパターンを検知
 */
function detectSuspiciousAccess(req) {
    const ip = normalizeIP(req.ip);
    const url = req.originalUrl || req.url;
    const userAgent = req.headers['user-agent'] || '';
    
    // 不審なパターンをチェック
    for (const pattern of SECURITY_CONFIG.anomaly.suspiciousPatterns) {
        if (pattern.test(url)) {
            logSecurityEvent('SUSPICIOUS_ACCESS', {
                ip,
                url,
                userAgent,
                pattern: pattern.source
            });
            return true;
        }
    }
    
    // 不審なUser-Agent
    const suspiciousUserAgents = [
        /bot/i,
        /crawler/i,
        /spider/i,
        /scanner/i,
        /nmap/i,
        /nikto/i,
        /sqlmap/i
    ];
    
    for (const pattern of suspiciousUserAgents) {
        if (pattern.test(userAgent)) {
            logSecurityEvent('SUSPICIOUS_USER_AGENT', {
                ip,
                userAgent,
                pattern: pattern.source
            });
            return true;
        }
    }
    
    return false;
}

/**
 * IPがブロックされているかチェック
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
 * セキュリティ統計を取得
 */
function getSecurityStats() {
    const now = Date.now();
    
    return {
        blockedIPs: securityState.blockedIPs.size,
        recentAttacks: securityState.attackLogs.filter(log => 
            now - new Date(log.timestamp).getTime() < 24 * 60 * 60 * 1000
        ).length,
        ddosCounts: Array.from(securityState.ddosCounts.entries()).map(([ip, requests]) => ({
            ip,
            count: requests.length
        })),
        bruteForceAttempts: Array.from(securityState.bruteForceAttempts.entries()).map(([ip, data]) => ({
            ip,
            attempts: data.attempts.length,
            lastSuccess: data.lastSuccess
        }))
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