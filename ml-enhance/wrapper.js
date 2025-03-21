/**
 * ml-enhance/wrapper.js
 * 機械学習拡張機能と既存システムとの統合ラッパー
 * 既存システムと同じインターフェースを提供しながら、フォールバック機構を実装
 */

const localML = require('../localML'); // 既存の機械学習モジュール
const integration = require('./integration'); // 新しい機械学習モジュール
const logger = require('./logger');
// Import the entire config module with both config object and getConfigSummary function
const configModule = require('./config');
const { config } = configModule;

// 初期化フラグ
let initialized = false;

/**
 * ラッパーモジュールの初期化
 */
async function initialize() {
  const timer = logger.startTimer('wrapper_initialize');
  
  try {
    logger.info('ML拡張ラッパーの初期化を開始');
    
    // システム構成の記録 - Use getConfigSummary from the module
    logger.info(`ML構成: ${JSON.stringify(configModule.getConfigSummary())}`);
    
    // 拡張MLシステムの初期化（メインスイッチがONの場合のみ）
    if (config.enabled) {
      logger.info('拡張ML機能を初期化');
      await integration.initialize();
      logger.info('拡張ML機能の初期化完了');
    } else {
      logger.info('拡張ML機能は無効化されています（環境変数ML_ENHANCED=trueで有効化）');
    }
    
    initialized = true;
    logger.info('ML拡張ラッパーの初期化完了');
    return true;
  } catch (error) {
    logger.exception(error, 'ML拡張ラッパーの初期化に失敗:');
    initialized = false;
    return false;
  } finally {
    logger.endTimer(timer);
  }
}

/**
 * メッセージの分析と応答拡張（既存のenhanceResponse関数と同じインターフェース）
 */
async function enhanceResponse(userId, userMessage, mode) {
  const timer = logger.startTimer(`enhance_response_${mode}`);
  
  try {
    // 機能が無効か初期化されていない場合は既存システムを使用
    if (!config.enabled || !initialized) {
      logger.debug(`既存システムを使用: mode=${mode}, userId=${userId}`);
      return await localML.enhanceResponse(userId, userMessage, mode);
    }
    
    // モード別の設定チェック
    if (!config.modes[mode]) {
      logger.debug(`モード '${mode}' の拡張は無効です。既存システムを使用: userId=${userId}`);
      return await localML.enhanceResponse(userId, userMessage, mode);
    }
    
    logger.info(`拡張ML分析を実行: mode=${mode}, userId=${userId}`);
    logger.debug(`ユーザーメッセージ: ${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}`);
    
    // 拡張MLシステムで分析を試行
    try {
      const result = await integration.enhanceResponse(userId, userMessage, mode);
      
      // 結果のロギング
      if (result) {
        logger.debug(`ML分析結果: ${JSON.stringify(result).substring(0, 200)}...`);
        logger.info(`拡張ML分析成功: mode=${mode}, userId=${userId}`);
      } else {
        logger.warn(`拡張ML分析が空の結果を返しました: mode=${mode}, userId=${userId}`);
      }
      
      return result;
    } catch (error) {
      // 拡張ML処理でエラーが発生した場合のフォールバック
      logger.exception(error, `拡張ML処理エラー: mode=${mode}, userId=${userId}`);
      
      if (config.fallback.enabled) {
        logger.warn(`既存システムにフォールバック: mode=${mode}, userId=${userId}`);
        return await localML.enhanceResponse(userId, userMessage, mode);
      } else {
        // フォールバックが無効の場合はエラー再スロー
        throw error;
      }
    }
  } catch (error) {
    logger.exception(error, `致命的なエラー: mode=${mode}, userId=${userId}`);
    
    // 最終手段として既存システムを使用
    try {
      logger.warn(`最終フォールバックを試行: mode=${mode}, userId=${userId}`);
      return await localML.enhanceResponse(userId, userMessage, mode);
    } catch (finalError) {
      logger.error(`最終フォールバックも失敗: ${finalError.message}`);
      return null; // または基本的な応答オブジェクト
    }
  } finally {
    logger.endTimer(timer);
  }
}

/**
 * ユーザー分析データのロード（既存のloadUserAnalysis関数と同じインターフェース）
 */
async function loadUserAnalysis(userId, mode) {
  const timer = logger.startTimer(`load_user_analysis_${mode}`);
  
  try {
    // 機能が無効か初期化されていない場合は既存システムを使用
    if (!config.enabled || !initialized) {
      return await localML.loadUserAnalysis(userId, mode);
    }
    
    // モード別の設定チェック
    if (!config.modes[mode]) {
      return await localML.loadUserAnalysis(userId, mode);
    }
    
    logger.debug(`拡張MLユーザー分析読み込み: mode=${mode}, userId=${userId}`);
    
    // 拡張MLシステムでデータ読み込みを試行
    try {
      return await integration.loadUserAnalysis(userId, mode);
    } catch (error) {
      // エラー時のフォールバック
      logger.exception(error, `拡張MLデータ読み込みエラー: mode=${mode}, userId=${userId}`);
      
      if (config.fallback.enabled) {
        logger.warn(`既存システムにフォールバック: mode=${mode}, userId=${userId}`);
        return await localML.loadUserAnalysis(userId, mode);
      } else {
        throw error;
      }
    }
  } catch (error) {
    logger.exception(error, `致命的なデータ読み込みエラー: mode=${mode}, userId=${userId}`);
    
    // 最終手段として既存システムを使用
    try {
      return await localML.loadUserAnalysis(userId, mode);
    } catch (finalError) {
      logger.error(`最終フォールバックも失敗: ${finalError.message}`);
      return null;
    }
  } finally {
    logger.endTimer(timer);
  }
}

/**
 * パターン詳細の取得（既存の_getPatternDetails関数と同じインターフェース）
 */
function getPatternDetails(mode) {
  try {
    // 機能が無効か初期化されていない場合は既存システムを使用
    if (!config.enabled || !initialized) {
      return localML._getPatternDetails(mode);
    }
    
    // 拡張MLシステムで詳細取得を試行
    try {
      return integration.getPatternDetails(mode);
    } catch (error) {
      // エラー時のフォールバック
      logger.warn(`パターン詳細取得エラー: ${error.message}`);
      return localML._getPatternDetails(mode);
    }
  } catch (error) {
    logger.error(`致命的なパターン詳細取得エラー: ${error.message}`);
    return {}; // 空オブジェクトを返す
  }
}

/**
 * パターンのロード（既存の_loadPatterns関数と同じインターフェース）
 */
function loadPatterns() {
  try {
    // 機能が無効か初期化されていない場合は既存システムを使用
    if (!config.enabled || !initialized) {
      return localML._loadPatterns();
    }
    
    // 拡張MLシステムでパターンロードを試行
    try {
      return integration.loadPatterns();
    } catch (error) {
      // エラー時のフォールバック
      logger.warn(`パターンロードエラー: ${error.message}`);
      return localML._loadPatterns();
    }
  } catch (error) {
    logger.error(`致命的なパターンロードエラー: ${error.message}`);
    return {}; // 空オブジェクトを返す
  }
}

module.exports = {
  initialize,
  enhanceResponse,
  loadUserAnalysis,
  getPatternDetails,
  loadPatterns
}; 