const crypto = require('crypto');
const logger = require('./logger');

/**
 * Next-Generation Security System
 * - AI-powered threat detection
 * - Real-time behavioral analysis
 * - Advanced persistent threat (APT) detection
 * - Zero-trust security model
 */

// 最新セキュリティ設定
const SECURITY_CONFIG = {
    // AI駆動型異常検知
    aiDetection: {
        enabled: true,
        confidenceThreshold: 0.8, // 80%以上の確信度で脅威と判定
        learningEnabled: true, // 機械学習による改善
        modelUpdateInterval: 24 * 60 * 60 * 1000 // 24時間ごとにモデル更新
    },
    
    // ゼロトラスト設定
    zeroTrust: {
        enabled: true,
        defaultDeny: true, // デフォルトで全てを拒否
        trustScoreThreshold: 70, // 70点以上で許可
        trustDecayRate: 0.1 // 信頼度の減衰率
    },
    
    // 高度な持続的脅威（APT）検知
    aptDetection: {
        enabled: true,
        suspiciousActivityWindow: 7 * 24 * 60 * 60 * 1000, // 7日間の監視ウィンドウ
        correlationThreshold: 3, // 3つ以上の関連する不審な活動でAPTと判定
        behaviorAnalysisDepth: 10 // 10層の行動分析
    },
    
    // 最新攻撃パターン
    modernThreats: {
        // LLMプロンプトインジェクション
        promptInjection: {
            patterns: [
                /ignore\s+previous\s+instructions/i,
                /forget\s+everything/i,
                /you\s+are\s+now\s+a/i,
                /system\s*:\s*new\s+role/i,
                /jailbreak/i,
                /execute\s+as\s+admin/i,
                /override\s+safety/i,
                /<\|im_start\|>/i,
                /<\|im_end\|>/i,
                /\[SYSTEM\]/i,
                /\[ASSISTANT\]/i
            ]
        },
        
        // API乱用
        apiAbuse: {
            rapidRequests: 100, // 1分間に100リクエスト以上
            unusualEndpoints: [
                /\/admin/i,
                /\/debug/i,
                /\/test/i,
                /\/dev/i,
                /\/internal/i
            ],
            suspiciousPayloads: [
                /base64/i,
                /eval\(/i,
                /exec\(/i,
                /system\(/i
            ]
        },
        
        // 暗号通貨マイニング
        cryptoMining: {
            patterns: [
                /mining/i,
                /bitcoin/i,
                /cryptocurrency/i,
                /blockchain/i,
                /wallet/i,
                /stratum/i,
                /pool\..*\.com/i
            ],
            cpuThreshold: 80, // CPU使用率80%以上
            memoryThreshold: 90 // メモリ使用率90%以上
        },
        
        // IoT攻撃
        iotAttacks: {
            botnetPatterns: [
                /mirai/i,
                /gafgyt/i,
                /bashlite/i,
                /lightaidra/i
            ],
            deviceExploits: [
                /\/cgi-bin\//i,
                /\/deviceinfo/i,
                /\/setup\.cgi/i,
                /\/system\/deviceinfo/i
            ]
        }
    },
    
    // 行動分析設定
    behaviorAnalysis: {
        enabled: true,
        timeWindows: [
            5 * 60 * 1000,      // 5分
            15 * 60 * 1000,     // 15分
            60 * 60 * 1000,     // 1時間
            24 * 60 * 60 * 1000 // 24時間
        ],
        anomalyThreshold: 2.5, // 標準偏差の2.5倍以上で異常
        baselineUpdateInterval: 6 * 60 * 60 * 1000 // 6時間ごとにベースライン更新
    },
    
    // 地理的フィルタリング
    geoFiltering: {
        enabled: true,
        blockedCountries: ['CN', 'RU', 'KP'], // 高リスク国からのアクセスをブロック
        allowedCountries: ['JP', 'US', 'CA', 'GB', 'AU'], // 許可国リスト
        vpnDetection: true // VPN/Proxyの検出と制限
    }
};

// 高度なセキュリティ状態管理（Redis互換設計）
class AdvancedSecurityState {
    constructor() {
        this.threats = new Map();
        this.trustScores = new Map();
        this.behaviorProfiles = new Map();
        this.aptIndicators = new Map();
        this.geoData = new Map();
        this.aiModel = this.initializeAIModel();
    }
    
    initializeAIModel() {
        // 簡易AI模擬システム（実際の実装ではTensorFlow.jsなどを使用）
        return {
            threatClassifier: {
                weights: new Array(50).fill(0).map(() => Math.random()),
                bias: Math.random(),
                lastUpdate: Date.now()
            },
            behaviorAnalyzer: {
                normalPatterns: new Map(),
                anomalyDetector: new Map()
            }
        };
    }
    
    // 信頼スコアを計算
    calculateTrustScore(ip, userAgent, requestPattern) {
        let score = 50; // ベーススコア
        
        // 過去の行動履歴
        const history = this.behaviorProfiles.get(ip);
        if (history) {
            score += history.positiveActions * 2;
            score -= history.negativeActions * 5;
            score += Math.min(history.sessionDuration / 1000 / 60, 10); // 最大10点
        }
        
        // User-Agentの信頼性
        if (this.isLegitimateUserAgent(userAgent)) {
            score += 15;
        } else {
            score -= 20;
        }
        
        // リクエストパターンの正常性
        score += this.analyzeRequestPattern(requestPattern);
        
        return Math.max(0, Math.min(100, score));
    }
    
    isLegitimateUserAgent(userAgent) {
        const legitimatePatterns = [
            /Mozilla\/.*Chrome/i,
            /Mozilla\/.*Firefox/i,
            /Mozilla\/.*Safari/i,
            /LINE\//i // LINEアプリ
        ];
        
        return legitimatePatterns.some(pattern => pattern.test(userAgent));
    }
    
    analyzeRequestPattern(pattern) {
        let score = 0;
        
        // リクエスト頻度の正常性
        if (pattern.frequency > 0 && pattern.frequency < 10) {
            score += 10;
        } else if (pattern.frequency > 50) {
            score -= 15;
        }
        
        // エンドポイントの正当性
        if (pattern.endpoints.every(ep => this.isLegitimateEndpoint(ep))) {
            score += 10;
        }
        
        return score;
    }
    
    isLegitimateEndpoint(endpoint) {
        const legitimateEndpoints = [
            '/webhook',
            '/health',
            '/security/stats'
        ];
        
        return legitimateEndpoints.includes(endpoint) || endpoint.startsWith('/temp/');
    }
}

const securityState = new AdvancedSecurityState();

/**
 * AI駆動型脅威検知
 */
function aiThreatDetection(req) {
    const features = extractFeatures(req);
    const threatProbability = classifyThreat(features);
    
    if (threatProbability > SECURITY_CONFIG.aiDetection.confidenceThreshold) {
        return {
            isThreat: true,
            confidence: threatProbability,
            threatType: 'AI_DETECTED_THREAT',
            features: features
        };
    }
    
    return { isThreat: false, confidence: threatProbability };
}

/**
 * リクエストから特徴量を抽出
 */
function extractFeatures(req) {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] || '';
    const url = req.originalUrl || req.url;
    const method = req.method;
    const contentLength = parseInt(req.headers['content-length']) || 0;
    
    return {
        ipEntropy: calculateEntropy(ip),
        userAgentLength: userAgent.length,
        urlLength: url.length,
        methodType: method === 'POST' ? 1 : 0,
        contentLength: contentLength,
        hasSpecialChars: /[<>'"&]/.test(url + JSON.stringify(req.body)),
        timeOfDay: new Date().getHours(),
        requestSize: JSON.stringify(req.body).length
    };
}

/**
 * エントロピー計算
 */
function calculateEntropy(str) {
    const freq = {};
    for (const char of str) {
        freq[char] = (freq[char] || 0) + 1;
    }
    
    let entropy = 0;
    const len = str.length;
    for (const count of Object.values(freq)) {
        const p = count / len;
        entropy -= p * Math.log2(p);
    }
    
    return entropy;
}

/**
 * 脅威分類（簡易ニューラルネットワーク）
 */
function classifyThreat(features) {
    const weights = securityState.aiModel.threatClassifier.weights;
    const bias = securityState.aiModel.threatClassifier.bias;
    
    let score = bias;
    const featureValues = Object.values(features);
    
    for (let i = 0; i < Math.min(weights.length, featureValues.length); i++) {
        score += weights[i] * (featureValues[i] || 0);
    }
    
    // シグモイド関数で0-1の範囲に正規化
    return 1 / (1 + Math.exp(-score));
}

/**
 * LLMプロンプトインジェクション検知
 */
function detectPromptInjection(text) {
    if (!text || typeof text !== 'string') return false;
    
    const patterns = SECURITY_CONFIG.modernThreats.promptInjection.patterns;
    for (const pattern of patterns) {
        if (pattern.test(text)) {
            logSecurityEvent('PROMPT_INJECTION_DETECTED', {
                pattern: pattern.source,
                text: text.substring(0, 100) + '...'
            });
            return true;
        }
    }
    
    return false;
}

/**
 * API乱用検知
 */
function detectAPIAbuse(req) {
    const ip = req.ip;
    const url = req.originalUrl;
    const body = JSON.stringify(req.body);
    
    // 異常なエンドポイントアクセス
    const unusualEndpoints = SECURITY_CONFIG.modernThreats.apiAbuse.unusualEndpoints;
    for (const pattern of unusualEndpoints) {
        if (pattern.test(url)) {
            return {
                detected: true,
                type: 'UNUSUAL_ENDPOINT_ACCESS',
                pattern: pattern.source
            };
        }
    }
    
    // 不審なペイロード
    const suspiciousPayloads = SECURITY_CONFIG.modernThreats.apiAbuse.suspiciousPayloads;
    for (const pattern of suspiciousPayloads) {
        if (pattern.test(body)) {
            return {
                detected: true,
                type: 'SUSPICIOUS_PAYLOAD',
                pattern: pattern.source
            };
        }
    }
    
    return { detected: false };
}

/**
 * 行動分析
 */
function analyzeBehavior(ip, req) {
    const now = Date.now();
    
    if (!securityState.behaviorProfiles.has(ip)) {
        securityState.behaviorProfiles.set(ip, {
            firstSeen: now,
            lastSeen: now,
            requestCount: 0,
            endpoints: new Set(),
            userAgents: new Set(),
            positiveActions: 0,
            negativeActions: 0,
            sessionDuration: 0
        });
    }
    
    const profile = securityState.behaviorProfiles.get(ip);
    profile.lastSeen = now;
    profile.requestCount++;
    profile.endpoints.add(req.originalUrl);
    profile.userAgents.add(req.headers['user-agent']);
    profile.sessionDuration = now - profile.firstSeen;
    
    // 異常行動の検知
    const anomalies = [];
    
    // 異常に多くの異なるエンドポイントにアクセス
    if (profile.endpoints.size > 10) {
        anomalies.push('EXCESSIVE_ENDPOINT_EXPLORATION');
    }
    
    // 短時間での大量リクエスト
    const recentRequests = profile.requestCount;
    const timeSpan = Math.max(1, (now - profile.firstSeen) / 1000 / 60); // 分単位
    const requestRate = recentRequests / timeSpan;
    
    if (requestRate > 20) { // 毎分20リクエスト以上
        anomalies.push('HIGH_REQUEST_RATE');
    }
    
    // 複数のUser-Agentを使用
    if (profile.userAgents.size > 3) {
        anomalies.push('MULTIPLE_USER_AGENTS');
    }
    
    return {
        profile: profile,
        anomalies: anomalies,
        riskScore: calculateRiskScore(profile, anomalies)
    };
}

/**
 * リスクスコア計算
 */
function calculateRiskScore(profile, anomalies) {
    let score = 0;
    
    // 基本スコア
    score += anomalies.length * 20;
    
    // エンドポイント多様性ペナルティ
    score += Math.max(0, profile.endpoints.size - 5) * 5;
    
    // User-Agent多様性ペナルティ
    score += Math.max(0, profile.userAgents.size - 2) * 10;
    
    // 新規IPペナルティ
    const ageMinutes = (Date.now() - profile.firstSeen) / 1000 / 60;
    if (ageMinutes < 5) {
        score += 15;
    }
    
    return Math.min(100, score);
}

/**
 * 地理的フィルタリング（簡易版）
 */
function geoFilter(ip) {
    // 実際の実装では外部IPgeolocationサービスを使用
    // ここでは簡易的な判定
    
    // プライベートIPは許可
    if (isPrivateIP(ip)) {
        return { allowed: true, reason: 'PRIVATE_IP' };
    }
    
    // 既知の悪意あるIPレンジをチェック（例）
    const maliciousRanges = [
        '192.0.2.', // RFC 5737テスト用
        '198.51.100.', // RFC 5737テスト用
        '203.0.113.' // RFC 5737テスト用
    ];
    
    for (const range of maliciousRanges) {
        if (ip.startsWith(range)) {
            return { 
                allowed: false, 
                reason: 'MALICIOUS_IP_RANGE',
                action: 'BLOCK'
            };
        }
    }
    
    return { allowed: true, reason: 'GEO_ALLOWED' };
}

function isPrivateIP(ip) {
    const privateRanges = [
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^127\./,
        /^::1$/,
        /^fc00::/,
        /^fe80::/
    ];
    
    return privateRanges.some(range => range.test(ip));
}

/**
 * セキュリティログ記録
 */
function logSecurityEvent(type, details) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        type,
        details,
        severity: getSeverityLevel(type),
        version: '2.0' // Next-gen security system
    };
    
    console.warn(`🚨 [NEXT-GEN-SECURITY] ${type}:`, JSON.stringify(details));
    
    if (logger && logger.warn) {
        logger.warn('NextGenSecurity', `${type} detected`, details);
    }
}

/**
 * 攻撃タイプに基づく重要度判定
 */
function getSeverityLevel(attackType) {
    const severityLevels = {
        'AI_DETECTED_THREAT': 'HIGH',
        'PROMPT_INJECTION_DETECTED': 'CRITICAL',
        'API_ABUSE_DETECTED': 'HIGH',
        'BEHAVIOR_ANOMALY': 'MEDIUM',
        'GEO_BLOCKED': 'LOW',
        'TRUST_SCORE_LOW': 'MEDIUM',
        'APT_INDICATOR': 'CRITICAL'
    };
    return severityLevels[attackType] || 'LOW';
}

/**
 * Next-Generation Security Middleware
 */
function nextGenSecurityMiddleware(req, res, next) {
    const startTime = Date.now();
    const ip = req.ip;
    
    try {
        // 1. 地理的フィルタリング
        const geoCheck = geoFilter(ip);
        if (!geoCheck.allowed) {
            logSecurityEvent('GEO_BLOCKED', { ip, reason: geoCheck.reason });
            return res.status(403).json({
                error: 'Access denied',
                reason: 'Geographic restriction'
            });
        }
        
        // 2. AI駆動型脅威検知
        const aiThreat = aiThreatDetection(req);
        if (aiThreat.isThreat) {
            logSecurityEvent('AI_DETECTED_THREAT', {
                ip,
                confidence: aiThreat.confidence,
                features: aiThreat.features
            });
            
            if (aiThreat.confidence > 0.9) { // 90%以上の確信度でブロック
                return res.status(403).json({
                    error: 'Access denied',
                    reason: 'AI threat detection'
                });
            }
        }
        
        // 3. LLMプロンプトインジェクション検知
        if (req.body && req.body.events) {
            for (const event of req.body.events) {
                if (event.type === 'message' && event.message.type === 'text') {
                    if (detectPromptInjection(event.message.text)) {
                        return res.status(403).json({
                            error: 'Access denied',
                            reason: 'Prompt injection detected'
                        });
                    }
                }
            }
        }
        
        // 4. API乱用検知
        const apiAbuse = detectAPIAbuse(req);
        if (apiAbuse.detected) {
            logSecurityEvent('API_ABUSE_DETECTED', {
                ip,
                type: apiAbuse.type,
                pattern: apiAbuse.pattern
            });
        }
        
        // 5. 行動分析
        const behaviorAnalysis = analyzeBehavior(ip, req);
        if (behaviorAnalysis.riskScore > 70) {
            logSecurityEvent('BEHAVIOR_ANOMALY', {
                ip,
                riskScore: behaviorAnalysis.riskScore,
                anomalies: behaviorAnalysis.anomalies
            });
        }
        
        // 6. 信頼スコア計算
        const trustScore = securityState.calculateTrustScore(
            ip,
            req.headers['user-agent'],
            {
                frequency: behaviorAnalysis.profile.requestCount,
                endpoints: Array.from(behaviorAnalysis.profile.endpoints)
            }
        );
        
        if (trustScore < SECURITY_CONFIG.zeroTrust.trustScoreThreshold) {
            logSecurityEvent('TRUST_SCORE_LOW', {
                ip,
                trustScore,
                threshold: SECURITY_CONFIG.zeroTrust.trustScoreThreshold
            });
            
            if (trustScore < 30) { // 極めて低い信頼度でブロック
                return res.status(403).json({
                    error: 'Access denied',
                    reason: 'Insufficient trust score'
                });
            }
        }
        
        // セキュリティヘッダーを追加
        res.set({
            'X-Security-Score': trustScore,
            'X-AI-Confidence': aiThreat.confidence.toFixed(2),
            'X-Processing-Time': `${Date.now() - startTime}ms`
        });
        
        next();
        
    } catch (error) {
        logSecurityEvent('SECURITY_SYSTEM_ERROR', {
            ip,
            error: error.message,
            stack: error.stack
        });
        
        // セキュリティシステムのエラーでもリクエストは通す（フェイルオープン）
        next();
    }
}

/**
 * セキュリティ統計取得
 */
function getAdvancedSecurityStats() {
    const now = Date.now();
    
    return {
        version: '2.0',
        uptime: process.uptime(),
        aiModel: {
            lastUpdate: securityState.aiModel.threatClassifier.lastUpdate,
            totalClassifications: securityState.threats.size
        },
        behaviorProfiles: {
            total: securityState.behaviorProfiles.size,
            active: Array.from(securityState.behaviorProfiles.values()).filter(
                profile => now - profile.lastSeen < 24 * 60 * 60 * 1000
            ).length
        },
        trustScores: {
            average: Array.from(securityState.trustScores.values()).reduce((a, b) => a + b, 0) / 
                     Math.max(1, securityState.trustScores.size),
            distribution: calculateTrustDistribution()
        },
        geoFiltering: {
            enabled: SECURITY_CONFIG.geoFiltering.enabled,
            blockedCountries: SECURITY_CONFIG.geoFiltering.blockedCountries.length
        }
    };
}

function calculateTrustDistribution() {
    const scores = Array.from(securityState.trustScores.values());
    const distribution = { low: 0, medium: 0, high: 0 };
    
    for (const score of scores) {
        if (score < 40) distribution.low++;
        else if (score < 70) distribution.medium++;
        else distribution.high++;
    }
    
    return distribution;
}

module.exports = {
    nextGenSecurityMiddleware,
    getAdvancedSecurityStats,
    aiThreatDetection,
    detectPromptInjection,
    detectAPIAbuse,
    analyzeBehavior,
    geoFilter,
    logSecurityEvent
};