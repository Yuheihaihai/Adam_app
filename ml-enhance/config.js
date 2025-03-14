/**
 * ml-enhance/config.js
 * 機械学習拡張機能の構成管理
 * 環境変数からの設定読み込みと、デフォルト値の設定
 */

// 環境変数から設定を読み込み、デフォルト値を設定
const config = {
  // メインスイッチ: 機械学習拡張機能の有効/無効
  enabled: process.env.ML_ENHANCED === 'true',

  // モード別の設定
  modes: {
    general: process.env.ML_MODE_GENERAL === 'true',
    career: process.env.ML_MODE_CAREER === 'true',
    // 他のモードも同様に追加可能
  },

  // フォールバック: エラー時に既存システムを使用するか
  fallback: {
    enabled: process.env.ML_USE_FALLBACK !== 'false',
    maxRetries: parseInt(process.env.ML_MAX_RETRIES || '3')
  },

  // 学習と分析の設定
  analysis: {
    historyLimit: parseInt(process.env.ML_HISTORY_LIMIT || '200'),
    confidenceThreshold: parseFloat(process.env.ML_CONFIDENCE_THRESHOLD || '0.7')
  },

  // ロギング設定
  logging: {
    // ログレベル: debug, info, warn, error
    level: process.env.ML_LOG_LEVEL || 'info',
    // 詳細なパフォーマンス測定を記録するか
    performanceMetrics: process.env.ML_LOG_PERFORMANCE === 'true'
  },

  // TensorFlow.js設定
  tensorflow: {
    // バックエンドの指定（node、wasm、cpu、webgl）
    backend: process.env.ML_TF_BACKEND || 'cpu',
    // メモリ制限（MB）
    memoryLimit: parseInt(process.env.ML_TF_MEMORY_LIMIT || '4096')
  }
};

// 現在の構成のサマリーを返す関数
const getConfigSummary = () => {
  return {
    enabled: config.enabled,
    modes: config.modes,
    fallbackEnabled: config.fallback.enabled,
    loggingLevel: config.logging.level
  };
};

module.exports = {
  config,
  getConfigSummary
}; 