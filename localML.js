/**
 * LocalML - 機械学習機能（Perplexity APIに依存しない）
 * general、mental_health、analysisモードで利用する機械学習機能を提供
 */

const { getUserConversationHistory } = require('./conversationHistory');

class LocalML {
  constructor() {
    this.trainingData = {
      // モード別の特徴パターンデータ
      general: this._initializeGeneralPatterns(),
      mental_health: this._initializeMentalHealthPatterns(),
      analysis: this._initializeAnalysisPatterns(),
    };
    
    // 各ユーザーの会話データ分析結果を保持
    this.userAnalysis = {};
  }

  /**
   * ユーザーの会話履歴から学習し、AIの応答を強化するための分析を行う
   * @param {string} userId - ユーザーID
   * @param {string} userMessage - 最新のユーザーメッセージ
   * @param {string} mode - 会話モード（general/mental_health/analysis）
   * @returns {Object} - AIの応答に利用するための機械学習データ
   */
  async enhanceResponse(userId, userMessage, mode) {
    console.log(`\n🧠 [LocalML] 機械学習処理を開始: mode=${mode}`);
    
    try {
      // ユーザーの会話履歴を取得
      const conversationHistory = await getUserConversationHistory(userId, 20);
      
      // 会話履歴がなければ分析結果を返せない
      if (!conversationHistory || conversationHistory.length === 0) {
        console.log('    ├─ 会話履歴なし: 分析をスキップ');
        return null;
      }
      
      // ユーザーIDごとの分析データを初期化（存在しない場合）
      if (!this.userAnalysis[userId]) {
        this.userAnalysis[userId] = {
          general: { traits: {}, topics: {}, lastUpdated: null },
          mental_health: { indicators: {}, coping: {}, lastUpdated: null },
          analysis: { complexity: {}, focus: {}, lastUpdated: null },
        };
      }
      
      // モードに応じた分析を実行
      let analysisResult = null;
      switch (mode) {
        case 'general':
          analysisResult = this._analyzeGeneralConversation(userId, conversationHistory, userMessage);
          break;
        case 'mental_health':
          analysisResult = this._analyzeMentalHealthConversation(userId, conversationHistory, userMessage);
          break;
        case 'analysis':
          analysisResult = this._analyzeAnalyticalConversation(userId, conversationHistory, userMessage);
          break;
        default:
          console.log(`    ├─ 未対応モード: ${mode}`);
          return null;
      }
      
      console.log(`    ├─ 分析完了: ${analysisResult ? Object.keys(analysisResult).length : 0} 特性を検出`);
      
      if (analysisResult) {
        // 分析結果の概要をログに記録
        this._logAnalysisSummary(analysisResult, mode);
        
        // 分析結果を保存
        this.userAnalysis[userId][mode] = {
          ...analysisResult,
          lastUpdated: new Date()
        };
      }
      
      return analysisResult;
      
    } catch (error) {
      console.error(`    ├─ [LocalML] エラー発生: ${error.message}`);
      return null;
    }
  }
  
  /**
   * 一般会話モードのパターン初期化
   */
  _initializeGeneralPatterns() {
    return {
      // コミュニケーションスタイル
      communicationPatterns: {
        formal: ['でございます', 'いただけますか', '〜でしょうか', '敬語', '丁寧'],
        casual: ['だよね', 'じゃん', 'だよ', 'だけど', 'わよ'],
        direct: ['教えて', 'どう思う', '答えて', 'どうすれば'],
        detailed: ['詳しく', '具体的に', 'もっと', '詳細'],
        concise: ['簡単に', '要約', 'ざっくり', '簡潔に']
      },
      // 関心トピック
      interestPatterns: {
        technology: ['AI', 'コンピュータ', 'テクノロジー', 'デジタル', 'アプリ'],
        culture: ['映画', '本', '音楽', 'アート', '歴史'],
        lifestyle: ['料理', '旅行', 'ファッション', 'スポーツ', '健康'],
        science: ['科学', '宇宙', '物理', '生物', '化学'],
        society: ['ニュース', '政治', '社会', '環境', '経済']
      },
      // 感情表現
      emotionalPatterns: {
        positive: ['嬉しい', '楽しい', '好き', '良い', '素晴らしい'],
        negative: ['悲しい', '辛い', '嫌い', '悪い', '最悪'],
        neutral: ['普通', 'まあまあ', 'ふつう', '特に', 'どちらとも'],
        curious: ['なぜ', 'どうして', '不思議', '気になる', '知りたい'],
        confused: ['わからない', '混乱', '困った', '難しい', '複雑']
      }
    };
  }

