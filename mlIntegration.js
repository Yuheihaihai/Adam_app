/**
 * ML Integration - 機械学習機能統合モジュール
 * 
 * 既存のシステムと機械学習モジュールを統合するアダプター
 * 各モード（general, mental_health, analysis, career）に応じた機械学習機能を提供
 * 
 * キャリアモードはPerplexity APIを、他のモードはLocalMLを使用
 */

const localML = require('./localML');
const PerplexitySearch = require('./perplexitySearch');
// Helper function for knowledge needs detection
function needsKnowledge(userMessage) {
  // For career mode, we always want to run the knowledge enhancement
  // unless the message is very short or not relevant
  if (userMessage.length < 10) {
    console.log('📊 [PERPLEXITY ML] Message too short for knowledge enhancement:', userMessage.length, 'characters');
    return false;
  }
  
  // Check for highly relevant career-related terms
  const careerTerms = [
    // Career-specific terms
    '適職', '向いてる', 'キャリア', '仕事', '職業', '就職', '転職',
    '業界', '職種', '会社', '働く', '就活', '求人', 'スキル',
    
    // Career challenges
    '悩み', '課題', '不安', '迷っ', '選択', '決断', '将来',
    
    // Workplace environment
    '職場', '環境', '人間関係', '上司', '同僚', '部下', 'チーム',
    '社風', '企業', '組織', '会社', '給料', '年収', '報酬'
  ];
  
  return careerTerms.some(term => userMessage.includes(term));
}

const Airtable = require('airtable');
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');

// Perplexityクライアントの初期化
const perplexity = process.env.PERPLEXITY_API_KEY ? 
  new PerplexitySearch(process.env.PERPLEXITY_API_KEY) : null;

// 拡張: ユーザー特性統合設定
const USER_TRAITS_INTEGRATION = {
  USE_ENHANCED_PERSONALIZATION: true, // 拡張ユーザー特性分析を使用するか
  TRAITS_CACHE_TTL: 24 * 60 * 60 * 1000, // 特性キャッシュのTTL (24時間)
  PERSONALIZATION_THRESHOLD: 50, // パーソナライズに必要な最低確信度 (%)
  PERSONALIZATION_WEIGHT: 0.8 // プロンプト生成時の特性の重み (0-1)
};

// ローカルキャッシュの設定
const LOCAL_DATA_PATH = path.join(__dirname, 'ml_data_cache.json');
let localDataCache = {};

try {
  if (fs.existsSync(LOCAL_DATA_PATH)) {
    const data = fs.readFileSync(LOCAL_DATA_PATH, 'utf8');
    localDataCache = JSON.parse(data);
    console.log(`Loaded ${Object.keys(localDataCache).length} cached ML data entries`);
  } else {
    console.log('No ML data cache found, will create new cache');
    localDataCache = {};
  }
} catch (error) {
  console.error('Error loading ML data cache:', error);
  localDataCache = {};
}

