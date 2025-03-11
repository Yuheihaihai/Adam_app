/**
 * ML Hook - 機械学習機能統合ポイント
 * 
 * server.jsから呼び出される機械学習フックポイント
 * 既存のコードを変更せずに機械学習機能を統合
 */

const { getMLData, generateSystemPrompt } = require('./mlIntegration');

/**
 * 機械学習データを取得して処理する
 * @param {string} userId - ユーザーID
 * @param {string} userMessage - ユーザーメッセージ 
 * @param {string} mode - 会話モード
 * @returns {Promise<Object>} - 処理結果 { mlData, systemPrompt }
 */
async function processMlData(userId, userMessage, mode) {
  console.log(`\n🤖 [ML Hook] プロセス開始: mode=${mode}`);
  
  try {
    // 機械学習データを取得
    const mlData = await getMLData(userId, userMessage, mode);
    
    if (!mlData) {
      console.log('    └─ MLデータなし: スキップ');
      return { mlData: null, systemPrompt: null };
    }
    
    // 機械学習データからシステムプロンプトを生成
    const systemPrompt = generateSystemPrompt(mode, mlData);
    
    // MLデータ統合の概要を表示
    console.log('    ├─ MLデータ統合完了:');
    console.log(`    │  ├─ データサイズ: ${JSON.stringify(mlData).length} バイト`);
    console.log(`    │  └─ プロンプト長: ${systemPrompt ? systemPrompt.length : 0} 文字`);
    
    // 最終的な結果を返す
    console.log('    └─ ML処理完了');
    return {
      mlData,
      systemPrompt
    };
    
  } catch (error) {
    console.error(`    └─ [ML Hook] エラー発生: ${error.message}`);
    return { mlData: null, systemPrompt: null };
  }
}

/**
 * ML処理の結果をAI応答と統合して分析
 * @param {string} aiResponse - AIの応答 
 * @param {Object} mlData - 機械学習データ
 * @param {string} mode - 会話モード
 * @returns {Object} - 分析結果
 */
function analyzeResponseWithMl(aiResponse, mlData, mode) {
  if (!mlData || !aiResponse) {
    return null;
  }
  
  console.log(`\n📊 [ML Hook] 応答分析: mode=${mode}`);
  
  try {
    const analysis = {
      influence_detected: false,
      influence_score: 0,
      influence_details: {}
    };
    
    // キャリアモード: Perplexityデータの反映分析
    if (mode === 'career' && mlData) {
      // ここでは既存のPerplexity分析ロジックを使用
      console.log('    └─ キャリアモード: 既存の分析ロジックを使用');
      return null;
    }
    // その他のモード: LocalMLデータの反映分析
    else if (['general', 'mental_health', 'analysis'].includes(mode) && mlData) {
      // 特徴語の検出
      const terms = getKeyTermsForMode(mode, mlData);
      const detectedTerms = terms.filter(term => aiResponse.includes(term));
      
      analysis.influence_detected = detectedTerms.length > 0;
      analysis.influence_score = (detectedTerms.length / terms.length) * 100;
      analysis.influence_details = {
        detected_terms: detectedTerms,
        total_terms: terms.length
      };
      
      // 分析結果をログに記録
      console.log(`    ├─ ML影響分析:`);
      console.log(`    │  ├─ 影響検出: ${analysis.influence_detected ? '✅' : '❌'}`);
      console.log(`    │  ├─ 影響スコア: ${Math.round(analysis.influence_score)}%`);
      console.log(`    │  └─ 検出特徴語: ${detectedTerms.length}/${terms.length}`);
      
      if (detectedTerms.length > 0) {
        console.log(`    │     └─ 検出語: ${detectedTerms.slice(0, 3).join(', ')}${detectedTerms.length > 3 ? ' など...' : ''}`);
      }
      
      console.log('    └─ 分析完了');
    }
    
    return analysis;
    
  } catch (error) {
    console.error(`    └─ [ML Hook] 応答分析エラー: ${error.message}`);
    return null;
  }
}

/**
 * モードに応じた特徴語を取得
 */
