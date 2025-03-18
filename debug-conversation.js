require('dotenv').config();
const Airtable = require('airtable');

// ユーザーIDを指定（LINE Bot のユーザーID）
const TEST_USER_ID = 'U13186758f1191e87da4aaa2fe4bdb529'; // 実際のユーザーIDに置き換えてください

// Airtable接続情報
console.log(`\n=== Airtable接続情報 ===`);
console.log(`API_KEY存在: ${!!process.env.AIRTABLE_API_KEY}`);
console.log(`BASE_ID存在: ${!!process.env.AIRTABLE_BASE_ID}`);

// データベース接続を初期化
const airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

// 会話履歴取得関数 - fetchUserHistoryとほぼ同じロジック
async function testFetchConversation(userId) {
  try {
    console.log(`\n=== ${userId} の会話履歴取得テスト開始 ===`);
    
    // 1. ConversationHistoryテーブルの確認
    console.log(`\n1. ConversationHistoryテーブルからデータ取得を試みます...`);
    try {
      const conversationRecords = await airtableBase('ConversationHistory')
        .select({
          filterByFormula: `{UserID} = "${userId}"`,
          sort: [{ field: 'Timestamp', direction: 'asc' }],
          maxRecords: 30
        })
        .all();
        
      console.log(`結果: ${conversationRecords.length}件のレコードが見つかりました`);
      
      if (conversationRecords.length > 0) {
        console.log(`\n最新の5件を表示します:`);
        const recentRecords = conversationRecords.slice(-5);
        
        for (let i = 0; i < recentRecords.length; i++) {
          const record = recentRecords[i];
          console.log(`[${i+1}] Role: ${record.get('Role')}`);
          console.log(`    Content: ${record.get('Content').substring(0, 50)}${record.get('Content').length > 50 ? '...' : ''}`);
          console.log(`    Timestamp: ${record.get('Timestamp')}`);
          console.log('---');
        }
      }
    } catch (err) {
      console.error(`ConversationHistoryテーブルの取得に失敗: ${err.message}`);
    }
    
    // 2. UserAnalysisテーブルの確認
    console.log(`\n2. UserAnalysisテーブルからデータ取得を試みます...`);
    try {
      const userAnalysisRecords = await airtableBase('UserAnalysis')
        .select({
          filterByFormula: `AND({UserID} = "${userId}", {Mode} = "conversation")`,
          maxRecords: 1
        })
        .all();
        
      console.log(`結果: ${userAnalysisRecords.length}件のレコードが見つかりました`);
      
      if (userAnalysisRecords.length > 0) {
        const rawData = userAnalysisRecords[0].get('AnalysisData');
        if (rawData) {
          try {
            const data = JSON.parse(rawData);
            if (data.conversation && Array.isArray(data.conversation)) {
              console.log(`UserAnalysisテーブルに ${data.conversation.length} 件の会話履歴があります`);
            }
          } catch (jsonErr) {
            console.error(`JSON解析エラー: ${jsonErr.message}`);
          }
        }
      }
    } catch (err) {
      console.error(`UserAnalysisテーブルの取得に失敗: ${err.message}`);
    }
    
    // 3. INTERACTIONSテーブルの確認
    console.log(`\n3. INTERACTIONSテーブルからデータ取得を試みます...`);
    try {
      const interactionsRecords = await airtableBase('INTERACTIONS')
        .select({
          filterByFormula: `{UserID} = "${userId}"`,
          sort: [{ field: 'Timestamp', direction: 'desc' }],
          maxRecords: 30
        })
        .all();
        
      console.log(`結果: ${interactionsRecords.length}件のレコードが見つかりました`);
      
      if (interactionsRecords.length > 0) {
        console.log(`\n最新の5件を表示します:`);
        const recentRecords = interactionsRecords.slice(0, 5);
        
        for (let i = 0; i < recentRecords.length; i++) {
          const record = recentRecords[i];
          console.log(`[${i+1}] Role: ${record.get('Role')}`);
          console.log(`    Content: ${record.get('Content').substring(0, 50)}${record.get('Content').length > 50 ? '...' : ''}`);
          console.log(`    Timestamp: ${record.get('Timestamp')}`);
          console.log('---');
        }
      }
    } catch (err) {
      console.error(`INTERACTIONSテーブルの取得に失敗: ${err.message}`);
    }
    
    console.log(`\n=== テスト完了 ===`);
  } catch (error) {
    console.error('エラーが発生しました:', error);
  }
}

// テスト実行
testFetchConversation(TEST_USER_ID)
  .then(() => console.log('デバッグ完了'))
  .catch(err => console.error('テスト失敗:', err)); 