require('dotenv').config();
const Airtable = require('airtable');
const sqlite3 = require('sqlite3').verbose();

async function compareData() {
  console.log('🔍 === SQLite vs Airtable データ比較 ===\n');
  
  // SQLiteデータ確認
  console.log('📁 SQLite データベース確認...');
  const db = new sqlite3.Database('airtable_migration.db');
  
  const sqliteData = {};
  
  // SQLiteのテーブル件数確認
  await new Promise((resolve) => {
    db.get('SELECT COUNT(*) as count FROM user_messages', (err, row) => {
      if (err) {
        console.error('❌ user_messages エラー:', err.message);
        sqliteData.user_messages = 0;
      } else {
        sqliteData.user_messages = row.count;
        console.log(`📊 SQLite user_messages: ${row.count}件`);
      }
      resolve();
    });
  });
  
  await new Promise((resolve) => {
    db.get('SELECT COUNT(*) as count FROM user_analysis', (err, row) => {
      if (err) {
        console.error('❌ user_analysis エラー:', err.message);
        sqliteData.user_analysis = 0;
      } else {
        sqliteData.user_analysis = row.count;
        console.log(`📊 SQLite user_analysis: ${row.count}件`);
      }
      resolve();
    });
  });
  
  await new Promise((resolve) => {
    db.get('SELECT COUNT(*) as count FROM job_analysis', (err, row) => {
      if (err) {
        console.error('❌ job_analysis エラー:', err.message);
        sqliteData.job_analysis = 0;
      } else {
        sqliteData.job_analysis = row.count;
        console.log(`📊 SQLite job_analysis: ${row.count}件`);
      }
      resolve();
    });
  });
  
  db.close();
  
  // Airtableデータ確認（全件数取得）
  console.log('\n📊 Airtable 全データ確認...');
  const base = new Airtable({ 
    apiKey: process.env.AIRTABLE_API_KEY 
  }).base(process.env.AIRTABLE_BASE_ID);
  
  const airtableData = {};
  
  // ConversationHistory
  console.log('🔍 ConversationHistory 全件確認中...');
  let conversationCount = 0;
  try {
    await base('ConversationHistory').select().eachPage((records, fetchNextPage) => {
      conversationCount += records.length;
      console.log(`  現在: ${conversationCount}件...`);
      fetchNextPage();
    });
    airtableData.ConversationHistory = conversationCount;
    console.log(`✅ ConversationHistory 総計: ${conversationCount}件`);
  } catch (error) {
    console.error(`❌ ConversationHistory エラー: ${error.message}`);
    airtableData.ConversationHistory = 0;
  }
  
  // UserAnalysis
  console.log('🔍 UserAnalysis 全件確認中...');
  let userAnalysisCount = 0;
  try {
    await base('UserAnalysis').select().eachPage((records, fetchNextPage) => {
      userAnalysisCount += records.length;
      console.log(`  現在: ${userAnalysisCount}件...`);
      fetchNextPage();
    });
    airtableData.UserAnalysis = userAnalysisCount;
    console.log(`✅ UserAnalysis 総計: ${userAnalysisCount}件`);
  } catch (error) {
    console.error(`❌ UserAnalysis エラー: ${error.message}`);
    airtableData.UserAnalysis = 0;
  }
  
  // JobAnalysis
  console.log('🔍 JobAnalysis 全件確認中...');
  let jobAnalysisCount = 0;
  try {
    await base('JobAnalysis').select().eachPage((records, fetchNextPage) => {
      jobAnalysisCount += records.length;
      console.log(`  現在: ${jobAnalysisCount}件...`);
      fetchNextPage();
    });
    airtableData.JobAnalysis = jobAnalysisCount;
    console.log(`✅ JobAnalysis 総計: ${jobAnalysisCount}件`);
  } catch (error) {
    console.error(`❌ JobAnalysis エラー: ${error.message}`);
    airtableData.JobAnalysis = 0;
  }
  
  // 比較結果
  console.log('\n🔍 === データ比較結果 ===');
  console.log('\n📨 メッセージデータ:');
  console.log(`  Airtable ConversationHistory: ${airtableData.ConversationHistory}件`);
  console.log(`  SQLite user_messages: ${sqliteData.user_messages}件`);
  const messageDiff = airtableData.ConversationHistory - sqliteData.user_messages;
  if (messageDiff > 0) {
    console.log(`  ⚠️  不足: ${messageDiff}件が移行されていません`);
  } else if (messageDiff < 0) {
    console.log(`  ✅ SQLiteに${Math.abs(messageDiff)}件多くあります`);
  } else {
    console.log(`  ✅ 完全一致`);
  }
  
  console.log('\n📊 ユーザー分析データ:');
  console.log(`  Airtable UserAnalysis: ${airtableData.UserAnalysis}件`);
  console.log(`  SQLite user_analysis: ${sqliteData.user_analysis}件`);
  const userAnalysisDiff = airtableData.UserAnalysis - sqliteData.user_analysis;
  if (userAnalysisDiff > 0) {
    console.log(`  ⚠️  不足: ${userAnalysisDiff}件が移行されていません`);
  } else if (userAnalysisDiff < 0) {
    console.log(`  ✅ SQLiteに${Math.abs(userAnalysisDiff)}件多くあります`);
  } else {
    console.log(`  ✅ 完全一致`);
  }
  
  console.log('\n💼 ジョブ分析データ:');
  console.log(`  Airtable JobAnalysis: ${airtableData.JobAnalysis}件`);
  console.log(`  SQLite job_analysis: ${sqliteData.job_analysis}件`);
  const jobAnalysisDiff = airtableData.JobAnalysis - sqliteData.job_analysis;
  if (jobAnalysisDiff > 0) {
    console.log(`  ⚠️  不足: ${jobAnalysisDiff}件が移行されていません`);
  } else if (jobAnalysisDiff < 0) {
    console.log(`  ✅ SQLiteに${Math.abs(jobAnalysisDiff)}件多くあります`);
  } else {
    console.log(`  ✅ 完全一致`);
  }
  
  // 総合判定
  const totalAirtable = airtableData.ConversationHistory + airtableData.UserAnalysis + airtableData.JobAnalysis;
  const totalSQLite = sqliteData.user_messages + sqliteData.user_analysis + sqliteData.job_analysis;
  const totalDiff = totalAirtable - totalSQLite;
  
  console.log('\n🎯 === 総合結果 ===');
  console.log(`Airtable 総データ数: ${totalAirtable}件`);
  console.log(`SQLite 総データ数: ${totalSQLite}件`);
  
  if (totalDiff > 0) {
    console.log(`\n❌ ${totalDiff}件のデータが不足しています！`);
    console.log('🔄 追加移行が必要です');
    return false;
  } else if (totalDiff < 0) {
    console.log(`\n✅ SQLiteに${Math.abs(totalDiff)}件多くのデータがあります`);
    return true;
  } else {
    console.log('\n✅ 完全に同期されています！');
    return true;
  }
}

compareData().catch(console.error);
