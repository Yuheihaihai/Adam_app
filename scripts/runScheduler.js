const runWeeklyAnalysis = require('../scheduler/weeklyAnalysis');
const schedule = require('node-schedule');
const { runDiscoveryOnce } = require('../vendorDiscovery');

// スケジューラーから呼び出される関数
async function runScheduledTask() {
  console.log('Starting scheduled task...');
  await runWeeklyAnalysis();
  console.log('Scheduled task completed');
}

// スクリプトが直接実行された場合
if (require.main === module) {
  // 月次ベンダーディスカバリ（毎月1日 03:00 UTC）
  schedule.scheduleJob('0 3 1 * *', async () => {
    try {
      console.log('[Scheduler] Monthly vendor discovery started');
      const result = await runDiscoveryOnce();
      console.log('[Scheduler] Monthly vendor discovery finished', result);
    } catch (e) {
      console.error('[Scheduler] Monthly vendor discovery failed', e);
    }
  });

  // 既存の週次分析を即時1回実行
  runScheduledTask()
    .then(() => console.log('[Scheduler] bootstrap done'))
    .catch(error => console.error('Scheduler error:', error));
} 