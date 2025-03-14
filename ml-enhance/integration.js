/**
 * ml-enhance/integration.js
 * 機械学習拡張機能の実装
 * TensorFlow.jsを使用した機械学習機能とパターン分析の強化
 */

const tf = require('@tensorflow/tfjs');
const { getUserConversationHistory } = require('../conversationHistory');
const logger = require('./logger');
const { config } = require('./config');

// 既存のlocalMLモジュールを参照（パターン取得など）
const localML = require('../localML');

// 初期化状態
let initialized = false;
let tfBackend = null;

// モデルとデータ
let models = {};
let featureExtractor = null;
let sentimentAnalyzer = null;

/**
 * モジュールの初期化
 */
async function initialize() {
  const timer = logger.startTimer('ml_integration_initialize');
  
  try {
    logger.info('TensorFlow.js ML拡張機能の初期化を開始');
    
    // TensorFlowバックエンドの設定
    try {
      await tf.setBackend(config.tensorflow.backend);
      tfBackend = tf.getBackend();
      logger.info(`TensorFlow.jsバックエンド: ${tfBackend}`);
      
      // メモリ使用量の設定（可能な場合）
      if (tfBackend === 'webgl' && tf.env().getFlags().WEBGL_VERSION > 0) {
        tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
        logger.info('WebGL: 16ビット精度を有効化');
      }
    } catch (error) {
      logger.warn(`TensorFlow.jsバックエンド '${config.tensorflow.backend}' の設定に失敗: ${error.message}`);
      logger.info('代替バックエンドを使用します');
    }
    
    // 環境情報のログ
    logger.info(`TensorFlow.js バージョン: ${tf.version.tfjs}`);
    logger.info(`使用中のバックエンド: ${tf.getBackend()}`);
    
    // 特徴抽出器の初期化
    featureExtractor = initializeFeatureExtractor();
    logger.info('特徴抽出器の初期化完了');
    
    // 感情分析器の初期化
    sentimentAnalyzer = initializeSentimentAnalyzer();
    logger.info('感情分析器の初期化完了');
    
    // モデルのロード（まだ実装されていない場合は空のモデルを使用）
    // 注: 実際の実装ではここでモデルをロードする
    models.sentiment = createDummyModel();
    logger.info('モデル初期化完了（実際のモデルがロードされるまではダミーモデルを使用）');
    
    initialized = true;
    logger.info('ML拡張機能の初期化完了');
    return true;
  } catch (error) {
    logger.exception(error, 'ML拡張機能の初期化に失敗:');
    initialized = false;
    return false;
  } finally {
    logger.endTimer(timer);
  }
}

/**
 * ダミーモデルの作成（実際のモデルがロードされるまでの代替）
 */
function createDummyModel() {
  return {
    predict: (text) => {
      // 簡易的な感情スコア計算
      const positiveWords = ['良い', '素晴らしい', '嬉しい', 'ありがとう', '好き'];
      const negativeWords = ['悪い', '残念', '嫌い', '問題', '悲しい'];
      
      let score = 0;
      
      positiveWords.forEach(word => {
        if (text.includes(word)) score += 1;
      });
      
      negativeWords.forEach(word => {
        if (text.includes(word)) score -= 1;
      });
      
      return {
        score,
        label: score > 0 ? 'positive' : (score < 0 ? 'negative' : 'neutral')
      };
    }
  };
}

/**
 * 特徴抽出器の初期化
 */
function initializeFeatureExtractor() {
  // 既存のパターンデータを使用した特徴抽出器
  return {
    extract: (text, history = []) => {
      const features = {
        // テキスト基本特徴
        textLength: text.length,
        hasQuestion: text.includes('？') || text.includes('?'),
        wordCount: text.split(/\s+/).length,
        
        // 文の種類
        sentenceTypes: {
          question: (text.match(/[？?]/g) || []).length,
          exclamation: (text.match(/[！!]/g) || []).length,
          statement: (text.match(/[。.]/g) || []).length
        },
        
        // 会話履歴統計
        historyStats: analyzeHistory(history)
      };
      
      // 既存のパターン検出を活用
      try {
        const patternResults = {};
        
        // 各パターンカテゴリでの検出
        const generalPatterns = localML.trainingData.general;
        
        for (const category in generalPatterns) {
          patternResults[category] = {};
          
          for (const subCategory in generalPatterns[category]) {
            const patterns = generalPatterns[category][subCategory];
            let count = 0;
            
            for (const pattern of patterns) {
              if (text.includes(pattern)) {
                count++;
              }
            }
            
            patternResults[category][subCategory] = count;
          }
        }
        
        features.patternMatches = patternResults;
      } catch (error) {
        logger.warn(`既存パターン検出中にエラー: ${error.message}`);
        features.patternMatches = {};
      }
      
      return features;
    }
  };
}

