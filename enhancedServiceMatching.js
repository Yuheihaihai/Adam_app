// enhancedServiceMatching.js
// 既存のserver.jsコードを変更せずにEmbedding機能を統合するファイル

// 必要な依存関係
const ServiceMatchingUtils = require('./serviceMatchingUtils');

// インスタンス作成
const serviceMatchingUtils = new ServiceMatchingUtils();

// 初期化済みかどうか
let initialized = false;

/**
 * 初期化関数
 */
async function initialize() {
  if (!initialized) {
    try {
      await serviceMatchingUtils.initialize();
      initialized = true;
      console.log('Enhanced service matching module initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize enhanced service matching module:', error);
      return false;
    }
  }
  return initialized;
}

/**
 * server.jsの既存のdetectAdviceRequestWithLLM関数を取得するユーティリティ
 * @return {Function|null} detectAdviceRequestWithLLM関数またはnull
 */
function getOriginalDetectAdviceRequestWithLLM() {
  // グローバルスコープにある場合
  if (typeof global.detectAdviceRequestWithLLM === 'function') {
    return global.detectAdviceRequestWithLLM;
  }
  
  // server.jsからインポートできる場合
  try {
    return require('./server').detectAdviceRequestWithLLM;
  } catch (error) {
    console.warn('Could not import detectAdviceRequestWithLLM from server.js:', error.message);
    return null;
  }
}

/**
 * サービス推奨を表示すべきか判断する拡張関数
 * @param {string} userMessage - ユーザーのメッセージ
 * @param {Array} history - 会話履歴
 * @param {string} userId - ユーザーID
 * @return {Promise<boolean>} サービス推奨を表示すべきかどうか
 */
async function enhancedShouldShowServiceRecommendation(userMessage, history, userId) {
  // 初期化
  if (!initialized) {
    await initialize();
  }
  
  // 元の関数を取得
  const originalDetect = getOriginalDetectAdviceRequestWithLLM();
  
  try {
    // Embedding機能による判断
    return await serviceMatchingUtils.shouldShowServiceRecommendation(userMessage, history, userId);
  } catch (error) {
    console.error('Error in enhanced service recommendation decision:', error);
    
    // エラーの場合は元の関数を使用
    if (originalDetect) {
      return originalDetect(userMessage, history);
    }
    
    // どちらも使えない場合は判断できないのでfalse
    return false;
  }
}

/**
 * 拡張サービスマッチング
 * @param {Array<string>} userNeeds - ユーザーのニーズ配列
 * @param {Array<Object>} services - サービス情報の配列
 * @return {Promise<Array<Object>>} マッチしたサービスの配列
 */
async function enhancedServiceMatching(userNeeds, services) {
  // 初期化
  if (!initialized) {
    await initialize();
  }
  
  try {
    // Embedding機能によるマッチング
    return await serviceMatchingUtils.enhancedServiceMatching(userNeeds, services);
  } catch (error) {
    console.error('Error in enhanced service matching:', error);
    
    // エラーの場合は空の配列を返す
    return [];
  }
}

// server.jsが直接アクセスできる公開API
const enhancedServiceMatchingAPI = {
  initialize,
  shouldShowServiceRecommendation: enhancedShouldShowServiceRecommendation,
  enhancedServiceMatching
};

// グローバル登録
global.enhancedServiceMatching = enhancedServiceMatchingAPI;

module.exports = enhancedServiceMatchingAPI; 