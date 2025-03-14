#!/usr/bin/env node

/**
 * scripts/check-ml-status.js
 * 機械学習の状態を確認するためのコマンドラインスクリプト
 * 
 * 使用方法:
 * node scripts/check-ml-status.js
 */

// 環境変数の読み込み
require('dotenv').config();
try {
  require('dotenv').config({ path: './ml-enhance/.env' });
} catch (error) {
  console.log('ml-enhance/.env ファイルが見つからないため、デフォルト設定を使用します');
}

// モジュールの読み込み
let statusLogger;
let monitoring;

try {
  // モニタリングモジュールの初期化（非同期）
  async function initialize() {
    try {
      monitoring = require('../ml-enhance/monitoring');
      await monitoring.monitoringSystem.initialize();
      
      statusLogger = require('../ml-enhance/log-status');
      
      // 完了したら状態を表示
      statusLogger.printMachineLearningStatus();
      
      // プロセスを終了（ウェブサーバーではないので）
      setTimeout(() => process.exit(0), 100);
    } catch (error) {
      console.error('初期化に失敗しました:', error);
      process.exit(1);
    }
  }
  
  // 初期化を実行
  initialize();
} catch (error) {
  console.error(`
============================================================
  エラー: 機械学習モジュールの読み込みに失敗しました
============================================================

考えられる原因:
1. ml-enhanceモジュールがインストールされていない
2. 必要なデータベースに接続できない
3. 設定ファイルに問題がある

詳細エラー:
${error.message}
${error.stack}
`);
  process.exit(1);
} 