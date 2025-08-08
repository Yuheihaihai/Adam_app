/**
 * Conversation History Module
 * 
 * Provides functionality to store and retrieve user conversation history
 * Used by localML.js for analyzing conversation patterns
 */

// In-memory storage for conversation history
const conversationStore = {};
// Airtable はオプショナル依存。存在しない場合でも起動を継続する
let Airtable = null;
try {
  // 環境変数がなければ読み込まない最適化
  if (process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
    Airtable = require('airtable');
  }
} catch (e) {
  Airtable = null;
}

// Airtable設定
let airtableBase = null;
if (Airtable && process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
  airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
    .base(process.env.AIRTABLE_BASE_ID);
} else {
  console.warn('Airtable not configured or package unavailable. Conversation history persistence disabled.');
}

/**
 * Add a message to a user's conversation history
 * @param {string} userId - The user's unique identifier
 * @param {Object} message - The message object containing role and content
 */
async function addToConversationHistory(userId, message) {
  if (!conversationStore[userId]) {
    conversationStore[userId] = [];
  }
  
  const messageWithTimestamp = {
    ...message,
    timestamp: new Date().toISOString()
  };
  
  conversationStore[userId].push(messageWithTimestamp);
  
  // Limit history size (optional)
  if (conversationStore[userId].length > 100) {
    conversationStore[userId] = conversationStore[userId].slice(-100);
  }
  
  // Airtableにも保存
  await saveMessageToAirtable(userId, messageWithTimestamp);
}

/**
 * Airtableに会話メッセージを保存
 * @param {string} userId - ユーザーID
 * @param {Object} message - 保存するメッセージ
 */
async function saveMessageToAirtable(userId, message) {
  if (!airtableBase) return;
  
  try {
    console.log(`    ├─ Saving conversation message to Airtable for user ${userId}`);
    
    // データを準備
    const data = {
      UserID: userId,
      Role: message.role,
      Content: message.content || message.message,
      Timestamp: message.timestamp,
      Mode: message.mode || 'general', // モードを追加
      MessageType: message.type || 'text' // メッセージタイプを追加
    };
    
    // ConversationHistoryテーブルに保存を試みる
    try {
      await airtableBase('ConversationHistory').create([{
        fields: data
      }]);
      console.log(`    └─ Successfully saved message to ConversationHistory table`);
    } catch (tableErr) {
      // ConversationHistoryテーブルがない場合はUserAnalysisに保存を試みる
      if (tableErr.statusCode === 404 || tableErr.error === 'NOT_FOUND' || 
          (tableErr.message && tableErr.message.includes('could not be found'))) {
        
        console.log(`    ├─ ConversationHistory table not found. Attempting to save to UserAnalysis table...`);
        
        // AnalysisDataフィールドに会話データをJSON形式で保存
        const conversationData = {
          conversation: [message],
          lastUpdated: new Date().toISOString()
        };
        
        try {
          // 既存レコードを検索
          const records = await airtableBase('UserAnalysis')
            .select({
              filterByFormula: `AND({UserID} = "${userId}", {Mode} = "conversation")`,
              maxRecords: 1
            })
            .all();
          
          const analysisData = {
            UserID: userId,
            Mode: 'conversation',
            AnalysisData: JSON.stringify(conversationData),
            LastUpdated: new Date().toISOString()
          };
          
          if (records.length > 0) {
            // 既存のデータを読み取ってマージ
            let existingData = {};
            try {
              existingData = JSON.parse(records[0].get('AnalysisData') || '{"conversation":[]}');
              existingData.conversation = existingData.conversation || [];
              existingData.conversation.push(message);
              if (existingData.conversation.length > 100) {
                existingData.conversation = existingData.conversation.slice(-100);
              }
              existingData.lastUpdated = new Date().toISOString();
              
              analysisData.AnalysisData = JSON.stringify(existingData);
            } catch (e) {
              console.error('Error parsing existing conversation data:', e);
            }
            
            // 更新
            await airtableBase('UserAnalysis').update([{
              id: records[0].id,
              fields: analysisData
            }]);
            console.log(`    └─ Updated conversation in UserAnalysis table for user ${userId}`);
          } else {
            // 新規作成
            await airtableBase('UserAnalysis').create([{
              fields: analysisData
            }]);
            console.log(`    └─ Created new conversation in UserAnalysis table for user ${userId}`);
          }
        } catch (analysisTableErr) {
          console.error('Error saving to UserAnalysis table:', analysisTableErr);
          console.log('Please make sure the UserAnalysis table has the following fields:');
          console.log('- UserID (text)');
          console.log('- Mode (text)');
          console.log('- AnalysisData (long text)');
          console.log('- LastUpdated (date)');
        }
      } else {
        throw tableErr;
      }
    }
  } catch (err) {
    console.error('Error saving message to Airtable:', err);
    console.log('Please create ConversationHistory table with the following fields:');
    console.log('- UserID (text)');
    console.log('- Role (text)');
    console.log('- Content (long text)');
    console.log('- Timestamp (date)');
    console.log('- Mode (text)');
    console.log('- MessageType (text)');
  }
}

