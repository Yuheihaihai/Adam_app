require('dotenv').config();
const Airtable = require('airtable');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

class CompleteMissingDataMigration {
  constructor() {
    this.db = new sqlite3.Database('airtable_migration.db');
    this.base = new Airtable({ 
      apiKey: process.env.AIRTABLE_API_KEY 
    }).base(process.env.AIRTABLE_BASE_ID);
    
    this.stats = {
      conversationHistory: { total: 0, existing: 0, migrated: 0, errors: 0 },
      userAnalysis: { total: 0, existing: 0, migrated: 0, errors: 0 },
      jobAnalysis: { total: 0, existing: 0, migrated: 0, errors: 0 }
    };
  }

  async getExistingMessageIds() {
    return new Promise((resolve) => {
      this.db.all('SELECT message_id FROM user_messages', (err, rows) => {
        if (err) {
          console.error('既存メッセージID取得エラー:', err.message);
          resolve(new Set());
        } else {
          const ids = new Set(rows.map(row => row.message_id));
          console.log(`�� 既存メッセージID: ${ids.size}件`);
          resolve(ids);
        }
      });
    });
  }

  async getExistingAnalysisIds() {
    return new Promise((resolve) => {
      this.db.all('SELECT airtable_id FROM user_analysis WHERE airtable_id IS NOT NULL', (err, rows) => {
        if (err) {
          console.error('既存分析ID取得エラー:', err.message);
          resolve(new Set());
        } else {
          const ids = new Set(rows.map(row => row.airtable_id));
          console.log(`📋 既存分析ID: ${ids.size}件`);
          resolve(ids);
        }
      });
    });
  }

  async migrateConversationHistory() {
    console.log('\n🚀 ConversationHistory 不足分移行開始...');
    
    const existingIds = await this.getExistingMessageIds();
    let totalProcessed = 0;
    let migrated = 0;
    let errors = 0;

    try {
      await this.base('ConversationHistory').select().eachPage(async (records, fetchNextPage) => {
        
        const insertPromises = [];
        
        for (const record of records) {
          totalProcessed++;
          
          try {
            const fields = record.fields;
            const messageId = fields.message_id || fields.messageId || record.id;
            
            // 既に存在するかチェック
            if (existingIds.has(messageId)) {
              continue;
            }
            
            const messageData = {
              user_id: fields.user_id || fields.userId || fields.UserID || 'unknown',
              message_id: messageId,
              content: fields.content || fields.Content || fields.message || '',
              role: fields.role || fields.Role || 'user',
              mode: fields.mode || fields.Mode || 'general',
              message_type: fields.message_type || fields.MessageType || 'text',
              timestamp: fields.timestamp || fields.Timestamp || record._createdTime,
              airtable_id: record.id
            };

            // 非同期挿入をプロミス配列に追加
            insertPromises.push(new Promise((resolve) => {
              this.db.run(`
                INSERT OR IGNORE INTO user_messages 
                (user_id, message_id, content, role, mode, message_type, timestamp, airtable_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `, [
                messageData.user_id,
                messageData.message_id,
                messageData.content,
                messageData.role,
                messageData.mode,
                messageData.message_type,
                messageData.timestamp,
                messageData.airtable_id
              ], function(err) {
                if (err) {
                  errors++;
                  console.error(`❌ メッセージ挿入エラー: ${err.message}`);
                } else if (this.changes > 0) {
                  migrated++;
                }
                resolve();
              });
            }));
            
          } catch (error) {
            errors++;
            console.error(`❌ レコード処理エラー:`, error.message);
          }
        }
        
        // バッチ挿入を並列実行
        await Promise.all(insertPromises);
        
        if (totalProcessed % 1000 === 0) {
          console.log(`  📊 処理済み: ${totalProcessed}件, 新規移行: ${migrated}件`);
        }
        
        fetchNextPage();
      });

      this.stats.conversationHistory = { 
        total: totalProcessed, 
        existing: existingIds.size,
        migrated: migrated, 
        errors: errors 
      };
      
      console.log(`✅ ConversationHistory移行完了: ${migrated}件の新規データを移行`);
      
    } catch (error) {
      console.error('❌ ConversationHistory移行エラー:', error.message);
    }
  }

