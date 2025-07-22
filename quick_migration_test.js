// quick_migration_test.js
// 小バッチ移行テスト（タイムアウト回避）

require('dotenv').config();
const db = require('./db');
const Airtable = require('airtable');
const crypto = require('crypto');

// 暗号化サービスをインポート
const encryptionUtils = require('./encryption_utils');

class QuickMigrationTest {
  constructor() {
    this.airtable = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY });
    this.base = this.airtable.base(process.env.AIRTABLE_BASE_ID);
    this.stats = { total: 0, migrated: 0, skipped: 0, errors: 0 };
  }

  async execute() {
    console.log('🚀 === QUICK MIGRATION TEST (10 records) ===\n');
    
    try {
      // ConversationHistoryテーブルから最初の10件のみ移行テスト
      console.log('📧 ConversationHistory 10件テスト移行開始...');
      
      const records = await this.getRecordsLimited('ConversationHistory', 10);
      console.log(`   取得件数: ${records.length}件`);
      
      for (const record of records) {
        this.stats.total++;
        
        try {
          const fields = record.fields;
          const messageId = fields.MessageID || fields['Message ID'] || record.id;
          const userId = fields.UserID || fields['User ID'];
          const content = fields.Content;
          const role = fields.Role;
          
          if (!userId || !content || !role) {
            console.log(`   ⚠️ 必須フィールド不足: ${record.id}`);
            this.stats.errors++;
            continue;
          }

          // 既存チェック
          const hashedUserId = crypto.createHash('sha256').update(userId).digest('hex');
          const existingCheck = await db.pool.query(
            'SELECT id FROM user_messages WHERE user_id = $1 AND message_id = $2',
            [hashedUserId, messageId]
          );

          if (existingCheck.rows.length > 0) {
            console.log(`   📝 スキップ（既存）: ${messageId}`);
            this.stats.skipped++;
            continue;
          }

          // 新規挿入
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
            fields.MessageType || 'text',
            zkProof
          ]);

          console.log(`   ✅ 移行成功: ${messageId}`);
          this.stats.migrated++;

        } catch (error) {
          console.error(`   ❌ 移行エラー ${record.id}:`, error.message);
          this.stats.errors++;
        }
      }
      
      console.log('\n📊 テスト移行結果:');
      console.log(`   合計: ${this.stats.total}件`);
      console.log(`   移行: ${this.stats.migrated}件`);
      console.log(`   スキップ: ${this.stats.skipped}件`);
      console.log(`   エラー: ${this.stats.errors}件`);
      
    } catch (error) {
      console.error('❌ テスト移行エラー:', error);
      throw error;
    }
  }

  async getRecordsLimited(tableName, maxRecords) {
    const records = [];
    let count = 0;
    
    await this.base(tableName).select({
      maxRecords: maxRecords,
      view: 'Grid view'
    }).eachPage((pageRecords, fetchNextPage) => {
      for (const record of pageRecords) {
        if (count >= maxRecords) break;
        records.push(record);
        count++;
      }
      if (count < maxRecords) fetchNextPage();
    });
    
    return records;
  }
}

// スクリプト実行
if (require.main === module) {
  const migration = new QuickMigrationTest();
  migration.execute()
    .then(() => {
      console.log('\n✅ テスト移行完了！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ テスト移行失敗:', error);
      process.exit(1);
    });
}

module.exports = QuickMigrationTest; 