/**
 * ユーザーの会話履歴を取得
 * @param {string} userId - ユーザーID
 * @param {number} limit - Maximum number of messages to retrieve (default: 20)
 * @returns {Array} - Array of conversation messages
 */
async function getUserConversationHistory(userId, limit = 20) {
  if (!conversationStore[userId]) {
    // メモリにない場合はAirtableから取得を試みる
    await loadConversationHistoryFromAirtable(userId, limit);
  }
  
  if (!conversationStore[userId]) {
    return [];
  }
  
  // Return the most recent messages up to the limit
  return conversationStore[userId].slice(-limit);
}

/**
 * Airtableから会話履歴を読み込む
 * @param {string} userId - ユーザーID
 * @param {number} limit - 取得する最大メッセージ数
 */
async function loadConversationHistoryFromAirtable(userId, limit = 20) {
  if (!airtableBase) return;
  
  try {
    // まずConversationHistoryテーブルをチェック
    try {
      const records = await airtableBase('ConversationHistory')
        .select({
          filterByFormula: `{UserID} = "${userId}"`,
          sort: [{ field: 'Timestamp', direction: 'desc' }],
          maxRecords: limit
        })
        .all();
      
      if (records.length > 0) {
        if (!conversationStore[userId]) {
          conversationStore[userId] = [];
        }
        
        // 降順で取得したレコードを昇順に変換
        records.reverse().forEach(record => {
          const message = {
            role: record.get('Role'),
            content: record.get('Content'),
            timestamp: record.get('Timestamp'),
            mode: record.get('Mode'),
            type: record.get('MessageType')
          };
          
          conversationStore[userId].push(message);
        });
        
        console.log(`Loaded ${records.length} messages from ConversationHistory for user ${userId}`);
        return;
      }
    } catch (tableErr) {
      // テーブルが存在しない場合は無視
    }
    
    // ConversationHistoryテーブルがないか、データがない場合はUserAnalysisをチェック
    const records = await airtableBase('UserAnalysis')
      .select({
        filterByFormula: `AND({UserID} = "${userId}", {Mode} = "conversation")`,
        maxRecords: 1
      })
      .all();
    
    if (records.length > 0) {
      try {
        const rawData = records[0].get('AnalysisData');
        if (rawData) {
          const data = JSON.parse(rawData);
          if (data.conversation && Array.isArray(data.conversation)) {
            conversationStore[userId] = data.conversation;
            console.log(`Loaded ${data.conversation.length} messages from UserAnalysis for user ${userId}`);
          }
        }
      } catch (e) {
        console.error('Error parsing conversation data from UserAnalysis:', e);
      }
    }
  } catch (err) {
    console.error('Error loading conversation history from Airtable:', err);
  }
}

/**
 * Clear a user's conversation history
 * @param {string} userId - The user's unique identifier
 */
async function clearConversationHistory(userId) {
  conversationStore[userId] = [];
  
  // Airtableからも削除（オプション）
  if (airtableBase) {
    try {
      // ConversationHistoryテーブルから削除を試みる
      try {
        const records = await airtableBase('ConversationHistory')
          .select({
            filterByFormula: `{UserID} = "${userId}"`
          })
          .all();
        
        if (records.length > 0) {
          const recordIds = records.map(record => record.id);
          const batchSize = 10; // Airtableの制限
          
          for (let i = 0; i < recordIds.length; i += batchSize) {
            const batch = recordIds.slice(i, i + batchSize);
            await airtableBase('ConversationHistory').destroy(batch);
          }
          
          console.log(`Cleared ${records.length} messages from ConversationHistory for user ${userId}`);
        }
      } catch (tableErr) {
        // テーブルが存在しない場合は無視
      }
      
      // UserAnalysisテーブルの会話データを空にする
      const records = await airtableBase('UserAnalysis')
        .select({
          filterByFormula: `AND({UserID} = "${userId}", {Mode} = "conversation")`,
          maxRecords: 1
        })
        .all();
      
      if (records.length > 0) {
        const emptyConversation = {
          conversation: [],
          lastUpdated: new Date().toISOString()
        };
        
        await airtableBase('UserAnalysis').update([{
          id: records[0].id,
          fields: {
            AnalysisData: JSON.stringify(emptyConversation),
            LastUpdated: new Date().toISOString()
          }
        }]);
        
        console.log(`Cleared conversation data in UserAnalysis for user ${userId}`);
      }
    } catch (err) {
      console.error('Error clearing conversation history from Airtable:', err);
    }
  }
}

module.exports = {
  addToConversationHistory,
  getUserConversationHistory,
  clearConversationHistory
}; 