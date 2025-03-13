/**
 * Enhanced Recommendation Trigger System
 * 
 * This module provides enhanced service recommendation triggering using an LLM
 * to better understand when a user's message implies a need for specific services.
 */

const { OpenAI } = require('openai');

class EnhancedRecommendationTrigger {
  constructor() {
    // Initialize OpenAI client for local LLM
    this.openai = process.env.OPENAI_API_KEY ? 
      new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 15000, // 15 second timeout 
        maxRetries: 3   // Allow 3 retries for recommendations
      }) : null;
    
    // Model to use
    this.modelName = "gpt-4o-mini";
    this.fallbackModel = "gpt-3.5-turbo"; // Fallback model if primary not available
    
    // Cache for LLM decisions to avoid redundant API calls
    this.decisionCache = new Map();
    this.cacheTTL = 60 * 60 * 1000; // 60 minutes - recommendations can be cached longer
    this.MAX_CACHE_SIZE = 1000;      // Maximum cache entries
    
    // Set up cache cleanup interval
    this.cleanupInterval = setInterval(() => this._cleanupCache(), 15 * 60 * 1000); // Clean every 15 minutes
    
    // Service matchers with sensitivity threshold (0.0-1.0)
    this.confidenceThreshold = 0.75;
    
    console.log('Enhanced recommendation trigger system initialized');
  }
  
  /**
   * Clean up expired cache entries
   * @private
   */
  _cleanupCache() {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [key, value] of this.decisionCache.entries()) {
      if (now - value.timestamp > this.cacheTTL) {
        this.decisionCache.delete(key);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      console.log(`Recommendation cache cleanup: removed ${expiredCount} expired entries, ${this.decisionCache.size} remaining`);
    }
  }

  /**
   * Safe substring handling for multibyte characters
   * @param {string} str - String to truncate
   * @param {number} maxLength - Maximum length in characters (not bytes)
   * @returns {string} - Safely truncated string
   * @private
   */
  _safeSubstring(str, maxLength) {
    if (!str) return '';
    return [...str].slice(0, maxLength).join('');
  }
  
  /**
   * Use LLM to determine if the message implies a service need
   * @param {string} message - The user message
   * @param {Array<Object>} conversationHistory - Previous conversation messages
   * @returns {Promise<Object>} - Promise resolving to {trigger: boolean, service: string, confidence: number}
   */
  async analyzeServiceNeed(message, conversationHistory = []) {
    if (!message || typeof message !== 'string') {
      return { trigger: false, service: null, confidence: 0 };
    }
    
    // Check cache first (using truncated message to avoid cache bloat)
    const cacheKey = `rec_${this._safeSubstring(message, 100)}`;
    const now = Date.now();
    const BUFFER_MS = 500; // 500ms buffer for expiration
    
    if (this.decisionCache.has(cacheKey)) {
      const cached = this.decisionCache.get(cacheKey);
      if (now - cached.timestamp < (this.cacheTTL - BUFFER_MS)) {
        console.log('Using cached LLM decision for service recommendation');
        return cached.decision;
      }
    }
    
    // If no OpenAI API key, return no recommendation
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log('No OpenAI API key available for service recommendation analysis');
      return { trigger: false, service: null, confidence: 0 };
    }
    
    // Update client with latest API key
    this.openai = new OpenAI({ 
      apiKey,
      timeout: 15000,
      maxRetries: 3
    });
    
    // Default result in case of errors
    const defaultResult = { trigger: false, service: null, confidence: 0 };
    
    try {
      console.log(`Analyzing message with ${this.modelName} for service recommendation...`);
      
      // Create context from conversation history
      let conversationContext = '';
      if (conversationHistory && conversationHistory.length > 0) {
        // Only use the last 5 messages for context
        const recentMessages = conversationHistory.slice(-5);
        conversationContext = recentMessages.map(msg => 
          `${msg.role === 'user' ? 'ユーザー' : 'アシスタント'}: ${this._safeSubstring(msg.content, 200)}`
        ).join('\n');
      }
      
      const systemPrompt = `あなたはユーザーの発言から、特定のサービスが必要かどうかを判断する専門家です。以下のサービスカテゴリが利用可能です：

- 健康相談
- メンタルヘルス
- キャリアアドバイス
- 学習支援
- 技術サポート
- 法律相談
- 財務アドバイス
- 生活アドバイス

ユーザーの発言を分析し、次の形式でJSONレスポンスを返してください：
{
  "trigger": true/false,  // サービスを提案すべき場合はtrue
  "service": "サービス名",  // 上記リストから最も関連性の高いサービス名
  "confidence": 0.0-1.0   // 確信度を0.0～1.0で表現
}

応答は必ず有効なJSONで、これらの3つのフィールドのみを含めてください。トリガーが必要ないと判断した場合は、serviceをnull、confidenceを0にしてください。`;

      const userMessage = `ユーザーの発言: "${message}"`;
      
      const messages = [
        { role: "system", content: systemPrompt }
      ];
      
      // Add conversation context if available
      if (conversationContext) {
        messages.push({ 
          role: "system", 
          content: `最近の会話コンテキスト:\n${conversationContext}` 
        });
      }
      
      messages.push({ role: "user", content: userMessage });
      
      // Make request with error handling and model fallback
      let response;
      try {
        response = await this.openai.chat.completions.create({
          model: this.modelName,
          messages: messages,
          max_tokens: 150,
          temperature: 0.0, // More deterministic for service matching
          response_format: { type: "json_object" }
        });
      } catch (modelError) {
        // If primary model not available, try fallback
        if (modelError.message && modelError.message.includes('model') && modelError.message.includes('not found')) {
          console.log(`Model ${this.modelName} not available, falling back to ${this.fallbackModel}`);
          response = await this.openai.chat.completions.create({
            model: this.fallbackModel,
            messages: messages,
            max_tokens: 150,
            temperature: 0.0,
            response_format: { type: "json_object" }
          });
        } else {
          throw modelError; // Re-throw if it's not a model availability issue
        }
      }
      
      // Validate response structure
      if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
        throw new Error('Unexpected API response structure');
      }
      
      // Parse response with error handling
      let decision;
      try {
        const content = response.choices[0].message.content.trim();
        decision = JSON.parse(content);
        
        // Validate expected fields
        if (typeof decision.trigger !== 'boolean' || 
            (decision.trigger && typeof decision.service !== 'string') ||
            typeof decision.confidence !== 'number') {
          throw new Error('Response missing required fields');
        }
        
        // Apply confidence threshold
        if (decision.confidence < this.confidenceThreshold) {
          decision.trigger = false;
          decision.service = null;
        }
      } catch (parseError) {
        console.error('Error parsing LLM response:', parseError.message);
        // Return default on parse failure
        decision = defaultResult;
      }
      
      // Manage cache size before adding new entry
      if (this.decisionCache.size >= this.MAX_CACHE_SIZE) {
        let oldestKey = null;
        let oldestTime = Date.now();
        
        for (const [key, value] of this.decisionCache.entries()) {
          if (value.timestamp < oldestTime) {
            oldestTime = value.timestamp;
            oldestKey = key;
          }
        }
        
        if (oldestKey) {
          this.decisionCache.delete(oldestKey);
          console.log('Recommendation cache full, removed oldest entry');
        }
      }
      
      // Cache the decision
      this.decisionCache.set(cacheKey, {
        decision,
        timestamp: now
      });
      
      console.log(`Service recommendation analysis result:`, 
        decision.trigger ? 
          `Trigger service: ${decision.service} (confidence: ${decision.confidence.toFixed(2)})` : 
          'No service recommendation needed');
      
      return decision;
      
    } catch (error) {
      // Log error without sensitive data
      console.error('Error analyzing service need:', {
        message: error.message,
        name: error.name,
        status: error.status
      });
      // Return default result on error
      return defaultResult;
    }
  }
  
  /**
   * Cleanup resources when shutting down
   */
  dispose() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Export singleton instance
module.exports = new EnhancedRecommendationTrigger(); 