/**
 * 感情分析器の初期化
 */
function initializeSentimentAnalyzer() {
  // シンプルな感情分析器（実際の実装ではTensorFlowモデルを使用）
  return {
    analyze: (text) => {
      try {
        return models.sentiment.predict(text);
      } catch (error) {
        logger.warn(`感情分析中にエラー: ${error.message}`);
        return { score: 0, label: 'neutral' };
      }
    }
  };
}

/**
 * 会話履歴の分析
 */
function analyzeHistory(history) {
  if (!history || history.length === 0) {
    return { insufficient: true };
  }
  
  // 基本的な統計
  const messageLengths = history.map(h => h.message?.length || 0);
  const avgMessageLength = messageLengths.reduce((a, b) => a + b, 0) / messageLengths.length;
  
  // 質問の頻度
  const questionCount = history.filter(h => 
    h.message?.includes('？') || h.message?.includes('?')
  ).length;
  
  return {
    messageCount: history.length,
    avgMessageLength,
    questionFrequency: questionCount / history.length,
    timespan: history.length > 0 ? 
      new Date() - new Date(history[0].timestamp || Date.now()) : 0
  };
}

/**
 * メッセージの分析と応答拡張
 */
async function enhanceResponse(userId, userMessage, mode) {
  const timer = logger.startTimer(`ml_integration_enhance_${mode}`);
  
  try {
    logger.info(`拡張ML処理: mode=${mode}, userId=${userId}`);
    
    // 初期化チェック
    if (!initialized) {
      logger.warn('ML拡張機能が初期化されていません');
      throw new Error('ML拡張機能が初期化されていません');
    }
    
    // 1. ユーザーの会話履歴を取得
    const historyLimit = config.analysis.historyLimit;
    const conversationHistory = await getUserConversationHistory(userId, historyLimit);
    logger.debug(`${conversationHistory.length}件の会話履歴を取得`);
    
    // 2. 特徴抽出
    const features = featureExtractor.extract(userMessage, conversationHistory);
    logger.debug('特徴抽出完了');
    
    // 3. 感情分析
    const sentiment = sentimentAnalyzer.analyze(userMessage);
    logger.debug(`感情分析結果: ${sentiment.label} (${sentiment.score})`);
    
    // 4. モード別の分析実行
    let analysisResult = null;
    
    if (mode === 'general') {
      // 一般会話モードの分析
      analysisResult = analyzeGeneralConversation(
        userId, conversationHistory, userMessage, features, sentiment
      );
    } else {
      // 他のモードの場合は既存の方法を使用
      throw new Error(`モード '${mode}' はML拡張機能で実装されていません`);
    }
    
    // 5. 拡張機能マーカーを追加
    if (analysisResult) {
      analysisResult.ml_enhanced = true;
      analysisResult.ml_version = '0.1.0';
      analysisResult.ml_timestamp = new Date().toISOString();
    }
    
    // 6. 分析結果を保存
    if (analysisResult) {
      await saveEnhancedAnalysis(userId, mode, analysisResult, features);
    }
    
    logger.info(`拡張ML処理完了: mode=${mode}, userId=${userId}`);
    return analysisResult;
  } catch (error) {
    logger.exception(error, `拡張ML処理エラー: mode=${mode}, userId=${userId}`);
    throw error; // エラーを再スローしてラッパーのフォールバックを発動
  } finally {
    logger.endTimer(timer);
  }
}

/**
 * 一般会話モードの分析
 */