  /**
   * メンタルヘルスモードのパターン初期化
   */
  _initializeMentalHealthPatterns() {
    return {
      // 心理状態の指標
      stateIndicators: {
        anxiety: ['不安', '心配', 'パニック', '緊張', '怖い'],
        depression: ['落ち込む', '無気力', '悲しい', '辛い', '絶望'],
        stress: ['ストレス', '疲れ', '余裕がない', '追い詰められ', '消耗'],
        loneliness: ['孤独', '寂しい', '一人', '孤立', '人間関係'],
        anger: ['怒り', 'イライラ', '腹立たしい', '憤り', '不満']
      },
      // 対処メカニズム
      copingMechanisms: {
        avoidance: ['避ける', '逃げる', '後回し', '無視', '見ないふり'],
        seeking_help: ['助けて', '相談', 'アドバイス', '誰か', 'サポート'],
        self_care: ['休息', '睡眠', '運動', 'リラックス', '趣味'],
        rumination: ['考え込む', '悩む', '頭から離れない', 'ずっと考える', '思い出す'],
        problem_solving: ['解決', '対策', '方法', '改善', '取り組む']
      },
      // 改善への姿勢
      improvementAttitude: {
        motivated: ['頑張りたい', '良くなりたい', '変わりたい', '前向き', '目標'],
        resistant: ['無理', '変わらない', '諦めた', '希望がない', '意味がない'],
        uncertain: ['わからない', '迷っている', '自信がない', '不安', '怖い'],
        hopeful: ['期待', '希望', '可能性', '未来', 'チャンス'],
        helpless: ['どうしようもない', '助からない', '終わり', 'だめ', '無駄']
      }
    };
  }

  /**
   * 分析モードのパターン初期化
   */
  _initializeAnalysisPatterns() {
    return {
      // 思考の複雑さ
      thinkingComplexity: {
        abstract: ['概念', '理論', '哲学', '抽象的', '本質'],
        concrete: ['具体的', '実例', '実際', '現実', '事実'],
        systemic: ['システム', '構造', '全体', '関係性', 'プロセス'],
        detailed: ['詳細', '細部', '精密', '厳密', '正確'],
        holistic: ['全体像', '包括的', '統合', '総合', '広範']
      },
      // 焦点エリア
      focusAreas: {
        problem: ['問題', '課題', '障害', '難しい', '解決すべき'],
        solution: ['解決策', '方法', '対処', '改善', '解消'],
        process: ['プロセス', '手順', '方法', 'ステップ', '進め方'],
        outcome: ['結果', '成果', '効果', '影響', '帰結'],
        context: ['背景', '状況', '環境', '文脈', '条件']
      },
      // 分析の精度
      analysisPrecision: {
        seeking_accuracy: ['正確', '厳密', '精密', '詳細', '確実'],
        approximating: ['おおよそ', '大体', '目安', '約', 'ざっくり'],
        questioning: ['本当？', '確か？', '疑問', '不確か', '検証'],
        validating: ['確認', '検証', '証明', '裏付け', '根拠'],
        estimating: ['推測', '予測', '見積もり', '仮定', '予想']
      }
    };
  }

  /**
   * 一般会話モードの分析実行
   */
  _analyzeGeneralConversation(userId, history, currentMessage) {
    console.log('    ├─ 一般会話モードの分析を実行');
    const analysis = {
      traits: {},
      topics: {},
      response_preferences: {}
    };

    // 会話全体のテキストを結合
    const allMessages = history.map(msg => msg.message).join(' ') + ' ' + currentMessage;

    // コミュニケーションスタイルの分析
    const styleData = this._detectPatterns(allMessages, this.trainingData.general.communicationPatterns);
    const dominantStyle = this._findDominantCategory(styleData);
    
    if (dominantStyle) {
      analysis.traits.communication_style = dominantStyle;
      analysis.traits.formality_level = this._calculateFormality(styleData);
    }

    // 関心トピックの分析
    const topicData = this._detectPatterns(allMessages, this.trainingData.general.interestPatterns);
    const topTopics = this._getTopCategories(topicData, 2);
    
    if (topTopics.length > 0) {
      analysis.topics.primary_interests = topTopics;
    }

    // 感情表現の分析
    const emotionData = this._detectPatterns(allMessages, this.trainingData.general.emotionalPatterns);
    const dominantEmotion = this._findDominantCategory(emotionData);
    
    if (dominantEmotion) {
      analysis.traits.emotional_tone = dominantEmotion;
    }

    // 応答の好みを分析
    analysis.response_preferences = this._analyzeResponsePreferences(allMessages);

    return analysis;
  }

