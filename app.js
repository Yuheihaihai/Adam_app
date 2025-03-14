// 環境変数読み込み
require('dotenv').config();

// ml-enhance用の環境変数もロード（存在する場合）
try {
  require('dotenv').config({ path: './ml-enhance/.env' });
} catch (error) {
  console.log('ml-enhance/.env ファイルが見つからないため、デフォルトの設定を使用します');
}

const express = require('express');
const path = require('path');
const { dashboard } = require('./ml-enhance/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

// 静的ファイルの提供
app.use(express.static('public'));

// JSONボディパーサーの追加
app.use(express.json());

// 機械学習ダッシュボードのルート
app.get('/ml-dashboard', (req, res) => {
  // ml-enhanceモジュールが利用可能かチェック
  try {
    const { generateDashboardHtml } = require('./ml-enhance/dashboard');
    const html = generateDashboardHtml();
    res.send(html);
  } catch (error) {
    res.status(500).send(`
      <h1>機械学習ダッシュボードエラー</h1>
      <p>ダッシュボードの読み込みに失敗しました: ${error.message}</p>
      <p><a href="/">ホームに戻る</a></p>
    `);
  }
});

// 機械学習ステータスAPIエンドポイント（JSONデータとして提供）
app.get('/api/ml-status', (req, res) => {
  try {
    const { getDashboardData } = require('./ml-enhance/dashboard');
    const data = getDashboardData();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: true,
      message: `機械学習ステータスの取得に失敗: ${error.message}`
    });
  }
});

// サーバーの起動
app.listen(PORT, () => {
  console.log(`サーバーが起動しました: http://localhost:${PORT}`);
  console.log('機械学習ダッシュボード: http://localhost:${PORT}/ml-dashboard');
}); 