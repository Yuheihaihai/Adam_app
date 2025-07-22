/**
 * ML Hook - 機械学習機能統合ポイント
 * 
 * server.jsから呼び出される機械学習フックポイント
 * 既存のコードを変更せずに機械学習機能を統合
 * 
 * 🔐 PostgreSQL版 - Apple並みセキュリティ強化済み
 */

const { getMLData, generateSystemPrompt } = require('./mlIntegration_postgresql');
const logger = require('./logger');

/**
 * 機械学習データを取得して処理する
 * @param {string} userId - ユーザーID
 * @param {string} userMessage - ユーザーメッセージ 
 * @param {string} mode - 会話モード
 * @returns {Promise<Object>} - 処理結果 { mlData, systemPrompt }
 */
async function processMlData(userId, userMessage, mode) {
  console.log(`\n🤖 [ML Hook] プロセス開始: mode=${mode}`);
  logger.info('MLHook', `Processing ML data for user ${userId}`, { mode });
  
  try {
    // 機械学習データを取得
    logger.debug('MLHook', 'Fetching ML data', { userMessageLength: userMessage ? userMessage.length : 0 });
    const mlData = await getMLData(userId, userMessage, mode);
    
    if (!mlData) {
      console.log('    └─ MLデータなし: スキップ');
      logger.info('MLHook', 'No ML data available, skipping');
      return { mlData: null, systemPrompt: null };
    }
    
    // 機械学習データからシステムプロンプトを生成
    logger.debug('MLHook', 'Generating system prompt from ML data');
    const systemPrompt = generateSystemPrompt(mode, mlData);
    
    // MLデータ統合の概要を表示
    console.log('    ├─ MLデータ統合完了:');
    console.log(`    │  ├─ データサイズ: ${JSON.stringify(mlData).length} バイト`);
    console.log(`    │  └─ プロンプト長: ${systemPrompt ? systemPrompt.length : 0} 文字`);
    
    // 最終的な結果を返す
    console.log('    └─ ML処理完了');
    logger.info('MLHook', 'ML processing completed', {
      dataSize: JSON.stringify(mlData).length,
      promptLength: systemPrompt ? systemPrompt.length : 0
    });
    
    return {
      mlData,
      systemPrompt
    };
    
  } catch (error) {
    console.error(`    └─ [ML Hook] エラー発生: ${error.message}`);
    logger.error('MLHook', 'Error processing ML data', error);
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
  logger.info('MLHook', 'Analyzing AI response with ML data', { mode });
  
  try {
    const analysis = {
      influence_detected: false,
      influence_score: 0,
      influence_details: {},
      personalization_metrics: {}
    };
    
    // キャリアモード: Perplexityデータの反映分析
    if (mode === 'career' && mlData) {
      // ここでは既存のPerplexity分析ロジックを使用
      console.log('    └─ キャリアモード: 既存の分析ロジックを使用');
      logger.debug('MLHook', 'Using career mode analysis logic');
      return null;
    }

    // その他のモード: LocalMLデータの反映分析
    else if (['general', 'mental_health', 'analysis'].includes(mode) && mlData) {
      logger.debug('MLHook', `Using ${mode} mode analysis logic`);
      // 特徴語の検出
      const terms = getKeyTermsForMode(mode, mlData);
      const detectedTerms = terms.filter(term => aiResponse.includes(term));
      
      analysis.influence_detected = detectedTerms.length > 0;
      analysis.influence_score = (detectedTerms.length / terms.length) * 100;
      analysis.influence_details = {
        detected_terms: detectedTerms,
        total_terms: terms.length
      };
      
      // 拡張: カテゴリの反映度を分析
      if (mlData.cognitive_style || mlData.communication_style || mlData.motivation_goals || mlData.cognitive_abilities) {
        analysis.personalization_metrics = analyzePersonalizationMetrics(aiResponse, mlData);
      }
      
      // 分析結果をログに記録
      console.log(`    ├─ ML影響分析:`);
      console.log(`    │  ├─ 影響検出: ${analysis.influence_detected ? '✅' : '❌'}`);
      console.log(`    │  ├─ 影響スコア: ${Math.round(analysis.influence_score)}%`);
      console.log(`    │  └─ 検出特徴語: ${detectedTerms.length}/${terms.length}`);
      
      if (detectedTerms.length > 0) {
        console.log(`    │     └─ 検出語: ${detectedTerms.slice(0, 3).join(', ')}${detectedTerms.length > 3 ? ' など...' : ''}`);
      }
      
      // 拡張: パーソナライゼーション指標のログ
      if (analysis.personalization_metrics && Object.keys(analysis.personalization_metrics).length > 0) {
        console.log(`    ├─ パーソナライゼーション指標:`);
        for (const [category, score] of Object.entries(analysis.personalization_metrics)) {
          console.log(`    │  ├─ ${category}: ${Math.round(score)}%`);
        }
      }
      
      console.log('    └─ 分析完了');
      
      logger.info('MLHook', 'Analysis completed', {
        influenceDetected: analysis.influence_detected,
        influenceScore: Math.round(analysis.influence_score),
        detectedTermsCount: detectedTerms.length,
        totalTermsCount: terms.length
      });
      
      // 詳細なパーソナライゼーション指標をデバッグログに記録
      if (analysis.personalization_metrics && Object.keys(analysis.personalization_metrics).length > 0) {
        logger.debug('MLHook', 'Personalization metrics', analysis.personalization_metrics);
      }
      
      // 詳細な特徴語検出をデバッグログに記録
      if (detectedTerms.length > 0) {
        logger.debug('MLHook', 'Detected terms', {
          terms: detectedTerms.slice(0, 10) // 長すぎる場合は最初の10個だけ
        });
      }
    }
    
    return analysis;
    
  } catch (error) {
    console.error(`    └─ [ML Hook] 応答分析エラー: ${error.message}`);
    logger.error('MLHook', 'Error analyzing response with ML', error);
    return null;
  }
}

/**
 * 拡張: 応答のパーソナライゼーション指標を分析
 * @param {string} aiResponse - AIの応答
 * @param {Object} mlData - 機械学習データ
 * @returns {Object} - カテゴリごとのパーソナライゼーション度合い（%）
 */
function analyzePersonalizationMetrics(aiResponse, mlData) {
  const metrics = {};
  
  // 認知スタイルの反映度を分析
  if (mlData.cognitive_style) {
    const cognitiveTerms = getCognitiveStyleTerms(mlData.cognitive_style);
    const detectedCognitiveTerms = cognitiveTerms.filter(term => aiResponse.includes(term));
    metrics.cognitive_style = (detectedCognitiveTerms.length / cognitiveTerms.length) * 100 || 0;
  }
  
  // コミュニケーションスタイルの反映度を分析
  if (mlData.communication_style) {
    const commTerms = getCommunicationStyleTerms(mlData.communication_style);
    const detectedCommTerms = commTerms.filter(term => aiResponse.includes(term));
    metrics.communication_style = (detectedCommTerms.length / commTerms.length) * 100 || 0;
  }
  
  // 動機付けと目標の反映度を分析
  if (mlData.motivation_goals) {
    const motivationTerms = getMotivationGoalsTerms(mlData.motivation_goals);
    const detectedMotivationTerms = motivationTerms.filter(term => aiResponse.includes(term));
    metrics.motivation_goals = (detectedMotivationTerms.length / motivationTerms.length) * 100 || 0;
  }
  
  // 認知能力の反映度を分析
  if (mlData.cognitive_abilities) {
    const cogAbilityTerms = getCognitiveAbilityTerms(mlData.cognitive_abilities);
    const detectedCogAbilityTerms = cogAbilityTerms.filter(term => aiResponse.includes(term));
    metrics.cognitive_abilities = (detectedCogAbilityTerms.length / cogAbilityTerms.length) * 100 || 0;
  }
  
  return metrics;
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
    
    // 拡張: 認知スタイルに基づく特徴語
    if (mlData.cognitive_style) {
      terms.push(...getCognitiveStyleTerms(mlData.cognitive_style));
    }
    
    // 拡張: コミュニケーションスタイルに基づく特徴語
    if (mlData.communication_style) {
      terms.push(...getCommunicationStyleTerms(mlData.communication_style));
    }
    
    // 拡張: 動機付けと目標に基づく特徴語
    if (mlData.motivation_goals) {
      terms.push(...getMotivationGoalsTerms(mlData.motivation_goals));
    }
    
    // 拡張: 認知能力に基づく特徴語
    if (mlData.cognitive_abilities) {
      terms.push(...getCognitiveAbilityTerms(mlData.cognitive_abilities));
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
    
    // 拡張: メンタルヘルスモードでの認知スタイル関連語
    if (mlData.cognitive_style) {
      if (mlData.cognitive_style.detail_oriented) terms.push('一つずつ', '段階的に', '具体的に');
      if (mlData.cognitive_style.big_picture_focus) terms.push('全体として', '広い視点で', '大きな流れ');
    }
    
    // 拡張: メンタルヘルスモードでの動機付け関連語
    if (mlData.motivation_goals) {
      if (mlData.motivation_goals.security_oriented) terms.push('安心', '安定', '守られる');
      if (mlData.motivation_goals.growth_oriented) terms.push('成長', '発展', '前進');
    }
    
    // 拡張: メンタルヘルスモードでの認知能力関連語
    if (mlData.cognitive_abilities) {
      if (mlData.cognitive_abilities.high_pattern_recognition) terms.push('パターン', '規則性', '関連性');
      if (mlData.cognitive_abilities.metacognitive_awareness) terms.push('自己認識', '気づき', '思考について考える');
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
    
    // 拡張: 分析モードでの認知スタイル
    if (mlData.cognitive_style) {
      if (mlData.cognitive_style.analytical_thinking) terms.push('分析', '論理的に', '要素に分けると');
      if (mlData.cognitive_style.creative_thinking) terms.push('創造的に', '新しい視点', '可能性');
    }
    
    // 拡張: 分析モードでの認知能力
    if (mlData.cognitive_abilities) {
      if (mlData.cognitive_abilities.high_analytical_reasoning) terms.push('分析', '論理構造', '因果関係');
      if (mlData.cognitive_abilities.information_synthesis) terms.push('統合', '組み合わせる', '複合的に見ると');
      if (mlData.cognitive_abilities.conceptual_abstraction) terms.push('抽象化', '一般化', '本質的には');
    }
  }
  
  return terms;
}

/**
 * 認知スタイルに基づく特徴語を取得
 */
function getCognitiveStyleTerms(cognitiveStyle) {
  const terms = [];
  
  if (cognitiveStyle.analytical_thinking) {
    terms.push('分析', '論理的', '順序立てて', '理由', '根拠', '因果関係');
  }
  
  if (cognitiveStyle.creative_thinking) {
    terms.push('創造的', '発想', 'アイデア', '柔軟に', '新しい視点');
  }
  
  if (cognitiveStyle.concrete_thinking) {
    terms.push('具体的', '実例', '実際に', '現実的', '実践的');
  }
  
  if (cognitiveStyle.abstract_thinking) {
    terms.push('抽象的', '概念', '理論', '本質', '原理');
  }
  
  if (cognitiveStyle.detail_oriented) {
    terms.push('詳細', '細部', '正確に', '丁寧に', '一つひとつ');
  }
  
  if (cognitiveStyle.big_picture_focus) {
    terms.push('全体像', '大きな視点', '大局的', '長期的', '広い視野');
  }
  
  if (cognitiveStyle.linear_thinking) {
    terms.push('順を追って', 'ステップ', '段階的に', '順序立てて');
  }
  
  if (cognitiveStyle.lateral_thinking) {
    terms.push('別の角度から', '多角的に', '従来の枠を超えて');
  }
  
  return terms;
}

/**
 * コミュニケーションスタイルに基づく特徴語を取得
 */
function getCommunicationStyleTerms(commStyle) {
  const terms = [];
  
  if (commStyle.verbal_expressiveness) {
    terms.push('表現', '言葉で説明', '明確に伝える');
  }
  
  if (commStyle.nonverbal_sensitivity) {
    terms.push('感じ取る', '雰囲気', '言葉以外');
  }
  
  if (commStyle.direct_communication) {
    terms.push('率直に', '直接的に', 'はっきりと');
  }
  
  if (commStyle.indirect_communication) {
    terms.push('遠回しに', '婉曲に', '状況に応じて');
  }
  
  if (commStyle.formal_language_preference) {
    terms.push('です', 'ます', 'でしょうか', 'いただく');
  }
  
  if (commStyle.casual_language_preference) {
    terms.push('だよ', 'よね', 'だね', 'かな');
  }
  
  if (commStyle.active_listening) {
    terms.push('聞く', '理解する', '共感する', '確認する');
  }
  
  return terms;
}

/**
 * 動機付けと目標に基づく特徴語を取得
 */
function getMotivationGoalsTerms(motivationGoals) {
  const terms = [];
  
  if (motivationGoals.achievement_oriented) {
    terms.push('達成', '成功', '結果', 'ゴール');
  }
  
  if (motivationGoals.growth_oriented) {
    terms.push('成長', '発展', '進歩', '向上');
  }
  
  if (motivationGoals.security_oriented) {
    terms.push('安全', '安定', '確実', '信頼');
  }
  
  if (motivationGoals.recognition_seeking) {
    terms.push('評価', '認められる', '承認', '実績');
  }
  
  if (motivationGoals.independence_goal) {
    terms.push('自立', '自分で', '独自に', '自己決定');
  }
  
  if (motivationGoals.belonging_goal) {
    terms.push('つながり', '所属感', '仲間', '受け入れられる');
  }
  
  if (motivationGoals.self_actualization_pursuit) {
    terms.push('自己実現', '可能性', '最大限', '本来の自分');
  }
  
  if (motivationGoals.short_term_focus) {
    terms.push('すぐに', '短期的', '今日から', '即効性');
  }
  
  if (motivationGoals.long_term_focus) {
    terms.push('長期的', '将来', '持続的', '根本的');
  }
  
  return terms;
}

/**
 * 認知能力に基づく特徴語を取得
 */
function getCognitiveAbilityTerms(cogAbilities) {
  const terms = [];
  
  // 言語的知性
  if (cogAbilities.high_verbal_intelligence) {
    terms.push('詳細な説明', '精緻な表現', '言語的に', '語彙', '比喩', '表現力');
  }
  
  // 分析的推論
  if (cogAbilities.high_analytical_reasoning) {
    terms.push('論理的分析', '推論', '検証', '明確な構造', '体系的', '因果関係');
  }
  
  // パターン認識
  if (cogAbilities.high_pattern_recognition) {
    terms.push('パターン', '法則性', '共通点', '関連性', '構造的理解');
  }
  
  // 記憶容量
  if (cogAbilities.high_memory_capacity) {
    terms.push('詳細を思い出す', '正確な再現', '情報の保持', '参照');
  }
  
  // 学習速度
  if (cogAbilities.high_learning_speed) {
    terms.push('素早く理解', '効率的に学ぶ', '即座に適用', '迅速な習得');
  }
  
  // 認知的柔軟性
  if (cogAbilities.high_cognitive_flexibility) {
    terms.push('視点の切り替え', '文脈適応', '柔軟な思考', '状況に応じて');
  }
  
  // 詳細への注意力
  if (cogAbilities.high_attention_to_detail) {
    terms.push('細部に注目', '精密さ', '厳密さ', '正確性', '詳細');
  }
  
  // 作業記憶
  if (cogAbilities.high_working_memory) {
    terms.push('複数要素の処理', '同時に考慮', '並行処理', '情報の操作');
  }
  
  // 処理速度
  if (cogAbilities.high_processing_speed) {
    terms.push('素早い反応', '迅速な思考', '即座の処理', '効率的');
  }
  
  // 発散的思考
  if (cogAbilities.high_divergent_thinking) {
    terms.push('多様な可能性', '創造的解決策', '複数の選択肢', '代替案');
  }
  
  // 収束的思考
  if (cogAbilities.high_convergent_thinking) {
    terms.push('最適解', '焦点を絞る', '正解を見つける', '効率的な解決');
  }
  
  // マルチタスク能力
  if (cogAbilities.multitasking_ability) {
    terms.push('複数の課題', '並行作業', '同時進行', '切り替え');
  }
  
  // 集中力
  if (cogAbilities.deep_focus_capability) {
    terms.push('深い集中', '持続的注意', '没頭', '注力');
  }
  
  // 全体像理解
  if (cogAbilities.big_picture_understanding) {
    terms.push('全体像', 'システム思考', '大局的視点', '包括的');
  }
  
  // 空間的推論
  if (cogAbilities.spatial_reasoning) {
    terms.push('空間的', '視覚化', '立体的', '位置関係');
  }
  
  // 数的推論
  if (cogAbilities.numerical_reasoning) {
    terms.push('数値的', '数学的', '定量的', '計算');
  }
  
  // 概念的抽象化
  if (cogAbilities.conceptual_abstraction) {
    terms.push('抽象化', '概念化', '一般化', '本質的要素');
  }
  
  // メタ認知
  if (cogAbilities.metacognitive_awareness) {
    terms.push('自己認識', '思考について考える', '内省', '自己調整');
  }
  
  // 知的好奇心
  if (cogAbilities.intellectual_curiosity) {
    terms.push('探究心', '好奇心', '学びへの熱意', '新しい知識');
  }
  
  // 複雑さの好み
  if (cogAbilities.preference_for_complexity) {
    terms.push('複雑な問題', '難解な課題', '高度な内容', '深い考察');
  }
  
  // 情報統合能力
  if (cogAbilities.information_synthesis) {
    terms.push('情報の統合', '多角的視点', '複合的理解', '関連づけ');
  }
  
  return terms;
}

module.exports = {
  processMlData,
  analyzeResponseWithMl
}; 