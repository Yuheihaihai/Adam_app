/**
 * ML Integration - 機械学習機能統合モジュール
 * 
 * 既存のシステムと機械学習モジュールを統合するアダプター
 * 各モード（general, mental_health, analysis, career）に応じた機械学習機能を提供
 * 
 * キャリアモードはPerplexity APIを、他のモードはLocalMLを使用
 */

const localML = require('./localML');
const { needsKnowledge, enhanceKnowledge, getJobTrends } = require('./perplexitySearch');

/**
 * ユーザーメッセージに基づいて機械学習データを取得
 * @param {string} userId - ユーザーID 
 * @param {string} userMessage - ユーザーメッセージ
 * @param {string} mode - 会話モード (general/mental_health/analysis/career)
 * @returns {Promise<Object|null>} - 機械学習データ (モードに応じたフォーマット)
 */
async function getMLData(userId, userMessage, mode) {
  console.log(`\n🔍 [ML Integration] モード: ${mode}, ユーザーID: ${userId.substring(0, 8)}...`);
  
  try {
    // キャリアモード: Perplexityを使用
    if (mode === 'career') {
      console.log('    ├─ キャリアモード: Perplexity APIを使用');
      
      if (!needsKnowledge(userMessage)) {
        console.log('    ├─ Perplexity: 必要性なし - スキップ');
        return null;
      }
      
      console.log('    ├─ Perplexity: データ取得開始');
      
      // Perplexityからデータを取得
      const [knowledge, jobTrends] = await Promise.all([
        enhanceKnowledge(userId, userMessage),
        getJobTrends(userMessage)
      ]);
      
      return {
        knowledge,
        jobTrends
      };
    } 
    // 他のモード: LocalMLを使用
    else if (['general', 'mental_health', 'analysis'].includes(mode)) {
      console.log(`    ├─ ${mode}モード: LocalMLを使用`);
      
      // LocalMLからユーザー分析を取得
      const analysis = await localML.enhanceResponse(userId, userMessage, mode);
      return analysis;
    }
    
    // 未対応モード
    console.log(`    ├─ 未対応モード: ${mode}`);
    return null;
    
  } catch (error) {
    console.error(`    ├─ [ML Integration] エラー発生: ${error.message}`);
    return null;
  }
}

/**
 * 機械学習データをAIのプロンプトに統合するためのシステムメッセージを生成
 * @param {string} mode - 会話モード
 * @param {Object} mlData - 機械学習データ
 * @returns {string|null} - システムメッセージまたはnull
 */
function generateSystemPrompt(mode, mlData) {
  if (!mlData) return null;
  
  try {
    // キャリアモード: Perplexityデータ用のプロンプト
    if (mode === 'career') {
      let prompt = '';
      
      // ジョブトレンドデータ
      if (mlData.jobTrends && mlData.jobTrends.analysis) {
        prompt += `
# 最新の市場データ (Perplexityから取得)

[市場分析]
${mlData.jobTrends.analysis || '情報を取得できませんでした。'}

[求人情報]
${mlData.jobTrends.urls || '情報を取得できませんでした。'}

このデータを活用してユーザーに適切なキャリアアドバイスを提供してください。
`;
      }
      
      // ユーザー特性データ
      if (mlData.knowledge) {
        prompt += `
# ユーザー特性の追加分析 (Perplexityから取得)

${mlData.knowledge}

この特性を考慮してアドバイスを提供してください。
`;
      }
      
      return prompt;
    } 
    // 他のモード: LocalMLデータ用のプロンプト
    else if (['general', 'mental_health', 'analysis'].includes(mode)) {
      return localML.generateSystemPrompt(mode, mlData);
    }
    
    return null;
    
  } catch (error) {
    console.error(`[ML Integration] プロンプト生成エラー: ${error.message}`);
    return null;
  }
}

module.exports = {
  getMLData,
  generateSystemPrompt
}; 