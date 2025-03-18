// enhancedEmbeddingService.js
// embeddingService.jsを拡張し、バッチ処理やレート制限機能を追加

const EmbeddingService = require('./embeddingService');
const crypto = require('crypto');

class EnhancedEmbeddingService {
  constructor() {
    this.embeddingService = null;
    this.embeddingQueue = [];
    this.MAX_BATCH_SIZE = 5;
    this.COOLDOWN_MS = 100; // 100ms間隔
    this.lastRequestTime = 0;
    this.isProcessingEmbeddings = false;
    
    // グローバルキャッシュ
    if (!global.enhancedEmbeddingCache) {
      global.enhancedEmbeddingCache = new Map();
    }
    
    if (!global.serviceMatchCache) {
      global.serviceMatchCache = new Map();
    }
    
    if (!global.imageDecisionStats) {
      global.imageDecisionStats = [];
    }
  }
  
  async initialize() {
    if (!this.embeddingService) {
      this.embeddingService = new EmbeddingService();
      const success = await this.embeddingService.initialize();
      
      // キャッシュクリーンアップを設定
      this._setupCacheCleanup();
      
      return success;
    }
    return true;
  }
  
  _setupCacheCleanup() {
    // すでに設定されている場合は重複設定しない
    if (global.cleanupIntervalSet) return;
    
    // キャッシュ自動クリーンアップ（30分ごと）
    setInterval(() => {
      const now = Date.now();
      
      // サービスマッチングキャッシュ（1時間TTL）
      if (global.serviceMatchCache?.size > 0) {
        for (const [key, value] of global.serviceMatchCache.entries()) {
          if (value.timestamp && now - value.timestamp > 60 * 60 * 1000) {
            global.serviceMatchCache.delete(key);
          }
        }
      }
      
      // エンベディングキャッシュ（サイズ制限）
      if (global.enhancedEmbeddingCache?.size > 2000) {
        // 古い順に削除
        const entries = [...global.enhancedEmbeddingCache.entries()];
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        // 最も古い500項目を削除
        for (let i = 0; i < Math.min(500, entries.length); i++) {
          if (entries[i]) {
            global.enhancedEmbeddingCache.delete(entries[i][0]);
          }
        }
      }
      
      // 統計データの制限
      if (global.imageDecisionStats?.length > 1000) {
        global.imageDecisionStats = global.imageDecisionStats.slice(-1000);
      }
    }, 30 * 60 * 1000);
    
    global.cleanupIntervalSet = true;
  }
  
  // レート制限付きエンベディング取得
  async getEmbeddingWithRateLimit(text) {
    // 初期化確認
    if (!this.embeddingService) {
      await this.initialize();
    }
    
    // 空文字列や短すぎるテキストはデフォルト値返却
    if (!text || text.length < 3) {
      return new Array(1536).fill(0);
    }
    
    // キャッシュチェック
    const cacheKey = crypto.createHash('md5').update(text).digest('hex');
    if (global.enhancedEmbeddingCache.has(cacheKey)) {
      return global.enhancedEmbeddingCache.get(cacheKey).embedding;
    }
    
    // バッチ処理のためキューに追加
    return new Promise((resolve, reject) => {
      this.embeddingQueue.push({ text, cacheKey, resolve, reject });
      this._processEmbeddingQueue();
    });
  }
  