  /**
   * メンタルヘルス会話モードの分析実行
   */
  _analyzeMentalHealthConversation(userId, history, currentMessage) {
    console.log('    ├─ メンタルヘルスモードの分析を実行');
    const analysis = {
      indicators: {},
      coping: {},
      support_needs: {}
    };

    // 会話全体のテキストを結合
    const allMessages = history.map(msg => msg.message).join(' ') + ' ' + currentMessage;

    // 心理状態の指標分析
    const stateData = this._detectPatterns(allMessages, this.trainingData.mental_health.stateIndicators);
    const primaryStates = this._getTopCategories(stateData, 2);
    
    if (primaryStates.length > 0) {
      analysis.indicators.emotional_states = primaryStates;
      analysis.indicators.intensity = this._calculateIntensity(stateData);
    }

    // 対処メカニズムの分析
    const copingData = this._detectPatterns(allMessages, this.trainingData.mental_health.copingMechanisms);
    const primaryCoping = this._getTopCategories(copingData, 2);
    
    if (primaryCoping.length > 0) {
      analysis.coping.mechanisms = primaryCoping;
    }

    // 改善への姿勢を分析
    const attitudeData = this._detectPatterns(allMessages, this.trainingData.mental_health.improvementAttitude);
    const dominantAttitude = this._findDominantCategory(attitudeData);
    
    if (dominantAttitude) {
      analysis.indicators.improvement_attitude = dominantAttitude;
    }

    // サポートニーズの分析
    analysis.support_needs = this._analyzeSupportNeeds(allMessages);

    return analysis;
  }

  /**
   * 分析モードの分析実行
   */
  _analyzeAnalyticalConversation(userId, history, currentMessage) {
    console.log('    ├─ 分析モードの分析を実行');
    const analysis = {
      complexity: {},
      focus: {},
      preferences: {}
    };

    // 会話全体のテキストを結合
    const allMessages = history.map(msg => msg.message).join(' ') + ' ' + currentMessage;

    // 思考の複雑さを分析
    const complexityData = this._detectPatterns(allMessages, this.trainingData.analysis.thinkingComplexity);
    const thinkingStyles = this._getTopCategories(complexityData, 2);
    
    if (thinkingStyles.length > 0) {
      analysis.complexity.thinking_style = thinkingStyles;
    }

    // 焦点エリアを分析
    const focusData = this._detectPatterns(allMessages, this.trainingData.analysis.focusAreas);
    const primaryFocus = this._getTopCategories(focusData, 2);
    
    if (primaryFocus.length > 0) {
      analysis.focus.primary_areas = primaryFocus;
    }

    // 分析の精度を分析
    const precisionData = this._detectPatterns(allMessages, this.trainingData.analysis.analysisPrecision);
    const precisionApproach = this._findDominantCategory(precisionData);
    
    if (precisionApproach) {
      analysis.preferences.precision_level = precisionApproach;
    }

    // 応答の詳細度の好みを分析
    analysis.preferences.detail_level = this._analyzeDetailPreference(allMessages);

    return analysis;
  }

  /**
   * テキスト内のパターンマッチングを行う
   */
  _detectPatterns(text, patternCategories) {
    const results = {};
    
    // 各カテゴリとそのパターンに対して
    Object.entries(patternCategories).forEach(([category, patterns]) => {
      let count = 0;
      
      // 各パターンが何回出現するか数える
      patterns.forEach(pattern => {
        const regex = new RegExp(pattern, 'gi');
        const matches = text.match(regex);
        if (matches) {
          count += matches.length;
        }
      });
      
      results[category] = count;
    });
    
    return results;
  }

