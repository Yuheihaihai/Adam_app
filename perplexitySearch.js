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
          userMessage.includes('仕事') || userMessage.includes('キャリア') ||
          userMessage.includes('診断') || userMessage.includes('職場') || 
          userMessage.includes('社風') || userMessage.includes('人間関係')) {
        analysisType = 'job suitability analysis';
        analysisPrompt = `会話履歴と現在のメッセージから、このユーザーの適職を具体的に分析してください。以下の項目を必ず含めてください：

1. コミュニケーションスタイルと特性に基づいた具体的な職業推奨（少なくとも3つ）
2. 向いている業界と職種（具体的な職業名を必ず挙げる）
3. 理想的な職場環境と社風
4. 職場での人間関係の適性
5. 適職に就くために必要なスキルや資格

必ず具体的な職業名や業界を推薦し、抽象的な分析だけで終わらないでください。`;
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
返答は必ず日本語で、300文字以内に収めてください。

特に適職診断を求められている場合は、必ず具体的な職業名や業界名を複数提案してください。一般的な特性分析ではなく、実際の職業推奨に重点を置いてください。`
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
      
      // Processing the response
      const timeTaken = Date.now() - startTime;
      const resultContent = response.choices[0]?.message?.content;
      
      console.log('   ├─ API call completed in', timeTaken, 'ms');
      console.log('   ├─ Response tokens:', response.usage?.total_tokens || 'unknown');
      console.log('   ├─ Result length:', resultContent?.length || 0, 'characters');
      
      // Parse the result to extract analysis and URLs
      let analysis = '';
      let urls = '';
      
      if (resultContent) {
        // Try splitting by the markdown header first, then the bracketed version
        let sections = resultContent.split(/## 求人情報|\[求人情報\]/);

        if (sections.length > 1) {
          // Remove the initial analysis marker
          analysis = sections[0].replace(/## キャリア市場分析|\[キャリア市場分析\]/, '').trim();
          urls = sections[1].trim();
          console.log('   ├─ Successfully extracted career analysis and job URLs using regex split.');
        } else {
          // Fallback if split fails
          analysis = resultContent;
          console.warn('   ├─ Could not split response into analysis and URLs. Assuming entire content is analysis.');
        }

        console.log('   └─ Sample of analysis:', analysis.substring(0, 50), '...');
      } else {
        console.log('   └─ ❌ No content returned from API');
      }
      
      return {
        analysis,
        urls
      };

    } catch (error) {
      console.error('   ❌ [PERPLEXITY ML] Job trends error:', error.message);
      return null;
    }
  }
  
  /**
   * ユーザー特性に基づいた具体的な適職推奨を取得
   * @param {Array} history - 会話履歴
   * @param {string} userMessage - ユーザーメッセージ
   * @returns {Promise<Object|null>} - 適職推奨結果
   */
  async getJobRecommendations(history, userMessage) {
    try {
      console.log('\n🎯 [PERPLEXITY ML] JOB RECOMMENDATIONS PROCESS');
      console.log('   ├─ Input message length:', userMessage.length, 'characters');
      
      // Extract recent messages for context
      const recentHistory = history.slice(-5);
      const recentMessages = recentHistory.map(h => `${h.role}: ${h.content}`).join('\n');
      
      const startTime = Date.now();
      const response = await this.client.chat.completions.create({
        model: "sonar",
        messages: [{
          role: 'system',
          content: `あなたは優秀なキャリアカウンセラーです。ユーザーに適した職業を具体的に提案してください。

以下は厳守すべき対応方針です：
1. 必ず具体的な職業名（少なくとも5つ）を提案すること
2. 特性分析のみで終わらず、必ず職業名を挙げること
3. 分析よりも具体的な職業推薦を優先すること
4. ユーザーのコミュニケーションパターンから適職を判断すること

レスポンスは必ず以下の構造に従ってください：

【最適な職業】
• [職業名1]: 具体的理由
• [職業名2]: 具体的理由
• [職業名3]: 具体的理由
• [職業名4]: 具体的理由
• [職業名5]: 具体的理由

【向いている業界】
• [業界1]
• [業界2]
• [業界3]

【特性分析】
(簡潔な特性分析を100文字以内で)

注意: 必ず実在する具体的な職業名と業界名を挙げてください。抽象的な分析だけで終わらないでください。`
        }, {
          role: 'user',
          content: `【会話履歴】
${recentMessages}

【現在のメッセージ】
${userMessage}

【リクエスト】
上記のユーザーに最適な職業を5つ以上、具体的に推薦してください。各職業がなぜ向いているのか理由も述べてください。また、向いている業界も3つ挙げてください。`
        }],
        max_tokens: 800,
        temperature: 0.5
      });
      
      const timeTaken = Date.now() - startTime;
      const resultContent = response.choices[0]?.message?.content;
      
      console.log('   ├─ API call completed in', timeTaken, 'ms');
      console.log('   ├─ Response tokens:', response.usage?.total_tokens || 'unknown');
      console.log('   ├─ Result length:', resultContent?.length || 0, 'characters');
      console.log('   └─ Sample of recommendations:', resultContent?.substring(0, 50), '...');

      return resultContent;
    } catch (error) {
      console.error('   └─ ❌ ERROR in job recommendations:', error.message);
      return null;
    }
  }

  /**
   * 一般的な検索クエリを処理するメソッド - 全てのトピックに対応
   * @param {string} query - 検索クエリ
   * @returns {Promise<string>} - 検索結果
   */
  async generalSearch(query) {
    try {
      if (!query || query.length < 5) {
        return "検索クエリが短すぎます。もう少し具体的な質問をしてください。";
      }

      console.log('\n🔍 [PERPLEXITY SEARCH] GENERAL SEARCH PROCESS');
      console.log('   ├─ Search query:', query);
      console.log('   ├─ Query length:', query.length, 'characters');
      console.log('   ├─ Making API call to Perplexity Sonar model...');

      const startTime = Date.now();
      const response = await this.client.chat.completions.create({
        model: "sonar",
        messages: [{
          role: 'system',
          content: `あなたは検索アシスタントです。ユーザーからの質問に対して、最新の正確な情報を提供してください。
以下の指針に従ってください：

1. 事実に基づいた情報を提供する
2. 情報が不確かな場合はその旨を明示する
3. 検索結果は簡潔かつ詳細に、日本語で提供する
4. 複雑なトピックについては、理解しやすいように説明する
5. 最新の情報を提供し、その情報がいつ現在のものか明示する
6. 可能であれば信頼できる情報源を示す

回答は以下の形式で構成してください：

【検索結果】
(質問に対する直接的な回答と詳細情報)

【情報源】
(関連する情報源やウェブサイトへの言及、もしあれば)`
        }, {
          role: 'user',
          content: `以下の質問について、最新かつ正確な情報を教えてください：

${query}`
        }],
        max_tokens: 1000,
        temperature: 0.7,
        timeout: 25000
      });

      const timeTaken = Date.now() - startTime;
      const resultContent = response.choices[0]?.message?.content;

      console.log('   ├─ API call completed in', timeTaken, 'ms');
      console.log('   ├─ Response tokens:', response.usage?.total_tokens || 'unknown');
      console.log('   ├─ Result length:', resultContent?.length || 0, 'characters');
      console.log('   └─ Sample of search result:', resultContent?.substring(0, 50), '...');

      return resultContent || '情報を取得できませんでした。';
    } catch (error) {
      console.error('   └─ ❌ ERROR in general search:', error.message);
      return `申し訳ありません。検索中にエラーが発生しました：${error.message}`;
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