function getKeyTermsForMode(mode, mlData) {
  const terms = [];
  
  // 一般モード
  if (mode === 'general' && mlData) {
    // コミュニケーションスタイル
    if (mlData.traits && mlData.traits.communication_style) {
      if (mlData.traits.communication_style === 'formal') {
        terms.push('です', 'ます', 'でしょうか', 'いただく');
      } else if (mlData.traits.communication_style === 'casual') {
        terms.push('だよ', 'よね', 'だね', 'かな');
      }
    }
    
    // 関心トピック
    if (mlData.topics && mlData.topics.primary_interests) {
      mlData.topics.primary_interests.forEach(topic => {
        if (topic === 'technology') terms.push('テクノロジー', 'AI', 'デジタル');
        if (topic === 'culture') terms.push('文化', '芸術', '映画', '音楽');
        if (topic === 'lifestyle') terms.push('ライフスタイル', '健康', '旅行');
        if (topic === 'science') terms.push('科学', '研究', '発見');
        if (topic === 'society') terms.push('社会', '経済', '環境');
      });
    }
    
    // 応答の好み
    if (mlData.response_preferences) {
      if (mlData.response_preferences.length === 'detailed') {
        terms.push('詳しく', '具体的に', '例えば');
      } else if (mlData.response_preferences.length === 'concise') {
        terms.push('簡潔に', '要点', '重要なのは');
      }
    }
  }
  
  // メンタルヘルスモード
  else if (mode === 'mental_health' && mlData) {
    // 感情状態
    if (mlData.indicators && mlData.indicators.emotional_states) {
      mlData.indicators.emotional_states.forEach(state => {
        if (state === 'anxiety') terms.push('不安', '心配', '落ち着く');
        if (state === 'depression') terms.push('気持ち', '辛い', '希望');
        if (state === 'stress') terms.push('ストレス', '休息', 'リラックス');
        if (state === 'loneliness') terms.push('孤独', 'つながり', '関係');
        if (state === 'anger') terms.push('怒り', '感情', '対処');
      });
    }
    
    // サポートニーズ
    if (mlData.support_needs) {
      if (mlData.support_needs.listening) terms.push('聞いていますよ', '理解します', 'つらかったですね');
      if (mlData.support_needs.advice) terms.push('アドバイス', '方法', '試してみてください');
      if (mlData.support_needs.information) terms.push('情報', '知る', '参考になる');
      if (mlData.support_needs.encouragement) terms.push('大丈夫', '前向き', '可能性');
    }
  }
  
  // 分析モード
  else if (mode === 'analysis' && mlData) {
    // 思考の複雑さ
    if (mlData.complexity && mlData.complexity.thinking_style) {
      mlData.complexity.thinking_style.forEach(style => {
        if (style === 'abstract') terms.push('概念', '理論', '本質');
        if (style === 'concrete') terms.push('具体的', '実例', '現実');
        if (style === 'systemic') terms.push('システム', '全体', '構造');
        if (style === 'detailed') terms.push('詳細', '正確', '厳密');
        if (style === 'holistic') terms.push('全体像', '包括的', '広い視点');
      });
    }
    
    // 焦点エリア
    if (mlData.focus && mlData.focus.primary_areas) {
      mlData.focus.primary_areas.forEach(area => {
        if (area === 'problem') terms.push('問題', '課題', '原因');
        if (area === 'solution') terms.push('解決策', '対策', '改善');
        if (area === 'process') terms.push('プロセス', '手順', 'ステップ');
        if (area === 'outcome') terms.push('結果', '成果', '効果');
        if (area === 'context') terms.push('状況', '背景', '前提');
      });
    }
    
    // 詳細度の好み
    if (mlData.preferences && mlData.preferences.detail_level) {
      if (mlData.preferences.detail_level === 'very_detailed') {
        terms.push('詳細に', '以下のように', '具体的には');
      } else if (mlData.preferences.detail_level === 'concise') {
        terms.push('要点', '簡潔に', '重要なのは');
      }
    }
  }
  
  return terms;
}

module.exports = {
  processMlData,
  analyzeResponseWithMl
}; 