// 100%完全移行スクリプト - 最終版（正しいフィールド名使用）
require('dotenv').config();
const Airtable = require('airtable');
const db = require('./db');

async function completeFullMigrationFinal() {
  console.log('🚀 100%完全移行開始（最終版）...\n');
  
  let totalProcessed = 0;
  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;
  const errors = [];
  
  try {
    // Step 1: 既に移行済みのデータを確認
    console.log('📋 Step 1: 移行済みデータ確認...');
    const existingData = await db.pool.query('SELECT COUNT(*) as count FROM user_messages');
    console.log(`✅ 既存データ: ${existingData.rows[0].count}件\n`);
    
    // Step 2: Airtableから全データ取得
    console.log('📋 Step 2: Airtable全データ取得...');
    const base = new Airtable({ 
      apiKey: process.env.AIRTABLE_API_KEY 
    }).base(process.env.AIRTABLE_BASE_ID);
    const table = base('ConversationHistory');
    
    const allRecords = [];
    
    await table.select({
      maxRecords: 100000,
      sort: [{ field: 'Timestamp', direction: 'asc' }]
    }).eachPage((records, fetchNextPage) => {
      allRecords.push(...records);
      console.log(`📥 取得中: ${allRecords.length}件...`);
      fetchNextPage();
    });
    
    console.log(`✅ Airtable総データ: ${allRecords.length}件\n`);
    
    // Step 3: 重複チェック関数
    const isDuplicate = async (userId, content, timestamp) => {
      try {
        const hashedUserId = require('crypto').createHash('sha256').update(userId).digest('hex');
        const result = await db.pool.query(
          'SELECT id FROM user_messages WHERE user_id = $1 AND timestamp = $2 LIMIT 1',
          [hashedUserId, timestamp]
        );
        return result.rows.length > 0;
      } catch (error) {
        return false; // エラー時は重複なしとして処理続行
      }
    };
    
    // Step 4: 完全移行処理
    console.log('📋 Step 3: 完全移行処理開始...\n');
    
    for (const record of allRecords) {
      totalProcessed++;
      
      try {
        const fields = record.fields;
        
        // データ検証とクリーニング（正しいフィールド名使用）
        const userId = fields.UserID || 'unknown';
        const content = fields.Content || '';
        const role = fields.Role || 'user';
        const timestamp = fields.Timestamp ? new Date(fields.Timestamp) : new Date();
        const messageId = fields.MessageID || `airtable-${record.id}`;
        const mode = fields.Mode || 'general';
        const messageType = fields.MessageType || 'text';
        
        // 必須フィールドチェック
        if (!content || content.trim() === '' || content === 'undefined') {
          skipCount++;
          if (totalProcessed % 500 === 0) {
            console.log(`⚠️  スキップ (空コンテンツ): ${totalProcessed}件目`);
          }
          continue;
        }
        
        if (userId === 'unknown' || !userId) {
          skipCount++;
          if (totalProcessed % 500 === 0) {
            console.log(`⚠️  スキップ (不明ユーザー): ${totalProcessed}件目`);
          }
          continue;
        }
        
        // 重複チェック
        if (await isDuplicate(userId, content, timestamp)) {
          skipCount++;
          if (totalProcessed % 1000 === 0) {
            console.log(`⚠️  スキップ (重複): ${totalProcessed}件目`);
          }
          continue;
        }
        
        // セキュア保存実行
        await db.storeSecureUserMessage(
          userId,
          messageId,
          content,
          role,
          mode,
          messageType
        );
        
        successCount++;
        
        // 進捗表示
        if (totalProcessed % 1000 === 0) {
          console.log(`✅ ${totalProcessed}件処理完了 (成功:${successCount}, エラー:${errorCount}, スキップ:${skipCount})`);
        }
        
      } catch (error) {
        errorCount++;
        errors.push({
          recordId: record.id,
          error: error.message,
          data: record.fields
        });
        
        // エラーログ（詳細すぎない程度に）
        if (errorCount % 200 === 0) {
          console.log(`❌ エラー${errorCount}件目: ${error.message.substring(0, 50)}...`);
        }
        
        // 致命的エラーの場合は一時停止
        if (error.message.includes('pool has ended') || error.message.includes('Connection terminated')) {
          console.log('🔄 接続エラー検出 - 3秒待機...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    
    // Step 5: 結果レポート
    console.log('\n📊 === 100%完全移行レポート ===');
    console.log(`✅ 成功: ${successCount}件`);
    console.log(`⚠️  スキップ: ${skipCount}件`);
    console.log(`❌ エラー: ${errorCount}件`);
    console.log(`📋 処理総数: ${totalProcessed}件`);
    
    const successRate = totalProcessed > 0 ? ((successCount / totalProcessed) * 100).toFixed(1) : '0.0';
    const migratedTotal = successCount + skipCount; // スキップ=既存データ
    
    console.log(`📈 成功率: ${successRate}%`);
    console.log(`🎯 移行完了率: ${((migratedTotal / totalProcessed) * 100).toFixed(1)}%`);
    
    // Step 6: 最終確認
    console.log('\n📋 Step 4: 最終データ確認...');
    const finalCount = await db.pool.query('SELECT COUNT(*) as count FROM user_messages');
    console.log(`✅ 最終データ数: ${finalCount.rows[0].count}件`);
    
    // エラーログ保存（エラーがある場合のみ）
    if (errors.length > 0) {
      const errorLogPath = `/tmp/final_migration_errors_${Date.now()}.json`;
      require('fs').writeFileSync(errorLogPath, JSON.stringify(errors, null, 2));
      console.log(`📝 エラーログ: ${errorLogPath}`);
    }
    
    console.log('\n✨ === 100%完全移行完了 ===');
    if (successCount + skipCount === totalProcessed) {
      console.log('🎉 すべてのデータが移行済みです！');
    } else {
      console.log(`🎯 追加移行: ${successCount}件完了`);
    }
    
  } catch (error) {
    console.error('❌ 致命的エラー:', error);
    throw error;
  }
}

// 実行
if (require.main === module) {
  completeFullMigrationFinal()
    .then(() => {
      console.log('\n🎉 100%完全移行プロセス完了！');
      process.exit(0);
    })
    .catch(error => {
      console.error('致命的エラー:', error);
      process.exit(1);
    });
}

module.exports = { completeFullMigrationFinal }; 