// OpenAIクライアントの初期化
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Airtableクライアントの初期化
const airtableBase = process.env.AIRTABLE_API_KEY ? 
  new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID) :
  null;

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
    // キャッシュチェック
    const cacheKey = `${userId}_${mode}`;
    const cachedData = localDataCache[cacheKey];
    
    if (cachedData && cachedData.timestamp > Date.now() - USER_TRAITS_INTEGRATION.TRAITS_CACHE_TTL) {
      console.log(`    ├─ Using cached ML data for user ${userId} in ${mode} mode`);
      return cachedData.data;
    }
    
    // 新しいデータを取得
    console.log(`    ├─ Fetching fresh ML data for user ${userId} in ${mode} mode`);
    
    // キャリアモード: Perplexityを使用
    if (mode === 'career') {
      console.log('    ├─ キャリアモード: Perplexity APIを使用');
      
      if (!needsKnowledge(userMessage)) {
        console.log('    ├─ Perplexity: 必要性なし - スキップ');
        return null;
      }
      
      console.log('    ├─ Perplexity: データ取得開始');
      
      // Perplexityクライアントが初期化されているか確認
      if (!perplexity) {
        console.error('    ├─ ❌ Perplexity API key missing or initialization failed');
        return null;
      }
      
      // Perplexityからデータを取得 - perplexityクライアントのメソッドを使用
      const [knowledge, jobTrends] = await Promise.all([
        perplexity.enhanceKnowledge([], userMessage), // 空の配列をhistoryとして渡す
        perplexity.getJobTrends(userMessage)
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
# ユーザー特性の追加分析 (Airtableから取得)

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

/**
 * ユーザー特性データを取得
 * @param {string} userId - ユーザーID
 * @param {string} userMessage - ユーザーメッセージ
 * @returns {Promise<Object>} - ユーザー特性データ
 */
async function getUserTraitsData(userId, userMessage) {
  // Airtableが設定されていない場合はAI生成データを使用
  if (!airtableBase) {
    console.log(`    ├─ No Airtable configured, using AI-generated user traits`);
    return generateUserTraits(userId, userMessage);
  }
  
  try {
    // Airtableからユーザー特性データを取得
    const records = await airtableBase('UserTraits')
      .select({
        filterByFormula: `{UserID} = '${userId}'`,
        maxRecords: 1
      })
      .firstPage();
    
    if (records && records.length > 0) {
      console.log(`    ├─ Found user traits in Airtable for user ${userId}`);
      
      // Airtableのデータを構造化
      const record = records[0];
      const traitsData = {
        traits: {
          communication_style: record.get('CommunicationStyle') || 'neutral',
          learning_style: record.get('LearningStyle') || 'balanced',
          decision_making: record.get('DecisionMaking') || 'balanced'
        },
        topics: {
          primary_interests: record.get('PrimaryInterests') || [],
          avoided_topics: record.get('AvoidedTopics') || []
        },
        response_preferences: {
          length: record.get('PreferredResponseLength') || 'medium',
          detail: record.get('PreferredDetailLevel') || 'medium',
          tone: record.get('PreferredTone') || 'neutral'
        },
        
        // 拡張: カテゴリを追加
        cognitive_style: parseCognitiveStyle(record.get('CognitiveStyle') || {}),
        communication_style: parseCommStyle(record.get('ExtendedCommStyle') || {}),
        motivation_goals: parseMotivationGoals(record.get('MotivationGoals') || {}),
        cognitive_abilities: parseCognitiveAbilities(record.get('CognitiveAbilities') || {})
      };
      
      return traitsData;
    } else {
      console.log(`    ├─ No user traits found in Airtable for user ${userId}, generating with AI`);
      return generateUserTraits(userId, userMessage);
    }
    
  } catch (error) {
    console.error(`    ├─ Error fetching user traits: ${error.message}`);
    console.log(`    ├─ Falling back to AI-generated user traits`);
    return generateUserTraits(userId, userMessage);
  }
}

/**
 * 拡張: Airtableから取得した認知スタイルデータをパース
 */
function parseCognitiveStyle(data) {
  if (!data || typeof data !== 'object') return {};
  
  try {
    // 文字列の場合はJSONとしてパース
    const styleData = typeof data === 'string' ? JSON.parse(data) : data;
    
    return {
      analytical_thinking: !!styleData.analytical_thinking,
      creative_thinking: !!styleData.creative_thinking,
      concrete_thinking: !!styleData.concrete_thinking,
      abstract_thinking: !!styleData.abstract_thinking,
      detail_oriented: !!styleData.detail_oriented,
      big_picture_focus: !!styleData.big_picture_focus,
      linear_thinking: !!styleData.linear_thinking,
      lateral_thinking: !!styleData.lateral_thinking,
      verbal_processing: !!styleData.verbal_processing,
      visual_processing: !!styleData.visual_processing,
      information_organization: !!styleData.information_organization,
      problem_solving_approach: !!styleData.problem_solving_approach
    };
  } catch (error) {
    console.error('Error parsing cognitive style data:', error);
    return {};
  }
}

/**
 * 拡張: Airtableから取得したコミュニケーションスタイルデータをパース
 */
function parseCommStyle(data) {
  if (!data || typeof data !== 'object') return {};
  
  try {
    // 文字列の場合はJSONとしてパース
    const styleData = typeof data === 'string' ? JSON.parse(data) : data;
    
    return {
      verbal_expressiveness: !!styleData.verbal_expressiveness,
      nonverbal_sensitivity: !!styleData.nonverbal_sensitivity,
      direct_communication: !!styleData.direct_communication,
      indirect_communication: !!styleData.indirect_communication,
      formal_language_preference: !!styleData.formal_language_preference,
      casual_language_preference: !!styleData.casual_language_preference,
      digital_communication_preference: !!styleData.digital_communication_preference,
      language_proficiency: !!styleData.language_proficiency,
      active_listening: !!styleData.active_listening,
      conversation_initiative: !!styleData.conversation_initiative
    };
  } catch (error) {
    console.error('Error parsing communication style data:', error);
    return {};
  }
}

/**
 * 拡張: Airtableから取得した動機付けと目標データをパース
 */
function parseMotivationGoals(data) {
  if (!data || typeof data !== 'object') return {};
  
  try {
    // 文字列の場合はJSONとしてパース
    const goalsData = typeof data === 'string' ? JSON.parse(data) : data;
    
    return {
      achievement_oriented: !!goalsData.achievement_oriented,
      growth_oriented: !!goalsData.growth_oriented,
      security_oriented: !!goalsData.security_oriented,
      recognition_seeking: !!goalsData.recognition_seeking,
      independence_goal: !!goalsData.independence_goal,
      belonging_goal: !!goalsData.belonging_goal,
      self_actualization_pursuit: !!goalsData.self_actualization_pursuit,
      short_term_focus: !!goalsData.short_term_focus,
      long_term_focus: !!goalsData.long_term_focus,
      goal_setting_clarity: !!goalsData.goal_setting_clarity,
      intrinsic_motivation: !!goalsData.intrinsic_motivation,
      extrinsic_motivation: !!goalsData.extrinsic_motivation
    };
  } catch (error) {
    console.error('Error parsing motivation goals data:', error);
    return {};
  }
}

/**
 * 拡張: Airtableから取得した認知能力データをパース
 */
function parseCognitiveAbilities(data) {
  if (!data || typeof data !== 'object') return {};
  
  try {
    // 文字列の場合はJSONとしてパース
    const abilitiesData = typeof data === 'string' ? JSON.parse(data) : data;
    
    return {
      // 知的特性の指標
      high_verbal_intelligence: !!abilitiesData.high_verbal_intelligence,
      high_analytical_reasoning: !!abilitiesData.high_analytical_reasoning,
      high_pattern_recognition: !!abilitiesData.high_pattern_recognition,
      high_memory_capacity: !!abilitiesData.high_memory_capacity,
      high_learning_speed: !!abilitiesData.high_learning_speed,
      high_cognitive_flexibility: !!abilitiesData.high_cognitive_flexibility,
      high_attention_to_detail: !!abilitiesData.high_attention_to_detail,
      high_working_memory: !!abilitiesData.high_working_memory,
      high_processing_speed: !!abilitiesData.high_processing_speed,
      high_divergent_thinking: !!abilitiesData.high_divergent_thinking,
      high_convergent_thinking: !!abilitiesData.high_convergent_thinking,
      
      // 認知特性の指標
      multitasking_ability: !!abilitiesData.multitasking_ability,
      deep_focus_capability: !!abilitiesData.deep_focus_capability,
      big_picture_understanding: !!abilitiesData.big_picture_understanding,
      sequential_processing: !!abilitiesData.sequential_processing,
      parallel_processing: !!abilitiesData.parallel_processing,
      spatial_reasoning: !!abilitiesData.spatial_reasoning,
      numerical_reasoning: !!abilitiesData.numerical_reasoning,
      conceptual_abstraction: !!abilitiesData.conceptual_abstraction,
      metacognitive_awareness: !!abilitiesData.metacognitive_awareness,
      intuitive_problem_solving: !!abilitiesData.intuitive_problem_solving,
      systematic_problem_solving: !!abilitiesData.systematic_problem_solving,
      
      // 特定の認知的傾向
      intellectual_curiosity: !!abilitiesData.intellectual_curiosity,
      preference_for_complexity: !!abilitiesData.preference_for_complexity,
      information_synthesis: !!abilitiesData.information_synthesis
    };
  } catch (error) {
    console.error('Error parsing cognitive abilities data:', error);
    return {};
  }
}

/**
 * AIを使用してユーザー特性データを生成
 * @param {string} userId - ユーザーID 
 * @param {string} userMessage - ユーザーメッセージ
 * @returns {Promise<Object>} - 生成されたユーザー特性データ
 */
async function generateUserTraits(userId, userMessage) {
  try {
    console.log(`    ├─ Generating user traits with AI for user ${userId}`);
    
    // AIモデル生成用プロンプトの構築
    const prompt = `あなたはユーザー特性分析の専門家です。以下のユーザーメッセージを分析し、ユーザーの特性をJSON形式で表現してください：

ユーザーID: ${userId}
メッセージ: "${userMessage}"

以下の構造に基づいて、ユーザーの特性を推測してください：
{
  "traits": {
    "communication_style": "formal, neutral, casual のいずれか",
    "learning_style": "visual, auditory, reading, kinesthetic のいずれか"
  },
  "topics": {
    "primary_interests": ["最大3つの主要な関心領域"],
    "avoided_topics": ["避けたい話題があれば"]
  },
  "response_preferences": {
    "length": "short, medium, long のいずれか",
    "detail": "low, medium, high のいずれか",
    "tone": "formal, friendly, enthusiastic のいずれか"
  },
  "cognitive_style": {
    "analytical_thinking": boolean,
    "creative_thinking": boolean,
    "concrete_thinking": boolean,
    "abstract_thinking": boolean,
    "detail_oriented": boolean,
    "big_picture_focus": boolean
  },
  "communication_style": {
    "verbal_expressiveness": boolean,
    "direct_communication": boolean,
    "indirect_communication": boolean,
    "formal_language_preference": boolean,
    "casual_language_preference": boolean,
    "active_listening": boolean
  },
  "motivation_goals": {
    "achievement_oriented": boolean,
    "growth_oriented": boolean,
    "security_oriented": boolean,
    "recognition_seeking": boolean,
    "independence_goal": boolean,
    "belonging_goal": boolean
  },
  "cognitive_abilities": {
    "high_verbal_intelligence": boolean,
    "high_analytical_reasoning": boolean,
    "high_pattern_recognition": boolean,
    "high_learning_speed": boolean,
    "high_working_memory": boolean,
    "high_processing_speed": boolean,
    "multitasking_ability": boolean,
    "deep_focus_capability": boolean,
    "conceptual_abstraction": boolean,
    "intellectual_curiosity": boolean,
    "information_synthesis": boolean
  }
}

1行のユーザーメッセージから完全に特性を判断することは難しいため、最も確率が高い推測を行い、極端な値は避けてください。JSON形式でのみ回答してください。`;

    // OpenAI APIを使用して特性を生成
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "あなたはユーザー特性分析の専門家です。JSONのみを返してください。" },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });
    
    // レスポンスをパース
    const traitsData = JSON.parse(response.choices[0].message.content);
    console.log(`    ├─ Successfully generated user traits with AI`);
    
    return traitsData;
    
  } catch (error) {
    console.error(`    ├─ Error generating user traits: ${error.message}`);
    
    // エラー時はデフォルト値を返す
    return {
      traits: {
        communication_style: 'neutral',
        learning_style: 'balanced'
      },
      topics: {
        primary_interests: [],
        avoided_topics: []
      },
      response_preferences: {
        length: 'medium',
        detail: 'medium',
        tone: 'neutral'
      },
      cognitive_style: {},
      communication_style: {},
      motivation_goals: {},
      cognitive_abilities: {}
    };
  }
}

