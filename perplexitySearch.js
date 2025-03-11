const { OpenAI } = require('openai');

class PerplexitySearch {
  constructor(apiKey) {
    if (!apiKey) {
      console.error('Perplexity API key is missing');
      throw new Error('Perplexity API key is required');
    }
    
    this.client = new OpenAI({ 
      apiKey: apiKey,
      baseURL: "https://api.perplexity.ai",
      timeout: 25000,  // 25 second timeout (below Heroku's 30s limit)
      maxRetries: 2    // Allow 2 retries
    });
  }

  async enhanceKnowledge(history, userMessage) {
    if (!this.needsKnowledge(userMessage)) return null;

    try {
      console.log('Enhancing knowledge with Perplexity for:', userMessage);
      
      // Extract recent messages for context
      const recentHistory = history.slice(-5);
      const recentMessages = recentHistory.map(h => `${h.role}: ${h.content}`).join('\n');
      
      // Create a more targeted prompt based on the user's message
      let analysisPrompt = '';
      
      if (userMessage.includes('適職') || userMessage.includes('向いてる') || 
          userMessage.includes('仕事') || userMessage.includes('キャリア')) {
        analysisPrompt = `会話履歴と現在のメッセージから、このユーザーの適職を分析してください。次の観点を考慮してください：
1. コミュニケーションスタイル (直接的/間接的、詳細重視/概念重視)
2. 意思決定パターン (論理的/感情的、迅速/慎重)
3. 職場での価値観 (安定/変化、独立/協調)
4. 強み・弱み
5. 向いていそうな職種や業界`;
      } else if (userMessage.includes('悩み') || userMessage.includes('課題') || 
                userMessage.includes('転職') || userMessage.includes('就職')) {
        analysisPrompt = `会話履歴と現在のメッセージから、このユーザーのキャリアに関する悩みと可能な解決策を分析してください。次の観点を考慮してください：
1. キャリアに関する主要な課題
2. 働く上での価値観と優先事項
3. コミュニケーションや対人関係の傾向
4. 成長可能性のある分野
5. 考慮すべき選択肢`;
      } else {
        analysisPrompt = `会話履歴と現在のメッセージから、このユーザーの特性を分析してください。次の観点を考慮してください：
1. コミュニケーションパターン
2. 思考プロセスの特徴
3. 社会的相互作用の傾向
4. 感情表現と自己認識
5. キャリアに関連する強みと課題`;
      }
      
      const response = await this.client.chat.completions.create({
        model: "sonar",
        messages: [{
          role: 'system',
          content: `あなたは「Adam」というキャリアカウンセラーです。与えられた会話履歴から、ユーザーの傾向や特性を分析し、キャリアに関連する洞察を提供してください。

分析は客観的で、具体的な根拠に基づいたものにしてください。
推測に頼りすぎず、会話から実際に観察できる情報を重視してください。
返答は必ず日本語で、300文字以内に収めてください。`
        }, {
          role: 'user',
          content: `【会話履歴】
${recentMessages}

【現在のメッセージ】
${userMessage}

【分析指示】
${analysisPrompt}`
        }],
        max_tokens: 500,
        temperature: 0.7
      });

      return response.choices[0]?.message?.content;
    } catch (error) {
      console.error('Perplexity knowledge enhancement error:', error);
      return null;
    }
  }

  needsKnowledge(userMessage) {
    // For career mode, we always want to run the knowledge enhancement
    // unless the message is very short or not relevant
    if (userMessage.length < 10) return false;
    
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
    
    // Return true if any career term is found
    return careerTerms.some(term => userMessage.includes(term));
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
        model: 'sonar',
        messages: [
          {
            role: 'user',
            content: `天気予報について: ${query}`
          }
        ],
        temperature: 0.7,
        max_tokens: 150
      });

      return response.choices[0]?.message?.content || '情報を取得できませんでした。';
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

  async getJobTrends(searchQuery = null) {
    try {
      // If no search query is provided, use a default one
      let query = searchQuery;
      
      if (!query) {
        // Default query covers general career trends
        query = '2025年におけるキャリアトレンド、新興職種、市場動向について詳しく分析し、将来性の高い3つの職種とその必要スキルを解説。各職種の求人サイトのURLも含めてください。';
      }
      
      console.log('Fetching job market trends with query:', query);
      
      const response = await this.client.chat.completions.create({
        model: "sonar",
        messages: [{
          role: 'system',
          content: `以下の指示に従って回答してください：

1. 確実な情報のみを提供し、不確かな情報は含めないでください
2. 具体的な事実やデータに基づいて説明してください
3. 推測や憶測は避け、「かもしれない」などの曖昧な表現は使用しないでください
4. 常に最新の市場動向に基づいた情報を提供してください
5. レスポンスは必ず日本語で提供してください

以下の2つの情報を分けて提供してください：

[キャリア市場分析]
キャリア市場の動向、新興職種について、必要なスキル、将来性、具体的な事例を含めて（800文字以内で簡潔に）

[求人情報]
Indeed、Wantedly、type.jpなどの具体的な求人情報のURL（3つ程度）`
        }, {
          role: 'user',
          content: query
        }],
        max_tokens: 1000,
        temperature: 0.7,
        timeout: 20000
      });

      const content = response.choices[0]?.message?.content || '';
      const [mainText, urlSection] = content.split('[求人情報]');
      
      return {
        analysis: mainText?.replace('[キャリア市場分析]', '').trim() || null,
        urls: urlSection?.trim() || null
      };
    } catch (error) {
      console.error('Perplexity job trends error:', error);
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        console.log('Perplexity timeout, returning null');
      }
      return null;
    }
  }
}

module.exports = PerplexitySearch; 