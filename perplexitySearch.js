const { OpenAI } = require('openai');

class PerplexitySearch {
  constructor(apiKey) {
    this.client = new OpenAI({ 
      apiKey: apiKey,
      baseURL: "https://api.perplexity.ai"
    });
  }

  // Validate if search query is relevant to our app's purpose
  isRelevantQuery(query) {
    const relevantTopics = [
      // Mental health & counseling
      '発達障害', 'ADHD', 'ASD', 'アスペルガー', '自閉症', 'カウンセリング',
      'メンタルヘルス', '精神科', '心理', 'ストレス', '不安',
      // Career & work
      'キャリア', '仕事', '転職', '就職', '職場', '働き方',
      // Self-analysis & growth
      '自己分析', '特性', '長所', '短所', '成長', 'スキル',
      // Social & communication
      'コミュニケーション', '人間関係', '対人関係', '社会性'
    ];

    const query_lower = query.toLowerCase();
    return relevantTopics.some(topic => query_lower.includes(topic));
  }

  async search(query, options = {}) {
    try {
      // First check if query is relevant
      if (!this.isRelevantQuery(query)) {
        return {
          result: "申し訳ありません。このボットは発達障害に関する相談、キャリアカウンセリング、自己分析のサポートに特化しています。それ以外の一般的な検索には対応していません。具体的なお悩みやご相談があればお聞かせください。"
        };
      }

      console.log('Searching Perplexity for relevant query:', query);
      
      const response = await this.client.chat.completions.create({
        model: "llama-3.1-sonar-large-128k-online",
        messages: [{
          role: 'system',
          content: `あなたは発達障害専門のカウンセラー「Adam」として、最新の研究や情報に基づいて回答してください。
          - 必ず医学的な参考情報や研究を含めること
          - 必ず「専門家への相談も推奨」と付け加えること
          - 回答は日本語のみ
          - 一般的な検索エンジンとは異なり、発達障害に関する専門的な観点から情報を提供すること`
        }, {
          role: 'user',
          content: query
        }],
        max_tokens: 1024,
        temperature: 0.7
      });

      return {
        result: response.choices[0].message.content
      };
    } catch (error) {
      console.error('Perplexity search error:', error);
      throw error;
    }
  }
}

module.exports = PerplexitySearch; 