  /**
   * 最も検出回数が多いカテゴリを返す
   */
  _findDominantCategory(categoryData) {
    let maxCount = 0;
    let dominantCategory = null;
    
    Object.entries(categoryData).forEach(([category, count]) => {
      if (count > maxCount) {
        maxCount = count;
        dominantCategory = category;
      }
    });
    
    // 検出回数が1以上の場合のみ結果を返す
    return maxCount > 0 ? dominantCategory : null;
  }

  /**
   * 検出回数が多い順にN個のカテゴリを返す
   */
  _getTopCategories(categoryData, n) {
    return Object.entries(categoryData)
      .filter(([_, count]) => count > 0)
      .sort(([_, countA], [__, countB]) => countB - countA)
      .slice(0, n)
      .map(([category, _]) => category);
  }

  /**
   * テキストの丁寧さレベルを計算
   */
  _calculateFormality(styleData) {
    const formal = styleData.formal || 0;
    const casual = styleData.casual || 0;
    
    if (formal === 0 && casual === 0) return 'neutral';
    if (formal > casual * 2) return 'very_formal';
    if (formal > casual) return 'somewhat_formal';
    if (casual > formal * 2) return 'very_casual';
    return 'somewhat_casual';
  }

  /**
   * 感情の強度を計算
   */
  _calculateIntensity(stateData) {
    const total = Object.values(stateData).reduce((sum, count) => sum + count, 0);
    
    if (total === 0) return 'neutral';
    if (total > 10) return 'high';
    if (total > 5) return 'moderate';
    return 'low';
  }

  /**
   * 応答の好みを分析
   */
  _analyzeResponsePreferences(text) {
    const preferences = {};
    
    // 応答の長さの好み
    if (/詳しく|具体的に|詳細|教えて|説明/gi.test(text)) {
      preferences.length = 'detailed';
    } else if (/簡単に|要約|ざっくり|簡潔/gi.test(text)) {
      preferences.length = 'concise';
    } else {
      preferences.length = 'balanced';
    }
    
    // トーンの好み
    if (/面白く|楽しく|ユーモア|冗談/gi.test(text)) {
      preferences.tone = 'friendly';
    } else if (/正確に|厳密に|客観的|事実/gi.test(text)) {
      preferences.tone = 'factual';
    } else {
      preferences.tone = 'balanced';
    }
    
    return preferences;
  }

  /**
   * サポートニーズを分析
   */
  _analyzeSupportNeeds(text) {
    const needs = {};
    
    // 傾聴ニーズ
    if (/聞いて|話を聞いて|理解して|共感/gi.test(text)) {
      needs.listening = true;
    }
    
    // アドバイスニーズ
    if (/アドバイス|助言|どうすれば|教えて|方法/gi.test(text)) {
      needs.advice = true;
    }
    
    // 情報ニーズ
    if (/情報|知りたい|教えて|どこで|どうやって/gi.test(text)) {
      needs.information = true;
    }
    
    // 励ましニーズ
    if (/励まし|勇気|元気|希望|前向き/gi.test(text)) {
      needs.encouragement = true;
    }
    
    return needs;
  }

  /**
   * 詳細度の好みを分析
   */
  _analyzeDetailPreference(text) {
    if (/詳しく|詳細|深く|徹底的|全て/gi.test(text)) {
      return 'very_detailed';
    } 
    if (/簡潔に|要点|ざっくり|概要/gi.test(text)) {
      return 'concise';
    }
    return 'moderate';
  }

  /**
   * 分析結果の概要をログに出力
   */
  _logAnalysisSummary(analysis, mode) {
    console.log(`    ├─ [LocalML] ${mode}モードの分析結果:`);
    
    // オブジェクトを最大2階層まで出力
    Object.entries(analysis).forEach(([category, items]) => {
      console.log(`    │  ├─ ${category}:`);
      
      Object.entries(items).forEach(([key, value]) => {
        const displayValue = Array.isArray(value) 
          ? value.join(', ') 
          : (typeof value === 'object' ? '[複合データ]' : value);
        console.log(`    │  │  ├─ ${key}: ${displayValue}`);
      });
    });
  }
  
