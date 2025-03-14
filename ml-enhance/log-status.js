/**
 * ml-enhance/log-status.js
 * 機械学習の状態をログ形式で出力する機能
 */

const { monitoringSystem } = require('./monitoring');
const logger = require('./logger');

/**
 * 機械学習の状態をコンソールログとして表示
 */
function printMachineLearningStatus() {
  try {
    const metrics = monitoringSystem.getMetrics();
    const alerts = monitoringSystem.checkAlerts();
    
    // ステータス判定
    let systemStatus = 'healthy';
    if (alerts.some(alert => alert.severity === 'error')) {
      systemStatus = 'error';
    } else if (alerts.length > 0) {
      systemStatus = 'warning';
    }
    
    // ステータス表示用の記号
    const statusSymbol = {
      healthy: '✅',
      warning: '⚠️',
      error: '❌'
    };
    
    // 学習進捗の計算
    const trainingProgress = metrics.data.training.trainedRecords / 
      (metrics.data.training.totalRecords || 1) * 100;
    
    // 進捗バーの生成（ASCII形式）
    const progressBarLength = 20;
    const filledBlocks = Math.round((trainingProgress / 100) * progressBarLength);
    const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(progressBarLength - filledBlocks);
    
    // 境界線
    const separator = '='.repeat(80);
    const smallSeparator = '-'.repeat(80);
    
    // ログ出力
    console.log(separator);
    console.log(`機械学習ステータスレポート [${new Date().toLocaleString('ja-JP')}]`);
    console.log(separator);
    
    // 全体的なステータス
    console.log(`\n${statusSymbol[systemStatus]} 全体ステータス: ${getStatusText(systemStatus)}`);
    
    // ステータスの詳細説明
    console.log(`\n${getExplanationText(metrics, trainingProgress, systemStatus)}`);
    
    console.log(smallSeparator);
    
    // 進捗バー
    console.log(`\n学習進捗: ${Math.round(trainingProgress)}%`);
    console.log(`[${progressBar}]`);
    
    console.log(smallSeparator);
    
    // 主要指標
    console.log('\n主要指標:');
    console.log(`• 分析済データ: ${metrics.data.training.trainedRecords || 0} / ${metrics.data.training.totalRecords || 0} 件`);
    console.log(`• モデル精度: ${Math.round(metrics.data.model.accuracy * 100 || 0)}%`);
    console.log(`• モデルバージョン: ${metrics.data.model.version || '未定義'}`);
    console.log(`• データベース使用量: ${formatSize(metrics.data.database.size || 0)}`);
    
    // アラートがある場合
    if (alerts.length > 0) {
      console.log(smallSeparator);
      console.log('\n警告/エラー:');
      alerts.forEach((alert, index) => {
        const alertSymbol = alert.severity === 'error' ? '❌' : '⚠️';
        console.log(`${alertSymbol} [${alert.type}] ${alert.message}`);
      });
    }
    
    console.log(separator);
    console.log('実行中のプロセス:');
    console.log(`• TensorFlow.jsバックエンド: ${process.env.ML_TF_BACKEND || 'cpu'}`);
    console.log(`• モード: ${process.env.ML_MODE_GENERAL === 'true' ? '一般' : 'その他'}`);
    console.log(`• フォールバック: ${process.env.ML_USE_FALLBACK !== 'false' ? '有効' : '無効'}`);
    console.log(separator);
    
    return true;
  } catch (error) {
    console.error('機械学習ステータスのログ出力に失敗:', error);
    return false;
  }
}

/**
 * ステータスに対応するテキストを返す
 */
function getStatusText(status) {
  switch (status) {
    case 'healthy':
      return '正常';
    case 'warning':
      return '注意（一部問題あり）';
    case 'error':
      return '異常（問題発生中）';
    default:
      return '不明';
  }
}

/**
 * 機械学習の状態説明を返す
 */
function getExplanationText(metrics, progress, status) {
  if (status === 'error') {
    return '機械学習システムに問題が発生しています。エラーログを確認してください。';
  } else if (status === 'warning') {
    return '機械学習システムは動作していますが、一部最適でない状態です。詳細は警告を確認してください。';
  } else {
    if (progress < 30) {
      return '機械学習プロセスが初期段階で動作中です。十分なデータが集まるとパフォーマンスが向上します。';
    } else if (progress < 70) {
      return '機械学習プロセスが順調に進行中です。モデルは継続的に学習を行っています。';
    } else {
      return '機械学習プロセスが高いパフォーマンスで動作中です。モデルは十分なデータを学習済みです。';
    }
  }
}

/**
 * ファイルサイズを読みやすい形式にフォーマット
 */
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * モニタリングデータを短い形式でログに出力
 */
function logBriefStatus() {
  try {
    const metrics = monitoringSystem.getMetrics();
    const trainingProgress = metrics.data.training.trainedRecords / 
      (metrics.data.training.totalRecords || 1) * 100;
    
    logger.info(
      `[ML状態] 進捗:${Math.round(trainingProgress)}%, ` +
      `精度:${Math.round(metrics.data.model.accuracy * 100 || 0)}%, ` +
      `データ:${metrics.data.training.trainedRecords || 0}/${metrics.data.training.totalRecords || 0}, ` +
      `V:${metrics.data.model.version || '?.?.?'}`
    );
    
    return true;
  } catch (error) {
    logger.error('ステータスログの出力に失敗:', error);
    return false;
  }
}

module.exports = {
  printMachineLearningStatus,
  logBriefStatus
}; 