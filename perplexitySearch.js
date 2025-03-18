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
    if (!needsKnowledge(userMessage)) {
      console.log('📊 [PERPLEXITY ML] Knowledge enhancement skipped - message does not match criteria');
      return null;
    }

    try {
      console.log('\n📊 [PERPLEXITY ML] KNOWLEDGE ENHANCEMENT PROCESS');
      console.log('   ├─ Input message length:', userMessage.length, 'characters');
      
      // Extract recent messages for context
      const recentHistory = history.slice(-5);
      const recentMessages = recentHistory.map(h => `${h.role}: ${h.content}`).join('\n');
      console.log('   ├─ Context: Using last', recentHistory.length, 'messages from conversation history');
      
      // Create a more targeted prompt based on the user's message
      let analysisPrompt = '';
      let analysisType = '';
      
      if (userMessage.includes('適職') || userMessage.includes('向いてる') || 
          userMessage.includes('仕事') || userMessage.includes('キャリア')) {
        analysisType = 'job suitability analysis';
        analysisPrompt = `会話履歴と現在のメッセージから、このユーザーの適職を分析してください。次の観点を考慮してください：
1. コミュニケーションスタイル (直接的/間接的、詳細重視/概念重視)
2. 意思決定パターン (論理的/感情的、迅速/慎重)
3. 職場での価値観 (安定/変化、独立/協調)
4. 強み・弱み
5. 向いていそうな職種や業界`;
      } else if (userMessage.includes('悩み') || userMessage.includes('課題') || 
                userMessage.includes('転職') || userMessage.includes('就職')) {
        analysisType = 'career challenges analysis';
        analysisPrompt = `会話履歴と現在のメッセージから、このユーザーのキャリアに関する悩みと可能な解決策を分析してください。次の観点を考慮してください：
1. キャリアに関する主要な課題
2. 働く上での価値観と優先事項
3. コミュニケーションや対人関係の傾向
4. 成長可能性のある分野
5. 考慮すべき選択肢`;
      } else {
        analysisType = 'general characteristics analysis';
        analysisPrompt = `会話履歴と現在のメッセージから、このユーザーの特性を分析してください。次の観点を考慮してください：
1. コミュニケーションパターン
2. 思考プロセスの特徴
3. 社会的相互作用の傾向
4. 感情表現と自己認識
5. キャリアに関連する強みと課題`;
      }
      
      console.log('   ├─ Selected ML approach:', analysisType);
      console.log('   ├─ Prompt length:', analysisPrompt.length, 'characters');
      console.log('   ├─ Making API call to Perplexity Sonar model...');
      
      const startTime = Date.now();
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
      
      const timeTaken = Date.now() - startTime;
      const resultContent = response.choices[0]?.message?.content;
      
      console.log('   ├─ API call completed in', timeTaken, 'ms');
      console.log('   ├─ Response tokens:', response.usage?.total_tokens || 'unknown');
      console.log('   ├─ Result length:', resultContent?.length || 0, 'characters');
      console.log('   └─ Sample of analysis:', resultContent?.substring(0, 50), '...');

      return resultContent;
    } catch (error) {
      console.error('   └─ ❌ ERROR in knowledge enhancement:', error.message);
      return null;
    }
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
    try {
      // 拡張版の意味的クエリ判定を使用
      const isAllowed = await this.isAllowedQuerySemantic(query);
      
      if (!isAllowed) {
        return "申し訳ありません。天気予報とスポーツの結果以外の検索には対応していません。";
      }

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

  /**
   * クエリが許可されたトピックに関するものかどうかを意味的に判断（非同期）
   * @param {string} query - 検索クエリ
   * @returns {Promise<boolean>} - 許可されるかどうか
   */
  async isAllowedQuerySemantic(query) {
    try {
      // キーワードマッチングは高速なため最初に試す
      const hasDirectKeyword = query.includes('天気') || 
                               query.includes('weather') ||
                               query.includes('試合') ||
                               query.includes('スポーツ') ||
                               query.includes('sports');
      
      if (hasDirectKeyword) {
        return true;
      }
      
      // EmbeddingServiceのインスタンスを取得または作成
      if (!this.embeddingService) {
        const EmbeddingService = require('./embeddingService');
        this.embeddingService = new EmbeddingService();
        await this.embeddingService.initialize();
      }
      
      // 意図カテゴリと例文のマッピング
      const intentExamples = {
        weather: "今日の天気はどうですか？東京の気象情報を教えて。明日は雨が降りますか？今日の気温はどうなりますか？",
        sports: "昨日の試合の結果を教えて。プロ野球の順位表はどうなっていますか？サッカーのスコアを知りたい。今週末の試合予定は？"
      };
      
      // 各カテゴリとの類似度を計算
      const weatherSimilarity = await this.embeddingService.getTextSimilarity(query, intentExamples.weather);
      const sportsSimilarity = await this.embeddingService.getTextSimilarity(query, intentExamples.sports);
      
      // 類似度スコアの閾値
      const SIMILARITY_THRESHOLD = 0.70;
      
      // デバッグログ
      console.log(`Query: "${query}"`);
      console.log(`Weather similarity: ${weatherSimilarity.toFixed(3)}`);
      console.log(`Sports similarity: ${sportsSimilarity.toFixed(3)}`);
      
      // いずれかのカテゴリが閾値を超えていれば許可
      return (weatherSimilarity > SIMILARITY_THRESHOLD || sportsSimilarity > SIMILARITY_THRESHOLD);
    } catch (error) {
      console.error('Error detecting query intent:', error);
      // エラー時は安全のため元のキーワードマッチングに戻る
      return this.isAllowedQuery(query);
    }
  }

  async getJobTrends(searchQuery = null) {
    try {
      // If no search query is provided, use a default one
      let query = searchQuery;
      
      if (!query) {
        // Default query covers general career trends
        query = '2025年におけるキャリアトレンド、新興職種、市場動向について詳しく分析し、将来性の高い3つの職種とその必要スキルを解説。各職種の求人サイトのURLも含めてください。';
      }
      
      console.log('\n📈 [PERPLEXITY ML] JOB TRENDS RETRIEVAL');
      console.log('   ├─ Query type:', searchQuery ? 'Custom' : 'Default');
      console.log('   ├─ Query length:', query.length, 'characters');
      console.log('   ├─ Making API call to Perplexity Sonar model...');
      
      const startTime = Date.now();
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

      const timeTaken = Date.now() - startTime;
      const content = response.choices[0]?.message?.content || '';
      const [mainText, urlSection] = content.split('[求人情報]');
      
      console.log('   ├─ API call completed in', timeTaken, 'ms');
      console.log('   ├─ Response tokens:', response.usage?.total_tokens || 'unknown');
      
      const result = {
        analysis: mainText?.replace('[キャリア市場分析]', '').trim() || null,
        urls: urlSection?.trim() || null
      };
      
      console.log('   ├─ Analysis text length:', result.analysis?.length || 0, 'characters');
      console.log('   ├─ Sample of analysis:', result.analysis?.substring(0, 50), '...');
      console.log('   ├─ URLs provided:', result.urls ? 'Yes' : 'No');
      if (result.urls) {
        const urlCount = result.urls.split('\n').filter(line => line.includes('http')).length;
        console.log('   └─ Number of URLs:', urlCount);
      }
      
      return result;
    } catch (error) {
      console.error('   ❌ [PERPLEXITY ML] Job trends error:', error.message);
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        console.log('   ├─ Error type: Timeout');
      }
      if (error.response) {
        console.error('   ├─ Error status:', error.response.status);
        console.error('   └─ Error data:', JSON.stringify(error.response.data));
      }
      return null;
    }
  }
}

// モジュール関数としてneedsKnowledgeを実装
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

// Export the PerplexitySearch class
module.exports = PerplexitySearch; 