  /**
   * AIの応答生成に使用するシステムプロンプトを生成
   * @param {string} mode - 会話モード
   * @param {Object} analysis - 機械学習による分析結果
   * @returns {string} - システムプロンプト
   */
  generateSystemPrompt(mode, analysis) {
    if (!analysis) return null;
    
    let prompt = `\n# ユーザー分析データ (LocalML)\n\n`;
    
    switch (mode) {
      case 'general':
        prompt += this._generateGeneralPrompt(analysis);
        break;
      case 'mental_health':
        prompt += this._generateMentalHealthPrompt(analysis);
        break;
      case 'analysis':
        prompt += this._generateAnalysisPrompt(analysis);
        break;
      default:
        return null;
    }
    
    prompt += `\n\nこの分析を参考に、ユーザーに最適な応答を作成してください。`;
    return prompt;
  }
  
  /**
   * 一般会話モード用のプロンプト生成
   */
  _generateGeneralPrompt(analysis) {
    let prompt = `## コミュニケーション特性\n`;
    
    if (analysis.traits && analysis.traits.communication_style) {
      prompt += `- コミュニケーションスタイル: ${this._translateTrait(analysis.traits.communication_style)}\n`;
    }
    
    if (analysis.traits && analysis.traits.formality_level) {
      prompt += `- フォーマリティレベル: ${this._translateFormality(analysis.traits.formality_level)}\n`;
    }
    
    if (analysis.traits && analysis.traits.emotional_tone) {
      prompt += `- 感情トーン: ${this._translateEmotion(analysis.traits.emotional_tone)}\n`;
    }
    
    prompt += `\n## 興味・関心\n`;
    
    if (analysis.topics && analysis.topics.primary_interests) {
      prompt += `- 主な関心: ${analysis.topics.primary_interests.map(topic => this._translateTopic(topic)).join(', ')}\n`;
    }
    
    prompt += `\n## 応答の好み\n`;
    
    if (analysis.response_preferences) {
      if (analysis.response_preferences.length) {
        prompt += `- 好む応答の長さ: ${this._translateLength(analysis.response_preferences.length)}\n`;
      }
      
      if (analysis.response_preferences.tone) {
        prompt += `- 好むトーン: ${this._translateTone(analysis.response_preferences.tone)}\n`;
      }
    }
    
    return prompt;
  }
  
  /**
   * メンタルヘルスモード用のプロンプト生成
   */
  _generateMentalHealthPrompt(analysis) {
    let prompt = `## 心理状態\n`;
    
    if (analysis.indicators && analysis.indicators.emotional_states) {
      prompt += `- 主な感情状態: ${analysis.indicators.emotional_states.map(state => this._translateState(state)).join(', ')}\n`;
    }
    
    if (analysis.indicators && analysis.indicators.intensity) {
      prompt += `- 感情の強度: ${this._translateIntensity(analysis.indicators.intensity)}\n`;
    }
    
    if (analysis.indicators && analysis.indicators.improvement_attitude) {
      prompt += `- 改善への姿勢: ${this._translateAttitude(analysis.indicators.improvement_attitude)}\n`;
    }
    
    prompt += `\n## 対処メカニズム\n`;
    
    if (analysis.coping && analysis.coping.mechanisms) {
      prompt += `- 主な対処法: ${analysis.coping.mechanisms.map(mechanism => this._translateCoping(mechanism)).join(', ')}\n`;
    }
    
    prompt += `\n## サポートニーズ\n`;
    
    if (analysis.support_needs) {
      const needs = [];
      if (analysis.support_needs.listening) needs.push('傾聴と共感');
      if (analysis.support_needs.advice) needs.push('具体的なアドバイス');
      if (analysis.support_needs.information) needs.push('情報提供');
      if (analysis.support_needs.encouragement) needs.push('励ましと動機づけ');
      
      if (needs.length > 0) {
        prompt += `- 求めているサポート: ${needs.join(', ')}\n`;
      }
    }
    
    return prompt;
  }
  
