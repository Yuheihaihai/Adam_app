const axios = require('axios');

class PerplexitySearch {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Perplexity API key is required');
    }
    this.apiKey = apiKey;
  }

  async getJobTrends(query) {
    try {
      console.log('Making Perplexity API request with query:', query);
      
      const response = await axios.post('https://api.perplexity.ai/chat/completions', {
        model: 'pplx-7b-chat',
        messages: [{
          role: 'user',
          content: query
        }],
        max_tokens: 1024,
        temperature: 0.7
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // Matching the server's 60s timeout
      });

      if (!response.data) {
        console.error('No data received from Perplexity API');
        return null;
      }

      const content = response.data.choices?.[0]?.message?.content || '';
      console.log('Received Perplexity response:', content);
      
      // Split content into analysis and URLs sections
      const [mainText, urlSection] = content.split('[求人情報]');
      
      return {
        analysis: mainText?.trim() || null,
        urls: urlSection?.trim() || null
      };

    } catch (error) {
      console.error('Perplexity search error:', error.response?.data || error.message);
      if (error.code === 'ECONNABORTED') {
        console.log('Perplexity request timed out');
      }
      return null;
    }
  }
}

module.exports = PerplexitySearch;
