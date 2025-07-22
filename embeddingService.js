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
    this.isEnabled = false;                 // Add isEnabled property
    
    // シンプルなメモリキャッシュ
    this.cache = new Map();
    
    // Token limit safety measures
    this.maxTokenLimit = 8000;              // 余裕を持って8,000トークンまでに制限（APIの上限は8,192）
    this.avgCharsPerToken = 2.5;            // より保守的な値に調整（日本語では通常1文字で2トークン程度）
    this.safetyBuffer = 0.7;                // 追加の安全マージン（70%）
    
    // Initialize on construction
    this.initialize();
  }

  /**
   * サービスを初期化（OpenAIクライアントを設定）
   * @returns {Promise<boolean>} 初期化が成功したかどうか
   */
  async initialize() {
    try {
      if (!this.openaiApiKey) {
        console.warn('OpenAI API Key is not set. EmbeddingService will operate in fallback mode.');
        this.initialized = false;
        this.isEnabled = false; // Add isEnabled property
        return false;
      }

      this.client = new OpenAI({ apiKey: this.openaiApiKey });
      this.initialized = true;
      this.isEnabled = true; // Add isEnabled property
      
      console.log(`EmbeddingService initialized with model: ${this.model}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize EmbeddingService:', error);
      this.initialized = false;
      this.isEnabled = false; // Add isEnabled property
      return false;
    }
  }

  /**
   * 文字数からトークン数を粗く見積もる
   * @param {string} text - 対象テキスト
   * @returns {number} - 推定トークン数
   */
  estimateTokenCount(text) {
    if (!text) return 0;
    
    // 日本語文字とそれ以外を区別して計算
    let japaneseChars = 0;
    let otherChars = 0;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      // ひらがな、カタカナ、漢字の文字コード範囲をチェック
      if (
        (char >= '\u3040' && char <= '\u309F') || // ひらがな
        (char >= '\u30A0' && char <= '\u30FF') || // カタカナ
        (char >= '\u4E00' && char <= '\u9FFF')    // 漢字
      ) {
        japaneseChars++;
      } else {
        otherChars++;
      }
    }
    
    // 日本語は1文字あたり約2トークン、英数字等は4文字あたり約1トークンと見積もる
    const estimatedTokens = (japaneseChars * 2) + (otherChars / 4);
    
    return Math.ceil(estimatedTokens);
  }

  /**
   * テキストを最大トークン制限に収まるように切り詰める
   * @param {string} text - 切り詰めるテキスト
   * @returns {string} - 切り詰められたテキスト
   */
  truncateToTokenLimit(text) {
    if (!text) return '';
    
    // 実際のトークン制限よりさらに安全マージンを設ける
    const safeTokenLimit = Math.floor(this.maxTokenLimit * this.safetyBuffer);
    
    const estimatedTokens = this.estimateTokenCount(text);
    
    if (estimatedTokens <= safeTokenLimit) {
      return text; // トークン制限内なら変更なし
    }
    
    // 制限を超える場合は切り詰め
    console.warn(`Text exceeds token limit (est. ${estimatedTokens} tokens). Truncating to ~${safeTokenLimit} tokens.`);
    
    // 文字数ベースで切り詰め（概算）
    // 日本語と英数字の比率に基づく切り詰め
    const ratio = safeTokenLimit / estimatedTokens;
    const targetLength = Math.floor(text.length * ratio);
    
    const truncatedText = text.slice(0, targetLength);
    
    console.log(`Truncated from ${text.length} chars to ${truncatedText.length} chars`);
    return truncatedText;
  }

  /**
   * テキストのエンベディングを取得
   * @param {string} text - エンベディングに変換するテキスト
   * @returns {Promise<number[]>} エンベディングベクトル
   */
  async getEmbedding(text) {
    // 初期化確認
    if (!this.initialized) {
      const initSuccess = await this.initialize();
      if (!initSuccess) {
        console.warn('EmbeddingService not initialized. Returning zero vector.');
        return new Array(this.embeddingDimension).fill(0);
      }
    }

    // 入力検証
    if (!text || typeof text !== 'string' || text.trim() === '') {
      console.warn('Empty text provided for embedding, returning zero vector.');
      return new Array(this.embeddingDimension).fill(0);
    }

    // トークン制限を確認し、必要に応じて切り詰め
    const truncatedText = this.truncateToTokenLimit(text);
    
    // テキストが切り詰められた場合はキャッシュを使用しない
    const wasTextTruncated = truncatedText.length < text.length;
    
    // キャッシュチェック (切り詰めがない場合のみ)
    const cacheKey = `emb_${this.model}_${truncatedText}`;
    if (this.cacheEnabled && !wasTextTruncated && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      // OpenAI APIを呼び出してエンベディングを取得
      const response = await this.client.embeddings.create({
        model: this.model,
        input: truncatedText.trim()
      });

      // レスポンスからエンベディングを抽出
      const embedding = response.data[0].embedding;

      // キャッシュに保存 (切り詰めがない場合のみ)
      if (this.cacheEnabled && !wasTextTruncated) {
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
      
      // トークン制限エラーの場合、さらに厳しく切り詰めて再試行
      if (error.message && error.message.includes('maximum context length') && truncatedText.length > 100) {
        console.log('Token limit exceeded even after truncation. Retrying with shorter text...');
        
        // より厳しく切り詰め (全体の1/3程度に)
        const furtherTruncatedText = truncatedText.slice(0, Math.floor(truncatedText.length / 3));
        
        try {
          const retryResponse = await this.client.embeddings.create({
            model: this.model,
            input: furtherTruncatedText.trim()
          });
          
          console.log(`Successfully got embedding after further truncation to ${furtherTruncatedText.length} chars`);
          return retryResponse.data[0].embedding;
        } catch (retryError) {
          console.error('Error in retry attempt:', retryError);
          // 最終手段：非常に短いサンプルだけを使用
          if (furtherTruncatedText.length > 200) {
            const finalAttempt = furtherTruncatedText.slice(0, 200);
            try {
              const lastResponse = await this.client.embeddings.create({
                model: this.model,
                input: finalAttempt.trim()
              });
              console.log(`Final attempt succeeded with ${finalAttempt.length} chars`);
              return lastResponse.data[0].embedding;
            } catch (finalError) {
              console.error('All embedding attempts failed:', finalError);
              return new Array(this.embeddingDimension).fill(0);
            }
          }
          // 失敗した場合はゼロ埋めベクトルを返す
          return new Array(this.embeddingDimension).fill(0);
        }
      }
      
      // その他のエラーの場合はゼロ埋めベクトルを返す
      return new Array(this.embeddingDimension).fill(0);
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
      // 入力が大きすぎる場合は切り詰め
      const truncatedText1 = this.truncateToTokenLimit(text1);
      const truncatedText2 = this.truncateToTokenLimit(text2);
      
      // 両方のテキストのエンベディングを取得
      const [embedding1, embedding2] = await Promise.all([
        this.getEmbedding(truncatedText1),
        this.getEmbedding(truncatedText2)
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
      // クエリのエンベディングを取得（トークン制限は getEmbedding 内で適用）
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