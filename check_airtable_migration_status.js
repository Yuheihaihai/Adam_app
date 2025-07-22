/**
 * Airtable移行状況確認スクリプト
 * - 残存データの確認
 * - 移行済みデータとの照合
 * - データ整合性検証
 */

const Airtable = require('airtable');

async function checkAirtableMigrationStatus() {
  console.log('📊 Airtable移行状況確認開始...\n');
  
  try {
    // 環境変数確認
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
      console.log('❌ Airtable認証情報が見つかりません');
      return;
    }
    
    const base = new Airtable({ 
      apiKey: process.env.AIRTABLE_API_KEY 
    }).base(process.env.AIRTABLE_BASE_ID);
    
    // 1. ConversationHistoryテーブルの確認
    console.log('=== 1. ConversationHistoryテーブル確認 ===');
    
    const conversationRecords = await new Promise((resolve, reject) => {
      const records = [];
      base('ConversationHistory')
        .select({
          maxRecords: 100,
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
    
    console.log(`✅ ConversationHistory残存レコード数: ${conversationRecords.length}`);
    
    if (conversationRecords.length > 0) {
      console.log('\n📋 最新の残存データ（上位5件）:');
      conversationRecords.slice(0, 5).forEach((record, i) => {
        const userId = record.get('UserID') || 'N/A';
        const role = record.get('Role') || 'N/A';
        const timestamp = record.get('Timestamp') || 'N/A';
        const contentLength = (record.get('Content') || '').length;
        
        console.log(`   ${i+1}. UserID: ${userId.substring(0,12)}...`);
        console.log(`      Role: ${role}`);
        console.log(`      Content Length: ${contentLength} chars`);
        console.log(`      Timestamp: ${timestamp}`);
        console.log(`      Record ID: ${record.id}`);
        console.log('');
      });
      
      // ユーザー分布分析
      const userDistribution = {};
      conversationRecords.forEach(record => {
        const userId = record.get('UserID');
        if (userId) {
          userDistribution[userId] = (userDistribution[userId] || 0) + 1;
        }
      });
      
      console.log(`\n📈 ユーザー分布（${Object.keys(userDistribution).length}名）:`);
      Object.entries(userDistribution)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .forEach(([userId, count]) => {
          console.log(`   ${userId.substring(0,12)}...: ${count}件`);
        });
    }
    
    // 2. UserAnalysisテーブルの確認
    console.log('\n=== 2. UserAnalysisテーブル確認 ===');
    
    try {
      const userAnalysisRecords = await new Promise((resolve, reject) => {
        const records = [];
        base('UserAnalysis')
          .select({
            maxRecords: 50,
            sort: [{ field: 'UpdatedAt', direction: 'desc' }]
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
      
      console.log(`✅ UserAnalysis残存レコード数: ${userAnalysisRecords.length}`);
      
      if (userAnalysisRecords.length > 0) {
        console.log('\n📊 UserAnalysisサンプル（上位3件）:');
        userAnalysisRecords.slice(0, 3).forEach((record, i) => {
          const userId = record.get('UserID') || 'N/A';
          const mode = record.get('Mode') || 'N/A';
          const updatedAt = record.get('UpdatedAt') || 'N/A';
          
          console.log(`   ${i+1}. UserID: ${userId.substring(0,12)}...`);
          console.log(`      Mode: ${mode}`);
          console.log(`      UpdatedAt: ${updatedAt}`);
          console.log(`      Record ID: ${record.id}`);
          console.log('');
        });
      }
      
    } catch (userAnalysisError) {
      console.log('⚠️ UserAnalysisテーブル確認エラー:', userAnalysisError.message);
    }
    
    // 3. その他のテーブル確認
    console.log('\n=== 3. その他のテーブル確認 ===');
    
    const otherTables = ['Users', 'UserTraits', 'Interactions', 'JobAnalysis'];
    
    for (const tableName of otherTables) {
      try {
        const records = await new Promise((resolve, reject) => {
          const records = [];
          base(tableName)
            .select({ maxRecords: 10 })
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
        
        console.log(`   ${tableName}: ${records.length}件`);
        
      } catch (tableError) {
        console.log(`   ${tableName}: アクセスエラー (${tableError.message})`);
      }
    }
    
    // 4. 移行推奨事項
    console.log('\n=== 4. 移行推奨事項 ===');
    
    const totalRemaining = conversationRecords.length;
    
    if (totalRemaining === 0) {
      console.log('🎉 ConversationHistoryの移行は完了しています！');
    } else if (totalRemaining < 50) {
      console.log(`⚠️ 少量のデータが残存（${totalRemaining}件）`);
      console.log('   → 手動での最終移行を推奨');
    } else {
      console.log(`🚨 大量のデータが残存（${totalRemaining}件）`);
      console.log('   → 追加の一括移行が必要');
    }
    
    console.log('\n🎯 移行状況確認完了');
    
  } catch (error) {
    console.error('❌ 確認中にエラー発生:', error.message);
    console.error('詳細:', error);
  }
}

// スクリプト直接実行時
if (require.main === module) {
  checkAirtableMigrationStatus()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { checkAirtableMigrationStatus }; 