function analyzeGeneralConversation(userId, history, currentMessage, features, sentiment) {
  try {
    // 既存のlocalMLの方法を基本としつつ、拡張
    
    // 分析結果オブジェクト初期化
    const analysis = {
      traits: {},
      topics: {},
      response_preferences: {}
    };
    
    // 感情トーンの設定
    if (sentiment && sentiment.label) {
      analysis.traits.emotional_tone = sentiment.label;
    }
    
    // コミュニケーションスタイルの分析（既存のパターンを使用）
    if (features.patternMatches && features.patternMatches.communicationPatterns) {
      const styles = features.patternMatches.communicationPatterns;
      const dominantStyle = Object.keys(styles).reduce(
        (max, style) => styles[style] > styles[max] ? style : max,
        Object.keys(styles)[0]
      );
      
      if (dominantStyle) {
        analysis.traits.communication_style = dominantStyle;
      }
    }
    
    // 関心トピックの分析
    if (features.patternMatches && features.patternMatches.interestPatterns) {
      const topics = features.patternMatches.interestPatterns;
      const topTopics = Object.keys(topics)
        .sort((a, b) => topics[b] - topics[a])
        .slice(0, 2)
        .filter(topic => topics[topic] > 0);
      
      if (topTopics.length > 0) {
        analysis.topics.primary_interests = topTopics;
      }
    }
    
    // 応答設定の決定
    analysis.response_preferences = {
      length: features.textLength > 100 ? 'detailed' : 'balanced',
      tone: sentiment.label === 'positive' ? 'enthusiastic' : 'balanced'
    };
    
    // 拡張データの追加
    analysis.ml_features = {
      text_stats: {
        length: features.textLength,
        question: features.hasQuestion,
        word_count: features.wordCount
      },
      history_stats: features.historyStats,
      sentiment: sentiment
    };
    
    return analysis;
  } catch (error) {
    logger.exception(error, '一般会話分析エラー:');
    return null;
  }
}

/**
 * 拡張された分析結果の保存
 */
async function saveEnhancedAnalysis(userId, mode, analysisData, features) {
  const timer = logger.startTimer('save_enhanced_analysis');
  
  try {
    // 拡張データを追加
    const enhancedAnalysisData = {
      ...analysisData,
      ml_version: '0.1.0',
      ml_features: features,
      timestamp: new Date().toISOString()
    };
    
    // 既存のlocalML._saveUserAnalysisと同じインターフェイスで呼び出し
    await localML._saveUserAnalysis(userId, mode, enhancedAnalysisData);
    logger.info(`拡張分析データを保存: userId=${userId}, mode=${mode}`);
    
    return true;
  } catch (error) {
    logger.exception(error, '拡張分析データ保存エラー:');
    return false;
  } finally {
    logger.endTimer(timer);
  }
}

/**
 * ユーザー分析データのロード
 */
async function loadUserAnalysis(userId, mode) {
  const timer = logger.startTimer('load_user_analysis');
  
  try {
    // 既存の機能を使用
    const analysis = await localML.loadUserAnalysis(userId, mode);
    
    // 拡張データの存在チェック
    if (analysis && analysis.ml_enhanced) {
      logger.debug(`拡張ML分析データを読み込み: userId=${userId}, mode=${mode}`);
    } else {
      logger.debug(`通常の分析データを読み込み: userId=${userId}, mode=${mode}`);
    }
    
    return analysis;
  } catch (error) {
    logger.exception(error, 'ユーザー分析データ読み込みエラー:');
    throw error;
  } finally {
    logger.endTimer(timer);
  }
}

/**
 * パターン詳細の取得
 */
function getPatternDetails(mode) {
  try {
    // 既存のパターン詳細に拡張情報を追加
    const basePatterns = localML._getPatternDetails(mode);
    
    // ML拡張情報の追加
    return {
      ...basePatterns,
      ml_enhanced: true,
      ml_version: '0.1.0',
      sentiment_analysis: true
    };
  } catch (error) {
    logger.error(`パターン詳細取得エラー: ${error.message}`);
    return localML._getPatternDetails(mode);
  }
}

/**
 * パターンのロード
 */
function loadPatterns() {
  try {
    // 既存のパターンロード機能を使用
    return localML._loadPatterns();
  } catch (error) {
    logger.error(`パターンロードエラー: ${error.message}`);
    return {};
  }
}

module.exports = {
  initialize,
  enhanceResponse,
  loadUserAnalysis,
  getPatternDetails,
  loadPatterns
}; 