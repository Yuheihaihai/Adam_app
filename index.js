// index.js
// Embeddingベース機能のエントリーポイント

// 必要なモジュールのインポート
const EnhancedEmbeddingService = require('./enhancedEmbeddingService');
const ServiceMatchingUtils = require('./serviceMatchingUtils');
const ImageGenerationUtils = require('./imageGenerationUtils');
const handleASDUsageInquiry = require('./handleASDUsageInquiry');

// インスタンス作成
const embeddingService = new EnhancedEmbeddingService();
const serviceMatchingUtils = new ServiceMatchingUtils();
const imageGenerationUtils = new ImageGenerationUtils();

/**
 * すべてのEmbedding機能を初期化
 * @returns {Promise<boolean>} - 初期化が成功したかどうか
 */
async function initializeEmbeddingFeatures() {
  console.log('Initializing Enhanced Embedding Features...');
  
  try {
    // 各サービスの初期化
    await Promise.all([
      embeddingService.initialize(),
      serviceMatchingUtils.initialize(),
      imageGenerationUtils.initialize()
    ]);
    
    // グローバルに公開
    global.enhancedEmbeddingService = embeddingService;
    global.serviceMatchingUtils = serviceMatchingUtils;
    global.imageGenerationUtils = imageGenerationUtils;
    global.handleASDUsageInquiry = handleASDUsageInquiry;
    
    console.log('Enhanced Embedding Features successfully initialized.');
    return true;
  } catch (error) {
    console.error('Failed to initialize Enhanced Embedding Features:', error);
    return false;
  }
}

/**
 * ユーザーのメッセージに基づいてサービス推奨を表示すべきか判断
 * @param {string} userMessage - ユーザーメッセージ
 * @param {Array} history - 会話履歴
 * @param {string} userId - ユーザーID
 * @returns {Promise<boolean>} - サービス推奨を表示すべきかどうか
 */
async function shouldShowServiceRecommendation(userMessage, history, userId) {
  try {
    // 初期化確認
    if (!global.serviceMatchingUtils) {
      await initializeEmbeddingFeatures();
    }
    
    return global.serviceMatchingUtils.shouldShowServiceRecommendation(userMessage, history, userId);
  } catch (error) {
    console.error('Error in shouldShowServiceRecommendation:', error);
    
    // フォールバック：既存の関数を使用
    if (typeof detectAdviceRequestWithLLM === 'function') {
      return detectAdviceRequestWithLLM(userMessage, history);
    }
    
    // どちらも利用不可の場合はデフォルト値
    return true;
  }
}

/**
 * サービスのマッチング
 * @param {Array<string>} userNeeds - ユーザーのニーズを表す文字列配列
 * @param {Array<Object>} services - サービスオブジェクトの配列
 * @returns {Promise<Array<Object>>} - マッチしたサービスの配列
 */
async function enhancedServiceMatching(userNeeds, services) {
  try {
    // 初期化確認
    if (!global.serviceMatchingUtils) {
      await initializeEmbeddingFeatures();
    }
    
    return global.serviceMatchingUtils.enhancedServiceMatching(userNeeds, services);
  } catch (error) {
    console.error('Error in enhancedServiceMatching:', error);
    // フォールバック：空の結果
    return [];
  }
}

/**
 * 画像生成すべきかどうかを判断
 * @param {string} userMessage - ユーザーメッセージ
 * @param {string} aiResponse - AIの応答
 * @returns {Promise<boolean>} - 画像生成すべきかどうか
 */
async function shouldGenerateImage(userMessage, aiResponse) {
  try {
    // 初期化確認
    if (!global.imageGenerationUtils) {
      await initializeEmbeddingFeatures();
    }
    
    return global.imageGenerationUtils.shouldGenerateImage(userMessage, aiResponse);
  } catch (error) {
    console.error('Error in shouldGenerateImage:', error);
    
    // フォールバック：既存の関数を使用
    if (typeof isConfusionRequest === 'function') {
      return isConfusionRequest(userMessage);
    }
    
    // どちらも利用不可の場合はデフォルト値（安全のためfalse）
    return false;
  }
}

// サーバー起動時に初期化
initializeEmbeddingFeatures().then(success => {
  if (success) {
    console.log('Embedding features are ready to use.');
  } else {
    console.warn('Embedding features initialization failed, falling back to default methods.');
  }
});

// 公開する関数
module.exports = {
  initializeEmbeddingFeatures,
  shouldShowServiceRecommendation,
  enhancedServiceMatching,
  shouldGenerateImage,
  handleASDUsageInquiry
}; 