  /**
   * 分析モード用のプロンプト生成
   */
  _generateAnalysisPrompt(analysis) {
    let prompt = `## 思考特性\n`;
    
    if (analysis.complexity && analysis.complexity.thinking_style) {
      prompt += `- 思考スタイル: ${analysis.complexity.thinking_style.map(style => this._translateThinking(style)).join(', ')}\n`;
    }
    
    prompt += `\n## 分析の焦点\n`;
    
    if (analysis.focus && analysis.focus.primary_areas) {
      prompt += `- 主な焦点: ${analysis.focus.primary_areas.map(area => this._translateFocus(area)).join(', ')}\n`;
    }
    
    prompt += `\n## 分析の好み\n`;
    
    if (analysis.preferences) {
      if (analysis.preferences.precision_level) {
        prompt += `- 精度の好み: ${this._translatePrecision(analysis.preferences.precision_level)}\n`;
      }
      
      if (analysis.preferences.detail_level) {
        prompt += `- 詳細度の好み: ${this._translateDetail(analysis.preferences.detail_level)}\n`;
      }
    }
    
    return prompt;
  }
  
  // 以下、分析結果を日本語に変換するヘルパーメソッド
  
  _translateTrait(trait) {
    const translations = {
      formal: '丁寧で形式的',
      casual: 'カジュアルで親しみやすい',
      direct: '直接的ではっきりした',
      detailed: '詳細で説明的',
      concise: '簡潔で要点的'
    };
    return translations[trait] || trait;
  }
  
  _translateFormality(level) {
    const translations = {
      very_formal: '非常に丁寧',
      somewhat_formal: 'やや丁寧',
      neutral: '標準的',
      somewhat_casual: 'やや砕けた',
      very_casual: '非常にカジュアル'
    };
    return translations[level] || level;
  }
  
  _translateEmotion(emotion) {
    const translations = {
      positive: 'ポジティブ',
      negative: 'ネガティブ',
      neutral: '中立的',
      curious: '好奇心旺盛',
      confused: '混乱している'
    };
    return translations[emotion] || emotion;
  }
  
  _translateTopic(topic) {
    const translations = {
      technology: 'テクノロジー',
      culture: '文化・芸術',
      lifestyle: 'ライフスタイル',
      science: '科学',
      society: '社会・時事'
    };
    return translations[topic] || topic;
  }
  
  _translateLength(length) {
    const translations = {
      detailed: '詳細な説明',
      concise: '簡潔な要点',
      balanced: 'バランスの取れた長さ'
    };
    return translations[length] || length;
  }
  
  _translateTone(tone) {
    const translations = {
      friendly: 'フレンドリーで親しみやすい',
      factual: '事実に基づいた客観的',
      balanced: 'バランスの取れた'
    };
    return translations[tone] || tone;
  }
  
  _translateState(state) {
    const translations = {
      anxiety: '不安',
      depression: '落ち込み',
      stress: 'ストレス',
      loneliness: '孤独感',
      anger: '怒り・苛立ち'
    };
    return translations[state] || state;
  }
  
  _translateIntensity(intensity) {
    const translations = {
      high: '高い',
      moderate: '中程度',
      low: '低い',
      neutral: '中立的'
    };
    return translations[intensity] || intensity;
  }
  
  _translateAttitude(attitude) {
    const translations = {
      motivated: '意欲的',
      resistant: '抵抗的',
      uncertain: '不確か',
      hopeful: '希望的',
      helpless: '無力感'
    };
    return translations[attitude] || attitude;
  }
  
  _translateCoping(coping) {
    const translations = {
      avoidance: '回避',
      seeking_help: '援助希求',
      self_care: 'セルフケア',
      rumination: '反芻思考',
      problem_solving: '問題解決'
    };
    return translations[coping] || coping;
  }
  
  _translateThinking(thinking) {
    const translations = {
      abstract: '抽象的',
      concrete: '具体的',
      systemic: 'システム的',
      detailed: '詳細志向',
      holistic: '全体的視点'
    };
    return translations[thinking] || thinking;
  }
  
  _translateFocus(focus) {
    const translations = {
      problem: '問題定義',
      solution: '解決策',
      process: 'プロセス',
      outcome: '成果・結果',
      context: '文脈・背景'
    };
    return translations[focus] || focus;
  }
  
  _translatePrecision(precision) {
    const translations = {
      seeking_accuracy: '高精度志向',
      approximating: '近似・大枠重視',
      questioning: '検証的',
      validating: '検証重視',
      estimating: '推定的'
    };
    return translations[precision] || precision;
  }
  
  _translateDetail(detail) {
    const translations = {
      very_detailed: '非常に詳細',
      moderate: '適度な詳細さ',
      concise: '簡潔・要点のみ'
    };
    return translations[detail] || detail;
  }
}

module.exports = new LocalML(); 