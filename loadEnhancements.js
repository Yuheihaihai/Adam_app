/**
 * Enhanced Features Auto-Loader
 * 
 * This file automatically initializes all enhanced features when required.
 * To use it, simply require this file in your main server.js after initializing
 * your serviceRecommender and other services.
 * 
 * Example:
 * ```
 * // After initializing services
 * const serviceRecommender = new ServiceRecommender(base);
 * 
 * // Load enhanced features
 * require('./loadEnhancements')(serviceRecommender);
 * ```
 */

const enhancedServiceInit = require('./enhancedServiceInit');

// Export a function that initializes everything when called
module.exports = function(serviceRecommender) {
  console.log('\n=== INITIALIZING ENHANCED FEATURES ===');
  
  try {
    if (!serviceRecommender) {
      console.error('Cannot initialize enhancements: serviceRecommender is required');
      return false;
    }
    
    // Initialize the enhanced service features
    const serviceInitResult = enhancedServiceInit.initializeEnhancement(serviceRecommender);
    
    if (serviceInitResult) {
      console.log('✅ Enhanced service recommendations initialized');
    } else {
      console.warn('⚠️ Failed to initialize enhanced service recommendations');
    }
    
    console.log('\n=== ENHANCED FEATURES INITIALIZATION COMPLETE ===\n');
    
    return serviceInitResult;
  } catch (error) {
    console.error('Error initializing enhanced features:', error);
    return false;
  }
}; 