/**
 * キャリアモード用のデータを取得
 */
async function getCareerModeData(userId, userMessage) {
  // 実装は省略（既存のPerplexityデータ取得ロジックを使用）
  return null;
}

/**
 * メンタルヘルスモード用のデータを取得
 */
async function getMentalHealthData(userId, userMessage) {
  // メンタルヘルスデータの取得ロジック
  return null;
}

/**
 * 分析モード用のデータを取得
 */
async function getAnalysisData(userId, userMessage) {
  // 分析モードデータの取得ロジック
  return null;
}

/**
 * 機械学習データからシステムプロンプトを生成
 * @param {string} mode - 会話モード
 * @param {Object} mlData - 機械学習データ
 * @returns {string} - 生成されたシステムプロンプト
 */
function generateSystemPrompt(mode, mlData) {
  if (!mlData) return null;
  
  try {
    // モードに応じてプロンプトを生成
    let systemPrompt = '';
    
    if (mode === 'career') {
      systemPrompt = generateCareerModePrompt(mlData);
    } else if (mode === 'mental_health') {
      systemPrompt = generateMentalHealthPrompt(mlData);
    } else if (mode === 'analysis') {
      systemPrompt = generateAnalysisPrompt(mlData);
    } else {
      // 一般モードの場合
      systemPrompt = generateGeneralModePrompt(mlData);
    }
    
    return systemPrompt;
    
  } catch (error) {
    console.error(`Error generating system prompt: ${error.message}`);
    return null;
  }
}

