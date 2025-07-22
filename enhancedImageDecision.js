// enhancedImageDecision.js
// 既存のserver.jsコードを変更せずにEmbedding機能を統合するファイル

// 必要な依存関係
const ImageGenerationUtils = require('./imageGenerationUtils');
const { OpenAI } = require('openai');

// インスタンス作成
const imageGenerationUtils = new ImageGenerationUtils();

// OpenAI クライアント（文脈分析用）
let contextAnalyzer = null;
if (process.env.OPENAI_API_KEY) {
  contextAnalyzer = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// 初期化済みかどうか
let initialized = false;

/**
 * 初期化関数
 */
async function initialize() {
  if (!initialized) {
    try {
      await imageGenerationUtils.initialize();
      initialized = true;
      console.log('Enhanced image decision module initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize enhanced image decision module:', error);
      return false;
    }
  }
  return initialized;
}

/**
 * LLMを使った文脈分析による画像生成判定
 * @param {string} userMessage - ユーザーメッセージ
 * @return {Promise<boolean>} - 画像生成すべきかどうか
 */
async function analyzeLLMContext(userMessage) {
  if (!contextAnalyzer) {
    console.log('[LLM-CONTEXT] OpenAI not available, skipping LLM analysis');
    return null; // LLMが利用不可の場合はnullを返す
  }

  try {
    const prompt = `以下のメッセージを分析して、ユーザーがAIに画像生成を依頼しているかどうかを判定してください。

判定基準:
- 「画像を作って」「イラストを描いて」「図解して」などの依頼表現 → YES
- 自分の能力や経験について話している場合 → NO
- 過去の出来事や趣味について話している場合 → NO

メッセージ: "${userMessage}"

回答は「YES」または「NO」のみで答えてください。`;

    const response = await contextAnalyzer.chat.completions.create({
      model: "gpt-4o-mini", // 高速で安価なモデル
      messages: [{ role: "user", content: prompt }],
      max_tokens: 10,
      temperature: 0.1
    });

    const result = response.choices[0].message.content.trim().toUpperCase();
    const decision = result === 'YES';
    
    console.log(`[LLM-CONTEXT] Message: "${userMessage.substring(0, 30)}..." → ${result}`);
    return decision;
    
  } catch (error) {
    console.error('[LLM-CONTEXT] Error in LLM analysis:', error);
    return null; // エラー時はnullを返してフォールバック
  }
}

/**
 * server.jsの既存のisConfusionRequest関数を取得するユーティリティ
 * @return {Function|null} isConfusionRequest関数またはnull
 */
function getOriginalIsConfusionRequest() {
  // グローバルスコープにある場合
  if (typeof global.isConfusionRequest === 'function') {
    return global.isConfusionRequest;
  }
  
  // server.jsからインポートできる場合
  try {
    return require('./server').isConfusionRequest;
  } catch (error) {
    console.warn('Could not import isConfusionRequest from server.js:', error.message);
    return null;
  }
}

/**
 * 掘り下げモードをチェックする関数を取得
 * @return {Function|null} isDeepExplorationRequest関数またはnull
 */
function getIsDeepExplorationRequest() {
  // グローバルスコープにある場合
  if (typeof global.isDeepExplorationRequest === 'function') {
    return global.isDeepExplorationRequest;
  }
  
  // server.jsからインポートできる場合
  try {
    return require('./server').isDeepExplorationRequest;
  } catch (error) {
    console.warn('Could not import isDeepExplorationRequest from server.js:', error.message);
    return null;
  }
}

/**
 * 拡張された画像生成判断（LLM文脈分析付き）
 * @param {string} userMessage - ユーザーのメッセージ
 * @param {string} aiResponse - AIの前回の応答（オプション）
 * @return {Promise<boolean>} 画像生成すべきかどうか
 */
async function enhancedShouldGenerateImage(userMessage, aiResponse = null) {
  // 初期化
  if (!initialized) {
    await initialize();
  }
  
  // 掘り下げモードをチェック
  const isDeepExplorationRequest = getIsDeepExplorationRequest();
  if (isDeepExplorationRequest && isDeepExplorationRequest(userMessage)) {
    console.log('[DEBUG] Deep exploration mode detected - skipping image generation');
    return false;
  }

  // 1. LLM文脈分析（最優先）
  const llmDecision = await analyzeLLMContext(userMessage);
  if (llmDecision !== null) {
    // LLMの判定がNOの場合、他の判定をスキップ
    if (llmDecision === false) {
      console.log('[LLM-CONTEXT] LLM decided NO - skipping other checks');
      return false;
    }
    // LLMの判定がYESの場合、そのまま返す
    if (llmDecision === true) {
      console.log('[LLM-CONTEXT] LLM decided YES - generating image');
      return true;
    }
  }

  // 2. 従来の判定ロジック（LLMが利用不可またはエラーの場合のフォールバック）
  console.log('[LLM-CONTEXT] Using fallback methods');
  
  // 元のisConfusionRequest関数を取得
  const originalIsConfusionRequest = getOriginalIsConfusionRequest();
  
  // 基本チェック（既存の機能を活用）
  let basicDecision = false;
  if (originalIsConfusionRequest) {
    basicDecision = originalIsConfusionRequest(userMessage);
  } else {
    // isConfusionRequestが見つからない場合の簡易判定
    const simpleKeywords = ['画像', 'イメージ', '図', '絵', 'ビジュアル'];
    basicDecision = simpleKeywords.some(keyword => userMessage.includes(keyword));
  }
  
  // 拡張機能によるチェック
  try {
    // どちらかがtrueならtrueを返す
    if (basicDecision) {
      return true;
    }
    
    // Embedding機能による高度な判断
    return await imageGenerationUtils.shouldGenerateImage(userMessage, aiResponse);
  } catch (error) {
    console.error('Error in enhanced image generation decision:', error);
    // エラーの場合は基本判断を返す
    return basicDecision;
  }
}

/**
 * 統計情報取得
 */
function getImageDecisionStats() {
  if (!initialized) {
    return { initialized: false, stats: [] };
  }
  
  return imageGenerationUtils.getImageDecisionStats();
}

// server.jsが直接アクセスできる公開API
const enhancedImageDecision = {
  initialize,
  shouldGenerateImage: enhancedShouldGenerateImage,
  getStats: getImageDecisionStats
};

// グローバル登録
global.enhancedImageDecision = enhancedImageDecision;

module.exports = enhancedImageDecision; 