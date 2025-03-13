/**
 * Enhanced Confusion Detection System
 * 
 * This module provides enhanced confusion detection using a local LLM implementation
 * to better understand when a user is confused about an AI response.
 * This implementation is designed to work alongside the existing confusion detection system.
 */

const { OpenAI } = require('openai');

class EnhancedConfusionDetector {
  constructor() {
    // Confusion indicator keywords (including the existing ones from isConfusionRequest)
    this.confusionKeywords = [
      'わからない', '分からない', '理解できない', '意味がわからない', '意味が分からない',
      '何これ', 'なにこれ', '何だこれ', 'なんだこれ', '何だろう', 'なんだろう',
      'どういう意味', 'どういうこと', 'よくわからない', 'よく分からない',
      '何が起きてる', '何が起きている', 'なにが起きてる',
      '何が書いてある', '何て書いてある', '何と書いてある', 'これは何',
      'これはなに', 'これって何', 'これってなに', '何が表示されてる',
      '何が表示されている', 'なにが表示されてる', 'これ何', 'これなに',
      'もう一度', 'もっと詳しく', '分かりやすく', 'かみ砕いて', 'かみくだいて',
      '難しい', 'むずかしい', '複雑', 'ふくざつ', '混乱', '説明して',
      '教えて', 'もっと簡単に', 'シンプルに', '具体的に', '例を挙げて'
    ];
    
    // Initialize OpenAI client for local LLM
    this.openai = process.env.OPENAI_API_KEY ? 
      new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 10000, // 10 second timeout 
        maxRetries: 2   // Allow 2 retries
      }) : null;
      
    // Model to use - using a smaller model for efficiency
    this.modelName = "gpt-4o-mini";
    this.fallbackModel = "gpt-3.5-turbo"; // Fallback model if primary not available
    
    // Cache for LLM decisions to avoid redundant API calls
    this.decisionCache = new Map();
    this.cacheTTL = 30 * 60 * 1000; // 30 minutes
    this.MAX_CACHE_SIZE = 1000;      // Maximum cache entries
    
    // Set up cache cleanup interval
    this.cleanupInterval = setInterval(() => this._cleanupCache(), 15 * 60 * 1000); // Clean every 15 minutes
    
    console.log('Enhanced confusion detection system initialized');
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
      console.log(`Confusion cache cleanup: removed ${expiredCount} expired entries, ${this.decisionCache.size} remaining`);
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
   * Checks if a message contains confusion keywords
   * @param {string} message - The user message
   * @returns {boolean} - True if confusion keywords are detected
   */
  hasConfusionKeywords(message) {
    if (!message || typeof message !== 'string') return false;
    
    return this.confusionKeywords.some(keyword => message.includes(keyword));
  }
  
  /**
   * Use local LLM to determine if the message indicates confusion
   * @param {string} message - The user message
   * @param {string} previousResponse - The previous AI response (optional)
   * @returns {Promise<boolean>} - Promise resolving to true if confusion is detected
   */
  async isConfusedWithLLM(message, previousResponse = null) {
    if (!message || typeof message !== 'string') return false;
    
    // Check cache first
    const cacheKey = `conf_${this._safeSubstring(message, 50)}`;
    const now = Date.now();
    const BUFFER_MS = 500; // 500ms buffer for expiration
    
    if (this.decisionCache.has(cacheKey)) {
      const cached = this.decisionCache.get(cacheKey);
      if (now - cached.timestamp < (this.cacheTTL - BUFFER_MS)) {
        console.log('Using cached LLM decision for confusion detection');
        return cached.decision;
      }
    }
    
    // If no OpenAI API key, fall back to keyword detection
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log('No OpenAI API key available for confusion LLM check, using keywords only');
      return this.hasConfusionKeywords(message);
    }
    
    // Update client with latest API key
    this.openai = new OpenAI({ 
      apiKey,
      timeout: 10000,
      maxRetries: 2
    });
    
    try {
      console.log(`Analyzing message with ${this.modelName} for confusion...`);
      
      let systemPrompt = `あなたはユーザーの会話内容を分析し、ユーザーが前回のアシスタントからの回答について混乱や理解困難を示しているかを判断する専門家です。

混乱の例:
- わからない
- もっと詳しく説明して
- どういう意味ですか
- 理解できません
- もっと簡単に言って
- 例を挙げてくれますか
- 何が言いたいのかわからない
- 違う方法で説明して

日本語のメッセージを分析し、ユーザーが混乱または理解困難を示しているかどうかを判断してください。
混乱や理解困難が示されている場合は「CONFUSED」、そうでない場合は「NOT_CONFUSED」と答えてください。

これらの2つの応答のみを使用してください。`;

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ];
      
      // Add context of previous response if available
      if (previousResponse) {
        // Safe truncation for long previous responses
        const safeResponse = this._safeSubstring(previousResponse, 500);
        messages.splice(1, 0, { 
          role: "system", 
          content: `前回のアシスタントの回答は次のとおりです: "${safeResponse}${previousResponse.length > 500 ? '...' : ''}"` 
        });
      }
      
      // Make request with error handling and model fallback
      let response;
      try {
        response = await this.openai.chat.completions.create({
          model: this.modelName,
          messages: messages,
          max_tokens: 50,
          temperature: 0.0 // More deterministic for classification
        });
      } catch (modelError) {
        // If primary model not available, try fallback
        if (modelError.message && modelError.message.includes('model') && modelError.message.includes('not found')) {
          console.log(`Model ${this.modelName} not available, falling back to ${this.fallbackModel}`);
          response = await this.openai.chat.completions.create({
            model: this.fallbackModel,
            messages: messages,
            max_tokens: 50,
            temperature: 0.0
          });
        } else {
          throw modelError; // Re-throw if it's not a model availability issue
        }
      }
      
      // Validate response structure
      if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
        throw new Error('Unexpected API response structure');
      }
      
      // More precise content matching
      const content = response.choices[0].message.content.trim();
      const decision = content === 'CONFUSED' || content.startsWith('CONFUSED');
      
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
          console.log('Confusion cache full, removed oldest entry');
        }
      }
      
      // Cache the decision
      this.decisionCache.set(cacheKey, {
        decision,
        timestamp: now
      });
      
      console.log(`LLM confusion detection decision: ${decision ? 'Confused' : 'Not confused'}`);
      return decision;
      
    } catch (error) {
      // Log error without sensitive data
      console.error('Error using LLM for confusion detection:', {
        message: error.message,
        name: error.name,
        status: error.status
      });
      // Fall back to keyword detection on error
      return this.hasConfusionKeywords(message);
    }
  }
  
  /**
   * Main function to determine if image generation should be triggered
   * Combines keyword detection and LLM understanding
   * @param {string} message - The user message
   * @param {string} previousResponse - The previous AI response (optional)
   * @returns {Promise<boolean>} - Promise resolving to true if image generation should be triggered
   */
  async shouldGenerateImage(message, previousResponse = null) {
    // First, check for confusion keywords (fast)
    const hasKeywords = this.hasConfusionKeywords(message);
    
    // If confusion keywords are present, we can skip LLM check
    if (hasKeywords) {
      console.log('Confusion keywords detected, skipping LLM check');
      return true;
    }
    
    // If no obvious confusion keywords, use LLM to understand message content
    const isConfusedWithLLM = await this.isConfusedWithLLM(message, previousResponse);
    
    // Log final decision
    console.log(`Enhanced confusion detection decision: ${isConfusedWithLLM ? 'TRIGGER' : 'SKIP'} image generation`);
    
    return isConfusedWithLLM;
  }
}

// Export singleton instance
module.exports = new EnhancedConfusionDetector(); 