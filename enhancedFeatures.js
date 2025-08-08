/**
 * Enhanced Features Integration
 * 
 * This module integrates enhanced recommendation and confusion detection
 * features with the existing system without modifying existing code.
 * 
 * It exports functions that can be called from the main server code
 * as additional checks alongside the existing logic.
 */

const enhancedRecommendationTrigger = require('./enhancedRecommendationTrigger');
const enhancedConfusionDetector = require('./enhancedConfusionDetector');

/**
 * Enhanced check for service recommendation triggers
 * 
 * @param {string} userMessage - The user message
 * @param {Array<Object>} conversationHistory - Optional conversation history
 * @returns {Promise<boolean>} - True if service recommendations should be shown
 */
async function shouldShowServiceRecommendations(userMessage, conversationHistory = []) {
  try {
    // Use the enhanced recommendation trigger system (LLM/MLベース)
    const analysis = await enhancedRecommendationTrigger.analyzeServiceNeed(userMessage, conversationHistory);
    
    // If the analysis returns a trigger recommendation with sufficient confidence
    return analysis.trigger === true;
  } catch (error) {
    console.error('Error in enhanced recommendation detection:', error);
    // In case of error, don't interfere with the existing system
    return false;
  }
}

/**
 * Enhanced service need analysis that returns detailed information
 * 
 * @param {string} userMessage - The user message
 * @param {Array<Object>} conversationHistory - Optional conversation history
 * @returns {Promise<Object>} - Service analysis result {trigger, service, confidence}
 */
async function analyzeServiceNeed(userMessage, conversationHistory = []) {
  try {
    // Use the enhanced recommendation trigger system's full analysis (LLM/ML)
    return await enhancedRecommendationTrigger.analyzeServiceNeed(userMessage, conversationHistory);
  } catch (error) {
    console.error('Error in enhanced service need analysis:', error);
    // In case of error, return default result
    return { trigger: false, service: null, confidence: 0 };
  }
}

/**
 * Enhanced check for user confusion to trigger image generation
 * 
 * @param {string} userMessage - The user message
 * @param {string} previousResponse - The previous AI response (optional)
 * @returns {Promise<boolean>} - True if image generation should be triggered
 */
async function shouldGenerateImage(userMessage, previousResponse = null) {
  try {
    // Use the enhanced confusion detector
    return await enhancedConfusionDetector.shouldGenerateImage(userMessage, previousResponse);
  } catch (error) {
    console.error('Error in enhanced confusion detection:', error);
    // In case of error, don't interfere with the existing system
    return false;
  }
}

/**
 * Simplified interface to check for service recommendation without async
 * Used when async operations are not possible due to code structure
 * 
 * @param {string} userMessage - The user message
 * @returns {boolean} - True if basic trigger keywords are detected
 */
function hasRecommendationTriggerKeywords(userMessage) {
  try {
    // Use only the keywords method for synchronous contexts
    return enhancedRecommendationTrigger.hasRecommendationTrigger(userMessage);
  } catch (error) {
    console.error('Error in recommendation keyword detection:', error);
    return false;
  }
}

/**
 * Simplified interface to check for confusion keywords without async
 * Used when async operations are not possible due to code structure
 * 
 * @param {string} userMessage - The user message
 * @returns {boolean} - True if basic confusion keywords are detected
 */
function hasConfusionKeywords(userMessage) {
  try {
    // Use only the keywords method for synchronous contexts
    return enhancedConfusionDetector.hasConfusionKeywords(userMessage);
  } catch (error) {
    console.error('Error in confusion keyword detection:', error);
    return false;
  }
}

module.exports = {
  shouldShowServiceRecommendations,
  analyzeServiceNeed,
  shouldGenerateImage,
  hasRecommendationTriggerKeywords,
  hasConfusionKeywords
}; 