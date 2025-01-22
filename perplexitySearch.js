const { OpenAI } = require('openai');

class PerplexitySearch {
  constructor(apiKey) {
    if (!apiKey) {
      console.error('Perplexity API key is missing');
      throw new Error('Perplexity API key is required');
    }
    
    this.client = new OpenAI({ 
      apiKey: apiKey,
      baseURL: "https://api.perplexity.ai"
    });
  }

  async enhanceKnowledge(history, userMessage) {
    if (!this.needsKnowledge(userMessage)) return null;

    try {
      console.log('Enhancing knowledge with Perplexity for:', userMessage);
      
      const response = await this.client.chat.completions.create({
        model: "sonar-medium-online",
        messages: [{
          role: 'system',
          content: `あなたは「Adam」というカウンセラーです。
          発達障害に関する最新の研究や知見、キャリアトレンドや働き方の新しい視点、
          メンタルヘルスケアの最新アプローチについて情報を提供してください。
          情報は counseling context として使用します。
          返答は必ず日本語で、200文字以内に収めてください。`
        }, {
          role: 'user',
          content: this.constructSearchQuery(history, userMessage)
        }],
        max_tokens: 256,
        temperature: 0.7
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Perplexity knowledge enhancement error:', error);
      return null; // Fail gracefully - continue without enhanced knowledge
    }
  }

  needsKnowledge(userMessage) {
    const needsUpdate = [
      '最近の傾向', '業界動向', 'トレンド',
      'リモートワーク', 'ハイブリッド', '働き方改革',
      '研究', '論文', '最新',
      'テクノロジー', 'デジタル', 'IT業界',
      '発達障害', 'ADHD', 'ASD',
      'メンタルヘルス', 'カウンセリング'
    ].some(term => userMessage.includes(term));

    return needsUpdate;
  }

  constructSearchQuery(history, userMessage) {
    return `Counseling context: Latest professional insights about: ${userMessage}
            Focus: developmental disorders, career counseling, mental health
            Purpose: professional counseling reference
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
        model: "sonar-medium-online",
        messages: [{
          role: 'system',
          content: '天気予報とスポーツの結果のみ、簡潔に回答してください。'
        }, {
          role: 'user',
          content: query
        }],
        max_tokens: 256,
        temperature: 0.7,
        timeout: 10000
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Perplexity query error:', error);
      return "申し訳ありません。情報を取得できませんでした。";
    }
  }

  isAllowedQuery(query) {
    return query.includes('天気') || 
           query.includes('weather') ||
           query.includes('試合') ||
           query.includes('スポーツ') ||
           query.includes('sports');
  }
}

module.exports = PerplexitySearch; 