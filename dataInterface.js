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
      
      // セキュアなメソッドを使用してユーザーのメッセージ履歴を取得
      const messages = await this.dbConnection.fetchSecureUserHistory(userId, limit);
      
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
  
  async storeUserMessage(userId, content, role, mode = 'general', messageType = 'text') {
    try {
      // メッセージIDを生成
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // セキュアなメソッドを使用してメッセージを保存
      const result = await this.dbConnection.storeSecureUserMessage(
        userId, 
        messageId, 
        content, 
        role, 
        mode, 
        messageType
      );
      
      // キャッシュをクリア
      Array.from(this.messageCache.keys())
        .filter(key => key.startsWith(userId))
        .forEach(key => this.messageCache.delete(key));
      
      // resultがオブジェクトでidプロパティがある場合はそれを返す
      // なければ生成したmessageIdを返す（保存は成功したと仮定）
      if (result && typeof result === 'object' && result.id) {
        return result.id;
      }
      // 保存が成功したがIDが返されない場合は、生成したmessageIdを返す
      return result ? messageId : null;
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
        'INSERT INTO analysis_results (user_id, result_type, data) VALUES ($1, $2, $3)',
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
        'SELECT data FROM analysis_results WHERE user_id = $1 AND result_type = $2 ORDER BY timestamp DESC LIMIT 1',
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