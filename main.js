// main.js - アプリケーション起動スクリプト
require('dotenv').config();
const db = require('./db');
const server = require('./server');

// アプリケーション起動時の初期化処理
async function initialize() {
  try {
    console.log('=== アプリケーション初期化開始 ===');
    
    // データベース接続テスト
    console.log('1. データベース接続テスト実行中...');
    const dbConnected = await db.testConnection();
    
    if (!dbConnected) {
      console.error('データベース接続に失敗しました。アプリケーションを続行します。');
    } else {
      console.log('データベース接続に成功しました。');
      
      // pgvector拡張の有効化を試みる
      try {
        console.log('2. pgvector拡張の有効化を試みています...');
        await db.query('CREATE EXTENSION IF NOT EXISTS vector;');
        console.log('pgvector拡張が有効化されました。');
      } catch (pgvectorError) {
        console.warn('pgvector拡張の有効化に失敗しました:', pgvectorError.message);
        console.warn('セマンティック検索機能が制限される可能性があります。');
      }
      
      // テーブル初期化
      console.log('3. データベーステーブルの初期化中...');
      const tablesInitialized = await db.initializeTables();
      
      if (tablesInitialized) {
        console.log('データベーステーブルが正常に初期化されました。');
      } else {
        console.error('データベーステーブルの初期化に失敗しました。一部の機能が動作しない可能性があります。');
      }
    }
    
    // 定期的なクリーンアップタスクをスケジュール
    scheduleCleanupTasks();
    
    // アプリケーションの起動
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`サーバーがポート ${PORT} で起動しました`);
      console.log('=== アプリケーション初期化完了 ===');
    });
    
  } catch (error) {
    console.error('アプリケーション初期化中にエラーが発生しました:', error);
    console.log('エラーはログに記録されました。サーバーを起動します。');
    
    // エラーがあってもサーバーは起動する
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`サーバーがポート ${PORT} で起動しました（エラーあり）`);
    });
  }
}

// 定期的なクリーンアップタスク
function scheduleCleanupTasks() {
  // 古いembeddingを1日1回クリーンアップ
  const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24時間
  
  setInterval(async () => {
    try {
      console.log('古いembeddingのクリーンアップを実行中...');
      await db.query('SELECT cleanup_old_embeddings();');
      console.log('クリーンアップ完了');
    } catch (error) {
      console.error('クリーンアップ中にエラーが発生しました:', error.message);
    }
  }, CLEANUP_INTERVAL);
  
  console.log(`クリーンアップタスクが ${CLEANUP_INTERVAL/1000/60/60} 時間ごとにスケジュールされました`);
}

// アプリケーションを初期化
initialize().catch(err => {
  console.error('初期化処理で予期しないエラーが発生しました:', err);
});
