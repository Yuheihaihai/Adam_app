require('dotenv').config();
const db = require('./db');
const Airtable = require('airtable');
const crypto = require('crypto');
const encryptionUtils = require('./encryption_utils');

class CompleteAirtableToSQLMigration {
  constructor() {
    this.stats = {
      conversationHistory: { processed: 0, migrated: 0, skipped: 0, errors: 0 },
      userAnalysis: { processed: 0, migrated: 0, skipped: 0, errors: 0 },
      userTraits: { processed: 0, migrated: 0, skipped: 0, errors: 0 },
      users: { processed: 0, migrated: 0, skipped: 0, errors: 0 },
      interactions: { processed: 0, migrated: 0, skipped: 0, errors: 0 },
      jobAnalysis: { processed: 0, migrated: 0, skipped: 0, errors: 0 }
    };
    
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      throw new Error('Airtable API Key and Base ID are required');
    }
    
    this.base = new Airtable({ 
      apiKey: process.env.AIRTABLE_API_KEY 
    }).base(process.env.AIRTABLE_BASE_ID);
  }

  async execute() {
    console.log('🚀 === 完全Airtable→PostgreSQL移行開始 ===\n');
    
    try {
      // 1. テーブル初期化
      await this.initializePostgreSQLTables();
      
      // 2. 各テーブルのデータを移行
      await this.migrateConversationHistory();
      await this.migrateUserAnalysis();
      await this.migrateUserTraits();
      await this.migrateUsers();
      await this.migrateInteractions();
      await this.migrateJobAnalysis();
      
      // 3. 結果レポート
      this.printMigrationReport();
      
      console.log('\n✅ === 完全移行完了 ===');
      return true;
      
    } catch (error) {
      console.error('\n❌ === 移行エラー ===');
      console.error('Error:', error.message);
      return false;
    }
  }

  async initializePostgreSQLTables() {
    console.log('📋 PostgreSQLテーブル初期化中...');
    
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. user_messages テーブル（既存）
      console.log('   ✓ user_messages - 既存テーブル確認');
      
      // 2. user_ml_analysis テーブル
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_ml_analysis (
          id SERIAL PRIMARY KEY,
          user_id_hash VARCHAR(64) NOT NULL,
          mode VARCHAR(50) NOT NULL DEFAULT 'general',
          analysis_data_encrypted TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          airtable_record_id VARCHAR(255) UNIQUE,
          data_version VARCHAR(20) DEFAULT '1.0',
          privacy_level INTEGER DEFAULT 3,
          zk_proof TEXT,
          deletion_scheduled_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '180 days'),
          UNIQUE(user_id_hash, mode)
        )
      `);
      console.log('   ✓ user_ml_analysis');
      
      // 3. user_traits テーブル
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_traits (
          id SERIAL PRIMARY KEY,
          user_id_hash VARCHAR(64) NOT NULL UNIQUE,
          traits_data_encrypted TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          airtable_record_id VARCHAR(255) UNIQUE,
          deletion_scheduled_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '180 days')
        )
      `);
      console.log('   ✓ user_traits');
      
      // 4. users テーブル
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          user_id_hash VARCHAR(64) NOT NULL UNIQUE,
          user_data_encrypted TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          airtable_record_id VARCHAR(255) UNIQUE,
          deletion_scheduled_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '180 days')
        )
      `);
      console.log('   ✓ users');
      
      // 5. job_analysis テーブル
      await client.query(`
        CREATE TABLE IF NOT EXISTS job_analysis (
          id SERIAL PRIMARY KEY,
          user_id_hash VARCHAR(64) NOT NULL,
          job_data_encrypted TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          airtable_record_id VARCHAR(255) UNIQUE,
          deletion_scheduled_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '180 days')
        )
      `);
      console.log('   ✓ job_analysis');
      
      // インデックス作成
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_user_ml_analysis_user_hash ON user_ml_analysis(user_id_hash)',
        'CREATE INDEX IF NOT EXISTS idx_user_ml_analysis_mode ON user_ml_analysis(mode)',
        'CREATE INDEX IF NOT EXISTS idx_user_traits_user_hash ON user_traits(user_id_hash)',
        'CREATE INDEX IF NOT EXISTS idx_users_user_hash ON users(user_id_hash)',
        'CREATE INDEX IF NOT EXISTS idx_job_analysis_user_hash ON job_analysis(user_id_hash)'
      ];
      
      for (const indexQuery of indexes) {
        await client.query(indexQuery);
      }
      
      await client.query('COMMIT');
      console.log('✅ テーブル初期化完了\n');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async migrateConversationHistory() {
    console.log('💬 === ConversationHistory移行 ===');
    
    try {
      // 既存データ確認
      const existingData = await db.pool.query(
        'SELECT user_id, message_id FROM user_messages'
      );
      const existingSet = new Set(
        existingData.rows.map(row => `${row.user_id}:${row.message_id}`)
      );
      console.log(`   既存PostgreSQLデータ: ${existingSet.size}件`);
      
      // Airtableから全データ取得
      const records = await this.getAllRecords('ConversationHistory');
      console.log(`   Airtable総件数: ${records.length}件`);
      
      for (const record of records) {
        this.stats.conversationHistory.processed++;
        
        try {
          const fields = record.fields;
          const userId = fields.UserID || fields['User ID'];
          const messageId = fields.MessageID || fields['Message ID'] || record.id;
          const content = fields.Content;
          const role = fields.Role;
          
          if (!userId || !content || !role) {
            console.log(`   ⚠️ 必須フィールド不足: ${record.id}`);
            this.stats.conversationHistory.errors++;
            continue;
          }
          
          // 重複チェック
          const hashedUserId = crypto.createHash('sha256').update(userId).digest('hex');
          const checkKey = `${hashedUserId}:${messageId}`;
          
          if (existingSet.has(checkKey)) {
            this.stats.conversationHistory.skipped++;
            continue;
          }
          
          // PostgreSQLに保存
          const encryptedContent = encryptionUtils.encrypt(content);
          const zkProof = crypto.createHash('sha256').update(hashedUserId + messageId + Date.now()).digest('hex').substring(0, 32);
          
          await db.pool.query(`
            INSERT INTO user_messages 
            (user_id, message_id, content, role, timestamp, mode, message_type, zk_proof, deletion_scheduled_at, privacy_level)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '180 days', 3)
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
          existingSet.add(checkKey);
          
          if (this.stats.conversationHistory.migrated % 50 === 0) {
            console.log(`   ✅ 移行済み: ${this.stats.conversationHistory.migrated}件`);
          }
          
        } catch (error) {
          console.error(`   ❌ レコード処理エラー ${record.id}:`, error.message);
          this.stats.conversationHistory.errors++;
        }
      }
      
      console.log(`✅ ConversationHistory移行完了: ${this.stats.conversationHistory.migrated}件\n`);
      
    } catch (error) {
      console.error('❌ ConversationHistory移行エラー:', error.message);
      throw error;
    }
  }

  async migrateUserAnalysis() {
    console.log('🤖 === UserAnalysis移行 ===');
    
    try {
      // 既存データ確認
      const existingData = await db.pool.query(
        'SELECT airtable_record_id FROM user_ml_analysis WHERE airtable_record_id IS NOT NULL'
      );
      const existingRecordIds = new Set(existingData.rows.map(row => row.airtable_record_id));
      console.log(`   既存PostgreSQLデータ: ${existingRecordIds.size}件`);
      
      // Airtableから全データ取得
      const records = await this.getAllRecords('UserAnalysis');
      console.log(`   Airtable総件数: ${records.length}件`);
      
      for (const record of records) {
        this.stats.userAnalysis.processed++;
        
        try {
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
            (user_id_hash, mode, analysis_data_encrypted, airtable_record_id, zk_proof, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (airtable_record_id) DO NOTHING
          `, [
            hashedUserId,
            mode,
            encryptedData,
            record.id,
            zkProof,
            fields.LastUpdated ? new Date(fields.LastUpdated) : new Date(),
            new Date()
          ]);
          
          this.stats.userAnalysis.migrated++;
          existingRecordIds.add(record.id);
          
          if (this.stats.userAnalysis.migrated % 25 === 0) {
            console.log(`   ✅ 移行済み: ${this.stats.userAnalysis.migrated}件`);
          }
          
        } catch (error) {
          console.error(`   ❌ レコード処理エラー ${record.id}:`, error.message);
          this.stats.userAnalysis.errors++;
        }
      }
      
      console.log(`✅ UserAnalysis移行完了: ${this.stats.userAnalysis.migrated}件\n`);
      
    } catch (error) {
      console.error('❌ UserAnalysis移行エラー:', error.message);
      throw error;
    }
  }

  async migrateUserTraits() {
    console.log('👤 === UserTraits移行 ===');
    
    try {
      // Airtableから全データ取得を試行
      const records = await this.getAllRecords('UserTraits');
      console.log(`   Airtable総件数: ${records.length}件`);
      
      if (records.length === 0) {
        console.log('   ℹ️ UserTraitsテーブルにデータなし\n');
        return;
      }
      
      // 既存データ確認
      const existingData = await db.pool.query(
        'SELECT airtable_record_id FROM user_traits WHERE airtable_record_id IS NOT NULL'
      );
      const existingRecordIds = new Set(existingData.rows.map(row => row.airtable_record_id));
      
      for (const record of records) {
        this.stats.userTraits.processed++;
        
        try {
          if (existingRecordIds.has(record.id)) {
            this.stats.userTraits.skipped++;
            continue;
          }
          
          const fields = record.fields;
          const userId = fields.UserID || fields['User ID'];
          const traitsData = fields.TraitsData || fields['Traits Data'] || {};
          
          if (!userId) {
            this.stats.userTraits.errors++;
            continue;
          }
          
          const hashedUserId = crypto.createHash('sha256').update(userId).digest('hex');
          const encryptedData = encryptionUtils.encrypt(JSON.stringify(traitsData));
          
          await db.pool.query(`
            INSERT INTO user_traits 
            (user_id_hash, traits_data_encrypted, airtable_record_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (airtable_record_id) DO NOTHING
          `, [
            hashedUserId,
            encryptedData,
            record.id,
            fields.CreatedTime ? new Date(fields.CreatedTime) : new Date(),
            new Date()
          ]);
          
          this.stats.userTraits.migrated++;
          
        } catch (error) {
          console.error(`   ❌ レコード処理エラー ${record.id}:`, error.message);
          this.stats.userTraits.errors++;
        }
      }
      
      console.log(`✅ UserTraits移行完了: ${this.stats.userTraits.migrated}件\n`);
      
    } catch (error) {
      if (error.message.includes('NOT_FOUND') || error.statusCode === 404) {
        console.log('   ℹ️ UserTraitsテーブル未発見（スキップ）\n');
      } else {
        console.error('❌ UserTraits移行エラー:', error.message);
      }
    }
  }

  async migrateUsers() {
    console.log('👥 === Users移行 ===');
    
    try {
      const records = await this.getAllRecords('Users');
      console.log(`   Airtable総件数: ${records.length}件`);
      
      if (records.length === 0) {
        console.log('   ℹ️ Usersテーブルにデータなし\n');
        return;
      }
      
      const existingData = await db.pool.query(
        'SELECT airtable_record_id FROM users WHERE airtable_record_id IS NOT NULL'
      );
      const existingRecordIds = new Set(existingData.rows.map(row => row.airtable_record_id));
      
      for (const record of records) {
        this.stats.users.processed++;
        
        try {
          if (existingRecordIds.has(record.id)) {
            this.stats.users.skipped++;
            continue;
          }
          
          const fields = record.fields;
          const userId = fields.UserID || fields['User ID'];
          
          if (!userId) {
            this.stats.users.errors++;
            continue;
          }
          
          const hashedUserId = crypto.createHash('sha256').update(userId).digest('hex');
          const userData = {
            originalFields: fields,
            migrationDate: new Date().toISOString()
          };
          const encryptedData = encryptionUtils.encrypt(JSON.stringify(userData));
          
          await db.pool.query(`
            INSERT INTO users 
            (user_id_hash, user_data_encrypted, airtable_record_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (airtable_record_id) DO NOTHING
          `, [
            hashedUserId,
            encryptedData,
            record.id,
            fields.CreatedTime ? new Date(fields.CreatedTime) : new Date(),
            new Date()
          ]);
          
          this.stats.users.migrated++;
          
        } catch (error) {
          console.error(`   ❌ レコード処理エラー ${record.id}:`, error.message);
          this.stats.users.errors++;
        }
      }
      
      console.log(`✅ Users移行完了: ${this.stats.users.migrated}件\n`);
      
    } catch (error) {
      if (error.message.includes('NOT_FOUND') || error.statusCode === 404) {
        console.log('   ℹ️ Usersテーブル未発見（スキップ）\n');
      } else {
        console.error('❌ Users移行エラー:', error.message);
      }
    }
  }

  async migrateInteractions() {
    console.log('🔄 === Interactions移行 ===');
    
    try {
      const records = await this.getAllRecords('Interactions');
      console.log(`   Airtable総件数: ${records.length}件`);
      
      if (records.length === 0) {
        console.log('   ℹ️ Interactionsテーブルにデータなし\n');
        return;
      }
      
      // InteractionsはConversationHistoryと同様の構造なので、user_messagesに統合
      const existingData = await db.pool.query(
        'SELECT user_id, message_id FROM user_messages'
      );
      const existingSet = new Set(
        existingData.rows.map(row => `${row.user_id}:${row.message_id}`)
      );
      
      for (const record of records) {
        this.stats.interactions.processed++;
        
        try {
          const fields = record.fields;
          const userId = fields.UserID || fields['User ID'];
          const content = fields.Content;
          const role = fields.Role;
          
          if (!userId || !content || !role) {
            this.stats.interactions.errors++;
            continue;
          }
          
          const messageId = `interaction_${record.id}`;
          const hashedUserId = crypto.createHash('sha256').update(userId).digest('hex');
          const checkKey = `${hashedUserId}:${messageId}`;
          
          if (existingSet.has(checkKey)) {
            this.stats.interactions.skipped++;
            continue;
          }
          
          const encryptedContent = encryptionUtils.encrypt(content);
          const zkProof = crypto.createHash('sha256').update(hashedUserId + messageId + Date.now()).digest('hex').substring(0, 32);
          
          await db.pool.query(`
            INSERT INTO user_messages 
            (user_id, message_id, content, role, timestamp, mode, message_type, zk_proof, deletion_scheduled_at, privacy_level)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '180 days', 3)
          `, [
            hashedUserId,
            messageId,
            encryptedContent,
            role,
            fields.Timestamp ? new Date(fields.Timestamp) : new Date(),
            'interaction',
            'text',
            zkProof
          ]);
          
          this.stats.interactions.migrated++;
          existingSet.add(checkKey);
          
        } catch (error) {
          console.error(`   ❌ レコード処理エラー ${record.id}:`, error.message);
          this.stats.interactions.errors++;
        }
      }
      
      console.log(`✅ Interactions移行完了: ${this.stats.interactions.migrated}件\n`);
      
    } catch (error) {
      if (error.message.includes('NOT_FOUND') || error.statusCode === 404) {
        console.log('   ℹ️ Interactionsテーブル未発見（スキップ）\n');
      } else {
        console.error('❌ Interactions移行エラー:', error.message);
      }
    }
  }

  async migrateJobAnalysis() {
    console.log('💼 === JobAnalysis移行 ===');
    
    try {
      const records = await this.getAllRecords('JobAnalysis');
      console.log(`   Airtable総件数: ${records.length}件`);
      
      if (records.length === 0) {
        console.log('   ℹ️ JobAnalysisテーブルにデータなし\n');
        return;
      }
      
      const existingData = await db.pool.query(
        'SELECT airtable_record_id FROM job_analysis WHERE airtable_record_id IS NOT NULL'
      );
      const existingRecordIds = new Set(existingData.rows.map(row => row.airtable_record_id));
      
      for (const record of records) {
        this.stats.jobAnalysis.processed++;
        
        try {
          if (existingRecordIds.has(record.id)) {
            this.stats.jobAnalysis.skipped++;
            continue;
          }
          
          const fields = record.fields;
          const userId = fields.UserID || fields['User ID'];
          const jobData = fields.JobData || fields['Job Data'] || fields;
          
          if (!userId) {
            this.stats.jobAnalysis.errors++;
            continue;
          }
          
          const hashedUserId = crypto.createHash('sha256').update(userId).digest('hex');
          const encryptedData = encryptionUtils.encrypt(JSON.stringify(jobData));
          
          await db.pool.query(`
            INSERT INTO job_analysis 
            (user_id_hash, job_data_encrypted, airtable_record_id, created_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (airtable_record_id) DO NOTHING
          `, [
            hashedUserId,
            encryptedData,
            record.id,
            fields.CreatedTime ? new Date(fields.CreatedTime) : new Date()
          ]);
          
          this.stats.jobAnalysis.migrated++;
          
        } catch (error) {
          console.error(`   ❌ レコード処理エラー ${record.id}:`, error.message);
          this.stats.jobAnalysis.errors++;
        }
      }
      
      console.log(`✅ JobAnalysis移行完了: ${this.stats.jobAnalysis.migrated}件\n`);
      
    } catch (error) {
      if (error.message.includes('NOT_FOUND') || error.statusCode === 404) {
        console.log('   ℹ️ JobAnalysisテーブル未発見（スキップ）\n');
      } else {
        console.error('❌ JobAnalysis移行エラー:', error.message);
      }
    }
  }

  async getAllRecords(tableName) {
    console.log(`   📋 ${tableName}テーブルからデータ取得中...`);
    
    try {
      const records = await this.base(tableName).select().all();
      return records;
    } catch (error) {
      if (error.statusCode === 404 || error.message.includes('NOT_FOUND')) {
        console.log(`   ⚠️ ${tableName}テーブルが見つかりません`);
        return [];
      }
      throw error;
    }
  }

  printMigrationReport() {
    console.log('\n📊 === 完全移行レポート ===');
    
    const tables = [
      'conversationHistory',
      'userAnalysis', 
      'userTraits',
      'users',
      'interactions',
      'jobAnalysis'
    ];
    
    let totalProcessed = 0;
    let totalMigrated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    
    for (const table of tables) {
      const stats = this.stats[table];
      console.log(`\n${table.toUpperCase()}:`);
      console.log(`  📥 処理済み: ${stats.processed}件`);
      console.log(`  ✅ 移行完了: ${stats.migrated}件`);
      console.log(`  ⏭️ スキップ: ${stats.skipped}件`);
      console.log(`  ❌ エラー: ${stats.errors}件`);
      
      totalProcessed += stats.processed;
      totalMigrated += stats.migrated;
      totalSkipped += stats.skipped;
      totalErrors += stats.errors;
    }
    
    console.log('\n=== 総計 ===');
    console.log(`📥 総処理件数: ${totalProcessed}件`);
    console.log(`✅ 総移行件数: ${totalMigrated}件`);
    console.log(`⏭️ 総スキップ: ${totalSkipped}件`);
    console.log(`❌ 総エラー: ${totalErrors}件`);
    
    const successRate = totalProcessed > 0 ? ((totalMigrated + totalSkipped) / totalProcessed * 100).toFixed(2) : 0;
    console.log(`📈 成功率: ${successRate}%`);
    
    if (totalMigrated === 0 && totalProcessed > 0) {
      console.log('\n⚠️ 新規移行データなし - すべて既に移行済みです');
    } else if (totalMigrated > 0) {
      console.log(`\n🎉 新規移行完了: ${totalMigrated}件のデータを正常にPostgreSQLに移行しました`);
    }
  }
}

// 実行
if (require.main === module) {
  (async () => {
    const migration = new CompleteAirtableToSQLMigration();
    const success = await migration.execute();
    process.exit(success ? 0 : 1);
  })();
}

module.exports = CompleteAirtableToSQLMigration; 