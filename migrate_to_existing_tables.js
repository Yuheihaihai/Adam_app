require('dotenv').config();
const Airtable = require('airtable');
const db = require('./db');

class ExistingTableMigration {
  constructor() {
    this.base = new Airtable({ 
      apiKey: process.env.AIRTABLE_API_KEY 
    }).base(process.env.AIRTABLE_BASE_ID);
    
    this.stats = {
      conversationHistory: { processed: 0, migrated: 0, errors: 0 },
      userAnalysis: { processed: 0, migrated: 0, errors: 0 },
      jobAnalysis: { processed: 0, migrated: 0, errors: 0 }
    };
  }

  async migrateConversationHistory() {
    console.log('📨 ConversationHistory → user_messages テーブルに移行中...');
    
    try {
      let processedCount = 0;
      let migratedCount = 0;
      let errorCount = 0;

      await this.base('ConversationHistory').select({
        maxRecords: 10000
      }).eachPage(async (records, fetchNextPage) => {
        
        for (const record of records) {
          processedCount++;
          
          try {
            const fields = record.fields;
            
            // Airtableフィールドを既存テーブル構造にマッピング
            const messageData = {
              user_id: fields.user_id || fields.userId || 'unknown',
              message_id: fields.message_id || fields.messageId || record.id,
              content: fields.content || fields.message || '',
              role: fields.role || 'user',
              mode: fields.mode || 'general',
              message_type: fields.message_type || fields.messageType || 'text',
              timestamp: fields.timestamp ? new Date(fields.timestamp) : new Date(record._createdTime)
            };

            // 既存のuser_messagesテーブルに挿入
            await db.query(`
              INSERT INTO user_messages 
              (user_id, message_id, content, role, mode, message_type, timestamp)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              ON CONFLICT (message_id) DO NOTHING
            `, [
              messageData.user_id,
              messageData.message_id,
              messageData.content,
              messageData.role,
              messageData.mode,
              messageData.message_type,
              messageData.timestamp
            ]);

            migratedCount++;
            
            if (migratedCount % 100 === 0) {
              console.log(`  ✓ ${migratedCount}件移行完了...`);
            }
            
          } catch (error) {
            errorCount++;
            console.error(`  ❌ レコード移行エラー:`, error.message);
          }
        }
        
        fetchNextPage();
      });

      this.stats.conversationHistory = { 
        processed: processedCount, 
        migrated: migratedCount, 
        errors: errorCount 
      };
      
      console.log(`✅ ConversationHistory移行完了: ${migratedCount}/${processedCount}件`);
      
    } catch (error) {
      console.error('❌ ConversationHistory移行エラー:', error.message);
    }
  }

  async migrateUserAnalysis() {
    console.log('📊 UserAnalysis → analysis_results テーブルに移行中...');
    
    try {
      let processedCount = 0;
      let migratedCount = 0;
      let errorCount = 0;

      await this.base('UserAnalysis').select({
        maxRecords: 10000
      }).eachPage(async (records, fetchNextPage) => {
        
        for (const record of records) {
          processedCount++;
          
          try {
            const fields = record.fields;
            
            // 分析データをJSONB形式で保存
            const analysisData = {
              user_id: fields.user_id || fields.userId || 'unknown',
              result_type: 'user_analysis',
              data: {
                sentiment_score: fields.sentiment_score,
                tone_analysis: fields.tone_analysis,
                communication_style: fields.communication_style,
                personality_insights: fields.personality_insights,
                growth_areas: fields.growth_areas,
                interview_readiness: fields.interview_readiness,
                confidence_level: fields.confidence_level,
                original_airtable_id: record.id,
                ...fields // その他のフィールドも保持
              },
              timestamp: fields.timestamp ? new Date(fields.timestamp) : new Date(record._createdTime)
            };

            // 既存のanalysis_resultsテーブルに挿入
            await db.query(`
              INSERT INTO analysis_results 
              (user_id, result_type, data, timestamp)
              VALUES ($1, $2, $3, $4)
            `, [
              analysisData.user_id,
              analysisData.result_type,
              JSON.stringify(analysisData.data),
              analysisData.timestamp
            ]);

            migratedCount++;
            
            if (migratedCount % 100 === 0) {
              console.log(`  ✓ ${migratedCount}件移行完了...`);
            }
            
          } catch (error) {
            errorCount++;
            console.error(`  ❌ レコード移行エラー:`, error.message);
          }
        }
        
        fetchNextPage();
      });

      this.stats.userAnalysis = { 
        processed: processedCount, 
        migrated: migratedCount, 
        errors: errorCount 
      };
      
      console.log(`✅ UserAnalysis移行完了: ${migratedCount}/${processedCount}件`);
      
    } catch (error) {
      console.error('❌ UserAnalysis移行エラー:', error.message);
    }
  }

