// dataInterface.js
const db = require('./db');

class DataInterface {
  constructor(config = {}) {
    this.dbConnection = config.dbConnection || db;
    this.messageCache = new Map(); // 簡易的なキャッシュ
  }

  async getUserHistory(userId, limit = 100) {
    try {
      // キャッシュキーの作成
      const cacheKey = `${userId}-${limit}`;
      
      // キャッシュがあればそれを返す（30秒有効）
      if (this.messageCache.has(cacheKey)) {
        const cached = this.messageCache.get(cacheKey);
        const now = Date.now();
        if (now - cached.timestamp < 30000) { // 30秒
          return cached.data;
        }
      }
      
      // データベースからユーザーのメッセージ履歴を取得
      const messages = await this.dbConnection.query(
        'SELECT id, user_id, content, role, timestamp FROM user_messages WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?',
        [userId, limit]
      );
      
      // キャッシュに保存
      this.messageCache.set(cacheKey, {
        timestamp: Date.now(),
        data: messages
      });
      
      return messages;
    } catch (error) {
      console.error('Error fetching user history:', error);
      throw error;
    }
  }
  
  async storeUserMessage(userId, content, role) {
    try {
      const result = await this.dbConnection.query(
        'INSERT INTO user_messages (user_id, content, role) VALUES (?, ?, ?)',
        [userId, content, role]
      );
      
      // キャッシュをクリア
      Array.from(this.messageCache.keys())
        .filter(key => key.startsWith(userId))
        .forEach(key => this.messageCache.delete(key));
      
      return result.insertId;
    } catch (error) {
      console.error('Error storing user message:', error);
      throw error;
    }
  }
  
  async storeAnalysisResult(userId, resultType, data) {
    try {
      // データがオブジェクトの場合はJSONに変換
      const jsonData = typeof data === 'string' ? data : JSON.stringify(data);
      
      const result = await this.dbConnection.query(
        'INSERT INTO analysis_results (user_id, result_type, data) VALUES (?, ?, ?)',
        [userId, resultType, jsonData]
      );
      
      return result.insertId;
    } catch (error) {
      console.error('Error storing analysis result:', error);
      throw error;
    }
  }
  
  async getLatestAnalysisResult(userId, resultType) {
    try {
      const results = await this.dbConnection.query(
        'SELECT data FROM analysis_results WHERE user_id = ? AND result_type = ? ORDER BY timestamp DESC LIMIT 1',
        [userId, resultType]
      );
      
      if (results.length === 0) return null;
      
      // JSON文字列をオブジェクトに変換して返す
      return JSON.parse(results[0].data);
    } catch (error) {
      console.error('Error fetching analysis result:', error);
      throw error;
    }
  }
}

module.exports = DataInterface; 