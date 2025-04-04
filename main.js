// main.js - アプリケーション起動スクリプト
// ml-enhance 用の環境変数もロード (先に読み込む)
try {
  require('dotenv').config({ path: './ml-enhance/.env' });
} catch (error) {
  console.log('ml-enhance/.env ファイルが見つからないため、デフォルトの設定を使用します');
}
// メインの .env ファイルをロード（ml-enhance/.env の値があれば上書きしない）
require('dotenv').config({ override: false }); 

// Make sure we use Heroku's PORT
console.log("HEROKU PORT ENV: ", process.env.PORT);

const db = require('./db');
const app = require('./server'); // expressアプリケーションオブジェクトをインポート

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
    // Ensure we read the PORT directly from the environment for Heroku
    const PORT = process.env.PORT || 3000;
    console.log(`Using PORT: ${PORT} (env: ${process.env.PORT})`);
    
    // Bind to 0.0.0.0 to accept all incoming connections
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`サーバーがポート ${PORT} で起動しました (host: 0.0.0.0)`);
      console.log('=== アプリケーション初期化完了 ===');
    });
    
  } catch (error) {
    console.error('アプリケーション初期化中にエラーが発生しました:', error);
    console.log('エラーはログに記録されました。サーバーを起動します。');
    
    // エラーがあってもサーバーは起動する
    const PORT = process.env.PORT || 3000;
    console.log(`エラー発生後、PORT: ${PORT} を使用します`);
    
    // Bind to 0.0.0.0 to accept all incoming connections
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`サーバーがポート ${PORT} で起動しました（エラーあり、host: 0.0.0.0）`);
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
