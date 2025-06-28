/**
 * LocalML - 機械学習機能（Perplexity APIに依存しない）
 * general、mental_health、analysisモードで利用する機械学習機能を提供
 */

const { getUserConversationHistory } = require('./conversationHistory');
const Airtable = require('airtable');
const EmbeddingService = require('./embeddingService');

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

    // Airtable設定
    if (process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
      this.base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
        .base(process.env.AIRTABLE_BASE_ID);
      
      // サーバー起動時に過去の分析データを読み込む
      this._loadAllUserAnalysis().catch(err => {
        console.error('Error loading user analysis data:', err);
      });
    } else {
      console.warn('Airtable credentials not found. User analysis persistence disabled.');
      this.base = null;
    }
  }

  /**
   * サーバー起動時に全ユーザーの分析データを読み込む
   */
  async _loadAllUserAnalysis() {
    if (!this.base) return;

    try {
      console.log('Loading saved user analysis data from Airtable...');
      
      try {
        // UserAnalysisテーブルからデータを取得してみる
        const records = await this.base('UserAnalysis').select({
          maxRecords: 1,
          view: 'Grid view'
        }).firstPage();
        
        console.log('UserAnalysis table is accessible. Loading data...');
        
        // テーブルにアクセスできたので、全データを取得
        const allRecords = await this.base('UserAnalysis').select().all();
        
        let loadCount = 0;
        allRecords.forEach(record => {
          try {
            const userId = record.get('UserID');
            const mode = record.get('Mode');
            const rawAnalysisData = record.get('AnalysisData');
            
            // AnalysisDataフィールドが存在し、有効なJSONであることを確認
            if (!userId || !mode || !rawAnalysisData) {
              console.log(`Skipping record due to missing data: ${record.id}`);
              return; // このレコードをスキップ
            }
            
            let analysisData;
            try {
              analysisData = JSON.parse(rawAnalysisData);
            } catch (jsonError) {
              console.log(`Invalid JSON in record ${record.id}, skipping: ${jsonError.message}`);
              return; // このレコードをスキップ
            }
            
            // メモリに復元
            if (!this.userAnalysis[userId]) {
              this.userAnalysis[userId] = {};
            }
            
            this.userAnalysis[userId][mode] = {
              ...analysisData,
              lastUpdated: new Date(record.get('LastUpdated') || new Date())
            };
            
            loadCount++;
          } catch (e) {
            console.error('Error parsing user analysis record:', e);
          }
        });
        
        console.log(`Successfully loaded analysis data for ${loadCount} user-mode combinations`);
      } catch (error) {
        // エラーが発生した場合、テーブルが存在しない可能性がある
        if (error.statusCode === 404 || error.error === 'NOT_FOUND' || 
            (error.message && error.message.includes('could not be found'))) {
          console.log('UserAnalysis table does not exist. Please create it with the following fields:');
          console.log('- UserID (text)');
          console.log('- Mode (text)');
          console.log('- AnalysisData (long text)');
          console.log('- LastUpdated (date)');
        } else {
          // その他のエラー
          throw error;
        }
      }
    } catch (err) {
      console.error('Error loading user analysis data from Airtable:', err);
    }
  }

  /**
   * ユーザー分析データをAirtableに保存
   */
  async _saveUserAnalysis(userId, mode, analysisData) {
    try {
      // 必要なデータがあるか確認
      if (!userId || !mode || !analysisData) {
        console.log('    ├─ 保存データ不足: 分析データの保存をスキップ');
        return;
      }
      
      // パターン検出の詳細情報を追加
      const enhancedAnalysisData = {
        ...analysisData,
        pattern_details: this._getPatternDetails(mode),
        timestamp: new Date().toISOString()
      };
      
      // 分析データをJSON文字列に変換
      const analysisDataString = JSON.stringify(enhancedAnalysisData);
      
      // 既存レコードを検索（履歴確認用）
      const records = await this.base('UserAnalysis')
        .select({
          filterByFormula: `AND({UserID} = "${userId}", {Mode} = "${mode}")`,
          maxRecords: 1
        })
        .all();
        
      // 常に新しいレコードとして保存（履歴化）
      const data = {
        UserID: userId,
        Mode: mode,
        AnalysisData: analysisDataString,
        LastUpdated: this._formatDateForAirtable(new Date()) // ローカル形式に変換
      };
      
      // 新規作成
      try {
        await this.base('UserAnalysis').create([{ fields: data }]);
        console.log(`    └─ 新しい分析データを作成しました: ユーザー ${userId}, モード ${mode}`);
      } catch (error) {
        // テーブルがない場合
        if (error.statusCode === 404 || error.message.includes('NOT_FOUND')) {
          console.log(`    └─ UserAnalysis テーブルが見つかりません: 分析データの保存をスキップ`);
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error(`    └─ 分析データ保存エラー: ${error.message}`);
    }
  }
  
  /**
   * 現在のモードに関連するパターン詳細情報を取得
   */
  _getPatternDetails(mode) {
    switch (mode) {
      case 'general':
        return this.trainingData.general;
      case 'mental_health':
        return this.trainingData.mental_health;
      case 'analysis':
        return this.trainingData.analysis;
      default:
        return {};
    }
  }

  /**
   * ユーザーメッセージを分析
   * @param {string} userMessage - ユーザーメッセージ
   * @param {Array} history - 会話履歴
   * @param {Object} previousAnalysis - 前回の分析結果
   * @returns {Promise<Object>} - 分析結果
   */
  async analyzeUserMessage(userMessage, history = [], previousAnalysis = null) {
    try {
      console.log('  [LocalML] ユーザーメッセージの分析開始');
      
      const startTime = Date.now();
      const currentMessage = userMessage.trim();
      
      // 基本分析
      const analysis = {
        topics: [],
        sentiment: 'neutral',
        support_needs: {
          listening: false,
          advice: false,
          information: false,
          encouragement: false
        },
        preferences: {
          detail_level: 'moderate'
        }
      };
      
      // モード判定部分を修正（_determineMode関数がないため）
      // 一般モードを常に使用
      const mode = 'general';
      console.log(`  [LocalML] 選択された分析モード: ${mode}`);
      
      // 一般モードで分析
      const modeAnalysis = await this._analyzeGeneralConversation(null, history, currentMessage);
      
      // 分析結果をマージ
      Object.assign(analysis, modeAnalysis);
      
      // 基本トピック抽出 - _extractTopics関数がないためスキップ
      // if (!analysis.topics || analysis.topics.length === 0) {
      //   analysis.topics = this._extractTopics(currentMessage);
      // }
      
      // 基本感情分析 - _analyzeSentiment関数を使わずに簡易実装
      if (!analysis.sentiment) {
        // 単純な感情分析ロジック
        if (currentMessage.includes('嬉しい') || currentMessage.includes('楽しい') || 
            currentMessage.includes('好き') || currentMessage.includes('ありがとう')) {
          analysis.sentiment = 'positive';
        } else if (currentMessage.includes('悲しい') || currentMessage.includes('辛い') || 
                   currentMessage.includes('嫌い') || currentMessage.includes('苦しい')) {
          analysis.sentiment = 'negative';
        } else {
          analysis.sentiment = 'neutral';
        }
      }
      
      // 詳細度の好みを分析
      analysis.preferences = analysis.preferences || {};
      
      // 会話全体のテキストを結合
      const allMessages = history.map(msg => msg.message).join(' ') + ' ' + currentMessage;
      
      // 詳細度の好みを分析 - _analyzeDetailPreference関数がないため直接実装
      if (allMessages.includes('詳しく') || allMessages.includes('詳細') || allMessages.includes('徹底的')) {
        analysis.preferences.detail_level = 'very_detailed';
      } else if (allMessages.includes('簡潔') || allMessages.includes('要点') || allMessages.includes('ざっくり')) {
        analysis.preferences.detail_level = 'concise';
      } else {
        analysis.preferences.detail_level = 'moderate';
      }
      
      // サポートニーズを分析（非同期になったことに注意）
      analysis.support_needs = await this._analyzeSupportNeeds(allMessages);
      
      const elapsedTime = Date.now() - startTime;
      console.log(`  [LocalML] 分析完了 (${elapsedTime}ms)`);
      
      // 分析結果のサマリーをログ
      this._logAnalysisSummary(analysis, mode);
      
      return analysis;
    } catch (error) {
      console.error('Error analyzing user message:', error);
      return {
        topics: [],
        sentiment: 'neutral',
        support_needs: {
          listening: false,
          advice: false,
          information: false,
          encouragement: false
        },
        preferences: {
          detail_level: 'moderate'
        }
      };
    }
  }

  /**
   * 一般会話の分析
   */
  async _analyzeGeneralConversation(userId, history, currentMessage) {
    console.log('    ├─ 一般モードの分析を実行');
    const analysis = {
      intent: {},
      sentiment: null,
      support_needs: {}
    };
    
    // 意図分析は単純化してスキップ
    console.log('    ├─ 意図分析をスキップ');
    
    // 会話全体のテキストを結合
    const allMessages = history.map(msg => msg.message).join(' ') + ' ' + currentMessage;
    
    // AI埋め込みベースの感情分析
    try {
      analysis.sentiment = await this._analyzeEmotionalSentiment(currentMessage, allMessages);
      console.log(`    ├─ 感情分析: ${analysis.sentiment}`);
    } catch (error) {
      console.error('Error in sentiment analysis:', error);
      analysis.sentiment = 'neutral';
    }
    
    // トピック抽出も埋め込みベースに
    try {
      analysis.topics = await this._analyzeTopics(allMessages);
      console.log(`    ├─ トピック抽出: ${analysis.topics.length}件`);
    } catch (error) {
      console.error('Error in topic extraction:', error);
      analysis.topics = [];
    }
    
    // サポートニーズの分析（非同期）
    try {
      analysis.support_needs = await this._analyzeSupportNeeds(allMessages);
      console.log('    ├─ サポートニーズ分析完了');
    } catch (error) {
      console.error('Error analyzing support needs:', error);
      // エラー時のフォールバック
      analysis.support_needs = {
        listening: false,
        advice: false,
        information: false,
        encouragement: false
      };
    }
    
    return analysis;
  }

  /**
   * AI埋め込みベースの感情分析
   * @param {string} currentMessage - 現在のメッセージ
   * @param {string} allMessages - 会話履歴全体
   * @returns {Promise<string>} - 検出された感情
   */
  async _analyzeEmotionalSentiment(currentMessage, allMessages) {
    // 埋め込みサービスのインスタンスが存在しない場合は作成
    if (!this.embeddingService) {
      this.embeddingService = new EmbeddingService();
      await this.embeddingService.initialize();
    }
    
    // 感情カテゴリと代表的な例文のマッピング
    const emotionExamples = {
      positive: "嬉しい、楽しい、幸せ、良かった、素晴らしい、ありがとう、最高、元気、希望、前向き",
      negative: "悲しい、辛い、苦しい、最悪、嫌だ、困った、不安、心配、怖い、つらい",
      angry: "怒り、イライラ、腹立つ、ムカつく、許せない、頭にくる、憤り、不満",
      anxious: "不安、心配、緊張、怖い、ドキドキ、落ち着かない、そわそわ、気になる",
      neutral: "普通、まあまあ、どちらでもない、特に、なんとも、そうですね、了解、わかりました"
    };
    
    // 閾値の設定（感情分析はより敏感に）
    const SIMILARITY_THRESHOLD = 0.55;
    
    try {
      // 現在のメッセージを重視（70%）、履歴全体も考慮（30%）
      const textToAnalyze = currentMessage + ' ' + allMessages.substring(0, 500);
      
      let maxSimilarity = 0;
      let detectedEmotion = 'neutral';
      
      // 各感情カテゴリの類似度をチェック
      for (const [emotion, examples] of Object.entries(emotionExamples)) {
        try {
          const similarity = await this.embeddingService.getTextSimilarity(textToAnalyze, examples);
          
          console.log(`      emotion ${emotion} similarity: ${similarity.toFixed(3)}`);
          
          if (similarity > maxSimilarity && similarity > SIMILARITY_THRESHOLD) {
            maxSimilarity = similarity;
            detectedEmotion = emotion;
          }
        } catch (error) {
          console.error(`Error detecting ${emotion} emotion:`, error.message);
        }
      }
      
      // 複数の感情が検出された場合の優先順位
      // negative/anxious > angry > positive > neutral
      if (detectedEmotion === 'neutral' && maxSimilarity < SIMILARITY_THRESHOLD) {
        // フォールバック: 簡単なキーワードチェック
        if (/😊|😄|🎉|良い|嬉しい|楽しい/.test(currentMessage)) {
          detectedEmotion = 'positive';
        } else if (/😢|😭|😰|辛い|悲しい|不安/.test(currentMessage)) {
          detectedEmotion = 'negative';
        } else if (/😡|💢|怒|イライラ/.test(currentMessage)) {
          detectedEmotion = 'angry';
        }
      }
      
      return detectedEmotion;
      
    } catch (error) {
      console.error('Error in emotional sentiment analysis:', error);
      // エラー時のフォールバック
      return this._analyzeEmotionalSentimentFallback(currentMessage);
    }
  }

  /**
   * 感情分析のフォールバック（正規表現ベース）
   * @private
   */
  _analyzeEmotionalSentimentFallback(text) {
    if (/嬉しい|楽しい|良い|素晴らしい|😊|😄|🎉/.test(text)) {
      return 'positive';
    } else if (/悲しい|辛い|苦しい|最悪|😢|😭|😰/.test(text)) {
      return 'negative';
    } else if (/怒り|イライラ|腹立つ|😡|💢/.test(text)) {
      return 'angry';
    } else if (/不安|心配|怖い|緊張/.test(text)) {
      return 'anxious';
    }
    return 'neutral';
  }

  /**
   * AI埋め込みベースのトピック分析
   * @param {string} text - 分析対象テキスト
   * @returns {Promise<Array>} - 検出されたトピック
   */
  async _analyzeTopics(text) {
    if (!this.embeddingService) {
      this.embeddingService = new EmbeddingService();
      await this.embeddingService.initialize();
    }
    
    const topicExamples = {
      work: "仕事、職場、上司、同僚、業務、会社、キャリア、転職、就職",
      relationship: "恋愛、友達、家族、人間関係、パートナー、結婚、別れ、デート",
      health: "健康、病気、薬、症状、治療、診断、体調、メンタル、精神",
      daily_life: "生活、日常、食事、睡眠、趣味、買い物、家事、掃除",
      study: "勉強、学校、試験、受験、資格、学習、授業、宿題",
      money: "お金、給料、貯金、節約、投資、ローン、支払い、収入"
    };
    
    const TOPIC_THRESHOLD = 0.6;
    const detectedTopics = [];
    
    try {
      for (const [topic, examples] of Object.entries(topicExamples)) {
        const similarity = await this.embeddingService.getTextSimilarity(text, examples);
        
        if (similarity > TOPIC_THRESHOLD) {
          detectedTopics.push(topic);
          console.log(`      topic ${topic} detected: ${similarity.toFixed(3)}`);
        }
      }
    } catch (error) {
      console.error('Error in topic analysis:', error);
    }
    
    return detectedTopics;
  }

  /**
   * メンタルヘルスモードの分析実行
   */
  async _analyzeMentalHealthConversation(userId, history, currentMessage) {
    console.log('    ├─ メンタルヘルスモードの分析を実行');
    const analysis = {
      indicators: {},
      coping: {},
      support_needs: {}
    };

    // 会話全体のテキストを結合
    const allMessages = history.map(msg => msg.message).join(' ') + ' ' + currentMessage;

    // 心理状態の指標分析
    const stateData = await this._detectPatternsWithEmbeddings(allMessages, this.trainingData.mental_health.stateIndicators);
    const primaryStates = this._getTopCategories(stateData, 2);
    
    if (primaryStates.length > 0) {
      analysis.indicators.emotional_states = primaryStates;
      analysis.indicators.intensity = this._calculateIntensity(stateData);
    }

    // 対処メカニズムの分析
    const copingData = await this._detectPatternsWithEmbeddings(allMessages, this.trainingData.mental_health.copingMechanisms);
    const primaryCoping = this._getTopCategories(copingData, 2);
    
    if (primaryCoping.length > 0) {
      analysis.coping.mechanisms = primaryCoping;
    }

    // 改善への姿勢を分析
    const attitudeData = await this._detectPatternsWithEmbeddings(allMessages, this.trainingData.mental_health.improvementAttitude);
    const dominantAttitude = this._findDominantCategory(attitudeData);
    
    if (dominantAttitude) {
      analysis.indicators.improvement_attitude = dominantAttitude;
    }

    // サポートニーズの分析（非同期）
    analysis.support_needs = await this._analyzeSupportNeeds(allMessages);

    return analysis;
  }

  /**
   * 分析モードの分析実行
   */
  async _analyzeAnalyticalConversation(userId, history, currentMessage) {
    console.log('    ├─ 分析モードの分析を実行');
    const analysis = {
      complexity: {},
      focus: {},
      preferences: {}
    };

    // 会話全体のテキストを結合
    const allMessages = history.map(msg => msg.message).join(' ') + ' ' + currentMessage;

    // 思考の複雑さを分析
    const complexityData = await this._detectPatternsWithEmbeddings(allMessages, this.trainingData.analysis.thinkingComplexity);
    const thinkingStyles = this._getTopCategories(complexityData, 2);
    
    if (thinkingStyles.length > 0) {
      analysis.complexity.thinking_styles = thinkingStyles;
    }

    // 焦点エリアを分析
    const focusData = await this._detectPatternsWithEmbeddings(allMessages, this.trainingData.analysis.focusAreas);
    const primaryFocus = this._getTopCategories(focusData, 2);
    
    if (primaryFocus.length > 0) {
      analysis.focus.primary_areas = primaryFocus;
    }

    // 分析の精度を分析
    const precisionData = await this._detectPatternsWithEmbeddings(allMessages, this.trainingData.analysis.analysisPrecision);
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
   * テキスト内のパターンを意味的に検出（非同期バージョン）
   * @param {string} text - 分析対象テキスト
   * @param {Object} patternCategories - カテゴリとパターンのマッピング
   * @returns {Promise<Object>} - 各カテゴリの検出カウント
   */
  async _detectPatternsWithEmbeddings(text, patternCategories) {
    const results = {};
    
    try {
      // EmbeddingServiceのインスタンスを取得または初期化
      if (!this.embeddingService) {
        const EmbeddingService = require('./embeddingService');
        this.embeddingService = new EmbeddingService();
        await this.embeddingService.initialize();
      }
      
      // テキストが短すぎる場合は従来の方法を使用
      if (text.length < 10) {
        return this._detectPatterns(text, patternCategories);
      }
      
      // 各カテゴリとそれに関連する例文の配列を作成
      const categoryExamples = {};
      for (const [category, patterns] of Object.entries(patternCategories)) {
        // パターンを例文に変換（正規表現を自然な文章に）
        const naturalPatterns = patterns.map(pattern => {
          // 正規表現特殊文字を除去して自然な文章に変換
          return pattern.replace(/[\^\$\\\.\*\+\?\(\)\[\]\{\}\|]/g, ' ').trim();
        }).filter(example => example.length > 0);
        
        // 有効な例文があれば連結
        if (naturalPatterns.length > 0) {
          categoryExamples[category] = naturalPatterns.join('. ');
        }
      }
      
      // 各カテゴリとの意味的類似度を計算
      for (const [category, examples] of Object.entries(categoryExamples)) {
        if (!examples || examples.length === 0) {
          // 例文がない場合は従来の方法を使用
          const count = this._countPatternMatches(text, patternCategories[category]);
          results[category] = count;
          continue;
        }
        
        // 類似度スコアを計算
        const similarity = await this.embeddingService.getTextSimilarity(text, examples);
        
        // スコアを0-10の範囲に正規化してカウントとして使用
        // 0.5以上の類似度から意味があると考える（0.5未満はほぼ無関係）
        const normalizedCount = similarity > 0.5 ? Math.round((similarity - 0.5) * 20) : 0;
        results[category] = normalizedCount;
        
        // デバッグ情報
        console.log(`Category: ${category}, Similarity: ${similarity.toFixed(3)}, Count: ${normalizedCount}`);
      }
      
      return results;
    } catch (error) {
      console.error('Error in semantic pattern detection:', error);
      // エラー時は従来の方法にフォールバック
      return this._detectPatterns(text, patternCategories);
    }
  }

  /**
   * 単純なパターンマッチングのカウント計算（ヘルパー関数）
   * @private
   */
  _countPatternMatches(text, patterns) {
    let count = 0;
    
    patterns.forEach(pattern => {
      const regex = new RegExp(pattern, 'gi');
      const matches = text.match(regex);
      if (matches) {
        count += matches.length;
      }
    });
    
    return count;
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
   * @param {string} text - 分析対象テキスト
   * @returns {Promise<Object>} - 検出されたニーズ
   */
  async _analyzeSupportNeeds(text) {
    const needs = {};
    
    // 埋め込みサービスのインスタンスが存在しない場合は作成
    if (!this.embeddingService) {
      this.embeddingService = new EmbeddingService();
      await this.embeddingService.initialize();
    }
    
    // ニーズカテゴリと代表的な例文のマッピング
    const needsExamples = {
      listening: "話を聞いてほしい、共感してほしい、理解してほしい、自分の気持ちを分かってほしい",
      advice: "アドバイスがほしい、どうすればいいか教えてほしい、助言がほしい、良い方法を知りたい",
      information: "情報がほしい、知りたい、教えてほしい、どこで見つけられるか、詳しく知りたい",
      encouragement: "励ましてほしい、勇気づけてほしい、前向きになりたい、元気が欲しい、希望が欲しい"
    };
    
    // 閾値の設定
    const SIMILARITY_THRESHOLD = 0.65;
    
    // すべてのニーズカテゴリをチェック（デフォルトはfalse）
    for (const needType of Object.keys(needsExamples)) {
      needs[needType] = false;
    }
    
    try {
      // 埋め込みサービスが正常に初期化されているか確認
      if (this.embeddingService && await this.embeddingService.initialize()) {
        // 各ニーズカテゴリの類似度をチェック
        for (const [needType, examples] of Object.entries(needsExamples)) {
          try {
            // 類似度計算
            const similarity = await this.embeddingService.getTextSimilarity(text, examples);
            needs[needType] = similarity > SIMILARITY_THRESHOLD;
            
            // デバッグ情報
            console.log(`${needType} need similarity: ${similarity.toFixed(3)} (threshold: ${SIMILARITY_THRESHOLD})`);
          } catch (error) {
            console.error(`Error detecting ${needType} need with embeddings:`, error.message);
            // エンベディングでエラーが発生した場合は正規表現にフォールバック
            this._applyFallbackDetection(text, needType, needs);
          }
        }
      } else {
        // 埋め込みサービスが利用できない場合は従来の正規表現に完全にフォールバック
        console.log('Embedding service not available, using regex fallback for all need types');
        this._applyAllFallbackDetections(text, needs);
      }
    } catch (error) {
      console.error('Error in analyzeSupportNeeds:', error);
      // エラーが発生した場合は従来の正規表現に完全にフォールバック
      this._applyAllFallbackDetections(text, needs);
    }
    
    return needs;
  }

  /**
   * 特定のニーズタイプに対して正規表現フォールバック検出を適用
   * @private
   */
  _applyFallbackDetection(text, needType, needs) {
    // 正規表現によるフォールバック検出
    if (needType === 'listening' && /聞いて|話を聞いて|理解して|共感/gi.test(text)) {
      needs[needType] = true;
      console.log(`${needType} need detected using regex fallback`);
    } else if (needType === 'advice' && /アドバイス|助言|どうすれば|教えて|方法/gi.test(text)) {
      needs[needType] = true;
      console.log(`${needType} need detected using regex fallback`);
    } else if (needType === 'information' && /情報|知りたい|教えて|どこで|どうやって/gi.test(text)) {
      needs[needType] = true;
      console.log(`${needType} need detected using regex fallback`);
    } else if (needType === 'encouragement' && /励まし|勇気|元気|希望|前向き/gi.test(text)) {
      needs[needType] = true;
      console.log(`${needType} need detected using regex fallback`);
    }
  }

  /**
   * すべてのニーズタイプに対して正規表現フォールバック検出を適用
   * @private
   */
  _applyAllFallbackDetections(text, needs) {
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
    
    console.log('All needs detected using regex fallback');
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
    let prompt = `## 感情状態とトピック\n`;
    
    // 新しいAI感情分析の結果を反映
    if (analysis.sentiment) {
      const sentimentTranslations = {
        positive: 'ポジティブ（喜び・楽しさ）',
        negative: 'ネガティブ（悲しみ・苦しみ）',
        angry: '怒り・イライラ',
        anxious: '不安・心配',
        neutral: '中立的・落ち着いている'
      };
      prompt += `- 現在の感情状態: ${sentimentTranslations[analysis.sentiment] || analysis.sentiment}\n`;
    }
    
    // トピック分析の結果を反映
    if (analysis.topics && analysis.topics.length > 0) {
      const topicTranslations = {
        work: '仕事・職場',
        relationship: '人間関係・恋愛',
        health: '健康・医療',
        daily_life: '日常生活',
        study: '学習・勉強',
        money: '金銭・経済'
      };
      const translatedTopics = analysis.topics.map(topic => topicTranslations[topic] || topic);
      prompt += `- 会話のトピック: ${translatedTopics.join(', ')}\n`;
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
      } else {
        prompt += `- 求めているサポート: 特になし（一般的な会話）\n`;
      }
    }
    
    // 感情に応じた応答ガイドライン
    prompt += `\n## 応答ガイドライン\n`;
    
    if (analysis.sentiment === 'positive') {
      prompt += `- ユーザーのポジティブな感情に共感し、その気持ちを維持・増幅させる応答を心がける\n`;
    } else if (analysis.sentiment === 'negative' || analysis.sentiment === 'anxious') {
      prompt += `- ユーザーの不安や悲しみに寄り添い、安心感を与える温かい応答を心がける\n`;
    } else if (analysis.sentiment === 'angry') {
      prompt += `- ユーザーの怒りを受け止め、冷静で理解ある対応を心がける\n`;
    } else {
      prompt += `- バランスの取れた、親しみやすい応答を心がける\n`;
    }
    
    // トピックに応じた専門性
    if (analysis.topics && analysis.topics.length > 0) {
      prompt += `- ${analysis.topics.join('、')}に関する適切な知識と理解を示す\n`;
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
    
    if (analysis.complexity && analysis.complexity.thinking_styles) {
      prompt += `- 思考スタイル: ${analysis.complexity.thinking_styles.map(style => this._translateThinking(style)).join(', ')}\n`;
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

  /**
   * 日付をAirtable互換のフォーマットに変換
   * Airtableが期待するLocal形式(3/13/2025)に変換
   */
  _formatDateForAirtable(date) {
    // 月/日/年 形式に変換
    const month = date.getMonth() + 1; // getMonthは0から始まるので+1
    const day = date.getDate();
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  }

  /**
   * ユーザーの会話履歴から学習し、AIの応答を強化するための分析を行う
   * 互換性のために残しておくが、内部ではanalyzeUserMessageを使用
   * @param {string} userId - ユーザーID
   * @param {string} userMessage - 最新のユーザーメッセージ
   * @param {string} mode - 会話モード（general/mental_health/analysis）
   * @returns {Promise<Object>} - AIの応答に利用するための機械学習データ
   */
  async enhanceResponse(userId, userMessage, mode) {
    console.log(`\n [LocalML] 機械学習処理を開始: mode=${mode}`);
    
    try {
      // ユーザーの会話履歴を取得
      const conversationHistory = await getUserConversationHistory(userId, 200);
      
      // 会話履歴がなければ分析結果を返せない
      if (!conversationHistory || conversationHistory.length === 0) {
        console.log('    ├─ 会話履歴なし: 分析をスキップ');
        return null;
      }
      
      // 新しいanalyzeUserMessage関数を使用して分析
      // 会話履歴のフォーマット変換
      const formattedHistory = conversationHistory.map(item => ({
        role: item.role,
        message: item.content
      }));
      
      console.log('    ├─ 新しいanalyzeUserMessage関数を使用して分析');
      const analysisResult = await this.analyzeUserMessage(userMessage, formattedHistory);
      
      console.log(`    ├─ 分析完了: ${analysisResult ? Object.keys(analysisResult).length : 0} 特性を検出`);
      
      if (analysisResult) {
        // ユーザーIDごとの分析データを初期化（存在しない場合）
        if (!this.userAnalysis[userId]) {
          this.userAnalysis[userId] = {
            general: { traits: {}, topics: {}, lastUpdated: null },
            mental_health: { indicators: {}, coping: {}, lastUpdated: null },
            analysis: { complexity: {}, focus: {}, lastUpdated: null },
          };
        }
        
        // 分析結果を保存
        const now = new Date();
        this.userAnalysis[userId][mode] = {
          ...analysisResult,
          lastUpdated: now
        };
        
        // Airtableに永続化
        this._saveUserAnalysis(userId, mode, analysisResult);
      }
      
      return analysisResult;
      
    } catch (error) {
      console.error(`    ├─ [LocalML] エラー発生: ${error.message}`);
      return null;
    }
  }
}

module.exports = new LocalML(); 