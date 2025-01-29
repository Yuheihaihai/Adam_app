const base = require('../config/airtable');

const JobAnalysis = {
  // 最新の分析結果を保存
  async saveAnalysis(userId, analysis) {
    try {
      const records = await base('JobAnalysis').create([
        {
          fields: {
            userId: userId,
            analysis: analysis,
            timestamp: new Date().toISOString()
          }
        }
      ]);
      return records[0];
    } catch (error) {
      console.error('Error saving to Airtable:', error);
      throw error;
    }
  },

  // 最新の分析結果を取得
  async getLatestAnalysis(userId) {
    try {
      const records = await base('JobAnalysis')
        .select({
          filterByFormula: `userId = '${userId}'`,
          sort: [{ field: 'timestamp', direction: 'desc' }],
          maxRecords: 1
        })
        .firstPage();
      
      return records.length > 0 ? records[0].fields : null;
    } catch (error) {
      console.error('Error fetching from Airtable:', error);
      throw error;
    }
  }
};

module.exports = JobAnalysis; 