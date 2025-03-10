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
        model: "gpt-4o-latest",
        messages: [
          {
            role: "system",
            content: `あなたは会話分析の専門家です。ユーザーとアシスタントの会話履歴を分析し、ユーザーのニーズや状況を特定してください。
            
            以下のカテゴリに分類された指標について、会話から判断できる場合はtrueを設定してください：
            
            {
              "employment": {
                "seeking_job": boolean,
                "has_income": boolean,
                "has_training": boolean,
                "remote_work_interest": boolean,
                "career_transition": boolean
              },
              "social": {
                "is_hikikomori": boolean,
                "social_anxiety": boolean,
                "isolation": boolean,
                "seeking_community": boolean
              },
              "mental_health": {
                "shows_depression": boolean,
                "shows_anxiety": boolean,
                "seeking_therapy": boolean,
                "stress_management": boolean
              },
              "education": {
                "seeking_education": boolean,
                "skill_development": boolean,
                "certification_interest": boolean
              },
              "daily_living": {
                "housing_needs": boolean,
                "financial_assistance": boolean,
                "legal_support": boolean,
                "healthcare_access": boolean
              },
              "interests": {
                "technology": boolean,
                "creative_arts": boolean,
                "physical_activities": boolean,
                "intellectual_pursuits": boolean
              }
            }
            
            特に以下の指標については、わずかな兆候でもtrueとしてください：
            - employment.has_income: 収入がないことを示す発言（例：「親に支援してもらっている」「無職」「収入がない」など）
            - employment.has_training: 就労訓練を受けていないことを示す発言（例：「訓練を受けていない」「プログラムがうまくいかなかった」など）
            - social.is_hikikomori: 引きこもり状態を示す発言（例：「家から出ない」「外出しない」「人と会わない」など）
            
            会話の内容から判断できる場合はtrueとし、明確に否定されている場合のみfalseとしてください。情報がない場合はfalseとします。`
          },
          {
            role: "user",
            content: `以下の会話履歴を分析してください：\n\n${conversationText}`
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
        education: {}, daily_living: {}, interests: {}
      };
    }
  }
}

module.exports = UserNeedsAnalyzer; 