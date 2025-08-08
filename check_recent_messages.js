#!/usr/bin/env node
/**
 * 最近のユーザーメッセージを取得して「寝不足」関連の言及があるかチェック
 */

const db = require('./db');

async function checkRecentMessages() {
  try {
    console.log('Fetching recent user messages...');
    const userId = 'Ue649c876a5b17abb6dbbbb6a286c51f0';
    const history = await db.fetchSecureUserHistory(userId, 50);
    
    // 最近のユーザーメッセージのみ抽出
    const userMessages = history
      .filter(m => m.role === 'user')
      .slice(0, 10)
      .map((m, i) => ({
        index: i + 1,
        content: m.content,
        timestamp: m.timestamp
      }));
    
    console.log('\n=== 最近のユーザーメッセージ (10件) ===');
    userMessages.forEach(msg => {
      console.log(`\n${msg.index}. [${msg.timestamp}]`);
      console.log(`   ${msg.content}`);
    });
    
    // 「寝不足」「過集中」「LINE bot」関連キーワードをチェック
    const keywords = ['寝不足', '過集中', 'LINE bot', '昨夜', '睡眠', '疲れ', '夜更かし'];
    console.log('\n=== キーワード検索結果 ===');
    
    const matches = [];
    userMessages.forEach(msg => {
      keywords.forEach(keyword => {
        if (msg.content.includes(keyword)) {
          matches.push({
            message: msg.content,
            keyword: keyword,
            timestamp: msg.timestamp
          });
        }
      });
    });
    
    if (matches.length > 0) {
      console.log('キーワードにマッチしたメッセージ:');
      matches.forEach(match => {
        console.log(`- "${match.keyword}" in: "${match.message}" [${match.timestamp}]`);
      });
    } else {
      console.log('最近のユーザーメッセージに「寝不足」関連の言及は見つかりませんでした。');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkRecentMessages();
