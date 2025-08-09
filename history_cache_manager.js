/**
 * 会話履歴キャッシュマネージャー
 * 重複する履歴取得を統合・最適化
 */

class HistoryCacheManager {
  constructor() {
    this.globalCache = new Map();
    this.activeRequests = new Map(); // 進行中のリクエストを追跡
    this.CACHE_TTL = 60000; // 1分キャッシュ
  }

  /**
   * 統合された履歴取得メソッド
   * 重複リクエストを防止し、キャッシュを効率的に活用
   */
  async getUnifiedHistory(userId, limit = 100, source = 'unified') {
    const cacheKey = `${userId}-${limit}`;
    const now = Date.now();

    // 1. キャッシュチェック
    if (this.globalCache.has(cacheKey)) {
      const cached = this.globalCache.get(cacheKey);
      if (now - cached.timestamp < this.CACHE_TTL) {
        console.log(`🔄 [HistoryCache] キャッシュヒット: ${cached.data?.length || 0}件 (${source})`);
        return cached.data;
      }
    }

    // 2. 進行中リクエストがあれば待機
    if (this.activeRequests.has(cacheKey)) {
      console.log(`⏳ [HistoryCache] 同時リクエスト待機中... (${source})`);
      return await this.activeRequests.get(cacheKey);
    }

    // 3. 新規リクエスト実行
    const requestPromise = this._fetchHistoryInternal(userId, limit, source);
    this.activeRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      
      // キャッシュに保存
      this.globalCache.set(cacheKey, {
        timestamp: now,
        data: result
      });

      console.log(`✅ [HistoryCache] 新規取得完了: ${result?.length || 0}件 (${source})`);
      return result;
    } finally {
      // 進行中リクエストから削除
      this.activeRequests.delete(cacheKey);
    }
  }

  /**
   * 内部履歴取得メソッド
   */
  async _fetchHistoryInternal(userId, limit, source) {
    try {
      // dataInterface.jsを通じて統一取得
      const dataInterface = require('./dataInterface');
      const instance = new dataInterface();
      return await instance.getUserHistory(userId, limit);
    } catch (error) {
      console.error(`❌ [HistoryCache] 履歴取得エラー (${source}):`, error.message);
      return [];
    }
  }

  /**
   * キャッシュクリア（メモリ使用量管理）
   */
  clearExpiredCache() {
    const now = Date.now();
    let cleared = 0;

    for (const [key, value] of this.globalCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.globalCache.delete(key);
        cleared++;
      }
    }

    if (cleared > 0) {
      console.log(`🧹 [HistoryCache] 期限切れキャッシュを${cleared}件削除`);
    }
  }

  /**
   * 統計情報取得
   */
  getStats() {
    return {
      cacheSize: this.globalCache.size,
      activeRequests: this.activeRequests.size,
      cacheTTL: this.CACHE_TTL
    };
  }
}

// シングルトンインスタンス
const historyCacheManager = new HistoryCacheManager();

// 定期的なキャッシュクリーンアップ（5分間隔）
setInterval(() => {
  historyCacheManager.clearExpiredCache();
}, 5 * 60 * 1000);

module.exports = historyCacheManager;
