const { OpenAI } = require('openai');

class PerplexitySearch {
  constructor(apiKey) {
    if (!apiKey) {
      console.error('Perplexity API key is missing');
      throw new Error('Perplexity API key is required');
    }
    
    this.client = new OpenAI({ 
      apiKey: apiKey,
      baseURL: "https://api.perplexity.ai",  // Just the base URL
      timeout: 25000,
      maxRetries: 2
    });
  }

  async enhanceKnowledge(history, userMessage) {
    if (!this.needsKnowledge(userMessage)) return null;

    try {
      console.log('Enhancing knowledge with Perplexity for:', userMessage);
      
      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: this.constructSearchQuery(history, userMessage) }
        ],
        max_tokens: 256,
        temperature: 0.7
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Perplexity knowledge enhancement error:', error);
      return null;
    }
  }

  needsKnowledge(userMessage) {
    const relevantTerms = [
      // Characteristics
      '特性', '分析', '思考', '傾向', 'パターン',
      'コミュニケーション', '対人関係', '性格',
      // Interests
      '好き', '興味', '趣味', '関心',
      // Career
      'キャリア', '仕事', '職業',
      // Mental Health
      'メンタル', 'ストレス', '不安',
      // Development
      '発達障害', 'ADHD', 'ASD'
    ];

    return relevantTerms.some(term => userMessage.includes(term));
  }

  constructSearchQuery(history, userMessage) {
    const recentMessages = history.slice(-3).map(h => h.content).join('\n');
    return `Context: ${recentMessages}
            Current query: ${userMessage}
            Focus: developmental disorders, personal characteristics, interests
            Purpose: counseling reference
            Format: Japanese, concise (max 200 chars)`;
  }

  // For weather/sports test queries only
  async handleAllowedQuery(query) {
    if (!this.isAllowedQuery(query)) {
      return "申し訳ありません。天気予報とスポーツの結果以外の検索には対応していません。";
    }

    try {
      console.log('Processing allowed query:', query);
      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: query }
        ],
        max_tokens: 150,
        temperature: 0.7
      });

      return response.choices[0].message.content || '情報を取得できませんでした。';
    } catch (error) {
      console.error('Perplexity query error:', error);
      return '申し訳ありません。情報を取得できませんでした。';
    }
  }

  isAllowedQuery(query) {
    return query.includes('天気') || 
           query.includes('weather') ||
           query.includes('試合') ||
           query.includes('スポーツ') ||
           query.includes('sports');
  }

  async getJobTrends(query) {
    try {
      console.log('🔍 Sending request to Perplexity API for job trends...');
      
      const response = await this.client.chat.completions.create({
        model: "sonar",
        messages: [{
          role: "system",
          content: `あなたは「Adam」というカウンセラーです。
          下記の観点から情報を提供してください：

          [分析の観点]
          1. コミュニケーションパターン
             - 言葉遣いの特徴
             - 表現の一貫性
             - 感情表現の方法

          2. 思考プロセス
             - 論理的思考の特徴
             - 問題解決アプローチ
             - 興味・関心の対象

          3. 社会的相互作用
             - 対人関係での傾向
             - ストレス対処方法
             - コミュニケーション上の強み/課題

          4. 感情と自己認識
             - 感情表現の特徴
             - 自己理解の程度
             - モチベーションの源泉

          返答は必ず日本語で、200文字以内に収めてください。` },
          { role: "user", content: query }
        ],
        max_tokens: 500,
        temperature: 0.7
      });

      return {
        analysis: response.choices[0]?.message?.content.slice(0, 1900),
        urls: []
      };
    } catch (error) {
      console.error('Perplexity search error:', error);
      return null;
    }
  }
}

module.exports = PerplexitySearch; 
