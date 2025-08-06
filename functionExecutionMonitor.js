const crypto = require('crypto');

/**
 * 機能実行監視システム
 * 各機能の実行状況を追跡し、実際の動作と期待値の差異を検知
 */
class FunctionExecutionMonitor {
  constructor() {
    this.executionLog = new Map();
    this.functionRegistry = new Map();
    this.recentRequests = new Map(); // ユーザーごとの最近のリクエストを保存
    
    // 監視対象の機能を登録
    this.initializeFunctionRegistry();
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
      description: '画像生成機能：DALL-E 3による画像生成'
    });

    this.functionRegistry.set('voiceProcessing', {
      name: '音声処理',
      triggerPatterns: ['音声', 'ボイス', '声', '話して', '読み上げ'],
      executionIndicators: ['handleAudio', 'OpenAI TTS', 'audioHandler'],
      description: '音声処理機能：音声認識・合成'
    });

    this.functionRegistry.set('careerAnalysis', {
      name: '適職診断',
      triggerPatterns: ['適職', 'キャリア', '仕事', '職業', '転職'],
      executionIndicators: ['generateCareerAnalysis', 'Google Gemini'],
      description: '適職診断機能：AI による詳細な職業適性分析'
    });

    this.functionRegistry.set('characteristicsAnalysis', {
      name: '特性分析',
      triggerPatterns: ['特性', '分析', '性格', '傾向', '特徴'],
      executionIndicators: ['enhancedCharacteristicsAnalyzer', 'getUserAnalysis'],
      description: '特性分析機能：会話履歴に基づく詳細な特性分析'
    });

    this.functionRegistry.set('serviceRecommendation', {
      name: 'サービス推薦',
      triggerPatterns: ['サービス', '支援', 'おすすめ', '紹介'],
      executionIndicators: ['serviceRecommender', 'calculateServiceMatch'],
      description: 'サービス推薦機能：発達障害支援サービスの推薦'
    });
  }

  /**
   * ユーザーリクエストの監視開始
   */
  startRequestMonitoring(userId, userMessage) {
    const requestId = this.generateRequestId();
    const timestamp = Date.now();
    
    // 機能実行意図の検出
    const detectedFunctions = this.detectFunctionIntention(userMessage);
    
    const monitoring = {
      requestId,
      userId: this.hashUserId(userId),
      timestamp,
      userMessage: userMessage.substring(0, 200), // プライバシー保護のため先頭200文字のみ
      detectedFunctions,
      executedFunctions: [],
      status: 'monitoring',
      completed: false
    };

    this.executionLog.set(requestId, monitoring);
    this.recentRequests.set(this.hashUserId(userId), requestId);
    
    return requestId;
  }

  /**
   * 機能実行の記録
   */
  recordFunctionExecution(requestId, functionName, details = {}) {
    const monitoring = this.executionLog.get(requestId);
    if (!monitoring) return false;

    const execution = {
      functionName,
      timestamp: Date.now(),
      details,
      success: details.success !== false
    };

    monitoring.executedFunctions.push(execution);
    console.log(`[FunctionMonitor] 機能実行記録: ${functionName}`, details);
    
    return true;
  }

  /**
   * 監視完了とギャップ分析
   */
  completeMonitoring(requestId) {
    const monitoring = this.executionLog.get(requestId);
    if (!monitoring) return null;

    monitoring.completed = true;
    monitoring.completedAt = Date.now();

    // ギャップ分析の実行
    const analysis = this.analyzeExecutionGap(monitoring);
    monitoring.gapAnalysis = analysis;

    console.log(`[FunctionMonitor] 監視完了:`, {
      detected: monitoring.detectedFunctions.length,
      executed: monitoring.executedFunctions.length,
      hasGap: analysis.hasGap
    });

    return analysis;
  }

  /**
   * 実行ギャップの分析
   */
  analyzeExecutionGap(monitoring) {
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
          reason: this.determineGapReason(detected.functionKey, monitoring)
        });
      }
    }

    return {
      hasGap: gaps.length > 0,
      gaps,
      summary: this.generateGapSummary(gaps),
      executionRate: detectedFunctions.length > 0 ? 
        (detectedFunctions.length - gaps.length) / detectedFunctions.length : 1
    };
  }

  /**
   * 機能実行意図の検出
   */
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
          description: config.description
        });
      }
    }

    return detected.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 機能マッチング判定
   */
  isFunctionMatched(functionKey, executedFunction) {
    const config = this.functionRegistry.get(functionKey);
    if (!config) return false;

    return config.executionIndicators.some(indicator => 
      executedFunction.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  /**
   * ギャップ理由の判定
   */
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

  /**
   * ギャップサマリーの生成
   */
  generateGapSummary(gaps) {
    if (gaps.length === 0) {
      return '全ての検出された機能が正常に実行されました';
    }

    const functionNames = gaps.map(gap => gap.functionName);
    return `以下の機能が期待されましたが実行されませんでした: ${functionNames.join('、')}`;
  }

  /**
   * LLM用の説明文生成
   */
  generateLLMExplanation(gapAnalysis, userMessage) {
    if (!gapAnalysis.hasGap) {
      return null; // ギャップがない場合は説明不要
    }

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
          
        case 'careerAnalysis':
          explanations.push(
            `適職診断機能が期待されましたが、診断モードが適切に起動しませんでした。` +
            `「適職診断をお願いします」など、より明確な表現をお試しください。`
          );
          break;
          
        default:
          explanations.push(
            `${gap.functionName}の実行が期待されましたが、実際には実行されませんでした。` +
            `${gap.reason}`
          );
      }
    }

    return explanations.join('\n\n');
  }

  /**
   * 画像生成の例示
   */
  getImageGenerationExample() {
    const examples = [
      '○○の画像を生成してください',
      '○○のイラストを作成して',
      '○○について図解してください'
    ];
    return examples[Math.floor(Math.random() * examples.length)];
  }

  /**
   * ユーザーIDのハッシュ化
   */
  hashUserId(userId) {
    return crypto.createHash('sha256').update(userId).digest('hex').substring(0, 16);
  }

  /**
   * リクエストIDの生成
   */
  generateRequestId() {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * 統計情報の取得
   */
  getStatistics() {
    const logs = Array.from(this.executionLog.values()).filter(log => log.completed);
    
    if (logs.length === 0) {
      return { totalRequests: 0, averageExecutionRate: 0, commonGaps: [] };
    }

    const totalRequests = logs.length;
    const averageExecutionRate = logs.reduce((sum, log) => 
      sum + (log.gapAnalysis?.executionRate || 0), 0) / totalRequests;

    // よくあるギャップの集計
    const gapCounts = {};
    logs.forEach(log => {
      if (log.gapAnalysis?.gaps) {
        log.gapAnalysis.gaps.forEach(gap => {
          gapCounts[gap.functionKey] = (gapCounts[gap.functionKey] || 0) + 1;
        });
      }
    });

    const commonGaps = Object.entries(gapCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([functionKey, count]) => ({
        functionKey,
        functionName: this.functionRegistry.get(functionKey)?.name || functionKey,
        count,
        percentage: (count / totalRequests * 100).toFixed(1)
      }));

    return {
      totalRequests,
      averageExecutionRate: (averageExecutionRate * 100).toFixed(1),
      commonGaps
    };
  }

  /**
   * 最近のユーザーリクエストの取得
   */
  getUserRecentRequest(userId) {
    const hashedUserId = this.hashUserId(userId);
    const requestId = this.recentRequests.get(hashedUserId);
    
    if (requestId) {
      return this.executionLog.get(requestId);
    }
    
    return null;
  }

  /**
   * ログのクリーンアップ（メモリ管理）
   */
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

    console.log(`[FunctionMonitor] クリーンアップ完了: ${this.executionLog.size} 件のログを保持`);
  }
}

// シングルトンインスタンス
const functionExecutionMonitor = new FunctionExecutionMonitor();

// 定期クリーンアップ（6時間ごと）
setInterval(() => {
  functionExecutionMonitor.cleanup();
}, 6 * 60 * 60 * 1000);

module.exports = functionExecutionMonitor;