require('dotenv').config();
const Airtable = require('airtable');
const sqlite3 = require('sqlite3').verbose();

class CorrectDataMigration {
  constructor() {
    // 新しいデータベースファイルを作成
    this.db = new sqlite3.Database('airtable_complete.db');
    this.base = new Airtable({ 
      apiKey: process.env.AIRTABLE_API_KEY 
    }).base(process.env.AIRTABLE_BASE_ID);
    
    this.stats = {
      conversationHistory: { processed: 0, migrated: 0, errors: 0 },
      userAnalysis: { processed: 0, migrated: 0, errors: 0 },
      jobAnalysis: { processed: 0, migrated: 0, errors: 0 }
    };
  }

  async initializeCorrectTables() {
    console.log('🗃️ 正しいテーブル構造を作成中...\n');
    
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // ConversationHistory → conversation_history テーブル
        this.db.run(`CREATE TABLE IF NOT EXISTS conversation_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          airtable_id TEXT UNIQUE,
          user_id TEXT NOT NULL,
          content TEXT,
          role TEXT,
          mode TEXT,
          message_type TEXT,
          timestamp TEXT,
          created_time TEXT
        )`, (err) => {
          if (err) {
            console.error('❌ conversation_history テーブル作成エラー:', err.message);
            reject(err);
            return;
          }
          console.log('✅ conversation_history テーブル作成完了');
        });

        // UserAnalysis → user_analysis テーブル
        this.db.run(`CREATE TABLE IF NOT EXISTS user_analysis_complete (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          airtable_id TEXT UNIQUE,
          user_id TEXT NOT NULL,
          mode TEXT,
          analysis_data TEXT,
          last_updated TEXT,
          created_time TEXT
        )`, (err) => {
          if (err) {
            console.error('❌ user_analysis_complete テーブル作成エラー:', err.message);
            reject(err);
            return;
          }
          console.log('✅ user_analysis_complete テーブル作成完了');
        });

        // JobAnalysis → job_analysis テーブル  
        this.db.run(`CREATE TABLE IF NOT EXISTS job_analysis_complete (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          airtable_id TEXT UNIQUE,
          created_time TEXT
        )`, (err) => {
          if (err) {
            console.error('❌ job_analysis_complete テーブル作成エラー:', err.message);
            reject(err);
            return;
          }
          console.log('✅ job_analysis_complete テーブル作成完了');
          resolve();
        });
      });
    });
  }

  async migrateConversationHistory() {
    console.log('\n📨 ConversationHistory → conversation_history 完全移行開始...');
    
    let processed = 0;
    let migrated = 0;
    let errors = 0;

    try {
      await this.base('ConversationHistory').select().eachPage(async (records, fetchNextPage) => {
        
        const insertPromises = records.map(record => {
          return new Promise((resolve) => {
            processed++;
            
            try {
              const fields = record.fields;
              
              this.db.run(`
                INSERT OR REPLACE INTO conversation_history 
                (airtable_id, user_id, content, role, mode, message_type, timestamp, created_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `, [
                record.id,
                fields.UserID || 'unknown',
                fields.Content || '',
                fields.Role || 'user',
                fields.Mode || 'general',
                fields.MessageType || 'text',
                fields.Timestamp || record._createdTime,
                record._createdTime
              ], function(err) {
                if (err) {
                  errors++;
                  console.error(`❌ ConversationHistory 挿入エラー: ${err.message}`);
                } else {
                  migrated++;
                }
                resolve();
              });
              
            } catch (error) {
              errors++;
              console.error(`❌ ConversationHistory 処理エラー:`, error.message);
              resolve();
            }
          });
        });
        
        await Promise.all(insertPromises);
        
        if (processed % 5000 === 0) {
          console.log(`  📊 ConversationHistory 処理済み: ${processed}件, 移行済み: ${migrated}件`);
        }
        
        fetchNextPage();
      });
      
      this.stats.conversationHistory = { processed, migrated, errors };
      console.log(`✅ ConversationHistory 移行完了: ${migrated}/${processed}件 (エラー: ${errors}件)`);
      
    } catch (error) {
      console.error('❌ ConversationHistory 移行エラー:', error.message);
    }
  }

  async migrateUserAnalysis() {
    console.log('\n📊 UserAnalysis → user_analysis_complete 完全移行開始...');
    
    let processed = 0;
    let migrated = 0;
    let errors = 0;

    try {
      await this.base('UserAnalysis').select().eachPage(async (records, fetchNextPage) => {
        
        const insertPromises = records.map(record => {
          return new Promise((resolve) => {
            processed++;
            
            try {
              const fields = record.fields;
              
              this.db.run(`
                INSERT OR REPLACE INTO user_analysis_complete 
                (airtable_id, user_id, mode, analysis_data, last_updated, created_time)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [
                record.id,
                fields.UserID || 'unknown',
                fields.Mode || 'general',
                fields.AnalysisData || '{}',
                fields.LastUpdated || null,
                record._createdTime
              ], function(err) {
                if (err) {
                  errors++;
                  console.error(`❌ UserAnalysis 挿入エラー: ${err.message}`);
                } else {
                  migrated++;
                }
                resolve();
              });
              
            } catch (error) {
              errors++;
              console.error(`❌ UserAnalysis 処理エラー:`, error.message);
              resolve();
            }
          });
        });
        
        await Promise.all(insertPromises);
        
        if (processed % 1000 === 0) {
          console.log(`  📊 UserAnalysis 処理済み: ${processed}件, 移行済み: ${migrated}件`);
        }
        
        fetchNextPage();
      });
      
      this.stats.userAnalysis = { processed, migrated, errors };
      console.log(`✅ UserAnalysis 移行完了: ${migrated}/${processed}件 (エラー: ${errors}件)`);
      
    } catch (error) {
      console.error('❌ UserAnalysis 移行エラー:', error.message);
    }
  }

  async migrateJobAnalysis() {
    console.log('\n💼 JobAnalysis → job_analysis_complete 完全移行開始...');
    
    let processed = 0;
    let migrated = 0;
    let errors = 0;

    try {
      await this.base('JobAnalysis').select().eachPage(async (records, fetchNextPage) => {
        
        const insertPromises = records.map(record => {
          return new Promise((resolve) => {
            processed++;
            
            try {
              this.db.run(`
                INSERT OR REPLACE INTO job_analysis_complete 
                (airtable_id, created_time)
                VALUES (?, ?)
              `, [
                record.id,
                record._createdTime
              ], function(err) {
                if (err) {
                  errors++;
                  console.error(`❌ JobAnalysis 挿入エラー: ${err.message}`);
                } else {
                  migrated++;
                }
                resolve();
              });
              
            } catch (error) {
              errors++;
              console.error(`❌ JobAnalysis 処理エラー:`, error.message);
              resolve();
            }
          });
        });
        
        await Promise.all(insertPromises);
        fetchNextPage();
      });
      
      this.stats.jobAnalysis = { processed, migrated, errors };
      console.log(`✅ JobAnalysis 移行完了: ${migrated}/${processed}件 (エラー: ${errors}件)`);
      
    } catch (error) {
      console.error('❌ JobAnalysis 移行エラー:', error.message);
    }
  }

  async verifyMigration() {
    console.log('\n🔍 === 完全移行結果検証 ===');
    
    return new Promise((resolve) => {
      let completed = 0;
      const tables = ['conversation_history', 'user_analysis_complete', 'job_analysis_complete'];
      
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

  async executeCompleteMigration() {
    const startTime = Date.now();
    console.log('🚀 === Airtable完全データ移行開始 ===\n');
    
    try {
      // 正しいテーブル構造を作成
      await this.initializeCorrectTables();
      
      // 全データ移行
      await this.migrateConversationHistory();
      await this.migrateUserAnalysis();
      await this.migrateJobAnalysis();
      
      // 結果検証
      await this.verifyMigration();
      
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      // 最終統計
      console.log('\n🎉 === 完全移行完了 ===');
      console.log(`⏱️  実行時間: ${duration}秒`);
      console.log('📊 移行統計:');
      
      Object.entries(this.stats).forEach(([table, stats]) => {
        console.log(`  ${table}: ${stats.migrated}/${stats.processed}件 (エラー: ${stats.errors}件)`);
      });
      
      const totalMigrated = Object.values(this.stats).reduce((sum, stats) => sum + stats.migrated, 0);
      console.log(`\n🎯 総移行数: ${totalMigrated}件`);
      console.log('✅ 新しいデータベース: airtable_complete.db');
      
    } catch (error) {
      console.error('❌ 移行プロセスでエラー:', error.message);
    } finally {
      this.db.close();
      console.log('🔐 データベース接続を閉じました');
    }
  }
}

// 実行
async function main() {
  const migration = new CorrectDataMigration();
  await migration.executeCompleteMigration();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = CorrectDataMigration;
