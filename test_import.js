// Simple test to check if we can import the adviceDetector module
console.log('Starting test...');

try {
  const adviceDetector = require('./adviceDetector');
  console.log('Successfully imported adviceDetector module');
  console.log('Module exports:', Object.keys(adviceDetector));
  
  // Test a simple advice request
  const testMessage = 'アドバイスください';
  const isAdvice = adviceDetector.isAdviceRequest(testMessage);
  console.log(`Is "${testMessage}" an advice request? ${isAdvice}`);
  
  // Test confidence
  const confidence = adviceDetector.getAdviceRequestConfidence(testMessage);
  console.log(`Confidence: ${confidence}`);
  
  // Test pattern extraction
  const patterns = adviceDetector.extractAdvicePatterns(testMessage);
  console.log('Extracted patterns:', patterns);
  
} catch (error) {
  console.error('Error importing or using adviceDetector module:', error);
}

console.log('Test completed'); 