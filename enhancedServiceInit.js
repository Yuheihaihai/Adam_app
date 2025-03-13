/**
 * Enhanced Service Features Initialization
 * 
 * This module initializes and connects our enhanced service features to the existing application.
 * It uses module patching to intercept the existing service recommendation flow without
 * modifying the original code.
 * 
 * To use this enhancement, require this file in your main application file after
 * initializing the serviceRecommender but before handling any requests.
 */

const serviceMatchingEnhancement = require('./serviceMatchingEnhancement');

// Export a function to initialize the enhancement with the existing service recommender
function initializeEnhancement(serviceRecommender) {
  if (!serviceRecommender) {
    console.error('ERROR: Cannot initialize service enhancement without a service recommender instance');
    return false;
  }
  
  try {
    // Initialize the service matching enhancement
    serviceMatchingEnhancement.initialize(serviceRecommender);
    
    // Patch the getFilteredRecommendations method to include our enhancement
    const originalGetFilteredRecommendations = serviceRecommender.getFilteredRecommendations;
    
    serviceRecommender.getFilteredRecommendations = async function(userId, userNeeds, conversationContext = null) {
      try {
        // Log that we're using the enhanced version
        console.log('[EnhancedInit] Using enhanced getFilteredRecommendations');
        
        // Get user message from conversation context (if available)
        const userMessage = conversationContext?.recentMessages?.length > 0 
          ? conversationContext.recentMessages[conversationContext.recentMessages.length - 1]
          : '';
        
        // First call the original method to get the standard recommendations
        const standardRecommendations = await originalGetFilteredRecommendations.call(this, userId, userNeeds, conversationContext);
        
        // If standard recommendations worked, return them
        if (standardRecommendations && standardRecommendations.length > 0) {
          console.log(`[EnhancedInit] Standard recommendations returned ${standardRecommendations.length} services`);
          return standardRecommendations;
        }
        
        // If no standard recommendations but we have user message, try enhanced matching
        if (userMessage) {
          console.log('[EnhancedInit] No standard recommendations, trying enhanced matching...');
          
          // Process with enhanced service matching
          const enhancedRecommendations = await serviceMatchingEnhancement.processServiceRecommendations(
            userId, userMessage, userNeeds, conversationContext, standardRecommendations);
          
          if (enhancedRecommendations && enhancedRecommendations.length > 0) {
            console.log(`[EnhancedInit] Enhanced matching returned ${enhancedRecommendations.length} services`);
            return enhancedRecommendations;
          }
        }
        
        // If nothing worked, return the original (empty) result
        console.log('[EnhancedInit] No recommendations from any source');
        return standardRecommendations;
      } catch (error) {
        console.error('[EnhancedInit] Error in enhanced getFilteredRecommendations:', error);
        // In case of error, call the original method directly
        return originalGetFilteredRecommendations.call(this, userId, userNeeds, conversationContext);
      }
    };
    
    // Add a method to check if a message explicitly requests recommendations
    serviceRecommender.isExplicitRecommendationRequest = serviceMatchingEnhancement.isExplicitRecommendationRequest;
    
    // Add a method to get all services (if not already present)
    if (!serviceRecommender.getAllServices) {
      serviceRecommender.getAllServices = async function() {
        return this.services || [];
      };
    }
    
    console.log('[EnhancedInit] Service recommendation enhancement successfully initialized!');
    console.log('[EnhancedInit] The existing service recommender has been enhanced with better detection.');
    
    return true;
  } catch (error) {
    console.error('ERROR initializing service enhancement:', error);
    return false;
  }
}

module.exports = {
  initializeEnhancement
}; 