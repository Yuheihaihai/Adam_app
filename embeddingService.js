// embeddingService.js
// OpenAIのEmbedding APIを使用してテキストのベクトル表現を取得するサービス

const { OpenAI } = require('openai');

class EmbeddingService {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.model = "text-embedding-3-small";  // 最新のモデルを使用
    this.embeddingDimension = 1536;         // デフォルトサイズ
    this.cacheEnabled = true;               // キャッシュ機能
    this.client = null;
    this.initialized = false;
    
    // シンプルなメモリキャッシュ
    this.cache = new Map();
  }

  /**
   * サービスを初期化（OpenAIクライアントを設定）
   * @returns {Promise<boolean>} 初期化が成功したかどうか
   */
  async initialize() {
    try {
      if (!this.openaiApiKey) {
        console.error('OpenAI API Key is not set. Please set OPENAI_API_KEY environment variable.');
        return false;
      }

      this.client = new OpenAI({ apiKey: this.openaiApiKey });
      this.initialized = true;
      
      console.log(`EmbeddingService initialized with model: ${this.model}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize EmbeddingService:', error);
      return false;
    }
  }

  /**
   * テキストのエンベディングを取得
   * @param {string} text - エンベディングに変換するテキスト
   * @returns {Promise<number[]>} エンベディングベクトル
   */
  async getEmbedding(text) {
    // 初期化確認
    if (!this.initialized) {
      await this.initialize();
    }

    // 入力検証
    if (!text || typeof text !== 'string' || text.trim() === '') {
      console.warn('Empty text provided for embedding, returning zero vector.');
      return new Array(this.embeddingDimension).fill(0);
    }

    // キャッシュチェック
    const cacheKey = `emb_${this.model}_${text}`;
    if (this.cacheEnabled && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      // OpenAI APIを呼び出してエンベディングを取得
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text.trim()
      });

      // レスポンスからエンベディングを抽出
      const embedding = response.data[0].embedding;

      // キャッシュに保存
      if (this.cacheEnabled) {
        this.cache.set(cacheKey, embedding);
        
        // キャッシュサイズを管理（最大1000アイテム）
        if (this.cache.size > 1000) {
          const oldestKey = this.cache.keys().next().value;
          this.cache.delete(oldestKey);
        }
      }

      return embedding;
    } catch (error) {
      console.error('Error getting embedding:', error);
      throw error;
    }
  }

  /**
   * 二つのエンベディング間のコサイン類似度を計算
   * @param {number[]} embedding1 - 1つ目のエンベディング
   * @param {number[]} embedding2 - 2つ目のエンベディング
   * @returns {number} 類似度スコア（-1〜1の範囲）
   */
  calculateSimilarity(embedding1, embedding2) {
    if (!Array.isArray(embedding1) || !Array.isArray(embedding2)) {
      console.error('Invalid embeddings provided for similarity calculation');
      return 0;
    }
    
    // 次元数が異なる場合
    if (embedding1.length !== embedding2.length) {
      console.error(`Embedding dimensions do not match: ${embedding1.length} vs ${embedding2.length}`);
      return 0;
    }

    try {
      // コサイン類似度の計算
      let dotProduct = 0;
      let magnitude1 = 0;
      let magnitude2 = 0;
      
      for (let i = 0; i < embedding1.length; i++) {
        dotProduct += embedding1[i] * embedding2[i];
        magnitude1 += embedding1[i] * embedding1[i];
        magnitude2 += embedding2[i] * embedding2[i];
      }
      
      magnitude1 = Math.sqrt(magnitude1);
      magnitude2 = Math.sqrt(magnitude2);
      
      if (magnitude1 === 0 || magnitude2 === 0) return 0;
      
      // コサイン類似度を返す（-1〜1の範囲）
      return dotProduct / (magnitude1 * magnitude2);
    } catch (error) {
      console.error('Error calculating similarity:', error);
      return 0;
    }
  }

  /**
   * 二つのテキスト間の意味的類似度を計算
   * @param {string} text1 - 1つ目のテキスト
   * @param {string} text2 - 2つ目のテキスト
   * @returns {Promise<number>} 類似度スコア（-1〜1の範囲）
   */
  async getTextSimilarity(text1, text2) {
    try {
      // 両方のテキストのエンベディングを取得
      const [embedding1, embedding2] = await Promise.all([
        this.getEmbedding(text1),
        this.getEmbedding(text2)
      ]);
      
      // 類似度を計算
      return this.calculateSimilarity(embedding1, embedding2);
    } catch (error) {
      console.error('Error getting text similarity:', error);
      return 0;
    }
  }

  /**
   * コレクション内で与えられたクエリに最も似たドキュメントを検索
   * @param {string} query - 検索クエリ
   * @param {string[]} documents - 検索対象のドキュメント配列
   * @param {number} topK - 返すべき最も似た結果の数
   * @returns {Promise<Array<{document: string, score: number}>>} - スコア付きの結果
   */
  async semanticSearch(query, documents, topK = 3) {
    if (!query || !Array.isArray(documents) || documents.length === 0) {
      return [];
    }

    try {
      // クエリのエンベディングを取得
      const queryEmbedding = await this.getEmbedding(query);
      
      // 各ドキュメントのエンベディングを取得し、類似度を計算
      const results = await Promise.all(
        documents.map(async (doc) => {
          const docEmbedding = await this.getEmbedding(doc);
          const similarity = this.calculateSimilarity(queryEmbedding, docEmbedding);
          
          return {
            document: doc,
            score: similarity
          };
        })
      );
      
      // 類似度スコアでソートし、上位K件を返す
      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    } catch (error) {
      console.error('Error in semantic search:', error);
      return [];
    }
  }
}

module.exports = EmbeddingService; 