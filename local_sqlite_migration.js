require('dotenv').config();
const Airtable = require('airtable');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

class LocalSqliteMigration {
  constructor() {
    this.db = new sqlite3.Database('airtable_migration.db');
    this.base = new Airtable({ 
      apiKey: process.env.AIRTABLE_API_KEY 
    }).base(process.env.AIRTABLE_BASE_ID);
    
    this.stats = {
      conversationHistory: { processed: 0, migrated: 0, errors: 0 },
      userAnalysis: { processed: 0, migrated: 0, errors: 0 },
      jobAnalysis: { processed: 0, migrated: 0, errors: 0 }
    };
  }

  async initializeTables() {
    console.log('🗃️ SQLiteテーブル初期化中...');
    
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // user_messages テーブル
        this.db.run(`CREATE TABLE IF NOT EXISTS user_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          message_id TEXT,
          content TEXT NOT NULL,
          role TEXT NOT NULL,
          timestamp DATETIME,
          mode TEXT,
          message_type TEXT,
          airtable_record_id TEXT UNIQUE
        )`);
        
        // user_analysis テーブル
        this.db.run(`CREATE TABLE IF NOT EXISTS user_analysis (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          mode TEXT,
          analysis_data TEXT,
          last_updated DATETIME,
          airtable_record_id TEXT UNIQUE
        )`);
        
        // job_analysis テーブル
        this.db.run(`CREATE TABLE IF NOT EXISTS job_analysis (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT,
          job_data TEXT,
          created_at DATETIME,
          airtable_record_id TEXT UNIQUE
        )`);
        
        console.log('✅ SQLiteテーブル初期化完了');
        resolve();
      });
    });
  }

  async migrateConversationHistory() {
    console.log('💬 === ConversationHistory移行開始 ===');
    
    try {
      let totalCount = 0;
      
      await this.base('ConversationHistory').select({
        maxRecords: 5000 // 最大5000件
      }).eachPage((records, fetchNextPage) => {
        
        records.forEach((record) => {
          this.stats.conversationHistory.processed++;
          
          try {
            const fields = record.fields;
            const userId = fields.UserID || fields['User ID'] || 'unknown';
            const content = fields.Content || '';
            const role = fields.Role || 'user';
            const messageId = fields.MessageID || fields['Message ID'] || record.id;
            const timestamp = fields.Timestamp || new Date().toISOString();
            const mode = fields.Mode || 'general';
            const messageType = fields.MessageType || fields['Message Type'] || 'text';
            
            if (!content || content.trim() === '') {
              return; // 空のコンテンツはスキップ
            }
            
            // SQLiteに保存
            this.db.run(
              `INSERT OR IGNORE INTO user_messages 
              (user_id, message_id, content, role, timestamp, mode, message_type, airtable_record_id) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [userId, messageId, content, role, timestamp, mode, messageType, record.id],
              function(err) {
                if (err) {
                  console.error('エラー:', err.message);
                } else if (this.changes > 0) {
                  this.stats.conversationHistory.migrated++;
                }
              }.bind(this)
            );
            
          } catch (error) {
            this.stats.conversationHistory.errors++;
            console.error(`レコードエラー ${record.id}:`, error.message);
          }
        });
        
        totalCount += records.length;
        console.log(`  📥 処理済み: ${totalCount}件`);
        fetchNextPage();
      });
      
      console.log(`✅ ConversationHistory完了: ${totalCount}件処理\n`);
      
    } catch (error) {
      console.error('❌ ConversationHistory移行エラー:', error.message);
    }
  }

  async migrateUserAnalysis() {
    console.log('🤖 === UserAnalysis移行開始 ===');
    
    try {
      let totalCount = 0;
      
      await this.base('UserAnalysis').select({
        maxRecords: 5000
      }).eachPage((records, fetchNextPage) => {
        
        records.forEach((record) => {
          this.stats.userAnalysis.processed++;
          
          try {
            const fields = record.fields;
            const userId = fields.UserID || fields['User ID'] || 'unknown';
            const mode = fields.Mode || 'general';
            const analysisData = fields.AnalysisData || fields['Analysis Data'] || '{}';
            const lastUpdated = fields.LastUpdated || fields['Last Updated'] || new Date().toISOString();
            
            // SQLiteに保存
            this.db.run(
              `INSERT OR IGNORE INTO user_analysis 
              (user_id, mode, analysis_data, last_updated, airtable_record_id) 
              VALUES (?, ?, ?, ?, ?)`,
              [userId, mode, analysisData, lastUpdated, record.id],
              function(err) {
                if (err) {
                  console.error('エラー:', err.message);
                } else if (this.changes > 0) {
                  this.stats.userAnalysis.migrated++;
                }
              }.bind(this)
            );
            
          } catch (error) {
            this.stats.userAnalysis.errors++;
            console.error(`レコードエラー ${record.id}:`, error.message);
          }
        });
        
        totalCount += records.length;
        console.log(`  📥 処理済み: ${totalCount}件`);
        fetchNextPage();
      });
      
      console.log(`✅ UserAnalysis完了: ${totalCount}件処理\n`);
      
    } catch (error) {
      console.error('❌ UserAnalysis移行エラー:', error.message);
    }
  }

  async migrateJobAnalysis() {
    console.log('💼 === JobAnalysis移行開始 ===');
    
    try {
      const records = await this.base('JobAnalysis').select().all();
      
      for (const record of records) {
        this.stats.jobAnalysis.processed++;
        
        try {
          const fields = record.fields;
          const userId = fields.UserID || fields['User ID'] || 'unknown';
          const jobData = fields.JobData || fields['Job Data'] || '{}';
          const createdAt = fields.CreatedAt || fields['Created At'] || new Date().toISOString();
          
          // SQLiteに保存
          this.db.run(
            `INSERT OR IGNORE INTO job_analysis 
            (user_id, job_data, created_at, airtable_record_id) 
            VALUES (?, ?, ?, ?)`,
            [userId, jobData, createdAt, record.id],
            function(err) {
              if (err) {
                console.error('エラー:', err.message);
              } else if (this.changes > 0) {
                this.stats.jobAnalysis.migrated++;
              }
            }.bind(this)
          );
          
        } catch (error) {
          this.stats.jobAnalysis.errors++;
          console.error(`レコードエラー ${record.id}:`, error.message);
        }
      }
      
      console.log(`✅ JobAnalysis完了: ${records.length}件処理\n`);
      
    } catch (error) {
      console.error('❌ JobAnalysis移行エラー:', error.message);
    }
  }

  async execute() {
    console.log('🚀 === Airtable → SQLite 移行開始 ===\n');
    
    try {
      await this.initializeTables();
      await this.migrateConversationHistory();
      await this.migrateUserAnalysis();
      await this.migrateJobAnalysis();
      
      this.printStats();
      
    } catch (error) {
      console.error('❌ 移行エラー:', error.message);
    } finally {
      this.db.close();
    }
  }

  printStats() {
    console.log('📊 === 移行統計 ===');
    console.log(`ConversationHistory: ${this.stats.conversationHistory.processed}件処理`);
    console.log(`UserAnalysis: ${this.stats.userAnalysis.processed}件処理`);
    console.log(`JobAnalysis: ${this.stats.jobAnalysis.processed}件処理`);
    console.log('\n✅ SQLite移行完了');
  }
}

// 実行
const migration = new LocalSqliteMigration();
migration.execute();