/**
 * 一般モード用のシステムプロンプトを生成
 * @param {Object} mlData - 機械学習データ
 * @returns {string} - 生成されたシステムプロンプト
 */
function generateGeneralModePrompt(mlData) {
  // 基本プロンプト（サービスの基本的な説明）
  let basePrompt = `あなたはAdamという名前のAIアシスタントです。ユーザーの質問に丁寧に回答してください。`;
  
  // 拡張パーソナライゼーションを使用する場合
  if (USER_TRAITS_INTEGRATION.USE_ENHANCED_PERSONALIZATION) {
    // ユーザーの認知スタイルに応じた調整
    if (mlData.cognitive_style) {
      const cogStyle = mlData.cognitive_style;
      
      if (cogStyle.analytical_thinking) {
        basePrompt += `\n\nユーザーは論理的・分析的な思考を好みます。回答は論理的構造を持ち、根拠に基づいた説明を心がけてください。`;
      }
      
      if (cogStyle.creative_thinking) {
        basePrompt += `\n\nユーザーは創造的な思考を好みます。新しい視点や柔軟なアイデアを含めるようにしてください。`;
      }
      
      if (cogStyle.detail_oriented) {
        basePrompt += `\n\nユーザーは詳細志向です。具体的で詳しい情報を提供し、重要な細部を見落とさないようにしてください。`;
      }
      
      if (cogStyle.big_picture_focus) {
        basePrompt += `\n\nユーザーは全体像を重視します。情報を大局的な文脈で提示し、要点を明確にしてください。`;
      }
    }
    
    // ユーザーのコミュニケーションスタイルに応じた調整
    if (mlData.communication_style) {
      const commStyle = mlData.communication_style;
      
      if (commStyle.direct_communication) {
        basePrompt += `\n\nユーザーは直接的なコミュニケーションを好みます。要点を明確に、簡潔に伝えてください。`;
      }
      
      if (commStyle.indirect_communication) {
        basePrompt += `\n\nユーザーは間接的なコミュニケーションを好みます。丁寧で配慮のある表現を心がけてください。`;
      }
      
      if (commStyle.formal_language_preference) {
        basePrompt += `\n\nユーザーはフォーマルな言葉遣いを好みます。丁寧な「です・ます」調で、敬語を適切に使用してください。`;
      }
      
      if (commStyle.casual_language_preference) {
        basePrompt += `\n\nユーザーはカジュアルな言葉遣いを好みます。親しみやすい「だ・である」調で、気さくな表現を使ってください。`;
      }
    }
    
    // ユーザーの動機付けと目標に応じた調整
    if (mlData.motivation_goals) {
      const motivGoals = mlData.motivation_goals;
      
      if (motivGoals.achievement_oriented) {
        basePrompt += `\n\nユーザーは達成志向です。具体的な成果や結果につながる情報を提供してください。`;
      }
      
      if (motivGoals.growth_oriented) {
        basePrompt += `\n\nユーザーは成長志向です。学びや発展につながる視点を含めるようにしてください。`;
      }
      
      if (motivGoals.security_oriented) {
        basePrompt += `\n\nユーザーは安全志向です。信頼性が高く、実証された情報を提供するよう心がけてください。`;
      }
      
      if (motivGoals.belonging_goal) {
        basePrompt += `\n\nユーザーは所属感を重視します。共感的で受容的な姿勢で接してください。`;
      }
    }
    
    // ユーザーの認知能力に応じた調整
    if (mlData.cognitive_abilities) {
      const cogAbilities = mlData.cognitive_abilities;
      
      if (cogAbilities.high_verbal_intelligence) {
        basePrompt += `\n\nユーザーは言語的知性が高いです。豊かな語彙と複雑な概念を用いた説明も理解できます。`;
      }
      
      if (cogAbilities.high_analytical_reasoning) {
        basePrompt += `\n\nユーザーは分析的推論能力が高いです。論理的な構造を持つ複雑な説明も理解できます。`;
      }
      
      if (cogAbilities.high_pattern_recognition) {
        basePrompt += `\n\nユーザーはパターン認識能力が高いです。情報間の関連性や規則性を示すことが効果的です。`;
      }
      
      if (cogAbilities.high_working_memory) {
        basePrompt += `\n\nユーザーは作業記憶が優れています。複数の情報を同時に処理できるため、複雑な説明も可能です。`;
      }
      
      if (cogAbilities.deep_focus_capability) {
        basePrompt += `\n\nユーザーは深い集中力を持っています。詳細な説明や複雑なトピックも理解できます。`;
      }
      
      if (cogAbilities.intuitive_problem_solving) {
        basePrompt += `\n\nユーザーは直感的な問題解決を得意とします。洞察や直感に訴える説明も効果的です。`;
      }
      
      if (cogAbilities.intellectual_curiosity) {
        basePrompt += `\n\nユーザーは知的好奇心が強いです。興味を引く追加情報や深い洞察を提供すると良いでしょう。`;
      }
    }
  } else {
    // 従来の方法（基本的な特性のみ）
    if (mlData.traits) {
      const traits = mlData.traits;
      
      // コミュニケーションスタイル
      if (traits.communication_style === 'formal') {
        basePrompt += `\n\nユーザーはフォーマルなコミュニケーションを好みます。丁寧な「です・ます」調で応答してください。`;
      } else if (traits.communication_style === 'casual') {
        basePrompt += `\n\nユーザーはカジュアルなコミュニケーションを好みます。親しみやすい「だ・である」調で応答してください。`;
      }
      
      // 学習スタイル
      if (traits.learning_style === 'visual') {
        basePrompt += `\n\nユーザーは視覚的な学習を好みます。説明には視覚的な例えや比喩を使うと効果的です。`;
      } else if (traits.learning_style === 'auditory') {
        basePrompt += `\n\nユーザーは聴覚的な学習を好みます。リズミカルな説明や音に関する例えが効果的です。`;
      } else if (traits.learning_style === 'reading') {
        basePrompt += `\n\nユーザーは読解による学習を好みます。明確な文章構造と論理的な説明が効果的です。`;
      } else if (traits.learning_style === 'kinesthetic') {
        basePrompt += `\n\nユーザーは体験的な学習を好みます。実践的な例や行動ベースの説明が効果的です。`;
      }
    }
    
    // 応答設定
    if (mlData.response_preferences) {
      const prefs = mlData.response_preferences;
      
      // 応答の長さ
      if (prefs.length === 'short') {
        basePrompt += `\n\nユーザーは簡潔な応答を好みます。要点を絞り、短く答えてください。`;
      } else if (prefs.length === 'long') {
        basePrompt += `\n\nユーザーは詳細な応答を好みます。十分な説明と背景情報を含めてください。`;
      }
      
      // 応答のトーン
      if (prefs.tone === 'formal') {
        basePrompt += `\n\nユーザーはフォーマルなトーンを好みます。専門的かつ丁寧に応答してください。`;
      } else if (prefs.tone === 'friendly') {
        basePrompt += `\n\nユーザーはフレンドリーなトーンを好みます。親しみやすく温かい応答を心がけてください。`;
      } else if (prefs.tone === 'enthusiastic') {
        basePrompt += `\n\nユーザーは熱意あるトーンを好みます。ポジティブで元気な応答を心がけてください。`;
      }
    }
  }
  
  // 関心トピックがある場合は追加
  if (mlData.topics && mlData.topics.primary_interests && mlData.topics.primary_interests.length > 0) {
    basePrompt += `\n\nユーザーは以下のトピックに関心があります: ${mlData.topics.primary_interests.join(', ')}.`;
  }
  
  // 避けるべきトピックがある場合は追加
  if (mlData.topics && mlData.topics.avoided_topics && mlData.topics.avoided_topics.length > 0) {
    basePrompt += `\n\nユーザーは以下のトピックを避けたいと考えています: ${mlData.topics.avoided_topics.join(', ')}. これらのトピックには触れないように注意してください。`;
  }
  
  // 最終的なプロンプトを返す
  return basePrompt;
}

