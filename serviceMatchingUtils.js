// serviceMatchingUtils.js
// サービスマッチング精度向上のためのユーティリティ

const crypto = require('crypto');
const EnhancedEmbeddingService = require('./enhancedEmbeddingService');

class ServiceMatchingUtils {
  constructor() {
    this.embeddingService = null;
    this.CONFIDENCE_THRESHOLD = 0.65; // デフォルト閾値
  }
  
  async initialize() {
    if (!this.embeddingService) {
      this.embeddingService = new EnhancedEmbeddingService();
      await this.embeddingService.initialize();
    }
    return true;
  }

  /**
   * ユーザーニーズに基づく高精度なサービスマッチング
   * @param {Array<string>} userNeeds - ユーザーのニーズ配列
   * @param {Array<Object>} services - サービス情報の配列
   * @returns {Promise<Array<Object>>} - マッチしたサービス配列
   */
  async enhancedServiceMatching(userNeeds, services) {
    await this.initialize();
    
    // 入力検証
    if (!Array.isArray(userNeeds) || userNeeds.length === 0 || !Array.isArray(services) || services.length === 0) {
      console.warn('Invalid input for enhanced service matching');
      return []; // 空配列を返す
    }
    
    // エンベディングサービスが利用できない場合は即座にフォールバック
    if (!this.embeddingService || !this.embeddingService.initialized || !this.embeddingService.isEnabled) {
      console.log('EmbeddingService not available, using fallback matching');
      return this._fallbackMatching(userNeeds, services);
    }
    
    try {
      // キャッシュ確認
      const cacheKey = crypto.createHash('md5').update(JSON.stringify(userNeeds)).digest('hex');
      if (global.serviceMatchCache?.has(cacheKey)) {
        const cached = global.serviceMatchCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 30 * 60 * 1000) { // 30分間有効
          return cached.results;
        }
      }
      
      // ユーザーニーズの意図をエンベディング
      const userNeedsText = userNeeds.join('. ');
      const needsEmbedding = await this.embeddingService.getEmbeddingWithRateLimit(userNeedsText);
      
      // エンベディング結果を検証（ゼロベクトルチェック）
      if (!needsEmbedding || (Array.isArray(needsEmbedding) && needsEmbedding.every(val => val === 0))) {
        console.log('Got zero embedding, falling back to keyword matching');
        return this._fallbackMatching(userNeeds, services);
      }
      
      // サービス説明のエンベディングをバッチで取得
      const servicesWithScores = [];
      
      // バッチサイズ: 10サービスごとに処理
      for (let i = 0; i < services.length; i += 10) {
        const batch = services.slice(i, i + 10);
        const batchResults = await Promise.all(batch.map(async service => {
          try {
            // サービスごとのエンベディングをキャッシュから取得または生成
            const serviceKey = `service_${service.id || service.name}`;
            let serviceEmbedding;
            
            if (global.enhancedEmbeddingCache?.has(serviceKey)) {
              serviceEmbedding = global.enhancedEmbeddingCache.get(serviceKey).embedding;
            } else {
              const serviceDesc = `${service.name}: ${service.description || ''}. 対象: ${(service.targets || []).join(', ')}`;
              serviceEmbedding = await this.embeddingService.getEmbeddingWithRateLimit(serviceDesc);
            }
            
            // 類似度計算
            const similarity = this.embeddingService.embeddingService.calculateSimilarity(
              needsEmbedding, 
              serviceEmbedding
            );
            
            return {
              service,
              score: (similarity + 1) / 2 // -1〜1 → 0〜1 に正規化
            };
          } catch (error) {
            console.error(`Error calculating similarity for service ${service.name}:`, error);
            return { service, score: 0 };
          }
        }));
        
        servicesWithScores.push(...batchResults);
        
        // 短い休憩（レート制限対策）
        if (i + 10 < services.length) {
          await new Promise(r => setTimeout(r, 100));
        }
      }
      
      // 結果をスコアでソート
      const results = servicesWithScores
        .sort((a, b) => b.score - a.score)
        .filter(item => item.score > this.CONFIDENCE_THRESHOLD);
      
      // キャッシュに保存
      if (!global.serviceMatchCache) global.serviceMatchCache = new Map();
      global.serviceMatchCache.set(cacheKey, {
        results,
        timestamp: Date.now()
      });
      
      return results;
    } catch (error) {
      console.error('Error in enhanced service matching:', error);
      // フォールバック：キーワードマッチングなど従来の方法を使用
      return this._fallbackMatching(userNeeds, services);
    }
  }
  
  /**
   * サービスマッチング機能のオンオフ判定
   * @param {string} userMessage - ユーザーメッセージ
   * @param {Array} history - 会話履歴
   * @returns {Promise<boolean>} - サービス表示するかどうか
   */
  async shouldShowServiceRecommendation(userMessage, history, userId) {
    await this.initialize();
    
    // 既に明示的に拒否しているユーザーにはサービスを表示しない
    if (global.userPreferences?._prefStore[userId]?.showServiceRecommendations === false) {
      return false;
    }
    
    // 短いメッセージは通常の処理に委ねる（省エネ）
    if (!userMessage || userMessage.length < 15) {
      // detectAdviceRequestWithLLMが実装されていれば使用し、なければtrueを返す
      return typeof detectAdviceRequestWithLLM === 'function' 
        ? detectAdviceRequestWithLLM(userMessage, history)
        : true;
    }
    
    try {
      // Embedding＋LLMで判定（キーワードは廃止）
      const messageEmbedding = await this.embeddingService.getEmbeddingWithRateLimit(userMessage);
      const centroid = await this.embeddingService.getEmbeddingWithRateLimit(
        "支援が必要, サービス提案, 相談したい, 困りごと, 具体的な手助けが欲しい"
      );
      const similarity = this.embeddingService.embeddingService.calculateSimilarity(centroid, messageEmbedding);
      const normalizedScore = (similarity + 1) / 2;

      if (normalizedScore < 0.35) return false;
      if (normalizedScore > 0.75) return true;

      // 中間域はLLMに委譲
      return typeof detectAdviceRequestWithLLM === 'function'
        ? detectAdviceRequestWithLLM(userMessage, history)
        : true;
    } catch (error) {
      console.error('Error in service recommendation decision:', error);
      // フォールバック：従来の方法
      return typeof detectAdviceRequestWithLLM === 'function'
        ? detectAdviceRequestWithLLM(userMessage, history)
        : true;
    }
  }
  
  /**
   * フォールバック用のシンプルなキーワードマッチング
   * @private
   */
  _fallbackMatching(userNeeds, services) {
    const results = [];
    const needsText = userNeeds.join(' ').toLowerCase();
    
    // 就職関連キーワードの拡張
    const jobKeywords = ['仕事', '就職', '転職', 'キャリア', '職業', '働く', '雇用', '求人'];
    const hasJobKeywords = jobKeywords.some(keyword => needsText.includes(keyword));
    
    for (const service of services) {
      let score = 0;
      
      // 名前、説明文、タグなどにマッチングキーワードがあるか検査
      const serviceText = `${service.name} ${service.description || ''} ${(service.tags || []).join(' ')}`.toLowerCase();
      const criteria = service.criteria || {};
      const criteriaText = Object.values(criteria).flat().join(' ').toLowerCase();
      
      // キーワードマッチングスコア
      for (const need of userNeeds) {
        const needLower = need.toLowerCase();
        if (serviceText.includes(needLower)) score += 0.4;
        if (criteriaText.includes(needLower)) score += 0.3;
      }
      
      // 就職関連サービスの特別処理
      if (hasJobKeywords && (service.tags || []).includes('employment')) {
        score += 0.5;
      }
      
      // 発達障害関連の特別処理
      if (needsText.includes('発達') || needsText.includes('障害') || needsText.includes('自閉') || needsText.includes('ADHD')) {
        if ((service.tags || []).includes('neurodivergent') || (service.tags || []).includes('autism')) {
          score += 0.6;
        }
      }
      
      // 最低限のスコアがあれば結果に追加（閾値を下げる）
      if (score > 0.2) {
        results.push({ service, score });
      }
    }
    
    // スコアでソート、最大5件まで
    return results.sort((a, b) => b.score - a.score).slice(0, 5);
  }
}

module.exports = ServiceMatchingUtils; 