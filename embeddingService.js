// embeddingService.js
const axios = require('axios');
const crypto = require('crypto');

class EmbeddingService {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.model = "text-embedding-3-small";  // 最新のモデルを使用
    this.embeddingDimension = 1536;         // デフォルトサイズ
    this.cacheEnabled = true;               // キャッシュ機能
    this.cache = new Map();                 // インメモリキャッシュ
    this.cacheTTL = 24 * 60 * 60 * 1000;    // 24時間キャッシュ
    
    // 再試行設定
    this.maxRetries = 3;
    this.retryDelay = 1000; // 初回の遅延は1秒
  }

  async initialize() {
    if (!this.openaiApiKey) {
      console.warn('OpenAI API key is missing. EmbeddingService will use fallback mechanisms.');
      return false;
    }
    
    try {
      // API接続テスト
      await this.getEmbedding("テスト");
      console.log('EmbeddingService initialized successfully with OpenAI API');
      return true;
    } catch (error) {
      console.error('Failed to initialize EmbeddingService:', error.message);
      return false;
    }
  }

  /**
   * テキストの埋め込みベクトルを取得
   * @param {string} text - 埋め込みを生成するテキスト
   * @returns {Promise<Array<number>>} - 埋め込みベクトル
   */
  async getEmbedding(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid input: text must be a non-empty string');
    }

    // キャッシュが有効で、キャッシュに存在する場合は返す
    if (this.cacheEnabled) {
      const cacheKey = this._getCacheKey(text);
      const cachedItem = this.cache.get(cacheKey);
      
      if (cachedItem && Date.now() < cachedItem.expiry) {
        console.log('Using cached embedding for input text');
        return cachedItem.embedding;
      }
    }

    if (!this.openaiApiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    // 再試行ロジック
    let lastError;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await axios.post(
          'https://api.openai.com/v1/embeddings',
          {
            input: text,
            model: this.model
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.openaiApiKey}`
            },
            timeout: 10000 // 10秒タイムアウト
          }
        );
        
        const embedding = response.data.data[0].embedding;
        
        // キャッシュが有効な場合、結果をキャッシュする
        if (this.cacheEnabled) {
          const cacheKey = this._getCacheKey(text);
          this.cache.set(cacheKey, {
            embedding,
            expiry: Date.now() + this.cacheTTL
          });
        }
        
        return embedding;
      } catch (error) {
        lastError = error;
        
        // レート制限エラーやサーバーエラーの場合のみ再試行
        if (
          error.response && 
          (error.response.status === 429 || error.response.status >= 500)
        ) {
          // 指数バックオフ（2^attempt * retryDelay）
          const delay = this.retryDelay * Math.pow(2, attempt);
          console.warn(`API request failed, retrying in ${delay}ms...`, error.message);
          
          // 待機
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // その他のエラーは再試行しない
        throw this._formatError(error);
      }
    }
    
    throw this._formatError(lastError);
  }

  /**
   * 2つの埋め込みベクトル間のコサイン類似度を計算
   * @param {Array<number>} embeddingA - 1つ目の埋め込みベクトル
   * @param {Array<number>} embeddingB - 2つ目の埋め込みベクトル
   * @returns {number} - 類似度スコア（-1から1の範囲、1が最も類似）
   */
  calculateSimilarity(embeddingA, embeddingB) {
    if (!Array.isArray(embeddingA) || !Array.isArray(embeddingB)) {
      throw new Error('Invalid input: embeddings must be arrays');
    }
    
    if (embeddingA.length !== embeddingB.length) {
      throw new Error(`Embedding dimensions don't match: ${embeddingA.length} vs ${embeddingB.length}`);
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < embeddingA.length; i++) {
      dotProduct += embeddingA[i] * embeddingB[i];
      normA += embeddingA[i] * embeddingA[i];
      normB += embeddingB[i] * embeddingB[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    // コサイン類似度を計算 (-1 から 1 の範囲)
    return dotProduct / (normA * normB);
  }

  /**
   * 2つのテキスト間の意味的類似度を計算
   * @param {string} textA - 1つ目のテキスト
   * @param {string} textB - 2つ目のテキスト
   * @returns {Promise<number>} - 類似度スコア（0から1の範囲、1が最も類似）
   */
  async getTextSimilarity(textA, textB) {
    try {
      const [embeddingA, embeddingB] = await Promise.all([
        this.getEmbedding(textA),
        this.getEmbedding(textB)
      ]);
      
      // コサイン類似度を計算し、0-1の範囲に正規化
      const similarity = this.calculateSimilarity(embeddingA, embeddingB);
      
      // -1から1の範囲を0から1の範囲に変換
      return (similarity + 1) / 2;
    } catch (error) {
      console.error('Error calculating text similarity:', error);
      throw error;
    }
  }

  /**
   * 意味的検索を実行
   * @param {string} query - 検索クエリ
   * @param {Array<string>} documents - 検索対象のドキュメント配列
   * @param {number} topK - 返す結果の最大数
   * @returns {Promise<Array<{document: string, score: number}>>} - スコア付きの結果
   */
  async semanticSearch(query, documents, topK = 3) {
    if (!Array.isArray(documents) || documents.length === 0) {
      return [];
    }
    
    try {
      // クエリの埋め込みを取得
      const queryEmbedding = await this.getEmbedding(query);
      
      // すべてのドキュメントの埋め込みを並列で取得
      const documentEmbeddings = await Promise.all(
        documents.map(doc => this.getEmbedding(doc))
      );
      
      // 類似度スコアを計算
      const results = documents.map((doc, i) => ({
        document: doc,
        score: this.calculateSimilarity(queryEmbedding, documentEmbeddings[i])
      }));
      
      // スコアでソートし、正規化（0-1の範囲に）
      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(item => ({
          ...item,
          score: (item.score + 1) / 2 // -1から1の範囲を0から1に変換
        }));
    } catch (error) {
      console.error('Error in semantic search:', error);
      // エラーが発生した場合は空の結果を返す
      return [];
    }
  }

  /**
   * キャッシュキーを生成
   * @private
   */
  _getCacheKey(text) {
    return crypto
      .createHash('md5')
      .update(`${this.model}_${text}`)
      .digest('hex');
  }

  /**
   * エラーを適切にフォーマット
   * @private
   */
  _formatError(error) {
    if (error.response) {
      // API からのレスポンスエラー
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 401) {
        return new Error('Authentication error: Invalid API key');
      } else if (status === 429) {
        return new Error('Rate limit exceeded: Too many requests');
      } else if (status >= 500) {
        return new Error(`OpenAI server error (${status}): ${data.error?.message || 'Unknown error'}`);
      } else {
        return new Error(`API error (${status}): ${data.error?.message || 'Unknown error'}`);
      }
    } else if (error.request) {
      // リクエストは送信されたが、レスポンスが受信されなかった
      return new Error(`Network error: No response from OpenAI API - ${error.message}`);
    } else {
      // リクエストの設定中にエラーが発生
      return new Error(`Request setup error: ${error.message}`);
    }
  }
}

module.exports = EmbeddingService; 