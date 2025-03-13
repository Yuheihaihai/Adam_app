/**
 * Test Enhanced Features
 * 
 * This script tests the enhanced recommendation and confusion detection features
 * to verify that they work correctly without interfering with existing functionality.
 */

require('dotenv').config();  // Load environment variables from .env file
const enhancedFeatures = require('./enhancedFeatures');

// Sample messages to test recommendation detection
const recommendationTestMessages = [
  // Direct, explicit requests (should be detected by keywords)
  { text: 'オススメお願いします', expected: true, note: 'Explicit request (keyword)' },
  { text: 'おすすめのサービスを教えてください', expected: true, note: 'Explicit request (keyword)' },
  { text: 'サービスを紹介してください', expected: true, note: 'Explicit request (keyword)' },
  
  // Indirect requests (should be detected by LLM)
  { text: '私の状況に合った情報はありますか?', expected: true, note: 'Indirect request (LLM)' },
  { text: '何か助けになるものを知りたいです', expected: true, note: 'Indirect request (LLM)' },
  { text: '他に何かいい選択肢はありますか？', expected: true, note: 'Indirect request (LLM)' },
  
  // Non-recommendation messages (should not be detected)
  { text: 'こんにちは、元気ですか？', expected: false, note: 'Greeting (not recommendation)' },
  { text: '昨日の話の続きをしましょう', expected: false, note: 'Continuation (not recommendation)' },
  { text: '天気がいいですね', expected: false, note: 'Small talk (not recommendation)' }
];

// Sample messages to test confusion detection
const confusionTestMessages = [
  // Direct confusion (should be detected by keywords)
  { text: 'よくわかりません', expected: true, note: 'Direct confusion (keyword)' },
  { text: '何を言っているのかわからない', expected: true, note: 'Direct confusion (keyword)' },
  { text: 'もっと詳しく説明してください', expected: true, note: 'Direct confusion (keyword)' },
  
  // Indirect confusion (should be detected by LLM)
  { text: 'もう少し簡単に言ってくれませんか？', expected: true, note: 'Indirect confusion (LLM)' },
  { text: '違う言い方で説明できますか？', expected: true, note: 'Indirect confusion (LLM)' },
  { text: 'それはどういう意味なのでしょうか', expected: true, note: 'Indirect confusion (LLM)' },
  
  // Non-confusion messages (should not be detected)
  { text: 'ありがとう、とてもわかりやすいです', expected: false, note: 'Understanding (not confusion)' },
  { text: '次の話題に移りましょう', expected: false, note: 'Change topic (not confusion)' },
  { text: 'それは興味深いですね', expected: false, note: 'Engagement (not confusion)' }
];

// Previous response sample for confusion context
const previousResponse = 'このシステムは複数のモジュールから構成されており、各モジュールは特定の機能を担当しています。主要なコンポーネントには、ユーザー入力の処理、意図の検出、応答の生成などがあります。これらのモジュールは相互に連携して動作し、全体として一貫したユーザー体験を提供します。';

// Test recommendation detection
async function testRecommendationDetection() {
  console.log('\n=== TESTING RECOMMENDATION DETECTION ===');
  console.log('Testing enhanced service recommendation detection...');
  
  let passed = 0;
  let failed = 0;
  
  for (const test of recommendationTestMessages) {
    try {
      // Test keyword detection (synchronous)
      const hasKeywords = enhancedFeatures.hasRecommendationTriggerKeywords(test.text);
      
      // Test full detection (asynchronous)
      const result = await enhancedFeatures.shouldShowServiceRecommendations(test.text);
      
      // Evaluate test result
      const testPassed = result === test.expected;
      
      // Log result
      console.log(`- "${test.text.substring(0, 30)}${test.text.length > 30 ? '...' : ''}" (${test.note}):`);
      console.log(`  Keywords detected: ${hasKeywords}, Full detection: ${result}, Expected: ${test.expected}`);
      console.log(`  Result: ${testPassed ? 'PASS ✅' : 'FAIL ❌'}`);
      
      if (testPassed) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`- ERROR testing "${test.text}": ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\nRecommendation detection tests completed: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// Test confusion detection
async function testConfusionDetection() {
  console.log('\n=== TESTING CONFUSION DETECTION ===');
  console.log('Testing enhanced confusion detection...');
  
  let passed = 0;
  let failed = 0;
  
  for (const test of confusionTestMessages) {
    try {
      // Test keyword detection (synchronous)
      const hasKeywords = enhancedFeatures.hasConfusionKeywords(test.text);
      
      // Test full detection (asynchronous)
      const result = await enhancedFeatures.shouldGenerateImage(test.text, previousResponse);
      
      // Evaluate test result
      const testPassed = result === test.expected;
      
      // Log result
      console.log(`- "${test.text.substring(0, 30)}${test.text.length > 30 ? '...' : ''}" (${test.note}):`);
      console.log(`  Keywords detected: ${hasKeywords}, Full detection: ${result}, Expected: ${test.expected}`);
      console.log(`  Result: ${testPassed ? 'PASS ✅' : 'FAIL ❌'}`);
      
      if (testPassed) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`- ERROR testing "${test.text}": ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\nConfusion detection tests completed: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// Run all tests
async function runTests() {
  console.log('Starting enhanced features tests...');
  
  // Run recommendation detection tests
  const recommendationResults = await testRecommendationDetection();
  
  // Run confusion detection tests
  const confusionResults = await testConfusionDetection();
  
  // Show overall results
  console.log('\n=== TEST SUMMARY ===');
  console.log(`Recommendation tests: ${recommendationResults.passed} passed, ${recommendationResults.failed} failed`);
  console.log(`Confusion tests: ${confusionResults.passed} passed, ${confusionResults.failed} failed`);
  
  const totalPassed = recommendationResults.passed + confusionResults.passed;
  const totalFailed = recommendationResults.failed + confusionResults.failed;
  const totalTests = totalPassed + totalFailed;
  
  console.log(`\nOVERALL: ${totalPassed}/${totalTests} tests passed (${Math.round(totalPassed/totalTests*100)}%)`);
  
  if (totalFailed === 0) {
    console.log('\nALL TESTS PASSED! ✅ Enhanced features are working as expected.');
  } else {
    console.log('\nSome tests failed. Review the above output for details.');
  }
}

// Execute tests
runTests().catch(error => {
  console.error('Error running tests:', error);
  process.exit(1);
}); 