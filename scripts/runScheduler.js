const runWeeklyAnalysis = require('../scheduler/weeklyAnalysis');

// スケジューラーから呼び出される関数
async function runScheduledTask() {
  console.log('Starting scheduled task...');
  await runWeeklyAnalysis();
  console.log('Scheduled task completed');
}

// スクリプトが直接実行された場合
if (require.main === module) {
  runScheduledTask()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Scheduler error:', error);
      process.exit(1);
    });
} 