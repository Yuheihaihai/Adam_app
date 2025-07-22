// complete_data_migration_final.js
// AirtableからPostgreSQLへの完全データ移行（未移行データのみ）

require('dotenv').config();
const db = require('./db');
const Airtable = require('airtable');
const crypto = require('crypto');

// 暗号化サービスをインポート
const encryptionUtils = require('./encryption_utils');

class CompleteMigrationFinal {
  constructor() {
    // Airtable接続
    this.airtable = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY });
    this.base = this.airtable.base(process.env.AIRTABLE_BASE_ID);
    
    // 統計情報
    this.stats = {
      conversationHistory: { processed: 0, migrated: 0, skipped: 0, errors: 0 },
      userAnalysis: { processed: 0, migrated: 0, skipped: 0, errors: 0 },
      jobAnalysis: { processed: 0, migrated: 0, skipped: 0, errors: 0 }
    };
  }

  /**
   * 完全データ移行の実行
   */
  async execute() {
    console.log('🚀 === COMPREHENSIVE AIRTABLE TO POSTGRESQL MIGRATION ===\n');
    
    const startTime = Date.now();
    
    try {
      // 1. ConversationHistory移行
      await this.migrateConversationHistory();
      
      // 2. UserAnalysis移行
      await this.migrateUserAnalysis();
      
      // 3. JobAnalysis移行
      await this.migrateJobAnalysis();
      
      // 4. 最終統計表示
      this.displayFinalStats(startTime);
      
    } catch (error) {
      console.error('❌ 移行プロセスでエラーが発生:', error);
      throw error;
    }
  }

  /**
   * ConversationHistory移行
   */
  async migrateConversationHistory() {
    console.log('📧 === ConversationHistory Migration ===');
    
    try {
      // PostgreSQLの既存メッセージIDを取得
      const existingMessages = await db.pool.query(
        'SELECT message_id FROM user_messages WHERE message_id IS NOT NULL'
      );
      const existingMessageIds = new Set(existingMessages.rows.map(row => row.message_id));
      console.log(`   既存メッセージID: ${existingMessageIds.size}件`);

      // Airtableから全データを取得
      const records = await this.getAllRecords('ConversationHistory');
      console.log(`   Airtable総件数: ${records.length}件`);

      for (const record of records) {
        this.stats.conversationHistory.processed++;
        
        try {
          const fields = record.fields;
          const messageId = fields.MessageID || fields['Message ID'] || record.id;
          
          // 既存チェック
          if (existingMessageIds.has(messageId)) {
            this.stats.conversationHistory.skipped++;
            continue;
          }

          // 必須フィールドチェック
          const userId = fields.UserID || fields['User ID'];
          const content = fields.Content;
          const role = fields.Role;
          
          if (!userId || !content || !role) {
            console.log(`   ⚠️ 必須フィールド不足: ${record.id}`);
            this.stats.conversationHistory.errors++;
            continue;
          }

          // PostgreSQLに保存
          const hashedUserId = crypto.createHash('sha256').update(userId).digest('hex');
          const encryptedContent = encryptionUtils.encrypt(content);
          const zkProof = crypto.createHash('sha256').update(hashedUserId + messageId + Date.now()).digest('hex').substring(0, 32);

          await db.pool.query(`
            INSERT INTO user_messages 
            (user_id, message_id, content, role, timestamp, mode, message_type, zk_proof, deletion_scheduled_at, privacy_level)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '180 days', 3)
            ON CONFLICT (user_id, message_id) DO NOTHING
          `, [
            hashedUserId,
            messageId,
            encryptedContent,
            role,
            fields.Timestamp ? new Date(fields.Timestamp) : new Date(),
            fields.Mode || 'general',
            fields.MessageType || fields['Message Type'] || 'text',
            zkProof
          ]);

          this.stats.conversationHistory.migrated++;
          
          if (this.stats.conversationHistory.migrated % 100 === 0) {
            console.log(`   ✅ 移行済み: ${this.stats.conversationHistory.migrated}件`);
          }

        } catch (error) {
          console.error(`   ❌ レコード移行エラー ${record.id}:`, error.message);
          this.stats.conversationHistory.errors++;
        }
      }

      console.log(`📧 ConversationHistory完了: ${this.stats.conversationHistory.migrated}件移行\n`);

    } catch (error) {
      console.error('❌ ConversationHistory移行エラー:', error);
      throw error;
    }
  }

  /**
   * UserAnalysis移行
   */
  async migrateUserAnalysis() {
    console.log('🤖 === UserAnalysis Migration ===');
    
    try {
      // PostgreSQLの既存レコードを取得
      const existingRecords = await db.pool.query(
        'SELECT airtable_record_id FROM user_ml_analysis WHERE airtable_record_id IS NOT NULL'
      );
      const existingRecordIds = new Set(existingRecords.rows.map(row => row.airtable_record_id));
      console.log(`   既存レコードID: ${existingRecordIds.size}件`);

      // Airtableから全データを取得
      const records = await this.getAllRecords('UserAnalysis');
      console.log(`   Airtable総件数: ${records.length}件`);

      for (const record of records) {
        this.stats.userAnalysis.processed++;
        
        try {
          // 既存チェック
          if (existingRecordIds.has(record.id)) {
            this.stats.userAnalysis.skipped++;
            continue;
          }

          const fields = record.fields;
          const userId = fields.UserID || fields['User ID'];
          const mode = fields.Mode || 'general';
          const analysisData = fields.AnalysisData || fields['Analysis Data'];
          
          if (!userId || !analysisData) {
            console.log(`   ⚠️ 必須フィールド不足: ${record.id}`);
            this.stats.userAnalysis.errors++;
            continue;
          }

          // データ処理
          let parsedData;
          try {
            parsedData = typeof analysisData === 'string' ? JSON.parse(analysisData) : analysisData;
          } catch (parseError) {
            console.log(`   ⚠️ JSON解析エラー: ${record.id}`);
            this.stats.userAnalysis.errors++;
            continue;
          }

          // PostgreSQLに保存
          const hashedUserId = crypto.createHash('sha256').update(userId).digest('hex');
          const encryptedData = encryptionUtils.encrypt(JSON.stringify(parsedData));
          const zkProof = crypto.createHash('sha256').update(hashedUserId + mode + Date.now()).digest('hex').substring(0, 32);

          await db.pool.query(`
            INSERT INTO user_ml_analysis 
            (user_id_hash, mode, analysis_data_encrypted, created_at, updated_at, airtable_record_id, data_version, privacy_level, zk_proof, deletion_scheduled_at)
            VALUES ($1, $2, $3, $4, $5, $6, '1.0', 3, $7, NOW() + INTERVAL '180 days')
            ON CONFLICT (airtable_record_id) DO NOTHING
          `, [
            hashedUserId,
            mode,
            encryptedData,
            fields.LastUpdated ? new Date(fields.LastUpdated) : new Date(),
            new Date(),
            record.id,
            zkProof
          ]);

          this.stats.userAnalysis.migrated++;

        } catch (error) {
          console.error(`   ❌ レコード移行エラー ${record.id}:`, error.message);
          this.stats.userAnalysis.errors++;
        }
      }

      console.log(`🤖 UserAnalysis完了: ${this.stats.userAnalysis.migrated}件移行\n`);

    } catch (error) {
      console.error('❌ UserAnalysis移行エラー:', error);
      throw error;
    }
  }

  /**
   * JobAnalysis移行（新しいテーブル作成）
   */
  async migrateJobAnalysis() {
    console.log('💼 === JobAnalysis Migration ===');
    
    try {
      // テーブル作成
      await this.createJobAnalysisTable();

      // Airtableから全データを取得
      const records = await this.getAllRecords('JobAnalysis');
      console.log(`   Airtable総件数: ${records.length}件`);

      for (const record of records) {
        this.stats.jobAnalysis.processed++;
        
        try {
          const fields = record.fields;
          const userId = fields.UserID || fields['User ID'];
          const jobData = fields.JobData || fields['Job Data'] || fields.Analysis;
          
          if (!userId) {
            console.log(`   ⚠️ 必須フィールド不足: ${record.id}`);
            this.stats.jobAnalysis.errors++;
            continue;
          }

          // PostgreSQLに保存
          const hashedUserId = crypto.createHash('sha256').update(userId).digest('hex');
          const encryptedData = jobData ? encryptionUtils.encrypt(JSON.stringify(jobData)) : null;

          await db.pool.query(`
            INSERT INTO job_analysis 
            (user_id_hash, job_data_encrypted, created_at, airtable_record_id, deletion_scheduled_at)
            VALUES ($1, $2, $3, $4, NOW() + INTERVAL '180 days')
            ON CONFLICT (airtable_record_id) DO NOTHING
          `, [
            hashedUserId,
            encryptedData,
            fields.CreatedAt ? new Date(fields.CreatedAt) : new Date(),
            record.id
          ]);

          this.stats.jobAnalysis.migrated++;

        } catch (error) {
          console.error(`   ❌ レコード移行エラー ${record.id}:`, error.message);
          this.stats.jobAnalysis.errors++;
        }
      }

      console.log(`💼 JobAnalysis完了: ${this.stats.jobAnalysis.migrated}件移行\n`);

    } catch (error) {
      console.error('❌ JobAnalysis移行エラー:', error);
      throw error;
    }
  }

  /**
   * JobAnalysisテーブル作成
   */
  async createJobAnalysisTable() {
    try {
      await db.pool.query(`
        CREATE TABLE IF NOT EXISTS job_analysis (
          id SERIAL PRIMARY KEY,
          user_id_hash VARCHAR(255) NOT NULL,
          job_data_encrypted TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          airtable_record_id VARCHAR(255) UNIQUE,
          deletion_scheduled_at TIMESTAMP,
          INDEX (user_id_hash),
          INDEX (created_at)
        )
      `);
      console.log('   ✅ job_analysisテーブル準備完了');
    } catch (error) {
      console.error('   ❌ テーブル作成エラー:', error.message);
    }
  }

  /**
   * Airtableから全レコードを取得
   */
  async getAllRecords(tableName) {
    const records = [];
    
    await this.base(tableName).select({
      view: 'Grid view'
    }).eachPage((pageRecords, fetchNextPage) => {
      records.push(...pageRecords);
      fetchNextPage();
    });
    
    return records;
  }

  /**
   * 最終統計表示
   */
  displayFinalStats(startTime) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('📊 === FINAL MIGRATION STATISTICS ===');
    console.log(`⏱️  実行時間: ${duration}秒\n`);
    
    console.log('📧 ConversationHistory:');
    console.log(`   処理済み: ${this.stats.conversationHistory.processed}件`);
    console.log(`   移行済み: ${this.stats.conversationHistory.migrated}件`);
    console.log(`   スキップ: ${this.stats.conversationHistory.skipped}件`);
    console.log(`   エラー: ${this.stats.conversationHistory.errors}件\n`);
    
    console.log('🤖 UserAnalysis:');
    console.log(`   処理済み: ${this.stats.userAnalysis.processed}件`);
    console.log(`   移行済み: ${this.stats.userAnalysis.migrated}件`);
    console.log(`   スキップ: ${this.stats.userAnalysis.skipped}件`);
    console.log(`   エラー: ${this.stats.userAnalysis.errors}件\n`);
    
    console.log('💼 JobAnalysis:');
    console.log(`   処理済み: ${this.stats.jobAnalysis.processed}件`);
    console.log(`   移行済み: ${this.stats.jobAnalysis.migrated}件`);
    console.log(`   スキップ: ${this.stats.jobAnalysis.skipped}件`);
    console.log(`   エラー: ${this.stats.jobAnalysis.errors}件\n`);
    
    const totalMigrated = this.stats.conversationHistory.migrated + 
                         this.stats.userAnalysis.migrated + 
                         this.stats.jobAnalysis.migrated;
    
    console.log(`🎉 === 移行完了: 合計 ${totalMigrated}件の新しいデータをPostgreSQLに移行 ===`);
  }
}

// スクリプト実行
if (require.main === module) {
  const migration = new CompleteMigrationFinal();
  migration.execute()
    .then(() => {
      console.log('\n✅ 完全データ移行が正常に完了しました！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 移行中にエラーが発生しました:', error);
      process.exit(1);
    });
}

module.exports = CompleteMigrationFinal; 