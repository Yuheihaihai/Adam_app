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
    if (process.env.USE_DATABASE === 'true' && require('./db')) {
      try {
        const db = require('./db');
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
    
    // 必要なインポートを確認
    if (!serverJsContent.includes('const db = require(\'./db\');')) {
      // dbモジュールのインポートを追加（既存のrequire文の後に）
      serverJsContent = serverJsContent.replace(
        'const Airtable = require(\'airtable\');',
        'const Airtable = require(\'airtable\');\n// データベース接続モジュール（条件付きロード）\nlet db;\nif (process.env.USE_DATABASE === \'true\') {\n  try {\n    db = require(\'./db\');\n  } catch (e) {\n    console.warn(\'Database module could not be loaded:\', e.message);\n  }\n}'
      );
      console.log('データベースモジュールのインポートを追加しました');
    }
    
    // 変更を保存
    fs.writeFileSync(serverJsPath, serverJsContent, 'utf8');
    console.log('server.jsファイルを更新しました');
    
    // 修正内容の概要を表示
    console.log('\n修正の概要:');
    console.log('1. storeInteraction関数を修正して、PostgreSQLデータベースにもデータを保存するようにしました');
    console.log('2. データベースモジュールを条件付きでロードするコードを追加しました');
    console.log('3. USE_DATABASE環境変数に基づいて機能を有効/無効にするようにしました');
    
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