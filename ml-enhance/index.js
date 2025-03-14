/**
 * ml-enhance/index.js
 * 機械学習拡張モジュールのメインエントリーポイント
 * 既存のlocalML.jsと同じインターフェースを提供しながら機能を拡張
 */

const wrapper = require('./wrapper');
const logger = require('./logger');

// モジュール初期化
(async () => {
  try {
    await wrapper.initialize();
  } catch (error) {
    logger.error(`ML拡張モジュールの初期化に失敗: ${error.message}`);
  }
})();

// 既存のlocalML.jsと同じインターフェースをエクスポート
module.exports = {
  // メイン機能：会話分析と応答拡張
  enhanceResponse: wrapper.enhanceResponse,
  
  // ユーザー分析データの読み込み
  loadUserAnalysis: wrapper.loadUserAnalysis,
  
  // その他必要な関数もここでエクスポート
  _loadPatterns: wrapper.loadPatterns,
  _getPatternDetails: wrapper.getPatternDetails
}; 