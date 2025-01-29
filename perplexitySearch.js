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
      maxRetries: 2,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'Accept-Charset': 'utf-8'
      }
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

  // Helper functions for text sanitization
  function removeEmojis(text) {
    return text.replace(/[\u{1F300}-\u{1FAFF}]/gu, "");
  }

  function limitLength(text, maxLen = 2000) {
    if (text.length > maxLen) {
      return text.slice(0, maxLen - 3) + "...";
    }
    return text;
  }

  function sanitizeForLINE(raw) {
    // 1) Remove emojis
    let cleaned = removeEmojis(raw);
    
    // 2) Remove zero-width spaces and other invisible characters
    cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');
    
    // 3) Keep only Japanese characters and basic punctuation
    cleaned = cleaned.replace(
      /[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF。、：！？（）\s]/g,
      ''
    );
    
    // 4) Normalize Unicode and fix spacing
    cleaned = cleaned
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim();
    
    // 5) Enforce length limit
    cleaned = limitLength(cleaned, 2000);
    
    return cleaned;
  }

  async getJobTrends(query) {
    try {
      console.log('🔍 Sending request to Perplexity API for job trends...');

      const response = await this.client.chat.completions.create({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: `あなたは「Adam」というカウンセラーです。
            下記の観点から情報を提供してください：

            [分析の観点]
            1. コミュニケーションパターン
            2. 思考プロセス
            3. 社会的相互作用
            4. 感情と自己認識

            返答は必ず以下の条件を守ってください：
            - 日本語のみを使用
            - 絵文字や特殊文字は使用しない
            - 改行は「。」で区切る
            - 全体で200文字以内`
          },
          {
            role: "user",
            content: query
          }
        ]
      });

      // Get raw text from response
      const rawText = response.choices[0]?.message?.content || '';
      console.log('Raw text length:', rawText.length);
      console.log('Raw text sample:', rawText.substring(0, 100));

      // Clean and sanitize text for LINE
      const cleanText = this.sanitizeForLINE(rawText);

      // Log sanitized text for verification
      console.log('Clean text length:', cleanText.length);
      console.log('Clean text sample:', cleanText.substring(0, 100));

      // Return sanitized text
      return {
        analysis: cleanText || '申し訳ありません。有効な回答を生成できませんでした。',
        urls: []
      };
    } catch (error) {
      console.error('Perplexity search error:', error);
      return null;
    }
  }
}

module.exports = PerplexitySearch; 