  async _processEmbeddingQueue() {
    // 既に処理中または空のキューなら終了
    if (this.embeddingQueue.length === 0 || this.isProcessingEmbeddings) return;
    
    this.isProcessingEmbeddings = true;
    
    try {
      // レート制限（前回リクエストから一定時間経過まで待機）
      const now = Date.now();
      const timeElapsed = now - this.lastRequestTime;
      if (timeElapsed < this.COOLDOWN_MS && this.lastRequestTime > 0) {
        await new Promise(r => setTimeout(r, this.COOLDOWN_MS - timeElapsed));
      }
      
      // バッチサイズだけキューから取り出す
      const batch = this.embeddingQueue.splice(0, Math.min(this.MAX_BATCH_SIZE, this.embeddingQueue.length));
      
      // 個別に処理（現在のembeddingServiceはバッチ処理をサポートしていないため）
      const results = await Promise.all(
        batch.map(async item => {
          try {
            const embedding = await this.embeddingService.getEmbedding(item.text);
            return { item, embedding, success: true };
          } catch (error) {
            return { item, error, success: false };
          }
        })
      );
      
      // 結果を各Promiseに戻す
      results.forEach(result => {
        if (result.success) {
          // キャッシュに保存
          global.enhancedEmbeddingCache.set(result.item.cacheKey, {
            embedding: result.embedding,
            timestamp: Date.now()
          });
          
          result.item.resolve(result.embedding);
        } else {
          result.item.reject(result.error);
        }
      });
      
      this.lastRequestTime = Date.now();
    } catch (error) {
      console.error('Error processing embedding batch:', error);
      // エラー時は個別に拒否
      this.embeddingQueue.slice(0, this.MAX_BATCH_SIZE).forEach(item => {
        item.reject(error);
      });
    } finally {
      this.isProcessingEmbeddings = false;
      
      // キューに残りがあればすぐに処理する
      if (this.embeddingQueue.length > 0) {
        setTimeout(() => this._processEmbeddingQueue(), this.COOLDOWN_MS);
      }
    }
  }
  
  // テキスト間の意味的類似度を計算（キャッシュと最適化付き）
  async getTextSimilarity(textA, textB) {
    // 初期化確認
    if (!this.embeddingService) {
      await this.initialize();
    }
    
    try {
      // 両方のテキストのエンベディングを取得
      const [embeddingA, embeddingB] = await Promise.all([
        this.getEmbeddingWithRateLimit(textA),
        this.getEmbeddingWithRateLimit(textB)
      ]);
      
      // 類似度を計算
      return this.embeddingService.calculateSimilarity(embeddingA, embeddingB);
    } catch (error) {
      console.error('Enhanced similarity calculation error:', error);
      // フォールバック：基本サービスを利用
      return this.embeddingService.getTextSimilarity(textA, textB);
    }
  }
  
  // 意味的検索（最適化版）
  async semanticSearch(query, documents, topK = 3) {
    // 初期化確認
    if (!this.embeddingService) {
      await this.initialize();
    }
    
    // 短いクエリや空の文書リストの場合は早期リターン
    if (!query || query.length < 3 || !Array.isArray(documents) || documents.length === 0) {
      return [];
    }
    
    try {
      // キャッシュキー
      const cacheKey = crypto.createHash('md5')
        .update(`${query}_${documents.length}_${topK}`)
        .digest('hex');
      
      // キャッシュチェック
      if (global.enhancedEmbeddingCache.has(cacheKey)) {
        const cached = global.enhancedEmbeddingCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 60 * 60 * 1000) { // 1時間有効
          return cached.results;
        }
      }
      
      // クエリのエンベディングを取得
      const queryEmbedding = await this.getEmbeddingWithRateLimit(query);
      
      // 文書をバッチに分割（レート制限対策）
      const BATCH_SIZE = 10;
      const results = [];
      
      for (let i = 0; i < documents.length; i += BATCH_SIZE) {
        const batch = documents.slice(i, i + BATCH_SIZE);
        
        // 各文書のエンベディングを取得
        const batchEmbeddings = await Promise.all(
          batch.map(doc => this.getEmbeddingWithRateLimit(doc))
        );
        
        // 類似度を計算して結果に追加
        batch.forEach((doc, index) => {
          const similarity = this.embeddingService.calculateSimilarity(
            queryEmbedding, 
            batchEmbeddings[index]
          );
          
          results.push({
            document: doc,
            score: (similarity + 1) / 2 // -1〜1 → 0〜1 に正規化
          });
        });
        
        // 短い休憩（レート制限対策）
        if (i + BATCH_SIZE < documents.length) {
          await new Promise(r => setTimeout(r, 100));
        }
      }
      
      // ソートして上位を返す
      const topResults = results
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
      
      // キャッシュに保存
      global.enhancedEmbeddingCache.set(cacheKey, {
        results: topResults,
        timestamp: Date.now()
      });
      
      return topResults;
    } catch (error) {
      console.error('Enhanced semantic search error:', error);
      // フォールバック：基本サービスを利用
      return this.embeddingService.semanticSearch(query, documents, topK);
    }
  }
}

module.exports = EnhancedEmbeddingService; 