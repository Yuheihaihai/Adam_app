// userNeedsAnalyzer.js - Analyzes user conversations to identify needs
const { OpenAI } = require('openai');

class UserNeedsAnalyzer {
  constructor(apiKey) {
    if (apiKey) {
    this.openai = new OpenAI({ apiKey });
      this.enabled = true;
    } else {
      console.warn('[UserNeedsAnalyzer] OpenAI API key not provided. Service will be disabled.');
      this.openai = null;
      this.enabled = false;
    }
  }

  async analyzeUserNeeds(userMessage, history) {
    if (!this.enabled || !this.openai) {
      console.log('[UserNeedsAnalyzer] Service disabled - returning empty analysis');
      return {};
    }
    
    try {
      // Ensure history is an array
      const historyArray = Array.isArray(history) ? history : [];
      
      // Add current message to history if provided
      const fullHistory = userMessage 
        ? [...historyArray, { role: 'user', content: userMessage }]
        : historyArray;
      
      // Format history for analysis
      const conversationText = fullHistory.map(msg => 
        `${msg.role === 'user' ? 'ユーザー' : 'アシスタント'}: ${msg.content}`
      ).join('\n\n');

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `あなたは高度な会話分析と人物特性評価の専門家です。ユーザーとアシスタントの会話履歴を分析し、100項目以上にわたるユーザーの特性、ニーズ、状況を特定してください。バイアスや偏見を含まない客観的な評価を行い、JSON形式で回答してください。

以下の指標について、会話から判断できる場合はtrueを設定してください：

{
  // 1. 既存の雇用関連指標（拡張）
  "employment": {
    "seeking_job": boolean, // 求職中
    "has_income": boolean, // 収入がある
    "has_training": boolean, // 職業訓練を受けている
    "remote_work_interest": boolean, // リモートワークに興味がある
    "career_transition": boolean, // キャリア移行中
    "general_employment_interest": boolean, // 一般就労に関心がある
    "entrepreneurial_interest": boolean, // 起業に関心がある
    "freelance_interest": boolean, // フリーランス・副業に関心がある
    "work_life_balance_focus": boolean, // ワークライフバランスを重視
    "leadership_role_interest": boolean, // リーダーシップ職に関心がある
    "skill_development_focus": boolean, // スキル開発に注力している
    "career_advancement_focus": boolean, // キャリアアップに関心がある
    "job_security_focus": boolean, // 雇用の安定性を重視
    "seeking_mentorship": boolean, // メンターを探している
    "seeking_feedback": boolean // フィードバックを求めている
  },
  
  // 2. 既存の社会性指標（拡張）
  "social": {
    "is_hikikomori": boolean, // 引きこもり状態
    "social_anxiety": boolean, // 社会不安
    "isolation": boolean, // 社会的孤立
    "seeking_community": boolean, // コミュニティを求めている
    "communication_difficulties": boolean, // コミュニケーション困難
    "conflict_avoidance": boolean, // 対立回避傾向
    "assertiveness_level": boolean, // 自己主張の強さ
    "social_initiative": boolean, // 社交的イニシアチブ
    "group_participation": boolean, // グループ活動への参加
    "online_social_preference": boolean, // オンライン社交の選好
    "social_engagement_level": boolean, // 社会的関与レベル
    "social_adaptability": boolean, // 社会的適応性
    "social_trust_level": boolean, // 社会的信頼度
    "cultural_integration": boolean // 文化的統合
  },
  
  // 3. 既存のメンタルヘルス指標（拡張）
  "mental_health": {
    "shows_depression": boolean, // うつ症状
    "shows_anxiety": boolean, // 不安症状
    "seeking_therapy": boolean, // 治療を探している
    "stress_management": boolean, // ストレス管理
    "neurodivergent_traits": boolean, // 神経多様性の特性
    "mood_regulation": boolean, // 気分調節
    "trauma_indicators": boolean, // トラウマの指標
    "resilience_level": boolean, // 回復力レベル
    "self_awareness": boolean, // 自己認識
    "coping_mechanisms": boolean, // 対処メカニズム
    "emotional_intelligence": boolean, // 感情知能
    "mindfulness_practice": boolean, // マインドフルネス実践
    "sleep_quality": boolean, // 睡眠の質
    "burnout_indicators": boolean // 燃え尽き症候群の指標
  },
  
  // 4. 既存の教育指標（拡張）
  "education": {
    "seeking_education": boolean, // 教育を求めている
    "skill_development": boolean, // スキル開発
    "certification_interest": boolean, // 資格に関心がある
    "learning_difficulties": boolean, // 学習困難
    "continuous_learning": boolean, // 継続的学習
    "academic_interests": boolean, // 学術的関心
    "practical_skills_focus": boolean, // 実践的スキル重視
    "self_directed_learning": boolean, // 自己主導型学習
    "structured_learning_preference": boolean, // 構造化された学習を好む
    "teaching_mentoring_interest": boolean, // 教えること・メンタリングに関心
    "learning_style_preferences": boolean, // 学習スタイルの好み
    "information_literacy": boolean, // 情報リテラシー
    "critical_thinking_skills": boolean // 批判的思考スキル
  },
  
  // 5. 既存の日常生活指標（拡張）
  "daily_living": {
    "housing_needs": boolean, // 住居ニーズ
    "financial_assistance": boolean, // 財政支援
    "legal_support": boolean, // 法的支援
    "healthcare_access": boolean, // 医療アクセス
    "executive_function_challenges": boolean, // 実行機能の課題
    "daily_routine_structure": boolean, // 日常的なルーティン構造
    "basic_needs_security": boolean, // 基本的ニーズの安全性
    "transportation_access": boolean, // 交通アクセス
    "digital_literacy": boolean, // デジタルリテラシー
    "self_care_habits": boolean, // セルフケアの習慣
    "time_management": boolean, // 時間管理
    "household_management": boolean, // 家庭管理
    "personal_finance_management": boolean // 個人財務管理
  },
  
  // 6. 既存の関心指標（拡張）
  "interests": {
    "technology": boolean, // テクノロジー
    "creative_arts": boolean, // 創造的芸術
    "physical_activities": boolean, // 身体活動
    "intellectual_pursuits": boolean, // 知的探求
    "special_interests": boolean, // 特別な関心
    "nature_outdoors": boolean, // 自然・アウトドア
    "cultural_activities": boolean, // 文化的活動
    "entertainment_media": boolean, // エンターテイメント・メディア
    "culinary_interests": boolean, // 料理の関心
    "collecting_hobbies": boolean, // コレクション趣味
    "gaming": boolean, // ゲーム
    "reading_preferences": boolean, // 読書の好み
    "learning_exploration": boolean // 学習・探求
  },
  
  // 7. 既存の人間関係指標（拡張）
  "relationships": {
    "seeking_romantic_connection": boolean, // 恋愛関係を求めている
    "seeking_emotional_support": boolean, // 感情的サポートを求めている
    "loneliness": boolean, // 孤独
    "desire_for_intimacy": boolean, // 親密さへの欲求
    "relationship_difficulties": boolean, // 関係の困難
    "attachment_style": boolean, // アタッチメントスタイル
    "trust_issues": boolean, // 信頼の問題
    "boundary_setting": boolean, // 境界設定
    "conflict_resolution_skills": boolean, // 対立解決スキル
    "caregiver_role": boolean, // 介護者の役割
    "social_circle_size": boolean, // 社会的輪の大きさ
    "seeking_friendship": boolean // 友情を求めている
  },
  
  // 8. 認知スタイル（新規カテゴリ）
  "cognitive_style": {
    "analytical_thinking": boolean, // 分析的思考
    "creative_thinking": boolean, // 創造的思考
    "concrete_thinking": boolean, // 具体的思考
    "abstract_thinking": boolean, // 抽象的思考
    "detail_oriented": boolean, // 細部志向
    "big_picture_focus": boolean, // 全体像志向
    "linear_thinking": boolean, // 直線的思考
    "lateral_thinking": boolean, // 水平思考
    "verbal_processing": boolean, // 言語的処理
    "visual_processing": boolean, // 視覚的処理
    "information_organization": boolean, // 情報整理能力
    "problem_solving_approach": boolean // 問題解決アプローチ
  },
  
  // 9. コミュニケーションスタイル（新規カテゴリ）
  "communication_style": {
    "verbal_expressiveness": boolean, // 言語表現力
    "nonverbal_sensitivity": boolean, // 非言語的感受性
    "direct_communication": boolean, // 直接的コミュニケーション
    "indirect_communication": boolean, // 間接的コミュニケーション
    "formal_language_preference": boolean, // 公式言語の好み
    "casual_language_preference": boolean, // カジュアル言語の好み
    "digital_communication_preference": boolean, // デジタルコミュニケーションの好み
    "language_proficiency": boolean, // 言語能力
    "active_listening": boolean, // 積極的傾聴
    "conversation_initiative": boolean // 会話のイニシアチブ
  },
  
  // 10. 動機付けと目標（新規カテゴリ）
  "motivation_goals": {
    "achievement_oriented": boolean, // 達成志向
    "growth_oriented": boolean, // 成長志向
    "security_oriented": boolean, // 安全志向
    "recognition_seeking": boolean, // 承認追求
    "independence_goal": boolean, // 独立性の目標
    "belonging_goal": boolean, // 所属感の目標
    "self_actualization_pursuit": boolean, // 自己実現の追求
    "short_term_focus": boolean, // 短期的焦点
    "long_term_focus": boolean, // 長期的焦点
    "goal_setting_clarity": boolean, // 目標設定の明確さ
    "intrinsic_motivation": boolean, // 内発的動機付け
    "extrinsic_motivation": boolean // 外発的動機付け
  },
  
  // 11. 認知能力（新規カテゴリ）
  "cognitive_abilities": {
    // 知的特性の指標
    "high_verbal_intelligence": boolean, // 高い言語的知性（語彙の豊かさ、複雑な言語構造の使用）
    "high_analytical_reasoning": boolean, // 高い分析的推論能力（論理的な議論構築、複雑な問題分解）
    "high_pattern_recognition": boolean, // 高いパターン認識能力（規則性の発見、関連性の理解）
    "high_memory_capacity": boolean, // 高い記憶容量（詳細な情報の保持と再現）
    "high_learning_speed": boolean, // 高い学習速度（新しい概念の素早い理解と適用）
    "high_cognitive_flexibility": boolean, // 高い認知的柔軟性（思考転換の容易さ、適応能力）
    "high_attention_to_detail": boolean, // 高い詳細への注意力（緻密さ、正確性）
    "high_working_memory": boolean, // 高い作業記憶（複数の情報の同時処理能力）
    "high_processing_speed": boolean, // 高い処理速度（素早い思考と反応）
    "high_divergent_thinking": boolean, // 高い発散的思考（創造的解決策の生成）
    "high_convergent_thinking": boolean, // 高い収束的思考（最適解への絞り込み）
    
    // 認知特性の指標
    "multitasking_ability": boolean, // マルチタスク能力（複数の課題の同時処理能力）
    "deep_focus_capability": boolean, // 深い集中力（一つの課題への持続的な注意）
    "big_picture_understanding": boolean, // 全体像の理解（複雑なシステムの概念把握）
    "sequential_processing": boolean, // 順序的処理（段階的に問題に取り組む）
    "parallel_processing": boolean, // 並列処理（複数の情報を同時に処理）
    "spatial_reasoning": boolean, // 空間的推論能力（視覚的イメージの操作）
    "numerical_reasoning": boolean, // 数的推論能力（数字とパターンの扱い）
    "conceptual_abstraction": boolean, // 概念的抽象化能力（具体から抽象への変換）
    "metacognitive_awareness": boolean, // メタ認知的意識（自己の思考過程の認識）
    "intuitive_problem_solving": boolean, // 直感的問題解決（非線形的な問題アプローチ）
    "systematic_problem_solving": boolean, // 系統的問題解決（方法論的なアプローチ）
    
    // 特定の認知的傾向
    "intellectual_curiosity": boolean, // 知的好奇心（新しい知識への関心）
    "preference_for_complexity": boolean, // 複雑さの好み（難しい問題への志向）
    "information_synthesis": boolean // 情報統合能力（異なる情報源の組み合わせ）
  }
}

特に以下の指標については、わずかな兆候でもtrueとしてください：
- employment.has_income: 収入がないことを示す発言
- employment.has_training: 就労訓練を受けていないことを示す発言
- social.is_hikikomori: 引きこもり状態を示す発言
- mental_health.neurodivergent_traits: 発達障害の特性を示す発言
- social.communication_difficulties: コミュニケーションの困難さを示す発言
- daily_living.executive_function_challenges: 実行機能の困難さを示す発言
- interests.special_interests: 特定の分野への強い興味を示す発言
- employment.general_employment_interest: 一般枠での就労希望を示す発言
- relationships.seeking_romantic_connection: 恋愛関係を求める発言
- relationships.seeking_emotional_support: 感情的なサポートを求める発言
- relationships.loneliness: 孤独感を示す発言
- relationships.desire_for_intimacy: 親密さを求める発言
- communication_style.indirect_communication: 間接的な表現を好む傾向を示す発言
- cognitive_style.detail_oriented: 細部に注目する傾向を示す発言
- motivation_goals.belonging_goal: 所属や受容を求める傾向を示す発言
- cognitive_abilities.high_verbal_intelligence: 豊かな語彙や複雑な表現の使用
- cognitive_abilities.high_analytical_reasoning: 論理的な思考構造や分析的な問題解決
- cognitive_abilities.intellectual_curiosity: 質問が多い、知識獲得に積極的

バイアスや偏見を避けるための注意点：
1. 文化的背景や個人的価値観に基づく判断を避け、明確な行動パターンや自己申告に基づいて評価する
2. 性別、年齢、社会的背景などに関する固定観念を適用しない
3. すべての特性を中立的に評価し、「良い」「悪い」などの価値判断を避ける
4. 診断的表現は避け、あくまで行動パターンや傾向として記述する
5. 不確実な場合は推測を避け、明確な証拠がある場合のみtrueとする
6. 認知能力に関する評価はIQテストなどの標準化された測定ではなく、会話から観察される傾向のみに基づく
7. 会話のみから認知能力を完全に評価することはできないため、あくまで推測的なものであることを認識する
8. 特に知的能力に関する評価では「高い/低い」という二分法ではなく、会話内での顕著な特徴のみを記録する
9. 一部の認知特性が目立つことは、必ずしも総合的な知的能力を示すものではない
10. 神経多様性（発達障害、学習障害など）は障害としてではなく、認知の多様性として中立的に扱う

会話の内容から判断できる場合はtrueとし、明確に否定されている場合のみfalseとしてください。情報がない場合はfalseとします。`
          },
          {
            role: "user",
            content: `以下の会話履歴を分析し、JSONオブジェクトとして結果を返してください：\n\n${conversationText}`
          }
        ],
        response_format: { type: "json_object" }
      });
      
      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Error analyzing user needs:', error);
      // Return empty structure in case of error
      return {
        employment: {}, social: {}, mental_health: {},
        education: {}, daily_living: {}, interests: {},
        relationships: {}, cognitive_style: {}, 
        communication_style: {}, motivation_goals: {},
        cognitive_abilities: {}
      };
    }
  }
}

module.exports = UserNeedsAnalyzer; 