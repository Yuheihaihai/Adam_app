/**
 * ml-enhance/logger.js
 * 機械学習拡張機能の専用ロギングシステム
 * 詳細なログ記録と診断情報の提供
 */

const { config } = require('./config');
const fs = require('fs');
const path = require('path');

// ログレベルの数値化
const LOG_LEVELS = {
  'debug': 0,
  'info': 1,
  'warn': 2,
  'error': 3
};

// ログディレクトリの確認と作成
const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (error) {
    console.error(`ログディレクトリの作成に失敗: ${error.message}`);
  }
}

// ログファイルパス
const LOG_FILE = path.join(LOG_DIR, 'ml-enhance.log');

// 現在の設定ログレベル
const currentLogLevel = LOG_LEVELS[config.logging.level] || LOG_LEVELS['info'];

// パフォーマンスメトリクス記録
const performanceMetrics = {};

/**
 * タイムスタンプ付きログメッセージを生成
 */
const formatLogMessage = (level, message) => {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [ML-ENHANCE] [${level.toUpperCase()}] ${message}`;
};

/**
 * ログをファイルと標準出力に書き込む
 */
const writeLog = (level, message) => {
  // 設定されたログレベルより低いレベルのログは無視
  if (LOG_LEVELS[level] < currentLogLevel) {
    return;
  }
  
  const formattedMessage = formatLogMessage(level, message);
  
  // コンソールに出力
  if (level === 'error') {
    console.error(formattedMessage);
  } else if (level === 'warn') {
    console.warn(formattedMessage);
  } else {
    console.log(formattedMessage);
  }
  
  // ファイルに書き込み
  try {
    fs.appendFileSync(LOG_FILE, formattedMessage + '\n');
  } catch (error) {
    console.error(`ログファイルへの書き込みに失敗: ${error.message}`);
  }
};

/**
 * パフォーマンス計測開始
 */
const startPerformanceTimer = (operationName) => {
  if (!config.logging.performanceMetrics) return null;
  
  const timerId = `${operationName}_${Date.now()}`;
  performanceMetrics[timerId] = {
    operation: operationName,
    startTime: process.hrtime()
  };
  return timerId;
};

/**
 * パフォーマンス計測終了と記録
 */
const endPerformanceTimer = (timerId) => {
  if (!config.logging.performanceMetrics || !timerId || !performanceMetrics[timerId]) return;
  
  const metrics = performanceMetrics[timerId];
  const endTime = process.hrtime(metrics.startTime);
  const durationMs = (endTime[0] * 1000) + (endTime[1] / 1000000);
  
  writeLog('debug', `Performance [${metrics.operation}]: ${durationMs.toFixed(2)}ms`);
  
  delete performanceMetrics[timerId];
  return durationMs;
};

// ロギング関数
const logger = {
  debug: (message) => writeLog('debug', message),
  info: (message) => writeLog('info', message),
  warn: (message) => writeLog('warn', message),
  error: (message) => writeLog('error', message),
  
  // パフォーマンスロギング
  startTimer: startPerformanceTimer,
  endTimer: endPerformanceTimer,
  
  // 例外ロギング（スタックトレース付き）
  exception: (error, context = '') => {
    const message = `${context} ${error.message}\nStack: ${error.stack}`;
    writeLog('error', message);
  },
  
  // オブジェクト詳細ロギング（開発・デバッグ用）
  object: (obj, label = 'Object') => {
    if (currentLogLevel <= LOG_LEVELS['debug']) {
      try {
        writeLog('debug', `${label}: ${JSON.stringify(obj, null, 2)}`);
      } catch (error) {
        writeLog('error', `オブジェクトのログ記録に失敗 (${label}): ${error.message}`);
      }
    }
  }
};

// モジュール初期化時に設定情報をログ
logger.info(`ML拡張ロガー初期化 - レベル: ${config.logging.level}, パフォーマンスメトリクス: ${config.logging.performanceMetrics}`);

module.exports = logger; 