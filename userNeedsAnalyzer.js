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
            
            以下のカテゴリに分類された指標について、会話から明確に判断できる場合のみtrueを設定し、それ以外はfalseとしてください：
            
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
            
            会話の内容から明示的に判断できる場合のみtrueとし、推測は避けてください。`
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