/**
 * Enhanced Features Usage Example
 * 
 * This file demonstrates how to use the enhanced features with the existing code.
 * It is not meant to be executed directly, but to serve as a guide for integration.
 * 
 * NOTE: This file is for reference purposes only. Do not import or require this file.
 */

// Import existing functionality (for reference only)
const isConfusionRequest = require('./server').isConfusionRequest;
const detectAdviceRequest = require('./server').detectAdviceRequest;

// Import enhanced features
const enhancedFeatures = require('./enhancedFeatures');

/**
 * EXAMPLE 1: Enhanced Service Recommendation Implementation
 * 
 * Shows how to use enhanced service recommendation detection alongside
 * the existing detectAdviceRequest function.
 */
async function enhancedServiceRecommendationExample(userMessage, history) {
  console.log('=== ENHANCED SERVICE RECOMMENDATION EXAMPLE ===');
  
  // First, check with existing system
  const isExplicitAdviceRequest = detectAdviceRequest(userMessage, history);
  console.log(`Existing system detected advice request: ${isExplicitAdviceRequest}`);
  
  // Then, check with enhanced system (if existing system didn't detect)
  let shouldShowRecommendations = isExplicitAdviceRequest;
  
  if (!isExplicitAdviceRequest) {
    // Use the enhanced detection only if the existing system didn't detect
    shouldShowRecommendations = await enhancedFeatures.shouldShowServiceRecommendations(userMessage);
    console.log(`Enhanced system recommendation decision: ${shouldShowRecommendations}`);
  }
  
  // Combined result
  console.log(`Final decision - Show recommendations: ${shouldShowRecommendations}`);
  console.log('=== END EXAMPLE ===\n');
  
  return shouldShowRecommendations;
}

/**
 * EXAMPLE 2: Enhanced Confusion Detection Implementation
 * 
 * Shows how to use enhanced confusion detection alongside
 * the existing isConfusionRequest function.
 */
async function enhancedConfusionDetectionExample(userMessage, previousResponse = null) {
  console.log('=== ENHANCED CONFUSION DETECTION EXAMPLE ===');
  
  // First, check with existing system
  const isConfused = isConfusionRequest(userMessage);
  console.log(`Existing system detected confusion: ${isConfused}`);
  
  // Then, check with enhanced system (if existing system didn't detect)
  let shouldGenerateImage = isConfused;
  
  if (!isConfused) {
    // Use the enhanced detection only if the existing system didn't detect
    shouldGenerateImage = await enhancedFeatures.shouldGenerateImage(userMessage, previousResponse);
    console.log(`Enhanced system confusion decision: ${shouldGenerateImage}`);
  }
  
  // Combined result
  console.log(`Final decision - Generate image: ${shouldGenerateImage}`);
  console.log('=== END EXAMPLE ===\n');
  
  return shouldGenerateImage;
}

/**
 * EXAMPLE: Integration in an actual handleText function
 * 
 * This is how you might adapt the existing handleText function to use
 * the enhanced features without modifying the core logic.
 */
async function handleTextExample(event) {
  try {
    const userId = event.source.userId;
    const userMessage = event.message.text.trim();
    
    // Get conversation history
    const history = await fetchUserHistory(userId, 10);
    const lastAssistantMessage = history.filter(item => item.role === 'assistant').pop();
    
    // Enhanced confusion detection (combines existing and new logic)
    let triggerImageExplanation = false;
    
    // First check with existing system
    if (isConfusionRequest(userMessage)) {
      console.log('Confusion detected using existing system');
      triggerImageExplanation = true;
    } 
    // Then try enhanced system if needed
    else {
      try {
        // Use enhanced confusion detection with context from previous response
        const previousResponse = lastAssistantMessage ? lastAssistantMessage.content : null;
        const enhancedConfusion = await enhancedFeatures.shouldGenerateImage(userMessage, previousResponse);
        
        if (enhancedConfusion) {
          console.log('Confusion detected using enhanced system');
          triggerImageExplanation = true;
        }
      } catch (error) {
        console.error('Error in enhanced confusion detection:', error);
        // Fall back to existing detection
      }
    }
    
    // Rest of the existing handleText function (for image generation)
    if (triggerImageExplanation) {
      // Image generation logic (existing code)
      if (lastAssistantMessage) {
        // 文字列からオブジェクト形式に変更
        pendingImageExplanations.set(userId, {
          content: lastAssistantMessage.content,
          timestamp: Date.now(),
          source: 'confusion_detection'
        });
      } else {
        // 文字列からオブジェクト形式に変更
        pendingImageExplanations.set(userId, {
          content: "説明がありません。",
          timestamp: Date.now(),
          source: 'default'
        });
      }
      const suggestionMessage = "前回の回答について、画像による説明を生成しましょうか？「はい」または「いいえ」でお答えください。";
      console.log("画像による説明の提案をユーザーに送信:", suggestionMessage);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: suggestionMessage
      });
    }
    
    // Rest of the normal message processing...
    
    // Enhanced service recommendation detection inside processWithAI
    // (this would be added to the processWithAI function)
    const isExplicitAdviceRequest = detectAdviceRequest(userMessage, history);
    
    // If explicit request not detected, try enhanced detection
    let showRecommendations = isExplicitAdviceRequest;
    
    if (!isExplicitAdviceRequest) {
      try {
        const enhancedRecommendation = await enhancedFeatures.shouldShowServiceRecommendations(userMessage);
        showRecommendations = enhancedRecommendation;
      } catch (error) {
        console.error('Error in enhanced recommendation detection:', error);
        // Fall back to existing detection
      }
    }
    
    console.log(`Service recommendations decision: ${showRecommendations ? 'SHOW' : 'SKIP'}`);
    
    // Continue with normal message processing...
    
  } catch (error) {
    console.error('Error in handleText:', error);
  }
}

/**
 * The examples above demonstrate how to integrate the enhanced features.
 * These functions are not meant to be called directly from this file.
 * 
 * To use in production:
 * 1. Import enhancedFeatures.js in your server.js file
 * 2. Add the enhanced detection as shown above without modifying existing logic
 * 3. Make sure the enhanced detection is only used when the existing detection doesn't trigger
 */

// For demonstration purposes only
module.exports = {
  enhancedServiceRecommendationExample,
  enhancedConfusionDetectionExample,
  handleTextExample
}; 