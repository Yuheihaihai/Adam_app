/**
 * ml-enhance/dashboard.js
 * 機械学習動作状況ダッシュボードの生成
 */

const { monitoringSystem } = require('./monitoring');
const logger = require('./logger');

// 視覚的なステータスの生成
function generateVisualStatus() {
  const metrics = monitoringSystem.getMetrics();
  const alerts = monitoringSystem.checkAlerts();
  
  // 簡単なステータス判定（問題なし/注意/警告）
  let systemStatus = 'healthy';
  if (alerts.some(alert => alert.severity === 'error')) {
    systemStatus = 'error';
  } else if (alerts.length > 0) {
    systemStatus = 'warning';
  }
  
  // 視覚的なインジケーター用の絵文字
  const statusEmoji = {
    healthy: '🟢',
    warning: '🟡',
    error: '🔴'
  };
  
  // 学習進捗の計算（0-100%）
  const trainingProgress = metrics.data.training.trainedRecords / 
    (metrics.data.training.totalRecords || 1) * 100;
  
  // 簡易的なプログレスバー表示（10ブロック）
  const progressBarLength = 10;
  const filledBlocks = Math.round((trainingProgress / 100) * progressBarLength);
  const progressBar = '■'.repeat(filledBlocks) + '□'.repeat(progressBarLength - filledBlocks);
  
  return {
    emoji: statusEmoji[systemStatus] || '⚪',
    status: systemStatus,
    progressBar,
    trainingProgress: Math.round(trainingProgress)
  };
}

// ダッシュボードHTMLの生成
function generateDashboardHtml() {
  const metrics = monitoringSystem.getMetrics();
  const visual = generateVisualStatus();
  
  // 最終更新時刻のフォーマット
  const lastUpdate = metrics.lastUpdate ? 
    new Date(metrics.lastUpdate).toLocaleString('ja-JP') : 
    '情報なし';
  
  // 機械学習状態の簡易説明
  const mlStatusExplanation = getSimpleStatusExplanation(metrics, visual);
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>機械学習システム状況</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 1000px;
          margin: 0 auto;
          padding: 20px;
        }
        .dashboard {
          border-radius: 10px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          overflow: hidden;
          margin-bottom: 30px;
        }
        .header {
          background: #4a6fa5;
          color: white;
          padding: 20px;
          font-size: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .header .emoji {
          font-size: 32px;
          margin-right: 10px;
        }
        .content {
          padding: 20px;
          background: white;
        }
        .status-card {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          border-left: 5px solid #4a6fa5;
        }
        .status-healthy { border-color: #28a745; }
        .status-warning { border-color: #ffc107; }
        .status-error { border-color: #dc3545; }
        
        .metrics {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
          margin-top: 20px;
        }
        .metric-card {
          background: white;
          border-radius: 8px;
          padding: 15px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .metric-title {
          font-size: 14px;
          color: #666;
          margin-bottom: 5px;
        }
        .metric-value {
          font-size: 24px;
          font-weight: bold;
          color: #333;
        }
        .progress-bar {
          letter-spacing: -2px;
          font-size: 24px;
          line-height: 1;
        }
        .footer {
          padding: 15px 20px;
          background: #f8f9fa;
          font-size: 12px;
          color: #666;
          text-align: right;
        }
        @media (max-width: 600px) {
          .metrics {
            grid-template-columns: 1fr;
          }
        }
      </style>
    </head>
    <body>
      <div class="dashboard">
        <div class="header">
          <div>
            <span class="emoji">${visual.emoji}</span>
            機械学習システム状況
          </div>
          <div style="font-size: 16px; opacity: 0.8;">
            Version ${metrics.data.model.version || '---'}
          </div>
        </div>
        
        <div class="content">
          <div class="status-card status-${visual.status}">
            <h2>機械学習ステータス</h2>
            <p style="font-size: 18px; margin-bottom: 5px;">
              ${mlStatusExplanation}
            </p>
            <div style="margin: 15px 0;">
              <div style="margin-bottom: 5px;">学習進捗:</div>
              <div class="progress-bar">${visual.progressBar}</div>
              <div style="text-align: right;">${visual.trainingProgress}%</div>
            </div>
          </div>
          
          <div class="metrics">
            <div class="metric-card">
              <div class="metric-title">分析済データ</div>
              <div class="metric-value">${metrics.data.training.trainedRecords || 0} / ${metrics.data.training.totalRecords || 0}</div>
            </div>
            
            <div class="metric-card">
              <div class="metric-title">モデル精度</div>
              <div class="metric-value">${Math.round(metrics.data.model.accuracy || 0)}%</div>
            </div>
            
            <div class="metric-card">
              <div class="metric-title">過去24時間のエラー数</div>
              <div class="metric-value">${metrics.data.errors.count || 0}</div>
            </div>
            
            <div class="metric-card">
              <div class="metric-title">データベース使用量</div>
              <div class="metric-value">${formatSize(metrics.data.database.size || 0)}</div>
            </div>
          </div>
        </div>
        
        <div class="footer">
          最終更新: ${lastUpdate}
        </div>
      </div>
    </body>
    </html>
  `;
}

// 機械学習の状態説明（非専門家向け）
function getSimpleStatusExplanation(metrics, visual) {
  // 状態に応じて説明を変える
  if (visual.status === 'error') {
    return '⚠️ 機械学習に問題が発生しています。技術チームが対応中です。';
  } else if (visual.status === 'warning') {
    return '⚠️ 機械学習は動作していますが、一部最適でない状態です。';
  } else {
    // 健全状態のときは、現在の学習段階に応じたメッセージ
    if (visual.trainingProgress < 30) {
      return '🚀 機械学習が始まっています！まだ学習初期段階ですが、これから賢くなります。';
    } else if (visual.trainingProgress < 70) {
      return '📈 機械学習が順調に進んでいます。システムは着実に賢くなっています。';
    } else {
      return '🎉 機械学習が正常に動作中です！システムはデータから積極的に学習しています。';
    }
  }
}

// ファイルサイズのフォーマット
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ダッシュボードデータの取得（APIエンドポイント用）
function getDashboardData() {
  const metrics = monitoringSystem.getMetrics();
  const visual = generateVisualStatus();
  const explanation = getSimpleStatusExplanation(metrics, visual);
  
  return {
    status: visual.status,
    statusEmoji: visual.emoji,
    progressPercent: visual.trainingProgress,
    progressBar: visual.progressBar,
    explanation: explanation,
    trainedRecords: metrics.data.training.trainedRecords || 0,
    totalRecords: metrics.data.training.totalRecords || 0,
    modelAccuracy: Math.round(metrics.data.model.accuracy || 0),
    errorCount: metrics.data.errors.count || 0,
    lastUpdate: metrics.lastUpdate
  };
}

module.exports = {
  generateDashboardHtml,
  getDashboardData
}; 