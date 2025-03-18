// imageGenerationUtils.js
// 画像生成機能のオンオフ判定のためのユーティリティ

const EnhancedEmbeddingService = require('./enhancedEmbeddingService');
const crypto = require('crypto');

class ImageGenerationUtils {
  constructor() {
    this.embeddingService = null;
    
    // 画像生成判断のための閾値
    this.CONFUSION_THRESHOLD = 0.65;
    this.IMAGE_REQUEST_THRESHOLD = 0.75;
    
    // 統計データ
    if (!global.imageDecisionStats) {
      global.imageDecisionStats = [];
    }
  }
  
  async initialize() {
    if (!this.embeddingService) {
      this.embeddingService = new EnhancedEmbeddingService();
      await this.embeddingService.initialize();
    }
    return true;
  }
  
  /**
   * 画像生成すべきかどうかを判断
   * @param {string} userMessage - ユーザーメッセージ
   * @param {string} aiResponse - AIの直前の返答
   * @returns {Promise<boolean>} - 画像生成すべきかどうか
   */
  async shouldGenerateImage(userMessage, aiResponse) {
    await this.initialize();
    
    // 短いメッセージや空のメッセージはスキップ
    if (!userMessage || userMessage.length < 10) {
      // 従来の判定方法がある場合はそれを使用
      return typeof isConfusionRequest === 'function' 
        ? isConfusionRequest(userMessage)
        : false;
    }
    
    try {
      // キャッシュのためのキー生成
      const cacheKey = crypto.createHash('md5').update(userMessage).digest('hex');
      
      // キャッシュチェック（5分間有効）
      if (global.enhancedEmbeddingCache?.has(`image_decision_${cacheKey}`)) {
        const cached = global.enhancedEmbeddingCache.get(`image_decision_${cacheKey}`);
        if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
          return cached.decision;
        }
      }
      
      // 混乱表現のサンプル
      const confusionExamples = [
        "意味がわかりません",
        "もう少しわかりやすく説明してください",
        "理解できません",
        "よくわからない",
        "何を言っているのかわからない"
      ];
      
      // 画像化リクエストのサンプル
      const imageRequestExamples = [
        "画像で説明してください",
        "ビジュアルで見せてください",
        "図解してもらえますか",
        "画像にしてください",
        "絵で表現してください"
      ];
      
      // サンプルをまとめて処理し、API呼び出しを削減
      const userEmbedding = await this.embeddingService.getEmbeddingWithRateLimit(userMessage);
      
      // 混乱表現と画像リクエスト表現をエンベディング
      const confusionText = confusionExamples.join(". ");
      const imageRequestText = imageRequestExamples.join(". ");
      
      const [confusionEmbedding, imageRequestEmbedding] = await Promise.all([
        this.embeddingService.getEmbeddingWithRateLimit(confusionText),
        this.embeddingService.getEmbeddingWithRateLimit(imageRequestText)
      ]);
      
      // 類似度計算
      const confusionScore = this.embeddingService.embeddingService.calculateSimilarity(
        userEmbedding, 
        confusionEmbedding
      );
      
      const imageRequestScore = this.embeddingService.embeddingService.calculateSimilarity(
        userEmbedding, 
        imageRequestEmbedding
      );
      
      // 正規化（-1〜1 → 0〜1）
      const normalizedConfusionScore = (confusionScore + 1) / 2;
      const normalizedImageScore = (imageRequestScore + 1) / 2;
      
      // 閾値判定（二段階判断）
      const directImageRequest = normalizedImageScore > this.IMAGE_REQUEST_THRESHOLD;
      const showsDueToConfusion = normalizedConfusionScore > this.CONFUSION_THRESHOLD && 
                                 aiResponse?.length > 200;
      
      // 結果
      const decision = directImageRequest || showsDueToConfusion;
      
      // 結果をキャッシュ
      if (!global.enhancedEmbeddingCache) global.enhancedEmbeddingCache = new Map();
      global.enhancedEmbeddingCache.set(`image_decision_${cacheKey}`, {
        decision,
        timestamp: Date.now()
      });
      
      // 統計情報の保存（将来のモデル改善用）
      global.imageDecisionStats.push({
        timestamp: Date.now(),
        messageLength: userMessage.length,
        aiResponseLength: aiResponse?.length || 0,
        confusionScore: normalizedConfusionScore,
        imageRequestScore: normalizedImageScore,
        decision,
        userMessage: userMessage.substring(0, 50) // プライバシー考慮で先頭のみ
      });
      
      // 統計情報の上限設定
      if (global.imageDecisionStats.length > 1000) {
        global.imageDecisionStats = global.imageDecisionStats.slice(-1000);
      }
      
      if (decision) {
        console.log(`[IMAGE-DECISION] 画像生成を判断: 混乱スコア=${normalizedConfusionScore.toFixed(2)}, 画像リクエストスコア=${normalizedImageScore.toFixed(2)}`);
      }
      
      return decision;
    } catch (error) {
      console.error('Error in image generation decision:', error);
      
      // フォールバック：従来の方法
      return typeof isConfusionRequest === 'function'
        ? isConfusionRequest(userMessage)
        : false;
    }
  }
  
  /**
   * 画像生成の統計情報を取得（内部診断用）
   */
  getImageDecisionStats() {
    if (!global.imageDecisionStats) return { count: 0, stats: [] };
    
    // 基本的な統計情報
    const stats = global.imageDecisionStats || [];
    const totalDecisions = stats.length;
    const positiveDecisions = stats.filter(s => s.decision).length;
    const positiveRate = totalDecisions > 0 ? positiveDecisions / totalDecisions : 0;
    
    // 平均スコア
    const avgConfusionScore = stats.reduce((sum, s) => sum + s.confusionScore, 0) / 
                              (stats.length || 1);
    const avgImageScore = stats.reduce((sum, s) => sum + s.imageRequestScore, 0) / 
                          (stats.length || 1);
    
    // 最新の判断10件
    const recentDecisions = stats.slice(-10).map(s => ({
      time: new Date(s.timestamp).toISOString(),
      decision: s.decision,
      confusionScore: s.confusionScore.toFixed(2),
      imageRequestScore: s.imageRequestScore.toFixed(2),
      message: s.userMessage
    }));
    
    return {
      count: totalDecisions,
      positiveRate: positiveRate.toFixed(2),
      avgConfusionScore: avgConfusionScore.toFixed(2),
      avgImageScore: avgImageScore.toFixed(2),
      recentDecisions
    };
  }
}

module.exports = ImageGenerationUtils; 