  async migrateUserAnalysis() {
    console.log('\n🚀 UserAnalysis 不足分移行開始...');
    
    const existingIds = await this.getExistingAnalysisIds();
    let totalProcessed = 0;
    let migrated = 0;
    let errors = 0;

    try {
      await this.base('UserAnalysis').select().eachPage(async (records, fetchNextPage) => {
        
        const insertPromises = [];
        
        for (const record of records) {
          totalProcessed++;
          
          try {
            const fields = record.fields;
            
            // 既に存在するかチェック
            if (existingIds.has(record.id)) {
              continue;
            }
            
            const analysisData = {
              user_id: fields.user_id || fields.userId || 'unknown',
              sentiment_score: fields.sentiment_score,
              tone_analysis: fields.tone_analysis,
              communication_style: fields.communication_style,
              personality_insights: fields.personality_insights,
              growth_areas: fields.growth_areas,
              interview_readiness: fields.interview_readiness,
              confidence_level: fields.confidence_level,
              timestamp: fields.timestamp || record._createdTime,
              airtable_id: record.id
            };

            insertPromises.push(new Promise((resolve) => {
              this.db.run(`
                INSERT OR IGNORE INTO user_analysis 
                (user_id, sentiment_score, tone_analysis, communication_style, 
                 personality_insights, growth_areas, interview_readiness, 
                 confidence_level, timestamp, airtable_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [
                analysisData.user_id,
                analysisData.sentiment_score,
                analysisData.tone_analysis,
                analysisData.communication_style,
                analysisData.personality_insights,
                analysisData.growth_areas,
                analysisData.interview_readiness,
                analysisData.confidence_level,
                analysisData.timestamp,
                analysisData.airtable_id
              ], function(err) {
                if (err) {
                  errors++;
                  console.error(`❌ 分析データ挿入エラー: ${err.message}`);
                } else if (this.changes > 0) {
                  migrated++;
                }
                resolve();
              });
            }));
            
          } catch (error) {
            errors++;
            console.error(`❌ 分析レコード処理エラー:`, error.message);
          }
        }
        
        await Promise.all(insertPromises);
        
        if (totalProcessed % 1000 === 0) {
          console.log(`  📊 処理済み: ${totalProcessed}件, 新規移行: ${migrated}件`);
        }
        
        fetchNextPage();
      });

      this.stats.userAnalysis = { 
        total: totalProcessed, 
        existing: existingIds.size,
        migrated: migrated, 
        errors: errors 
      };
      
      console.log(`✅ UserAnalysis移行完了: ${migrated}件の新規データを移行`);
      
    } catch (error) {
      console.error('❌ UserAnalysis移行エラー:', error.message);
    }
  }

  async verifyFinalResults() {
    console.log('\n🔍 === 最終移行結果検証 ===');
    
    return new Promise((resolve) => {
      let completed = 0;
      const tables = ['user_messages', 'user_analysis', 'job_analysis'];
      
      tables.forEach((table) => {
        this.db.get(`SELECT COUNT(*) as count FROM ${table}`, (err, row) => {
          if (err) {
            console.log(`❌ ${table}: エラー - ${err.message}`);
          } else {
            console.log(`📈 ${table}: ${row.count}件`);
          }
          
          completed++;
          if (completed === tables.length) {
            resolve();
          }
        });
      });
    });
  }

  async executeMigration() {
    console.log('🚀 === 不足データの完全移行開始 ===\n');
    
    const startTime = Date.now();
    
    // 段階的移行実行
    await this.migrateConversationHistory();
    await this.migrateUserAnalysis();
    // JobAnalysisは既に完全なので スキップ
    
    // 最終検証
    await this.verifyFinalResults();
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    // 最終統計
    console.log('\n🎉 === 不足データ移行完了 ===');
    console.log(`⏱️  実行時間: ${duration}秒`);
    console.log('📊 移行統計:');
    
    Object.entries(this.stats).forEach(([table, stats]) => {
      if (stats.total > 0) {
        console.log(`  ${table}:`);
        console.log(`    総処理: ${stats.total}件`);
        console.log(`    既存: ${stats.existing}件`);
        console.log(`    新規移行: ${stats.migrated}件`);
        console.log(`    エラー: ${stats.errors}件`);
      }
    });
    
    const totalNewMigrated = Object.values(this.stats).reduce((sum, stats) => sum + stats.migrated, 0);
    console.log(`\n🎯 新規移行総数: ${totalNewMigrated}件`);
    
    this.db.close();
    console.log('✅ データベース接続を閉じました');
  }
}

// 実行
async function main() {
  const migration = new CompleteMissingDataMigration();
  await migration.executeMigration();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = CompleteMissingDataMigration;
