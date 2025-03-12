/**
 * Demonstration of how to integrate the adviceDetector module with the shouldShowServicesToday function
 */

// Import the advice detector module
const adviceDetector = require('./adviceDetector');

/**
 * Example implementation of shouldShowServicesToday that uses the adviceDetector
 * @param {string} userId - The user ID
 * @param {Array} history - The conversation history
 * @param {string} userMessage - The current user message
 * @returns {boolean} - Whether to show service recommendations
 */
function enhancedShouldShowServicesToday(userId, history, userMessage) {
  // Check if user explicitly asks for advice using our new detector
  if (userMessage && adviceDetector.isAdviceRequest(userMessage)) {
    // Extract the specific patterns that matched
    const patterns = adviceDetector.extractAdvicePatterns(userMessage);
    
    // Log the detected patterns for debugging
    console.log('Advice request detected with patterns:', {
      explicit: patterns.explicit.length > 0 ? patterns.explicit : 'none',
      polite: patterns.polite.length > 0 ? patterns.polite : 'none',
      casual: patterns.casual.length > 0 ? patterns.casual : 'none'
    });
    
    // If explicit patterns were found, always show services
    if (patterns.explicit.length > 0) {
      console.log('Explicit advice request detected - showing services');
      return true;
    }
    
    // Get confidence score for the advice request
    const confidence = adviceDetector.getAdviceRequestConfidence(userMessage);
    console.log(`Advice request confidence: ${confidence}`);
    
    // If high confidence, show services
    if (confidence >= 0.7) {
      console.log('High confidence advice request detected - showing services');
      return true;
    }
  }
  
  try {
    // Here you would implement the rest of the original shouldShowServicesToday logic
    // This includes checking user preferences, last service time, etc.
    
    // For demonstration purposes, we'll just return true
    return true;
  } catch (err) {
    console.error('Error in enhancedShouldShowServicesToday:', err);
    return true; // Default to showing if there's an error
  }
}

/**
 * Test the enhanced function with some example messages
 */
function testAdviceDetection() {
  const userId = 'test-user-123';
  const history = [];
  
  // Test cases
  const testMessages = [
    'アドバイスください', // Explicit advice request
    'どうすればいいですか？', // Polite advice request
    '困っているんだけど、どうしたらいい？', // Problem + casual advice request
    'こんにちは、元気ですか？', // Not an advice request
    'I need some advice on this problem', // English advice request
    '最近疲れていて、何か良い解決策はありますか？' // Problem + question
  ];
  
  // Run tests
  console.log('=== ADVICE DETECTION TEST ===');
  testMessages.forEach((message, index) => {
    console.log(`\nTest ${index + 1}: "${message}"`);
    const result = enhancedShouldShowServicesToday(userId, history, message);
    console.log(`Result: ${result ? 'SHOW SERVICES' : 'DO NOT SHOW SERVICES'}`);
    console.log('-'.repeat(50));
  });
}

// Run the test
testAdviceDetection();

/**
 * Integration guide:
 * 
 * To integrate this with the existing server.js:
 * 
 * 1. Add the import at the top of server.js:
 *    const adviceDetector = require('./adviceDetector');
 * 
 * 2. Modify the shouldShowServicesToday function to use adviceDetector:
 *    - Replace the explicit advice patterns check with adviceDetector.isAdviceRequest()
 *    - Use adviceDetector.extractAdvicePatterns() to get detailed pattern matches
 *    - Use adviceDetector.getAdviceRequestConfidence() to get a confidence score
 * 
 * 3. Keep the existing timing and frequency logic
 * 
 * 4. Test thoroughly to ensure the integration works as expected
 */ 