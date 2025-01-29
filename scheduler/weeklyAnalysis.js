const schedule = require('node-schedule');
const JobAnalysis = require('../models/jobAnalysis');
const perplexity = require('../services/perplexity');

// 毎週日曜日の12:00 UTCに実行
const rule = new schedule.RecurrenceRule();
rule.dayOfWeek = 0;  // 0 = Sunday
rule.hour = 12;
rule.minute = 0;
rule.tz = 'Etc/UTC';

function startScheduler() {
  console.log('Starting weekly job scheduler...');
  
  const job = schedule.scheduleJob(rule, async function() {
    try {
      console.log('Running weekly analysis...');
      // TODO: ユーザーリストの取得ロジックを実装
      const users = ['user1', 'user2']; // 仮のユーザーリスト
      
      for (const userId of users) {
        const jobTrendsData = await perplexity.getJobTrends('job market trends');
        
        if (jobTrendsData?.analysis) {
          await JobAnalysis.saveAnalysis(userId, jobTrendsData.analysis);
          console.log(`Analysis saved for user: ${userId}`);
        }
      }
      
      console.log('Weekly analysis completed');
    } catch (error) {
      console.error('Error in weekly analysis:', error);
    }
  });
  
  return job;
}

module.exports = startScheduler; 