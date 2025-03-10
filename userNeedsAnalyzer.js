// userNeedsAnalyzer.js - Analyzes user conversations to identify needs
const { OpenAI } = require('openai');

class UserNeedsAnalyzer {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
  }

  async analyzeUserNeeds(history) {
    try {
      // Format history for analysis
      const conversationText = history.map(msg => 
        `${msg.role === 'user' ? 'ユーザー' : 'アシスタント'}: ${msg.content}`
      ).join('\n\n');

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `あなたは会話分析の専門家です。ユーザーとアシスタントの会話履歴を分析し、ユーザーのニーズや状況を特定してください。JSON形式で回答してください。
            
            以下のカテゴリに分類された指標について、会話から判断できる場合はtrueを設定してください：
            
            {
              "employment": {
                "seeking_job": boolean,
                "has_income": boolean,
                "has_training": boolean,
                "remote_work_interest": boolean,
                "career_transition": boolean,
                "general_employment_interest": boolean
              },
              "social": {
                "is_hikikomori": boolean,
                "social_anxiety": boolean,
                "isolation": boolean,
                "seeking_community": boolean,
                "communication_difficulties": boolean
              },
              "mental_health": {
                "shows_depression": boolean,
                "shows_anxiety": boolean,
                "seeking_therapy": boolean,
                "stress_management": boolean,
                "neurodivergent_traits": boolean
              },
              "education": {
                "seeking_education": boolean,
                "skill_development": boolean,
                "certification_interest": boolean,
                "learning_difficulties": boolean
              },
              "daily_living": {
                "housing_needs": boolean,
                "financial_assistance": boolean,
                "legal_support": boolean,
                "healthcare_access": boolean,
                "executive_function_challenges": boolean
              },
              "interests": {
                "technology": boolean,
                "creative_arts": boolean,
                "physical_activities": boolean,
                "intellectual_pursuits": boolean,
                "special_interests": boolean
              },
              "relationships": {
                "seeking_romantic_connection": boolean,
                "seeking_emotional_support": boolean,
                "loneliness": boolean,
                "desire_for_intimacy": boolean,
                "relationship_difficulties": boolean
              }
            }
            
            特に以下の指標については、わずかな兆候でもtrueとしてください：
            - employment.has_income: 収入がないことを示す発言（例：「親に支援してもらっている」「無職」「収入がない」など）
            - employment.has_training: 就労訓練を受けていないことを示す発言（例：「訓練を受けていない」「プログラムがうまくいかなかった」など）
            - social.is_hikikomori: 引きこもり状態を示す発言（例：「家から出ない」「外出しない」「人と会わない」など）
            - mental_health.neurodivergent_traits: 発達障害の特性を示す発言（例：「集中力が続かない」「人の気持ちがわからない」「こだわりが強い」「感覚過敏がある」など）
            - social.communication_difficulties: コミュニケーションの困難さを示す発言（例：「空気が読めない」「会話が続かない」「誤解されることが多い」など）
            - daily_living.executive_function_challenges: 実行機能の困難さを示す発言（例：「計画を立てるのが苦手」「片付けができない」「忘れ物が多い」「時間管理ができない」など）
            - interests.special_interests: 特定の分野への強い興味を示す発言（例：「〜について何時間も調べる」「〜のことなら詳しい」「〜にはまっている」など）
            - employment.general_employment_interest: 一般枠での就労希望を示す発言（例：「普通に働きたい」「障害者枠ではなく」「一般の仕事がしたい」など）
            - relationships.seeking_romantic_connection: 恋愛関係を求める発言（例：「好きになってほしい」「恋愛がしたい」「パートナーが欲しい」「疑似恋愛」など）
            - relationships.seeking_emotional_support: 感情的なサポートを求める発言（例：「寂しい」「話を聞いてほしい」「理解してほしい」など）
            - relationships.loneliness: 孤独感を示す発言（例：「寂しい」「一人」「誰もいない」など）
            - relationships.desire_for_intimacy: 親密さを求める発言（例：「触れ合いたい」「抱きしめられたい」「近くにいてほしい」など）
            
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
        relationships: {}
      };
    }
  }
}

module.exports = UserNeedsAnalyzer; 