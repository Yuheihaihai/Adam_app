const crypto = require('crypto');

/**
 * セキュリティ強化版機能実行監視システム
 * Lakera AI セキュリティガイドライン準拠
 */
class SecuredFunctionExecutionMonitor {
  constructor() {
    this.executionLog = new Map();
    this.functionRegistry = new Map();
    this.recentRequests = new Map();
    this.rateLimiter = new Map(); // レート制限
    this.encryptionKey = this.getOrCreateEncryptionKey();
    this.maxLogSize = 1000; // メモリDoS防止
    this.suspiciousPatterns = this.initializeSuspiciousPatterns();
    
    // 監視対象の機能を登録
    this.initializeFunctionRegistry();
    
    // セキュリティ監査ログ
    this.securityAuditLog = [];
  }

  /**
   * 暗号化キーの取得または生成
   */
  getOrCreateEncryptionKey() {
    // 環境変数から取得、なければ新規生成（本番では必ず環境変数設定）
    return process.env.FUNCTION_MONITOR_ENCRYPTION_KEY || 
           crypto.randomBytes(32).toString('hex');
  }

  /**
   * 悪意のあるパターンの初期化
   */
  initializeSuspiciousPatterns() {
    return [
      // プロンプトインジェクション検出パターン
      /ignore\s+previous\s+instructions/i,
      /system\s*:\s*you\s+are/i,
      /^(now\s+)?(you\s+are|act\s+as|pretend\s+to\s+be)/i,
      /jailbreak|bypass|override/i,
      /['"]\s*\+\s*['"]/,  // SQLインジェクション風
      /<script|javascript:|data:/i,  // XSS風
      /\$\{.*\}/,  // テンプレートインジェクション風
      // 機能監視システム特有の攻撃パターン
      /record.*function.*execution/i,
      /execute.*monitoring/i,
      /fake.*execution.*log/i
    ];
  }

  /**
   * 監視対象機能の登録
   */
  initializeFunctionRegistry() {
    this.functionRegistry.set('imageGeneration', {
      name: '画像生成',
      triggerPatterns: [
        '画像を生成', '画像を作成', '画像を作って', 'イメージを生成', 'イメージを作成',
        '図を生成', '絵を描いて', '絵を生成', 'イラストを作成', 'の画像', 'で生成して'
      ],
      executionIndicators: ['handleVisionExplanation', 'DALL-E', 'imageGenerator'],
      description: '画像生成機能：DALL-E 3による画像生成',
      riskLevel: 'medium' // セキュリティリスクレベル
    });

    this.functionRegistry.set('voiceProcessing', {
      name: '音声処理',
      triggerPatterns: ['音声', 'ボイス', '声', '話して', '読み上げ'],
      executionIndicators: ['handleAudio', 'OpenAI TTS', 'audioHandler'],
      description: '音声処理機能：音声認識・合成',
      riskLevel: 'high' // 音声データは機密性が高い
    });

    this.functionRegistry.set('careerAnalysis', {
      name: '適職診断',
      triggerPatterns: ['適職', 'キャリア', '仕事', '職業', '転職'],
      executionIndicators: ['generateCareerAnalysis', 'Google Gemini'],
      description: '適職診断機能：AI による詳細な職業適性分析',
      riskLevel: 'high' // 個人情報含む
    });

    this.functionRegistry.set('characteristicsAnalysis', {
      name: '特性分析',
      triggerPatterns: ['特性', '分析', '性格', '傾向', '特徴'],
      executionIndicators: ['enhancedCharacteristicsAnalyzer', 'getUserAnalysis'],
      description: '特性分析機能：会話履歴に基づく詳細な特性分析',
      riskLevel: 'critical' // 個人の詳細な分析データ
    });

    this.functionRegistry.set('serviceRecommendation', {
      name: 'サービス推薦',
      triggerPatterns: ['サービス', '支援', 'おすすめ', '紹介'],
      executionIndicators: ['serviceRecommender', 'calculateServiceMatch'],
      description: 'サービス推薦機能：発達障害支援サービスの推薦',
      riskLevel: 'medium'
    });
  }

  /**
   * セキュアなデータ暗号化
   */
  encryptData(data) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      console.error('[SecuredFunctionMonitor] 暗号化エラー:', error);
      throw new Error('データ暗号化に失敗しました');
    }
  }

  /**
   * セキュアなデータ復号化
   */
  decryptData(encryptedData) {
    try {
      const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
      
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('[SecuredFunctionMonitor] 復号化エラー:', error);
      throw new Error('データ復号化に失敗しました');
    }
  }

  /**
   * 入力の悪意のあるパターン検出
   */
  detectSuspiciousInput(userMessage) {
    const suspiciousFindings = [];
    
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(userMessage)) {
        suspiciousFindings.push({
          pattern: pattern.toString(),
          severity: 'high',
          description: 'プロンプトインジェクション疑いのパターンを検出'
        });
      }
    }

    // 異常な長さの検出
    if (userMessage.length > 5000) {
      suspiciousFindings.push({
        pattern: 'length_anomaly',
        severity: 'medium',
        description: '異常に長いメッセージを検出'
      });
    }

    // 特殊文字の過剰使用
    const specialCharCount = (userMessage.match(/[!@#$%^&*()_+={}\[\]:";'<>?,.\/\\|`~]/g) || []).length;
    if (specialCharCount > userMessage.length * 0.3) {
      suspiciousFindings.push({
        pattern: 'special_char_overuse',
        severity: 'medium',
        description: '特殊文字の過剰使用を検出'
      });
    }

    return suspiciousFindings;
  }

  /**
   * レート制限チェック
   */
  checkRateLimit(userId) {
    const hashedUserId = this.hashUserId(userId);
    const now = Date.now();
    const windowMs = 60 * 1000; // 1分
    const maxRequests = 10; // 1分間に10リクエスト

    if (!this.rateLimiter.has(hashedUserId)) {
      this.rateLimiter.set(hashedUserId, []);
    }

    const requests = this.rateLimiter.get(hashedUserId);
    
    // 古いリクエストを削除
    while (requests.length > 0 && now - requests[0] > windowMs) {
      requests.shift();
    }

    if (requests.length >= maxRequests) {
      this.logSecurityEvent('rate_limit_exceeded', {
        userId: hashedUserId,
        requestCount: requests.length,
        timeWindow: windowMs
      });
      return false;
    }

    requests.push(now);
    return true;
  }

  /**
   * セキュリティイベントのログ記録
   */
  logSecurityEvent(eventType, details) {
    const event = {
      timestamp: new Date().toISOString(),
      eventType,
      details,
      severity: details.severity || 'medium'
    };

    this.securityAuditLog.push(event);
    
    // ログサイズ制限（メモリDoS防止）
    if (this.securityAuditLog.length > 1000) {
      this.securityAuditLog.shift();
    }

    console.log(`[SecuredFunctionMonitor] セキュリティイベント: ${eventType}`, details);
  }

  /**
   * セキュアなユーザーリクエスト監視開始
   */
  startRequestMonitoring(userId, userMessage) {
    try {
      // レート制限チェック
      if (!this.checkRateLimit(userId)) {
        throw new Error('レート制限に達しました');
      }

      // 悪意のある入力の検出
      const suspiciousFindings = this.detectSuspiciousInput(userMessage);
      if (suspiciousFindings.length > 0) {
        this.logSecurityEvent('suspicious_input_detected', {
          userId: this.hashUserId(userId),
          findings: suspiciousFindings,
          messageLength: userMessage.length
        });
        
        // 高リスクの場合は監視を拒否
        const highRiskFindings = suspiciousFindings.filter(f => f.severity === 'high');
        if (highRiskFindings.length > 0) {
          throw new Error('セキュリティ脅威を検出したため、監視を開始できません');
        }
      }

      // メモリDoS防止
      if (this.executionLog.size >= this.maxLogSize) {
        this.forceCleanup();
      }

      const requestId = this.generateRequestId();
      const timestamp = Date.now();
      
      // 機能実行意図の検出
      const detectedFunctions = this.detectFunctionIntention(userMessage);
      
      // ユーザーメッセージの安全な保存（暗号化 + 最小化）
      const sanitizedMessage = this.sanitizeMessage(userMessage);
      const encryptedMessage = this.encryptData(sanitizedMessage);
      
      const monitoring = {
        requestId,
        userId: this.hashUserId(userId),
        timestamp,
        encryptedMessage, // 暗号化されたメッセージ
        detectedFunctions,
        executedFunctions: [],
        status: 'monitoring',
        completed: false,
        securityFindings: suspiciousFindings,
        riskLevel: this.calculateRiskLevel(detectedFunctions, suspiciousFindings)
      };

      this.executionLog.set(requestId, monitoring);
      this.recentRequests.set(this.hashUserId(userId), requestId);
      
      return requestId;
    } catch (error) {
      this.logSecurityEvent('monitoring_start_failed', {
        userId: this.hashUserId(userId),
        error: error.message
      });
      throw error;
    }
  }

  /**
   * メッセージのサニタイズ
   */
  sanitizeMessage(message) {
    // XSS防止
    const sanitized = message
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[SCRIPT_REMOVED]')
      .replace(/javascript:/gi, '[JAVASCRIPT_REMOVED]')
      .replace(/on\w+\s*=/gi, '[EVENT_HANDLER_REMOVED]');
    
    // 長さ制限（プライバシー保護）
    return sanitized.substring(0, 100); // 200文字から100文字に削減
  }

  /**
   * リスクレベルの計算
   */
  calculateRiskLevel(detectedFunctions, suspiciousFindings) {
    let riskScore = 0;
    
    // 検出された機能のリスクレベル
    for (const func of detectedFunctions) {
      const config = this.functionRegistry.get(func.functionKey);
      if (config) {
        switch (config.riskLevel) {
          case 'critical': riskScore += 4; break;
          case 'high': riskScore += 3; break;
          case 'medium': riskScore += 2; break;
          case 'low': riskScore += 1; break;
        }
      }
    }
    
    // 疑わしい入力のリスクスコア
    for (const finding of suspiciousFindings) {
      switch (finding.severity) {
        case 'high': riskScore += 3; break;
        case 'medium': riskScore += 2; break;
        case 'low': riskScore += 1; break;
      }
    }
    
    if (riskScore >= 8) return 'critical';
    if (riskScore >= 5) return 'high';
    if (riskScore >= 2) return 'medium';
    return 'low';
  }

  /**
   * セキュアな機能実行記録
   */
  recordFunctionExecution(requestId, functionName, details = {}) {
    const monitoring = this.executionLog.get(requestId);
    if (!monitoring) {
      this.logSecurityEvent('invalid_request_id', {
        requestId,
        functionName
      });
      return false;
    }

    // 実行記録の検証
    if (!this.validateFunctionExecution(functionName, details)) {
      this.logSecurityEvent('invalid_function_execution', {
        requestId,
        functionName,
        details
      });
      return false;
    }

    const execution = {
      functionName,
      timestamp: Date.now(),
      details: this.sanitizeExecutionDetails(details),
      success: details.success !== false,
      verified: true
    };

    monitoring.executedFunctions.push(execution);
    console.log(`[SecuredFunctionMonitor] 機能実行記録: ${functionName}`, {
      requestId,
      success: execution.success
    });
    
    return true;
  }

  /**
   * 機能実行の検証
   */
  validateFunctionExecution(functionName, details) {
    // 有効な機能名かチェック
    const validFunctions = [
      'handleVisionExplanation', 'imageGeneration_success', 'imageGeneration_failed',
      'handleAudio', 'voiceProcessing_success', 'voiceProcessing_failed',
      'generateCareerAnalysis', 'enhancedCharacteristicsAnalyzer',
      'serviceRecommender'
    ];
    
    if (!validFunctions.includes(functionName)) {
      return false;
    }
    
    // 詳細情報の検証
    if (details && typeof details !== 'object') {
      return false;
    }
    
    return true;
  }

  /**
   * 実行詳細のサニタイズ
   */
  sanitizeExecutionDetails(details) {
    const sanitized = {};
    
    for (const [key, value] of Object.entries(details)) {
      // 安全なキーのみ保持
      if (['success', 'trigger', 'reason', 'duration'].includes(key)) {
        if (typeof value === 'string') {
          sanitized[key] = value.substring(0, 100); // 長さ制限
        } else if (typeof value === 'boolean' || typeof value === 'number') {
          sanitized[key] = value;
        }
      }
    }
    
    return sanitized;
  }

  /**
   * セキュアなLLM説明文生成
   */
  generateLLMExplanation(gapAnalysis, originalMessage) {
    if (!gapAnalysis.hasGap) {
      return null;
    }

    // オリジナルメッセージのサニタイズ
    const sanitizedMessage = this.sanitizeMessage(originalMessage);
    
    const explanations = [];

    for (const gap of gapAnalysis.gaps) {
      switch (gap.functionKey) {
        case 'imageGeneration':
          explanations.push(
            `申し訳ありませんが、画像生成機能が作動しませんでした。` +
            `画像生成をご希望の場合は、「${this.getImageGenerationExample()}」のような ` +
            `明確な指示をお試しください。`
          );
          break;
          
        case 'voiceProcessing':
          explanations.push(
            `音声処理機能をご希望でしたが、現在の条件では実行できませんでした。` +
            `音声機能は特定の条件下でのみ利用可能です。`
          );
          break;
          
        default:
          explanations.push(
            `${gap.functionName}の実行が期待されましたが、セキュリティ上の理由で実行されませんでした。`
          );
      }
    }

    const explanation = explanations.join('\n\n');
    
    // 生成された説明文もサニタイズ
    return this.sanitizeMessage(explanation);
  }

  /**
   * 強制クリーンアップ（メモリDoS防止）
   */
  forceCleanup() {
    const now = Date.now();
    const entries = Array.from(this.executionLog.entries());
    
    // 古いエントリから削除
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toDelete = Math.ceil(entries.length * 0.3); // 30%削除
    for (let i = 0; i < toDelete; i++) {
      this.executionLog.delete(entries[i][0]);
    }
    
    this.logSecurityEvent('force_cleanup_executed', {
      deletedEntries: toDelete,
      remainingEntries: this.executionLog.size
    });
  }

  /**
   * セキュリティ統計の取得（認証付き）
   */
  getSecurityStatistics(authToken) {
    // 簡易認証チェック（本番では適切な認証システムを使用）
    if (!this.validateAdminAuth(authToken)) {
      throw new Error('不正なアクセス: 管理者権限が必要です');
    }
    
    const logs = Array.from(this.executionLog.values()).filter(log => log.completed);
    const securityEvents = this.securityAuditLog;
    
    return {
      totalRequests: logs.length,
      securityEvents: securityEvents.length,
      threatsByType: this.aggregateThreats(securityEvents),
      riskDistribution: this.aggregateRisks(logs),
      systemHealth: this.calculateSystemHealth(logs, securityEvents)
    };
  }

  /**
   * 簡易管理者認証
   */
  validateAdminAuth(authToken) {
    // 本番では適切なJWT認証などを実装
    const validToken = process.env.ADMIN_AUTH_TOKEN || 'secure_admin_token_2024';
    return authToken === validToken;
  }

  /**
   * ユーザーIDのセキュアハッシュ化
   */
  hashUserId(userId) {
    return crypto.createHmac('sha256', this.encryptionKey)
      .update(userId)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * セキュアなリクエストIDの生成
   */
  generateRequestId() {
    return crypto.randomBytes(16).toString('hex');
  }

  // その他のメソッドは元の実装を継承（セキュリティ強化版）
  detectFunctionIntention(userMessage) {
    const detected = [];
    const message = userMessage.toLowerCase();

    for (const [functionKey, config] of this.functionRegistry) {
      let matchCount = 0;
      const matchedPatterns = [];

      for (const pattern of config.triggerPatterns) {
        if (message.includes(pattern.toLowerCase())) {
          matchCount++;
          matchedPatterns.push(pattern);
        }
      }

      if (matchCount > 0) {
        const confidence = Math.min(matchCount / config.triggerPatterns.length, 1.0);
        detected.push({
          functionKey,
          functionName: config.name,
          confidence,
          matchedPatterns,
          description: config.description,
          riskLevel: config.riskLevel
        });
      }
    }

    return detected.sort((a, b) => b.confidence - a.confidence);
  }

  getImageGenerationExample() {
    const examples = [
      '○○の画像を生成してください',
      '○○のイラストを作成して',
      '○○について図解してください'
    ];
    return examples[Math.floor(Math.random() * examples.length)];
  }

  analyzeExecutionGap(monitoring) {
    // 元の実装と同様だが、セキュリティ要素を追加
    const detectedFunctions = monitoring.detectedFunctions;
    const executedFunctions = monitoring.executedFunctions.map(ex => ex.functionName);

    const gaps = [];
    
    for (const detected of detectedFunctions) {
      const wasExecuted = executedFunctions.some(executed => 
        this.isFunctionMatched(detected.functionKey, executed)
      );

      if (!wasExecuted) {
        gaps.push({
          functionKey: detected.functionKey,
          functionName: detected.functionName,
          confidence: detected.confidence,
          reason: this.determineGapReason(detected.functionKey, monitoring),
          securityImpact: this.assessSecurityImpact(detected)
        });
      }
    }

    return {
      hasGap: gaps.length > 0,
      gaps,
      summary: this.generateGapSummary(gaps),
      executionRate: detectedFunctions.length > 0 ? 
        (detectedFunctions.length - gaps.length) / detectedFunctions.length : 1,
      overallRisk: monitoring.riskLevel
    };
  }

  assessSecurityImpact(detectedFunction) {
    const config = this.functionRegistry.get(detectedFunction.functionKey);
    return {
      riskLevel: config?.riskLevel || 'unknown',
      dataAccess: this.getFunctionDataAccess(detectedFunction.functionKey),
      privacyImpact: this.getPrivacyImpact(detectedFunction.functionKey)
    };
  }

  getFunctionDataAccess(functionKey) {
    const dataAccessMap = {
      'imageGeneration': 'prompt_data',
      'voiceProcessing': 'audio_data',
      'careerAnalysis': 'personal_profile',
      'characteristicsAnalysis': 'conversation_history',
      'serviceRecommendation': 'preference_data'
    };
    return dataAccessMap[functionKey] || 'unknown';
  }

  getPrivacyImpact(functionKey) {
    const privacyMap = {
      'imageGeneration': 'low',
      'voiceProcessing': 'high',
      'careerAnalysis': 'high',
      'characteristicsAnalysis': 'critical',
      'serviceRecommendation': 'medium'
    };
    return privacyMap[functionKey] || 'unknown';
  }

  // 継承メソッド
  isFunctionMatched(functionKey, executedFunction) {
    const config = this.functionRegistry.get(functionKey);
    if (!config) return false;

    return config.executionIndicators.some(indicator => 
      executedFunction.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  determineGapReason(functionKey, monitoring) {
    const config = this.functionRegistry.get(functionKey);
    
    switch (functionKey) {
      case 'imageGeneration':
        return 'リクエストが画像生成の明確な指示パターンに一致しませんでした';
      case 'voiceProcessing':
        return '音声処理の実行条件が満たされませんでした';
      case 'careerAnalysis':
        return 'キャリア分析モードが適切にトリガーされませんでした';
      default:
        return `${config.name}の実行条件が満たされませんでした`;
    }
  }

  generateGapSummary(gaps) {
    if (gaps.length === 0) {
      return '全ての検出された機能が正常に実行されました';
    }

    const functionNames = gaps.map(gap => gap.functionName);
    return `以下の機能が期待されましたが実行されませんでした: ${functionNames.join('、')}`;
  }

  completeMonitoring(requestId) {
    const monitoring = this.executionLog.get(requestId);
    if (!monitoring) return null;

    monitoring.completed = true;
    monitoring.completedAt = Date.now();

    // ギャップ分析の実行
    const analysis = this.analyzeExecutionGap(monitoring);
    monitoring.gapAnalysis = analysis;

    console.log(`[SecuredFunctionMonitor] 監視完了:`, {
      detected: monitoring.detectedFunctions.length,
      executed: monitoring.executedFunctions.length,
      hasGap: analysis.hasGap,
      riskLevel: monitoring.riskLevel
    });

    return analysis;
  }

  aggregateThreats(securityEvents) {
    const threats = {};
    for (const event of securityEvents) {
      threats[event.eventType] = (threats[event.eventType] || 0) + 1;
    }
    return threats;
  }

  aggregateRisks(logs) {
    const risks = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const log of logs) {
      if (log.riskLevel) {
        risks[log.riskLevel]++;
      }
    }
    return risks;
  }

  calculateSystemHealth(logs, securityEvents) {
    const recentThreats = securityEvents.filter(e => 
      Date.now() - new Date(e.timestamp).getTime() < 60 * 60 * 1000 // 1時間以内
    ).length;
    
    if (recentThreats > 10) return 'Critical';
    if (recentThreats > 5) return 'Warning';
    return 'Good';
  }

  cleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24時間

    for (const [requestId, monitoring] of this.executionLog) {
      if (now - monitoring.timestamp > maxAge) {
        this.executionLog.delete(requestId);
      }
    }

    // 最近のリクエストマップもクリーンアップ
    for (const [userId, requestId] of this.recentRequests) {
      if (!this.executionLog.has(requestId)) {
        this.recentRequests.delete(userId);
      }
    }

    // セキュリティログのクリーンアップ
    const oldSecurityEvents = this.securityAuditLog.filter(event => 
      now - new Date(event.timestamp).getTime() > 7 * 24 * 60 * 60 * 1000 // 7日以内
    );
    this.securityAuditLog = this.securityAuditLog.filter(event => 
      now - new Date(event.timestamp).getTime() <= 7 * 24 * 60 * 60 * 1000
    );

    console.log(`[SecuredFunctionMonitor] セキュアクリーンアップ完了: ` +
      `${this.executionLog.size} 件のログ、${this.securityAuditLog.length} 件のセキュリティイベントを保持`);
  }
}

// シングルトンインスタンス
const securedFunctionExecutionMonitor = new SecuredFunctionExecutionMonitor();

// 定期クリーンアップ（6時間ごと）
setInterval(() => {
  securedFunctionExecutionMonitor.cleanup();
}, 6 * 60 * 60 * 1000);

module.exports = securedFunctionExecutionMonitor;