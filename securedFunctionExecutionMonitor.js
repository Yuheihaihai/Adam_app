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
   * 暗号化キーの取得（必須チェック強化版）
   */
  getOrCreateEncryptionKey() {
    const envKey = process.env.FUNCTION_MONITOR_ENCRYPTION_KEY;
    
    // 本番環境では必須チェック
    if (!envKey) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('FUNCTION_MONITOR_ENCRYPTION_KEY is required in production environment');
      }
      console.warn('[SecuredFunctionMonitor] WARNING: Using temporary encryption key. Set FUNCTION_MONITOR_ENCRYPTION_KEY in production!');
      return crypto.randomBytes(32).toString('hex');
    }
    
    // 鍵の長さチェック（最低32バイト）
    if (envKey.length < 64) { // hex文字列なので32バイト = 64文字
      throw new Error('FUNCTION_MONITOR_ENCRYPTION_KEY must be at least 32 bytes (64 hex characters)');
    }
    
    return envKey;
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
   * セキュアなデータ暗号化（AES-256-GCM正式実装）
   */
  encryptData(data) {
    try {
      // 32バイトの鍵をバイナリに変換
      const key = Buffer.from(this.encryptionKey, 'hex');
      
      // 16バイトのランダムIV生成
      const iv = crypto.randomBytes(16);
      
      // AES-256-GCMで暗号化
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      
      const dataString = JSON.stringify(data);
      let encrypted = cipher.update(dataString, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // 認証タグを取得
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: 'aes-256-gcm'
      };
    } catch (error) {
      console.error('[SecuredFunctionMonitor] 暗号化エラー:', error.message);
      throw new Error('データ暗号化に失敗しました');
    }
  }

  /**
   * セキュアなデータ復号化（AES-256-GCM正式実装）
   */
  decryptData(encryptedData) {
    try {
      // 必要なフィールドの存在チェック
      if (!encryptedData || !encryptedData.encrypted || !encryptedData.iv || !encryptedData.authTag) {
        throw new Error('暗号化データの形式が不正です');
      }
      
      // 32バイトの鍵をバイナリに変換
      const key = Buffer.from(this.encryptionKey, 'hex');
      
      // IVと認証タグをバイナリに変換
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const authTag = Buffer.from(encryptedData.authTag, 'hex');
      
      // AES-256-GCMで復号化
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('[SecuredFunctionMonitor] 復号化エラー:', error.message);
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
   * レート制限チェック（複合化・DoS対策強化版）
   */
  checkRateLimit(userId, clientIP = null) {
    const hashedUserId = this.hashUserId(userId);
    const now = Date.now();
    
    // 複数の制限レベル
    const limits = {
      perUser: { windowMs: 60 * 1000, maxRequests: 10 }, // ユーザー単位: 1分間に10リクエスト
      perIP: { windowMs: 60 * 1000, maxRequests: 20 },   // IP単位: 1分間に20リクエスト
      global: { windowMs: 60 * 1000, maxRequests: 100 }  // グローバル: 1分間に100リクエスト
    };
    
    // ユーザー単位制限
    if (!this.rateLimiter.has(hashedUserId)) {
      this.rateLimiter.set(hashedUserId, []);
    }
    
    const userRequests = this.rateLimiter.get(hashedUserId);
    
    // 古いリクエストを削除
    while (userRequests.length > 0 && now - userRequests[0] > limits.perUser.windowMs) {
      userRequests.shift();
    }
    
    // DoS対策：配列サイズ制限
    if (userRequests.length > 100) {
      userRequests.splice(0, userRequests.length - 50); // 半分に削減
    }
    
    if (userRequests.length >= limits.perUser.maxRequests) {
      this.logSecurityEvent('rate_limit_exceeded', {
        userId: hashedUserId,
        limitType: 'per_user',
        requestCount: userRequests.length,
        timeWindow: limits.perUser.windowMs
      });
      return false;
    }
    
    // IP単位制限（提供されている場合）
    if (clientIP) {
      const hashedIP = this.hashUserId(clientIP); // 同じハッシュ関数を使用
      
      if (!this.rateLimiter.has(`ip_${hashedIP}`)) {
        this.rateLimiter.set(`ip_${hashedIP}`, []);
      }
      
      const ipRequests = this.rateLimiter.get(`ip_${hashedIP}`);
      
      // 古いリクエストを削除
      while (ipRequests.length > 0 && now - ipRequests[0] > limits.perIP.windowMs) {
        ipRequests.shift();
      }
      
      // DoS対策：配列サイズ制限
      if (ipRequests.length > 100) {
        ipRequests.splice(0, ipRequests.length - 50);
      }
      
      if (ipRequests.length >= limits.perIP.maxRequests) {
        this.logSecurityEvent('rate_limit_exceeded', {
          clientIP: hashedIP,
          limitType: 'per_ip',
          requestCount: ipRequests.length,
          timeWindow: limits.perIP.windowMs
        });
        return false;
      }
      
      ipRequests.push(now);
    }
    
    // Map肥大化防止（定期クリーンアップ）
    if (Math.random() < 0.01) { // 1%の確率で実行
      this.cleanupRateLimiter();
    }
    
    userRequests.push(now);
    return true;
  }
  
  /**
   * レートリミッターのクリーンアップ（メモリDoS防止）
   */
  cleanupRateLimiter() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5分より古いエントリを削除
    
    for (const [key, requests] of this.rateLimiter.entries()) {
      if (requests.length === 0 || now - requests[requests.length - 1] > maxAge) {
        this.rateLimiter.delete(key);
      }
    }
    
    // 最大サイズ制限
    if (this.rateLimiter.size > 5000) {
      const entries = Array.from(this.rateLimiter.entries());
      // 古いものから削除
      entries.sort((a, b) => (b[1][b[1].length - 1] || 0) - (a[1][a[1].length - 1] || 0));
      
      for (let i = 2500; i < entries.length; i++) {
        this.rateLimiter.delete(entries[i][0]);
      }
    }
  }

  /**
   * PIIマスキング関数
   */
  maskSensitiveData(data) {
    if (typeof data === 'string') {
      // LINEユーザーIDマスキング
      data = data.replace(/U[a-f0-9]{32}/g, 'U****[MASKED]');
      // メールアドレスマスキング
      data = data.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '***@$2');
      // 電話番号マスキング
      data = data.replace(/(\d{3})-?(\d{4})-?(\d{4})/g, '$1-****-****');
      // APIキー・トークンマスキング
      data = data.replace(/[a-zA-Z0-9]{20,}/g, (match) => {
        if (match.length > 8) {
          return match.substring(0, 4) + '****[MASKED]';
        }
        return match;
      });
      // 攻撃ペイロード制限
      if (data.length > 100) {
        data = data.substring(0, 100) + '...[TRUNCATED]';
      }
    } else if (typeof data === 'object' && data !== null) {
      const masked = {};
      for (const [key, value] of Object.entries(data)) {
        // 機密性の高いフィールドをマスキング
        if (['message', 'content', 'payload', 'userMessage', 'pattern'].includes(key)) {
          masked[key] = this.maskSensitiveData(value);
        } else if (['userId', 'email', 'phone', 'token', 'key'].includes(key)) {
          masked[key] = this.maskSensitiveData(value);
        } else if (key === 'error' && typeof value === 'string') {
          // エラーメッセージも制限
          masked[key] = value.substring(0, 50) + '...[ERROR_TRUNCATED]';
        } else {
          masked[key] = value;
        }
      }
      return masked;
    }
    return data;
  }

  /**
   * セキュリティイベントのログ記録（PIIマスキング強化版）
   */
  logSecurityEvent(eventType, details) {
    // 機密情報をマスキング
    const maskedDetails = this.maskSensitiveData(details);
    
    const event = {
      timestamp: new Date().toISOString(),
      eventType,
      details: maskedDetails,
      severity: maskedDetails.severity || 'medium'
    };

    this.securityAuditLog.push(event);
    
    // ログサイズ制限（メモリDoS防止）
    if (this.securityAuditLog.length > 1000) {
      this.securityAuditLog.shift();
    }

    // ダイジェスト情報のみでログ出力（詳細は避ける）
    const logSummary = {
      eventType,
      severity: event.severity,
      userId: maskedDetails.userId || 'unknown',
      timestamp: event.timestamp
    };

    console.log(`[SecuredFunctionMonitor] セキュリティイベント: ${eventType}`, logSummary);
  }

  /**
   * セキュアなユーザーリクエスト監視開始
   */
  startRequestMonitoring(userId, userMessage) {
    try {
      // レート制限チェック
      if (!this.checkRateLimit(userId)) {
        this.logSecurityEvent('monitoring_denied', {
          userId: this.hashUserId(userId),
          reason: 'rate_limit',
          severity: 'medium'
        });
        throw new Error('リクエスト制限に達しました');
      }

      // 悪意のある入力の検出
      const suspiciousFindings = this.detectSuspiciousInput(userMessage);
      if (suspiciousFindings.length > 0) {
        this.logSecurityEvent('suspicious_input_detected', {
          userId: this.hashUserId(userId),
          findings: suspiciousFindings,
          messageLength: userMessage.length
        });
        
        // 高リスクの場合は監視を拒否（fail-close）
        const highRiskFindings = suspiciousFindings.filter(f => f.severity === 'high');
        if (highRiskFindings.length > 0) {
          this.logSecurityEvent('monitoring_denied', {
            userId: this.hashUserId(userId),
            reason: 'high_risk_input',
            severity: 'high',
            riskCount: highRiskFindings.length
          });
          throw new Error('セキュリティ要件により処理できません');
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
      // エラー詳細は内部ログのみ・外部には最小限の情報
      this.logSecurityEvent('monitoring_start_failed', {
        userId: this.hashUserId(userId),
        error: 'システムエラー', // 詳細なエラーメッセージは隠蔽
        severity: 'high'
      });
      
      // fail-close: セキュリティエラー時は必ず拒否
      throw new Error('監視システムを開始できません');
    }
  }

  /**
   * メッセージのサニタイズ（XSS対策強化版）
   */
  sanitizeMessage(message) {
    if (!message || typeof message !== 'string') {
      return '';
    }
    
    let sanitized = message;
    
    // 1. HTMLタグの完全除去・無害化
    sanitized = sanitized
      // スクリプトタグ（複数行対応）
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gis, '[SCRIPT_REMOVED]')
      // iframe、object、embed、applet
      .replace(/<(iframe|object|embed|applet)\b[^>]*>.*?<\/\1>/gis, '[OBJECT_REMOVED]')
      // style タグ
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gis, '[STYLE_REMOVED]')
      // link rel="stylesheet"
      .replace(/<link\b[^>]*rel\s*=\s*["']?stylesheet["']?[^>]*>/gi, '[LINK_REMOVED]')
      // meta refresh
      .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '[META_REMOVED]')
      // form タグ
      .replace(/<form\b[^>]*>.*?<\/form>/gis, '[FORM_REMOVED]');
    
    // 2. イベントハンドラーの除去（包括的）
    const eventHandlers = [
      'onload', 'onerror', 'onclick', 'onmouseover', 'onmouseout', 
      'onkeydown', 'onkeyup', 'onkeypress', 'onfocus', 'onblur',
      'onsubmit', 'onchange', 'onselect', 'onresize', 'onscroll',
      'ondblclick', 'onmousedown', 'onmouseup', 'onmousemove',
      'oncontextmenu', 'ondrag', 'ondrop', 'ontouchstart', 'ontouchend'
    ];
    
    for (const handler of eventHandlers) {
      const regex = new RegExp(`\\s*${handler}\\s*=\\s*["'][^"']*["']`, 'gi');
      sanitized = sanitized.replace(regex, '');
      const regex2 = new RegExp(`\\s*${handler}\\s*=\\s*[^\\s>]*`, 'gi');
      sanitized = sanitized.replace(regex2, '');
    }
    
    // 3. javascript: プロトコルの除去
    sanitized = sanitized
      .replace(/javascript:/gi, '[JAVASCRIPT_REMOVED]')
      .replace(/data:\s*text\/html/gi, '[DATA_HTML_REMOVED]')
      .replace(/vbscript:/gi, '[VBSCRIPT_REMOVED]');
    
    // 4. 危険な属性の除去
    sanitized = sanitized
      .replace(/\s*(src|href|action|formaction|background|cite|longdesc)\s*=\s*["']?\s*javascript:/gi, ' $1="[BLOCKED]"')
      .replace(/expression\s*\(/gi, '[EXPRESSION_REMOVED](');
    
    // 5. HTMLエンティティエンコード（XSS防止）
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
    
    // 6. 制御文字の除去
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
    
    // 7. 長さ制限（プライバシー保護・DoS防止）
    if (sanitized.length > 100) {
      sanitized = sanitized.substring(0, 100) + '...[TRUNCATED]';
    }
    
    return sanitized;
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
   * 管理者認証（強化版・JWT相当機能）
   */
  validateAdminAuth(authToken) {
    if (!authToken || typeof authToken !== 'string') {
      return false;
    }
    
    try {
      // トークン形式: timestamp:nonce:hmac
      const parts = authToken.split(':');
      if (parts.length !== 3) {
        return false;
      }
      
      const [timestamp, nonce, providedHmac] = parts;
      const tokenTimestamp = parseInt(timestamp);
      const now = Date.now();
      
      // タイムスタンプ検証（5分以内）
      if (now - tokenTimestamp > 5 * 60 * 1000) {
        console.warn('[SecuredFunctionMonitor] 期限切れトークン');
        return false;
      }
      
      // HMAC検証
      const secretKey = process.env.ADMIN_AUTH_SECRET || 'change_this_secret_key_in_production';
      const payload = `${timestamp}:${nonce}`;
      const expectedHmac = crypto.createHmac('sha256', secretKey)
        .update(payload)
        .digest('hex');
      
      // タイミング攻撃対策のための固定時間比較
      if (providedHmac.length !== expectedHmac.length) {
        return false;
      }
      
      let isValid = true;
      for (let i = 0; i < expectedHmac.length; i++) {
        if (providedHmac[i] !== expectedHmac[i]) {
          isValid = false;
        }
      }
      
      if (!isValid) {
        this.logSecurityEvent('admin_auth_failed', {
          reason: 'invalid_hmac',
          timestamp: tokenTimestamp
        });
        return false;
      }
      
      // nonce重複チェック（簡易版・本番ではRedis等を使用）
      if (this.usedNonces && this.usedNonces.has(nonce)) {
        this.logSecurityEvent('admin_auth_failed', {
          reason: 'nonce_reuse',
          nonce
        });
        return false;
      }
      
      // nonceを記録（メモリDoS対策で最大1000件）
      if (!this.usedNonces) {
        this.usedNonces = new Set();
      }
      if (this.usedNonces.size >= 1000) {
        this.usedNonces.clear(); // 簡易的なクリア
      }
      this.usedNonces.add(nonce);
      
      return true;
      
    } catch (error) {
      this.logSecurityEvent('admin_auth_error', {
        error: 'システムエラー' // 詳細は隠蔽
      });
      return false;
    }
  }
  
  /**
   * 管理用トークン生成ヘルパー（開発・テスト用）
   */
  generateAdminToken() {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const secretKey = process.env.ADMIN_AUTH_SECRET || 'change_this_secret_key_in_production';
    const payload = `${timestamp}:${nonce}`;
    const hmac = crypto.createHmac('sha256', secretKey)
      .update(payload)
      .digest('hex');
    
    return `${timestamp}:${nonce}:${hmac}`;
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