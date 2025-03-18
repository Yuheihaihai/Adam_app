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
      // Embeddingによる事前フィルタリング
      const opennessSamples = [
        "何かいいサービスを教えてください",
        "助けになる情報がほしい",
        "どうすればいいかわからない",
        "対応できる支援はありますか",
        "アドバイスをください"
      ];
      
      // サンプルをまとめて1つのテキストにしてAPI呼び出し削減
      const combinedSamples = opennessSamples.join(". ");
      const samplesEmbedding = await this.embeddingService.getEmbeddingWithRateLimit(combinedSamples);
      const messageEmbedding = await this.embeddingService.getEmbeddingWithRateLimit(userMessage);
      
      // コサイン類似度を計算
      const similarity = this.embeddingService.embeddingService.calculateSimilarity(
        samplesEmbedding, 
        messageEmbedding
      );
      
      // 正規化
      const normalizedScore = (similarity + 1) / 2;
      
      // スコアで判断
      if (normalizedScore < 0.3) {
        // 低スコアはサービス表示しない
        return false;
      } else if (normalizedScore > 0.7) {
        // 高スコアは直接表示
        return true;
      } else {
        // 中間スコアはLLMで判断（従来機能を活用）
        return typeof detectAdviceRequestWithLLM === 'function'
          ? detectAdviceRequestWithLLM(userMessage, history)
          : true;
      }
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
    
    for (const service of services) {
      let score = 0;
      
      // 名前、説明文、タグなどにマッチングキーワードがあるか検査
      const serviceText = `${service.name} ${service.description || ''} ${(service.tags || []).join(' ')}`.toLowerCase();
      const targets = (service.targets || []).join(' ').toLowerCase();
      
      // キーワードマッチングスコア
      for (const need of userNeeds) {
        const needLower = need.toLowerCase();
        if (serviceText.includes(needLower)) score += 0.3;
        if (targets.includes(needLower)) score += 0.5;
      }
      
      // 最低限のスコアがあれば結果に追加
      if (score > 0.3) {
        results.push({ service, score });
      }
    }
    
    // スコアでソート
    return results.sort((a, b) => b.score - a.score);
  }
}

module.exports = ServiceMatchingUtils; 