/**
 * キャリアモード用のシステムプロンプトを生成
 */
function generateCareerModePrompt(mlData) {
  // 既存の実装を使用
  return null;
}

/**
 * メンタルヘルスモード用のシステムプロンプトを生成
 */
function generateMentalHealthPrompt(mlData) {
  // メンタルヘルスプロンプトの生成ロジック
  return null;
}

/**
 * 分析モード用のシステムプロンプトを生成
 */
function generateAnalysisPrompt(mlData) {
  // 分析モードプロンプトの生成ロジック
  return null;
}

/**
 * Airtableからユーザー特性データを取得
 * @param {string} userId - ユーザーID
 * @returns {Promise<Object|null>} - ユーザー特性データまたはnull
 */
async function getUserTraitsFromAirtable(userId) {
  // Airtableが設定されていない場合は処理しない
  if (!airtableBase) {
    console.log(`    ├─ No Airtable configured for user traits`);
    return null;
  }
  
  try {
    // まずUserTraitsテーブルをチェック
    try {
      // Airtableからユーザー特性データを取得
      const records = await airtableBase('UserTraits')
        .select({
          filterByFormula: `{UserID} = "${userId}"`,
          maxRecords: 1
        })
        .all();
        
      if (records.length > 0) {
        console.log(`    ├─ Found user traits in Airtable for user ${userId}`);
        
        // Airtableのデータを構造化
        const record = records[0];
        return {
          cognitive_style: parseAirtableCognitiveStyle(record),
          communication_style: parseAirtableCommunicationStyle(record),
          motivation_goals: parseAirtableMotivationGoals(record),
          cognitive_abilities: parseAirtableCognitiveAbilities(record),
          // 他のデータフィールドを追加
          traits: record.get('traits') ? JSON.parse(record.get('traits')) : {},
          topics: record.get('topics') ? JSON.parse(record.get('topics')) : {},
          lastUpdated: record.get('LastUpdated')
        };
      }
    } catch (tableErr) {
      // UserTraitsテーブルが存在しない場合は無視
      if (tableErr.statusCode === 404 || tableErr.error === 'NOT_FOUND' || 
          (tableErr.message && tableErr.message.includes('could not be found'))) {
        console.log(`    ├─ UserTraits table not found`);
      } else {
        throw tableErr;
      }
    }
    
    // 次にUserAnalysisテーブルをチェック
    try {
      const records = await airtableBase('UserAnalysis')
        .select({
          filterByFormula: `AND({UserID} = "${userId}", {Mode} = "general")`,
          maxRecords: 1
        })
        .all();
      
      if (records.length > 0) {
        console.log(`    ├─ Found general mode analysis in UserAnalysis for user ${userId}`);
        
        try {
          const rawData = records[0].get('AnalysisData');
          if (rawData) {
            return JSON.parse(rawData);
          }
        } catch (e) {
          console.error('Error parsing analysis data from UserAnalysis:', e);
        }
      }
    } catch (tableErr) {
      // UserAnalysisテーブルが存在しない場合は無視
      if (tableErr.statusCode === 404 || tableErr.error === 'NOT_FOUND' || 
          (tableErr.message && tableErr.message.includes('could not be found'))) {
        console.log(`    ├─ UserAnalysis table not found`);
      } else {
        throw tableErr;
      }
    }
    
    console.log(`    ├─ No user traits found in Airtable for user ${userId}, generating with AI`);
    return null;
  } catch (err) {
    console.error('Error fetching user traits from Airtable:', err);
    return null;
  }
}

