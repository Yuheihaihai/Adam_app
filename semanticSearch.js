// semanticSearch.js
// 質問の意図理解のためのセマンティック検索モジュール
require('dotenv').config();
const { OpenAI } = require('openai');
const db = require('./db');

class SemanticSearch {
  constructor() {
    // OpenAI APIクライアントの初期化
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    // ローカルキャッシュ - メモリ使用量を抑えるため最大100件
    this.embeddingCache = new Map();
    this.maxCacheSize = 100;
    
    // 安価なモデルを使用（最も低価格なembedding API）
    this.embeddingModel = 'text-embedding-3-small';
    
    // デバッグフラグ（コスト計算用）
    this.apiCallCount = 0;
    this.estimatedCost = 0;
    
    console.log('SemanticSearch module initialized');
  }
  
  /**
   * テキストのembeddingを生成（キャッシュ使用）
   * @param {string} text - embedding生成対象テキスト
   * @returns {Promise<Array<number>>} - 生成されたembedding
   */
  async generateEmbedding(text) {
    try {
      // 空テキストや無効な入力に対するチェック
      if (!text || typeof text !== 'string' || text.trim() === '') {
        console.warn('Invalid text provided for embedding generation');
        return null;
      }
      
      // 長すぎるテキストは切り詰める（APIの制限とコスト削減のため）
      const truncatedText = text.substring(0, 8000);
      
      // キャッシュチェック
      const cacheKey = truncatedText.substring(0, 100); // 先頭100字をキーとして使用
      if (this.embeddingCache.has(cacheKey)) {
        return this.embeddingCache.get(cacheKey);
      }
      
      // API呼び出し
      console.log(`Generating embedding for text: ${truncatedText.substring(0, 30)}...`);
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: truncatedText,
      });
      
      // 課金額計算用カウンター
      this.apiCallCount++;
      // 推定コスト計算（$0.0001 / 1K tokens 程度と仮定）
      this.estimatedCost += (truncatedText.length / 4) * 0.0000001;
      
      const embedding = response.data[0].embedding;
      
      // キャッシュに保存
      this.embeddingCache.set(cacheKey, embedding);
      
      // キャッシュサイズ管理
      if (this.embeddingCache.size > this.maxCacheSize) {
        // 最も古いエントリを削除
        const firstKey = this.embeddingCache.keys().next().value;
        this.embeddingCache.delete(firstKey);
      }
      