  async migrateJobAnalysis() {
    console.log('💼 JobAnalysis → analysis_results テーブルに移行中...');
    
    try {
      let processedCount = 0;
      let migratedCount = 0;
      let errorCount = 0;

      await this.base('JobAnalysis').select({
        maxRecords: 1000
      }).eachPage(async (records, fetchNextPage) => {
        
        for (const record of records) {
          processedCount++;
          
          try {
            const fields = record.fields;
            
            // 求人分析データをJSONB形式で保存
            const jobData = {
              user_id: fields.user_id || fields.userId || 'system',
              result_type: 'job_analysis',
              data: {
                job_title: fields.job_title,
                company: fields.company,
                requirements: fields.requirements,
                skills_match: fields.skills_match,
                salary_range: fields.salary_range,
                match_score: fields.match_score,
                recommendations: fields.recommendations,
                original_airtable_id: record.id,
                ...fields // その他のフィールドも保持
              },
              timestamp: fields.timestamp ? new Date(fields.timestamp) : new Date(record._createdTime)
            };

            // 既存のanalysis_resultsテーブルに挿入
            await db.query(`
              INSERT INTO analysis_results 
              (user_id, result_type, data, timestamp)
              VALUES ($1, $2, $3, $4)
            `, [
              jobData.user_id,
              jobData.result_type,
              JSON.stringify(jobData.data),
              jobData.timestamp
            ]);

            migratedCount++;
            
          } catch (error) {
            errorCount++;
            console.error(`  ❌ レコード移行エラー:`, error.message);
          }
        }
        
        fetchNextPage();
      });

      this.stats.jobAnalysis = { 
        processed: processedCount, 
        migrated: migratedCount, 
        errors: errorCount 
      };
      
      console.log(`✅ JobAnalysis移行完了: ${migratedCount}/${processedCount}件`);
      
    } catch (error) {
      console.error('❌ JobAnalysis移行エラー:', error.message);
    }
  }

  async verifyMigration() {
    console.log('\n🔍 移行結果検証中...');
    
    try {
      // user_messagesテーブルの件数確認
      const messageCount = await db.query('SELECT COUNT(*) as count FROM user_messages');
      console.log(`user_messages: ${messageCount[0].count}件`);
      
      // analysis_resultsテーブルの件数確認  
      const analysisCount = await db.query('SELECT COUNT(*) as count FROM analysis_results');
      console.log(`analysis_results: ${analysisCount[0].count}件`);
      
      // 結果タイプ別の確認
      const typeBreakdown = await db.query(`
        SELECT result_type, COUNT(*) as count 
        FROM analysis_results 
        GROUP BY result_type
      `);
      
      console.log('\n📊 analysis_results 内訳:');
      typeBreakdown.forEach(row => {
        console.log(`  ${row.result_type}: ${row.count}件`);
      });
      
    } catch (error) {
      console.error('❌ 検証エラー:', error.message);
    }
  }

  async executeMigration() {
    console.log('🚀 === 既存テーブルへのデータ移行開始 ===\n');
    
    // データベース接続テスト
    const isConnected = await db.testConnection();
    if (!isConnected) {
      console.error('❌ データベース接続失敗。移行を中止します。');
      return;
    }
    
    // テーブル初期化
    console.log('🗃️ テーブル初期化中...');
    await db.initializeTables();
    
    // 各テーブルの移行実行
    await this.migrateConversationHistory();
    await this.migrateUserAnalysis(); 
    await this.migrateJobAnalysis();
    
    // 移行結果検証
    await this.verifyMigration();
    
    // 最終統計
    console.log('\n🎉 === 移行完了 ===');
    console.log('📊 移行統計:');
    Object.entries(this.stats).forEach(([table, stats]) => {
      console.log(`  ${table}: ${stats.migrated}/${stats.processed}件 (エラー: ${stats.errors}件)`);
    });
    
    const totalMigrated = Object.values(this.stats).reduce((sum, stats) => sum + stats.migrated, 0);
    console.log(`\n🎯 合計移行件数: ${totalMigrated}件`);
  }
}

// 移行実行
async function main() {
  const migration = new ExistingTableMigration();
  await migration.executeMigration();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ExistingTableMigration;
