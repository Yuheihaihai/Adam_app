/**
 * ml-enhance/index.js
 * 機械学習拡張モジュールのメインエントリーポイント
 * 既存のlocalML.jsと同じインターフェースを提供しながら機能を拡張
 */

const wrapper = require('./wrapper');
const logger = require('./logger');
const { monitoringSystem } = require('./monitoring');
const { config } = require('./config');

// モジュール初期化
(async () => {
  try {
    await wrapper.initialize();
  } catch (error) {
    logger.error(`ML拡張モジュールの初期化に失敗: ${error.message}`);
  }
})();

// モニタリングシステムの初期化を追加
async function initialize() {
  try {
    logger.info('ML拡張機能の初期化を開始');
    
    // モニタリングシステムの初期化
    await monitoringSystem.initialize();
    
    // ... existing initialization code ...
    
    logger.info('ML拡張機能の初期化が完了');
  } catch (error) {
    logger.error('ML拡張機能の初期化に失敗:', error);
    throw error;
  }
}

// メトリクス取得エンドポイントを追加
async function getMetrics() {
  try {
    const metrics = monitoringSystem.getMetrics();
    const alerts = monitoringSystem.checkAlerts();
    
    return {
      metrics,
      alerts,
      status: 'healthy'
    };
  } catch (error) {
    logger.error('メトリクスの取得に失敗:', error);
    throw error;
  }
}

// 既存のlocalML.jsと同じインターフェースをエクスポート
module.exports = {
  // メイン機能：会話分析と応答拡張
  enhanceResponse: wrapper.enhanceResponse,
  
  // ユーザー分析データの読み込み
  loadUserAnalysis: wrapper.loadUserAnalysis,
  
  // その他必要な関数もここでエクスポート
  _loadPatterns: wrapper.loadPatterns,
  _getPatternDetails: wrapper.getPatternDetails,
  initialize,
  getMetrics
}; 