/**
 * 会話履歴からユーザー特性を取得・拡張する
 * @param {string} userId - ユーザーID
 * @param {string} userMessage - 最新のユーザーメッセージ
 * @param {Array} conversationHistory - 会話履歴
 * @returns {Promise<Object>} 拡張されたユーザー特性データ
 */
async function enhanceUserNeedsWithAirtable(userNeeds, userId, conversationHistory) {
  if (!userNeeds) {
    console.log('No user needs data to enhance');
    return null;
  }
  
  try {
    // Airtableからユーザーデータを取得
    const airtableData = await getUserTraitsFromAirtable(userId);
    
    if (!airtableData) {
      console.log('No Airtable data available for enhancement');
      return userNeeds;
    }
    
    console.log('Enhancing user needs with Airtable data');
    
    // userNeedsとairtableDataをマージ
    const enhancedNeeds = { 
      ...userNeeds,
      // 認知スタイルをマージ
      cognitive_style: {
        ...userNeeds.cognitive_style,
        ...airtableData.cognitive_style
      },
      // コミュニケーションスタイルをマージ
      communication_style: {
        ...userNeeds.communication_style,
        ...airtableData.communication_style
      },
      // 動機付けと目標をマージ
      motivation_goals: {
        ...userNeeds.motivation_goals,
        ...airtableData.motivation_goals
      },
      // 認知能力をマージ
      cognitive_abilities: {
        ...userNeeds.cognitive_abilities,
        ...airtableData.cognitive_abilities
      },
      // 過去の分析情報を追加
      airtable_data: {
        available: true,
        source: 'Airtable',
        last_updated: airtableData.lastUpdated || new Date().toISOString()
      }
    };
    
    // 既存のデータを上書きしないようにマージ
    ['employment', 'social', 'mental_health', 'education', 'daily_living', 
     'interests', 'relationships'].forEach(category => {
      if (airtableData[category] && Object.keys(airtableData[category]).length > 0) {
        enhancedNeeds[category] = {
          ...enhancedNeeds[category],
          ...airtableData[category]
        };
      }
    });
    
    console.log('Successfully enhanced user needs with Airtable data');
    return enhancedNeeds;
  } catch (error) {
    console.error('Error enhancing user needs with Airtable data:', error);
    return userNeeds;
  }
}

