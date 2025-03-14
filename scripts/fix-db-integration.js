// fix-db-integration.js
// データベース統合の問題を修正するスクリプト
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// server.jsファイルのパス
const serverJsPath = path.join(__dirname, '..', 'server.js');

// 修正内容
async function fixDatabaseIntegration() {
  console.log('データベース統合の問題を修正します...');
  
  try {
    // server.jsファイルの読み込み
    let serverJsContent = fs.readFileSync(serverJsPath, 'utf8');
    
    // storeInteraction関数を修正
    console.log('storeInteraction関数を修正しています...');
    
    // 元のstoreInteraction関数を探す
    const storeInteractionRegex = /async function storeInteraction\(userId, role, content\) \{[\s\S]*?\}/g;
    
    // 新しいstoreInteraction関数の実装
    const newStoreInteraction = `async function storeInteraction(userId, role, content) {
  try {
    console.log(
      \`Storing interaction => userId: \${userId}, role: \${role}, content: \${content}\`
    );
    
    // Airtableに保存
    await base(INTERACTIONS_TABLE).create([
      {
        fields: {
          UserID: userId,
          Role: role,
          Content: content,
          Timestamp: new Date().toISOString(),
        },
      },
    ]);
    
    // PostgreSQLにも保存（USE_DATABASEが有効な場合）
    if (process.env.USE_DATABASE === 'true' && db) {
      try {
        await db.query(
          'INSERT INTO user_messages (user_id, content, role, timestamp) VALUES ($1, $2, $3, NOW())',
          [userId, content, role]
        );
        console.log('Interaction also stored in PostgreSQL database');
      } catch (dbErr) {
        console.error('Error storing interaction in database:', dbErr);
      }
    }
  } catch (err) {
    console.error('Error storing interaction:', err);
  }
}`;

    // 関数を置き換え
    if (serverJsContent.match(storeInteractionRegex)) {
      serverJsContent = serverJsContent.replace(storeInteractionRegex, newStoreInteraction);
      console.log('storeInteraction関数を正常に修正しました');
    } else {
      console.log('storeInteraction関数が見つかりませんでした');
      return false;
    }
    
    // fetchUserHistory関数を修正
    console.log('fetchUserHistory関数を修正しています...');
    
    // 元のfetchUserHistory関数を探す
    const fetchUserHistoryRegex = /async function fetchUserHistory\(userId, limit\) \{[\s\S]*?return \[\];\s*\}\s*\}/g;
    
    // 新しいfetchUserHistory関数の実装
    const newFetchUserHistory = `async function fetchUserHistory(userId, limit) {
  try {
    console.log(\`Fetching history for user \${userId}, limit: \${limit}\`);
    let combinedHistory = [];
    
    // 1. PostgreSQLからデータを取得（USE_DATABASEが有効な場合）
    if (process.env.USE_DATABASE === 'true' && db) {
      try {
        console.log('Fetching conversation history from PostgreSQL database...');
        const dbResults = await db.query(
          'SELECT user_id, content, role, timestamp FROM user_messages WHERE user_id = $1 ORDER BY timestamp ASC LIMIT $2',
          [userId, limit * 2] // userとassistantのやり取りがあるため、2倍のレコード数を取得
        );
        
        if (dbResults && dbResults.length > 0) {
          console.log(\`Found \${dbResults.length} messages in PostgreSQL database\`);
          
          const dbHistory = dbResults.map(row => ({
            role: row.role === 'assistant' ? 'assistant' : 'user',
            content: row.content || '',
          }));
          
          combinedHistory = [...combinedHistory, ...dbHistory];
        } else {
          console.log('No messages found in PostgreSQL database');
        }
      } catch (dbErr) {
        console.error('Error fetching history from PostgreSQL:', dbErr);
      }
    }
    
    // 2. Airtableからデータを取得
    try {
      if (process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
        const airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
          .base(process.env.AIRTABLE_BASE_ID);
          
        try {
          const conversationRecords = await airtableBase('ConversationHistory')
            .select({
              filterByFormula: \`{UserID} = "\${userId}"\`,
              sort: [{ field: 'Timestamp', direction: 'asc' }],
              maxRecords: limit * 2 // userとassistantのやり取りがあるため、2倍のレコード数を取得
            })
            .all();
            
          if (conversationRecords && conversationRecords.length > 0) {
            console.log(\`Found \${conversationRecords.length} conversation history records in ConversationHistory table\`);
            
            const airtableHistory = conversationRecords.map((r) => ({
              role: r.get('Role') === 'assistant' ? 'assistant' : 'user',
              content: r.get('Content') || '',
            }));
            
            // 既存のデータと重複しないものだけを追加
            const existingContents = new Set(combinedHistory.map(item => item.content));
            const uniqueAirtableHistory = airtableHistory.filter(item => !existingContents.has(item.content));
            
            combinedHistory = [...combinedHistory, ...uniqueAirtableHistory];
          }
        } catch (tableErr) {
          // ConversationHistoryテーブルが存在しない場合は無視して次の方法を試す
          console.log(\`ConversationHistory table not found or error: \${tableErr.message}. Falling back to UserAnalysis.\`);
        }
        
        // 3. UserAnalysisテーブルの会話データを試す（代替方法）
        try {
          const userAnalysisRecords = await airtableBase('UserAnalysis')
            .select({
              filterByFormula: \`AND({UserID} = "\${userId}", {Mode} = "conversation")\`,
              maxRecords: 1
            })
            .all();
            
          if (userAnalysisRecords && userAnalysisRecords.length > 0) {
            const rawData = userAnalysisRecords[0].get('AnalysisData');
            if (rawData) {
              try {
                const data = JSON.parse(rawData);
                if (data.conversation && Array.isArray(data.conversation)) {
                  console.log(\`Found \${data.conversation.length} messages in UserAnalysis conversation data\`);
                  
                  const analysisHistory = data.conversation.map(msg => ({
                    role: msg.role || 'user',
                    content: msg.content || msg.message || '',
                  }));
                  
                  // 既存のデータと重複しないものだけを追加
                  const existingContents = new Set(combinedHistory.map(item => item.content));
                  const uniqueAnalysisHistory = analysisHistory.filter(item => !existingContents.has(item.content));
                  
                  combinedHistory = [...combinedHistory, ...uniqueAnalysisHistory];
                }
              } catch (jsonErr) {
                console.error('Error parsing conversation data from UserAnalysis:', jsonErr);
              }
            }
          }
        } catch (analysisErr) {
          // UserAnalysisテーブルのアクセスエラーは無視して次の方法を試す
          console.log(\`UserAnalysis table not found or error: \${analysisErr.message}. Falling back to original method.\`);
        }
        
        // 4. 最後に既存の方法でデータを取得（元のコード）
        const records = await base(INTERACTIONS_TABLE)
          .select({
            filterByFormula: \`{UserID} = "\${userId}"\`,
            sort: [{ field: 'Timestamp', direction: 'desc' }],
            maxRecords: limit,
          })
          .all();
        console.log(\`Found \${records.length} records for user in original INTERACTIONS_TABLE\`);
    
        const interactionsHistory = records.reverse().map((r) => ({
          role: r.get('Role') === 'assistant' ? 'assistant' : 'user',
          content: r.get('Content') || '',
        }));
        
        // 既存のデータと重複しないものだけを追加
        const existingContents = new Set(combinedHistory.map(item => item.content));
        const uniqueInteractionsHistory = interactionsHistory.filter(item => !existingContents.has(item.content));
        
        combinedHistory = [...combinedHistory, ...uniqueInteractionsHistory];
      }
    } catch (airtableErr) {
      console.error('Error accessing Airtable for conversation history:', airtableErr);
    }
    
    // 結合したデータを時系列順に並べ替え（実装によっては不要）
    // combinedHistory.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
    
    // 最新のlimit件を返す
    if (combinedHistory.length > limit) {
      return combinedHistory.slice(-limit);
    }
    
    console.log(\`Returning \${combinedHistory.length} combined history messages\`);
    return combinedHistory;
  } catch (error) {
    console.error('Error fetching history:', error);
    return [];
  }
}`;

    // 関数を置き換え
    if (serverJsContent.match(fetchUserHistoryRegex)) {
      serverJsContent = serverJsContent.replace(fetchUserHistoryRegex, newFetchUserHistory);
      console.log('fetchUserHistory関数を正常に修正しました');
    } else {
      console.log('fetchUserHistory関数が見つかりませんでした');
    }
    
    // 必要なインポートを確認
    if (!serverJsContent.includes('const db = require(\'./db\');')) {
      // dbモジュールのインポートを追加（既存のrequire文の後に）
      serverJsContent = serverJsContent.replace(
        'const Airtable = require(\'airtable\');',
        'const Airtable = require(\'airtable\');\n// データベース接続モジュール（条件付きロード）\nlet db;\nif (process.env.USE_DATABASE === \'true\') {\n  try {\n    db = require(\'./db\');\n    // データベーステーブルの初期化\n    db.initializeTables().then(() => {\n      console.log(\'Database tables initialized successfully\');\n    }).catch(err => {\n      console.error(\'Failed to initialize database tables:\', err);\n    });\n  } catch (e) {\n    console.warn(\'Database module could not be loaded:\', e.message);\n  }\n}'
      );
      console.log('データベースモジュールのインポートを追加しました');
    }
    
    // 変更を保存
    fs.writeFileSync(serverJsPath, serverJsContent, 'utf8');
    console.log('server.jsファイルを更新しました');
    
    // 修正内容の概要を表示
    console.log('\n修正の概要:');
    console.log('1. storeInteraction関数を修正して、PostgreSQLデータベースにもデータを保存するようにしました');
    console.log('2. fetchUserHistory関数を修正して、PostgreSQLとAirtableの両方からデータを取得するようにしました');
    console.log('3. データベースモジュールを条件付きでロードするコードを追加しました');
    console.log('4. データベーステーブルの初期化処理を追加しました');
    console.log('5. USE_DATABASE環境変数に基づいて機能を有効/無効にするようにしました');
    
    return true;
  } catch (error) {
    console.error('修正中にエラーが発生しました:', error);
    return false;
  }
}

// スクリプトの実行
fixDatabaseIntegration().then(success => {
  if (success) {
    console.log('\n修正が完了しました。変更を確認し、アプリケーションを再起動してください。');
  } else {
    console.log('\n修正に失敗しました。手動で修正を行ってください。');
  }
}); 