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
      
      // セキュアなメソッドを使用してユーザーのメッセージ履歴を取得（メイン + バックアップを統合）
      const primary = await this.dbConnection.fetchSecureUserHistory(userId, limit);
      let merged = primary;
      if (Array.isArray(primary) && primary.length < limit && typeof this.dbConnection.fetchSecureUserHistoryFromBackup === 'function') {
        const remaining = Math.max(0, limit - primary.length);
        const backup = await this.dbConnection.fetchSecureUserHistoryFromBackup(userId, remaining);
        // 重複排除（message_id優先）しつつ時系列統合
        const seenIds = new Set(primary.map(m => m.message_id || m.id));
        const dedupedBackup = (backup || []).filter(m => {
          const key = m.message_id || m.id;
          if (!key) return true;
          if (seenIds.has(key)) return false;
          seenIds.add(key);
          return true;
        });
        merged = [...primary, ...dedupedBackup];
        // 新しい順に整列
        merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        // limit件に切り詰め
        merged = merged.slice(0, limit);
      }
      
      // キャッシュに保存
      this.messageCache.set(cacheKey, {
        timestamp: Date.now(),
        data: merged
      });
      
      return merged;
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