/**
 * ユーザーメッセージに基づいて機械学習データを取得
 * @param {string} userId - ユーザーID
 * @param {string} userMessage - ユーザーメッセージ
 * @param {string} mode - 会話モード（career/general/mental_health/analysis）
 * @param {Array} conversationHistory - 会話履歴
 * @returns {Promise<Object|null>} - 機械学習データ (モードに応じたフォーマット)
 */
async function getUserMlData(userId, userMessage, mode, conversationHistory = []) {
  console.log(`\n[ML Integration] Retrieving ML data for mode: ${mode}`);
  
  try {
    // キャリアモード: Perplexity特化モード
    if (mode === 'career') {
      try {
        console.log('  └─ Career mode - using Perplexity integration');
        
        // Perplexityから情報取得
        const perplexityData = await getPerplexityData(userMessage);
        
        // Airtableからユーザー特性データを取得して統合
        const userTraits = await getUserTraitsFromAirtable(userId);
        
        // ユーザー特性データがあれば追加
        if (userTraits) {
          console.log('  └─ Enhanced with Airtable user traits data');
        }
        
        return {
          knowledge: userTraits ? JSON.stringify(userTraits, null, 2) : perplexityData.knowledge,
          jobTrends: perplexityData.jobTrends
        };
      } catch (error) {
        console.error(`[ML Integration] Error in career mode: ${error.message}`);
        return null;
      }
    }
    
    // 他のモード: LocalML使用
    if (['general', 'mental_health', 'analysis'].includes(mode)) {
      try {
        console.log(`  └─ ${mode} mode - using LocalML integration`);
        
        // LocalMLデータを取得
        const mlData = await localML.enhanceResponse(userId, userMessage, mode);
        
        // UserNeedsAnalyzerからデータ取得
        let userNeeds = null;
        try {
          userNeeds = await userNeedsAnalyzer.analyzeUserNeeds(userMessage, conversationHistory);
        } catch (error) {
          console.error(`[ML Integration] Error analyzing user needs: ${error.message}`);
        }
        
        // ユーザーニーズをAirtableデータで拡張
        if (userNeeds) {
          const enhancedNeeds = await enhanceUserNeedsWithAirtable(userNeeds, userId, conversationHistory);
          
          // LocalMLデータとマージ
          const combinedData = {
            ...mlData,
            ...enhancedNeeds
          };
          
          console.log('  └─ Combined LocalML and UserNeeds data with Airtable enhancements');
          return combinedData;
        }
        
        return mlData;
      } catch (error) {
        console.error(`[ML Integration] Error in ${mode} mode: ${error.message}`);
        return null;
      }
    }
    
    console.log(`[ML Integration] Unsupported mode: ${mode}`);
    return null;
  } catch (error) {
    console.error(`[ML Integration] Unexpected error in ML data retrieval: ${error.message}`);
    return null;
  }
}

module.exports = {
  getPerplexityData,
  processMlData,
  generateSystemPrompt,
  getUserMlData,
  getUserTraitsFromAirtable,
  enhanceUserNeedsWithAirtable
}; 