      return embedding;
    } catch (error) {
      console.error('Embedding generation error:', error.message);
      return null;
    }
  }
  
  /**
   * 質問かどうかを判定
   * @param {string} text - 判定対象テキスト
   * @returns {boolean} - 質問の場合true
   */
  isQuestion(text) {
    if (!text) return false;
    
    // 日本語の疑問文パターン
    const japaneseQuestionPatterns = [
      /[\?？]$/, // 末尾が ? or ？
      /ですか[\.。\s]*$/, // 「ですか」で終わる
      /ますか[\.。\s]*$/, // 「ますか」で終わる
      /のか[\.。\s]*$/, // 「のか」で終わる
      /何|誰|どこ|いつ|なぜ|どうして|どのように|どんな|どう/ // 5W1H疑問詞
    ];
    
    return japaneseQuestionPatterns.some(pattern => pattern.test(text));
  }
  
  /**
   * 重要なコンテンツかどうかを判定
   * @param {string} text - 判定対象テキスト
   * @returns {boolean} - 重要な場合true
   */
  isImportantContent(text) {
    if (!text) return false;
    
    // キーワードベースの重要度判定（より精緻な実装は後ほど可能）
    const importantKeywords = [
      '重要', '覚えておいて', '忘れないで', 'ポイント', 
      '特徴', '要点', '特性', '定義', '意味', 
      '目標', '好み', '趣味', '希望', '課題'
    ];
    
    return importantKeywords.some(keyword => text.includes(keyword)) ||
           // 長文の場合も重要とみなす（後で参照する可能性大）
           text.length > 300;
  }
  
  /**
   * ユーザーメッセージをデータベースに保存
   * @param {string} userId - ユーザーID
   * @param {string} content - メッセージ内容
   * @param {Array<number>} embedding - 生成済みembedding
   * @returns {Promise<boolean>} - 成功時true
   */
  async storeMessageEmbedding(userId, content, embedding) {
    try {
      if (!embedding) {
        embedding = await this.generateEmbedding(content);
      }
      
      if (!embedding) {
        console.warn(`Failed to generate embedding for user ${userId}`);
        return false;
      }
      
      const isQuestionFlag = this.isQuestion(content);
      const isImportantFlag = this.isImportantContent(content);
      
      // 質問か重要なコンテンツのみ保存（費用削減）
      if (!isQuestionFlag && !isImportantFlag) {
        console.log(`Skipping storage for non-question, non-important content: ${content.substring(0, 30)}...`);
        return false;
      }
      
      // 有効期限の設定（質問は30日、重要なコンテンツは60日）
      const daysToExpire = isImportantFlag ? 60 : 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + daysToExpire);
      
      // メッセージID生成（タイムスタンプベース）
      const messageId = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      // データベースに保存
      await db.query(
        `INSERT INTO semantic_embeddings 
         (user_id, message_id, content, embedding, is_question, is_important, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, messageId, content, embedding, isQuestionFlag, isImportantFlag, expiresAt.toISOString()]
      );
      
      console.log(`Stored embedding for user ${userId}: ${isQuestionFlag ? 'question' : ''} ${isImportantFlag ? 'important' : ''}`);
      return true;
    } catch (error) {
      console.error('Error storing message embedding:', error.message);
      return false;
    }
  }
  
  /**
   * ユーザーの質問に関連する過去のコンテキストを検索
   * @param {string} userId - ユーザーID
   * @param {string} query - 検索クエリ
   * @param {number} limit - 取得件数
   * @returns {Promise<Array<{content: string, similarity: number}>>} - 関連コンテキスト
   */
  async findRelevantContext(userId, query, limit = 3) {
    try {
      // クエリのembeddingを生成
      const queryEmbedding = await this.generateEmbedding(query);
      
      if (!queryEmbedding) {
        console.warn(`Failed to generate embedding for query: ${query}`);
        return [];
      }
      
      // データベースから類似度検索（L2距離）
      const results = await db.query(
        `SELECT content, embedding <-> $1 as distance
         FROM semantic_embeddings
         WHERE user_id = $2
         ORDER BY embedding <-> $1
         LIMIT $3`,
        [queryEmbedding, userId, limit]
      );
      
      // アクセスカウントを更新
      if (results.length > 0) {
        const ids = results.map((_, index) => `$${index + 1}`).join(',');
        const idValues = results.map(result => result.id);
        
        await db.query(
          `UPDATE semantic_embeddings
           SET access_count = access_count + 1
           WHERE id IN (${ids})`,
          idValues
        );
      }
      
      // 結果をフォーマット
      return results.map(row => ({
        content: row.content,
        similarity: 1 - row.distance // 距離を類似度に変換（0-1）
      }));
    } catch (error) {
      console.error('Error finding relevant context:', error.message);
      return [];
    }
  }
  
  /**
   * 会話履歴と質問から関連コンテキストを加味したプロンプトを生成
   * @param {string} userId - ユーザーID
   * @param {string} query - ユーザーの質問
   * @param {string} systemPrompt - システムプロンプト
   * @param {Array} history - 会話履歴
   * @returns {Promise<{enhancedPrompt: string, contexts: Array}>} - 強化されたプロンプトと関連コンテキスト
   */
  async enhancePromptWithContext(userId, query, systemPrompt, history) {
    try {
      // クエリのembeddingをデータベースに保存（履歴化）
      this.storeMessageEmbedding(userId, query, null);
      
      // 関連コンテキストを検索
      const relevantContexts = await this.findRelevantContext(userId, query);
      
      // 関連コンテキストがない場合
      if (relevantContexts.length === 0) {
        return {
          enhancedPrompt: systemPrompt,
          contexts: []
        };
      }
      
      // 関連コンテキストをプロンプトに追加
      let contextSection = '関連する過去のやり取り:\n';
      relevantContexts.forEach((ctx, i) => {
        if (ctx.similarity > 0.7) { // 十分に関連性の高いコンテキストのみ
          contextSection += `${i+1}. ${ctx.content}\n`;
        }
      });
      
      // 会話履歴に既に含まれている場合は追加しない
      const historyContent = history.map(msg => msg.content).join(' ');
      if (relevantContexts.some(ctx => historyContent.includes(ctx.content))) {
        return {
          enhancedPrompt: systemPrompt,
          contexts: []
        };
      }
      
      // システムプロンプトの最後に追加
      const enhancedPrompt = `${systemPrompt}\n\n${contextSection}\n上記の情報を参考にして、一貫性のある回答を生成してください。`;
      
      return {
        enhancedPrompt,
        contexts: relevantContexts
      };
    } catch (error) {
      console.error('Error enhancing prompt with context:', error.message);
      return {
        enhancedPrompt: systemPrompt,
        contexts: []
      };
    }
  }
  
  /**
   * 古いembeddingデータのクリーンアップを実行
   * @returns {Promise<boolean>} - 成功時true
   */
  async cleanupOldEmbeddings() {
    try {
      await db.query('SELECT cleanup_old_embeddings()');
      console.log('Old embeddings cleaned up');
      return true;
    } catch (error) {
      console.error('Error cleaning up old embeddings:', error.message);
      return false;
    }
  }
  
  /**
   * デバッグ情報を出力
   * @returns {Object} - デバッグ情報
   */
  getDebugInfo() {
    return {
      apiCallCount: this.apiCallCount,
      estimatedCost: this.estimatedCost.toFixed(6),
      cacheSize: this.embeddingCache.size
    };
  }
}

module.exports = new SemanticSearch();
