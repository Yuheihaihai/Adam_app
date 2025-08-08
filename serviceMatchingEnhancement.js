/**
 * Service Matching Enhancement
 * 
 * This module provides integration between the enhanced recommendation detection system
 * and the existing service matching system. It serves as a bridge without modifying
 * existing code.
 * 
 * The main function is used as a secondary check when the standard service matching
 * system doesn't find any recommendations but the user's message clearly indicates
 * they are looking for service recommendations.
 */

const enhancedFeatures = require('./enhancedFeatures');

// Import service recommender (only if already loaded elsewhere)
let serviceRecommender = null;

/**
 * Initialize the service matching enhancement with the existing service recommender
 * @param {Object} existingServiceRecommender - The existing service recommender instance
 */
function initialize(existingServiceRecommender) {
  serviceRecommender = existingServiceRecommender;
  console.log('Service matching enhancement initialized');
}

/**
 * Check if a user is explicitly requesting service recommendations
 * @param {string} userMessage - The user message
 * @param {Array<Object>} conversationHistory - Conversation history (optional)
 * @returns {Promise<boolean>} - True if the user is explicitly requesting recommendations
 */
async function isExplicitRecommendationRequest(userMessage, conversationHistory = []) {
  // キーワードは廃止。LLM/MLで判定（会話文脈・感情を含む）。
  return await enhancedFeatures.shouldShowServiceRecommendations(userMessage, conversationHistory);
}

/**
 * Secondary service matching when the primary system fails to find recommendations
 * but the user is clearly asking for them
 * 
 * @param {string} userId - The user ID
 * @param {string} userMessage - The user message
 * @param {Object} userNeeds - The user needs object
 * @param {Object} conversationContext - The conversation context
 * @returns {Promise<Array>} - Array of recommended services
 */
async function getSecondaryRecommendations(userId, userMessage, userNeeds, conversationContext) {
  try {
    // If no service recommender is initialized, can't proceed
    if (!serviceRecommender) {
      console.warn('[ServiceEnhancement] No service recommender initialized');
      return [];
    }
    
    console.log('[ServiceEnhancement] Performing secondary service matching...');
    
    // Convert conversation context to a format suitable for the enhanced features
    const conversationHistory = conversationContext?.recentMessages || [];
    
    // First check if this is an explicit recommendation request
    const isExplicit = await isExplicitRecommendationRequest(userMessage, conversationHistory);
    
    if (!isExplicit) {
      console.log('[ServiceEnhancement] Not an explicit recommendation request, skipping');
      return [];
    }
    
    console.log('[ServiceEnhancement] Explicit recommendation request detected, analyzing service needs...');
    
    // Get detailed analysis from the enhanced system
    const analysis = await enhancedFeatures.analyzeServiceNeed(userMessage, conversationHistory);
    
    if (!analysis.trigger) {
      console.log('[ServiceEnhancement] Enhanced analysis did not trigger a recommendation');
      return [];
    }
    
    console.log(`[ServiceEnhancement] Enhanced analysis triggered a recommendation for service type: ${analysis.service || 'general'} (confidence: ${analysis.confidence})`);
    
    // If we have a specific service category from the analysis, prioritize services of that type
    let matchingServices = [];
    if (analysis.service) {
      // Get all available services first
      const allServices = await serviceRecommender.getAllServices();
      
      // Filter services by category from the analysis
      matchingServices = allServices.filter(service => {
        // Match by service category or subcategory if available
        const category = service.category?.toLowerCase() || '';
        const subcategory = service.subcategory?.toLowerCase() || '';
        const description = service.description?.toLowerCase() || '';
        const name = service.name?.toLowerCase() || '';
        
        const serviceType = analysis.service.toLowerCase();
        
        return category.includes(serviceType) || 
               subcategory.includes(serviceType) ||
               description.includes(serviceType) ||
               name.includes(serviceType);
      });
      
      // Add confidence scores to matched services
      matchingServices = matchingServices.map(service => {
        service.confidenceScore = analysis.confidence;
        return service;
      });
      
      // Ensure we don't exceed 3 recommendations
      matchingServices = matchingServices.slice(0, 3);
    }
    
    // If no matches by category, use existing recommendation logic with a lower threshold
    if (matchingServices.length === 0) {
      console.log('[ServiceEnhancement] No direct category matches, using backup matching...');
      
      // Get the current confidence threshold and temporarily lower it
      const originalThreshold = serviceRecommender.CONFIDENCE_THRESHOLD;
      const lowerThreshold = Math.min(originalThreshold, 0.4); // Lower to 40% but don't increase if already lower
      
      try {
        // Temporarily lower the confidence threshold
        serviceRecommender.CONFIDENCE_THRESHOLD = lowerThreshold;
        console.log(`[ServiceEnhancement] Temporarily lowered confidence threshold to ${lowerThreshold * 100}%`);
        
        // Use the existing service matching but with the lower threshold
        matchingServices = await serviceRecommender.findMatchingServices(userNeeds, conversationContext);
        
        // Ensure we don't exceed 3 recommendations
        matchingServices = matchingServices.slice(0, 3);
      } finally {
        // Restore the original threshold
        serviceRecommender.CONFIDENCE_THRESHOLD = originalThreshold;
        console.log(`[ServiceEnhancement] Restored confidence threshold to ${originalThreshold * 100}%`);
      }
    }
    
    console.log(`[ServiceEnhancement] Found ${matchingServices.length} services via secondary matching`);
    
    // Return the matching services
    return matchingServices;
  } catch (error) {
    console.error('[ServiceEnhancement] Error in secondary service matching:', error);
    return [];
  }
}

/**
 * Safe processing of service recommendations with fallback to secondary matching
 * 
 * @param {string} userId - The user ID
 * @param {string} userMessage - The user message
 * @param {Object} userNeeds - The user needs analysis
 * @param {Object} conversationContext - The conversation context
 * @param {Array} primaryRecommendations - The primary recommendations (if any)
 * @returns {Promise<Array>} - Final list of recommendations
 */
async function processServiceRecommendations(userId, userMessage, userNeeds, conversationContext, primaryRecommendations = []) {
  try {
    // If we already have recommendations from the primary system, just return them
    if (primaryRecommendations && primaryRecommendations.length > 0) {
      console.log(`[ServiceEnhancement] Using ${primaryRecommendations.length} primary recommendations`);
      return primaryRecommendations;
    }
    
    // Check if this is an explicit recommendation request
    const isExplicit = await isExplicitRecommendationRequest(userMessage, 
      conversationContext?.recentMessages || []);
    
    // If not an explicit request, no need for secondary processing
    if (!isExplicit) {
      console.log('[ServiceEnhancement] Not an explicit recommendation request, skipping secondary processing');
      return [];
    }
    
    console.log('[ServiceEnhancement] Primary recommendations empty, trying secondary matching...');
    
    // Get secondary recommendations
    const secondaryRecommendations = await getSecondaryRecommendations(
      userId, userMessage, userNeeds, conversationContext);
    
    console.log(`[ServiceEnhancement] Returning ${secondaryRecommendations.length} secondary recommendations`);
    return secondaryRecommendations;
  } catch (error) {
    console.error('[ServiceEnhancement] Error processing service recommendations:', error);
    return primaryRecommendations || []; // Return primary recommendations as fallback
  }
}

// Export the public interface
module.exports = {
  initialize,
  isExplicitRecommendationRequest,
  getSecondaryRecommendations,
  processServiceRecommendations
}; 