/**
 * 最終データ移行・検証スクリプト
 * - 残存Airtableデータの完全移行
 * - PostgreSQL動作確認
 * - データ整合性検証
 */

const Airtable = require('airtable');
const db = require('./db');

async function finalMigrationAndVerification() {
  console.log('🚀 最終データ移行・検証開始...\n');
  
  let stats = {
    airtableRemaining: 0,
    migrationSuccess: 0,
    migrationErrors: 0,
    postgresqlRecords: 0,
    readWriteTest: false
  };
  
  try {
    // 1. PostgreSQL接続確認
    console.log('=== 1. PostgreSQL接続確認 ===');
    const dbTest = await db.query('SELECT COUNT(*) as total FROM user_messages');
    // db.queryは配列を返すので、適切にアクセス
    if (dbTest && Array.isArray(dbTest) && dbTest.length > 0 && dbTest[0].total) {
      stats.postgresqlRecords = parseInt(dbTest[0].total);
      console.log(`✅ PostgreSQL接続OK - 既存レコード数: ${stats.postgresqlRecords}`);
    } else {
      throw new Error('PostgreSQL接続またはuser_messagesテーブルに問題があります');
    }
    
    // 2. Airtable残存データ確認
    console.log('\n=== 2. Airtable残存データ確認 ===');
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      console.log('⚠️ Airtable認証情報なし - PostgreSQLのみで動作中');
    } else {
      const base = new Airtable({ 
        apiKey: process.env.AIRTABLE_API_KEY 
      }).base(process.env.AIRTABLE_BASE_ID);
      
      // 残存データ取得
      const remainingRecords = await new Promise((resolve, reject) => {
        const records = [];
        base('ConversationHistory')
          .select({
            maxRecords: 200, // より多くのデータをチェック
            sort: [{ field: 'Timestamp', direction: 'desc' }]
          })
          .eachPage(
            (pageRecords, fetchNextPage) => {
              records.push(...pageRecords);
              fetchNextPage();
            },
            (err) => {
              if (err) reject(err);
              else resolve(records);
            }
          );
      });
      
      stats.airtableRemaining = remainingRecords.length;
      console.log(`📊 Airtable残存レコード数: ${stats.airtableRemaining}`);
      
      // 3. 残存データの移行実行
      if (stats.airtableRemaining > 0) {
        console.log('\n=== 3. 残存データ移行実行 ===');
        console.log(`移行対象: ${stats.airtableRemaining}件`);
        
        for (let i = 0; i < remainingRecords.length; i++) {
          const record = remainingRecords[i];
          
          try {
            const userId = record.get('UserID');
            const content = record.get('Content');
            const role = record.get('Role');
            const timestamp = record.get('Timestamp');
            const messageType = record.get('MessageType') || 'text';
            
            // 必須フィールドチェック
            if (!userId || !content || !role) {
              console.log(`⚠️ スキップ (${i+1}/${stats.airtableRemaining}): 必須フィールド不足`);
              continue;
            }
            
            // PostgreSQLに安全に移行
            const messageId = `airtable-${record.id}-${Date.now()}`;
            
            await db.storeSecureUserMessage(
              userId,
              messageId,
              content,
              role,
              'general',
              messageType
            );
            
            stats.migrationSuccess++;
            
            if ((i + 1) % 10 === 0) {
              console.log(`   進捗: ${i + 1}/${stats.airtableRemaining} (${Math.round((i + 1) / stats.airtableRemaining * 100)}%)`);
            }
            
          } catch (migrationError) {
            stats.migrationErrors++;
            console.log(`❌ 移行エラー (${i+1}/${stats.airtableRemaining}):`, migrationError.message);
          }
        }
        
        console.log(`✅ 移行完了: 成功 ${stats.migrationSuccess}件, エラー ${stats.migrationErrors}件`);
      } else {
        console.log('✅ 移行対象データなし - すべて移行済み');
      }
    }
    
    // 4. PostgreSQL読み書きテスト
    console.log('\n=== 4. PostgreSQL読み書きテスト ===');
    const testUserId = 'U' + 'final-test'.padEnd(32, '0');
    const testMessage = '最終検証テストメッセージ - ' + new Date().toISOString();
    
    try {
      // 書き込みテスト
      await db.storeSecureUserMessage(
        testUserId,
        'final-test-' + Date.now(),
        testMessage,
        'user',
        'general',
        'text'
      );
      
      // 読み込みテスト
      const testHistory = await db.fetchSecureUserHistory(testUserId, 1);
      
      if (testHistory && Array.isArray(testHistory) && testHistory.length > 0) {
        const retrievedContent = testHistory[0].content;
        if (retrievedContent === testMessage) {
          stats.readWriteTest = true;
          console.log('✅ 読み書きテスト成功');
        } else {
          console.log('❌ 読み書きテスト失敗: 内容不一致');
          console.log(`   期待値: "${testMessage}"`);
          console.log(`   実際値: "${retrievedContent}"`);
        }
      } else {
        console.log('❌ 読み書きテスト失敗: データ取得できず');
      }
      
    } catch (testError) {
      console.log('❌ 読み書きテスト失敗:', testError.message);
    }
    
    // 5. 最終状況確認
    console.log('\n=== 5. 最終状況確認 ===');
    const finalDbTest = await db.query('SELECT COUNT(*) as total FROM user_messages');
    const finalRecordCount = finalDbTest && Array.isArray(finalDbTest) && finalDbTest[0] ? parseInt(finalDbTest[0].total) : 0;
    
    console.log(`📊 最終結果:`);
    console.log(`   - PostgreSQL最終レコード数: ${finalRecordCount}`);
    console.log(`   - 移行前レコード数: ${stats.postgresqlRecords}`);
    console.log(`   - 新規移行成功: ${stats.migrationSuccess}`);
    console.log(`   - 移行エラー: ${stats.migrationErrors}`);
    console.log(`   - Airtable残存: ${stats.airtableRemaining}`);
    console.log(`   - 読み書きテスト: ${stats.readWriteTest ? '✅ 成功' : '❌ 失敗'}`);
    
    // 6. 総合判定
    console.log('\n=== 6. 総合判定 ===');
    
    const isFullyMigrated = stats.airtableRemaining === 0 || stats.migrationSuccess === stats.airtableRemaining;
    const isPgsqlWorking = stats.readWriteTest && finalRecordCount > 0;
    
    if (isFullyMigrated && isPgsqlWorking) {
      console.log('🎉 総合判定: 完全成功');
      console.log('   ✅ データ移行完了');
      console.log('   ✅ PostgreSQL正常動作');
      console.log('   ✅ システム準備完了');
    } else {
      console.log('⚠️ 総合判定: 要注意');
      if (!isFullyMigrated) {
        console.log('   ❌ データ移行未完了');
      }
      if (!isPgsqlWorking) {
        console.log('   ❌ PostgreSQL動作問題');
      }
    }
    
    console.log('\n🎯 最終検証完了');
    
    return {
      success: isFullyMigrated && isPgsqlWorking,
      stats: stats
    };
    
  } catch (error) {
    console.error('❌ 最終検証中にエラー発生:', error.message);
    console.error('詳細:', error);
    return {
      success: false,
      error: error.message,
      stats: stats
    };
  }
}

// スクリプト直接実行時
if (require.main === module) {
  finalMigrationAndVerification()
    .then(result => {
      console.log('\n🏁 最終結果:', result.success ? '成功' : '失敗');
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { finalMigrationAndVerification }; 