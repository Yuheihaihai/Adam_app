// test_perplexity.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const PerplexitySearch = require('./perplexitySearch'); // Import the class

// Check if the API key exists
const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
if (!perplexityApiKey) {
  console.error("❌ FAILURE: Perplexity API key (PERPLEXITY_API_KEY) not found in .env file.");
  process.exit(1); // Exit if key is missing
}

// --- Initialize Service ---
let perplexitySearch;
try {
    perplexitySearch = new PerplexitySearch(perplexityApiKey);
    console.log("✅ PerplexitySearch initialized successfully.");
} catch (error) {
    console.error("❌ FAILURE: Could not initialize PerplexitySearch:", error.message);
    process.exit(1); // Exit if initialization fails
}


// --- Test Data ---
const sampleHistory = [
    { role: 'user', content: 'こんにちは、キャリアについて相談させてください。' },
    { role: 'assistant', content: 'こんにちは。どのようなことでしょうか？' },
    { role: 'user', content: '今の仕事が単調で、もっと成長できる環境を探しています。' },
];
const userMessage_enhance = "今の仕事が自分に向いているのか分からなくて悩んでいます。";
const userMessage_recommend = "私に向いている具体的な職業を5つ提案してください。";
const query_general = "2024年の日本のAI業界の最新動向について教えてください。";

// --- Helper function (copy from perplexitySearch.js for standalone test) ---
function needsKnowledge(userMessage) {
    if (userMessage.length < 10) return false;
    const careerTerms = [
        '適職', '向いてる', 'キャリア', '仕事', '職業', '就職', '転職',
        '業界', '職種', '会社', '働く', '就活', '求人', 'スキル',
        '悩み', '課題', '不安', '迷っ', '選択', '決断', '将来',
        '職場', '環境', '人間関係', '上司', '同僚', '部下', 'チーム',
        '社風', '企業', '組織', '会社', '給料', '年収', '報酬'
    ];
    return careerTerms.some(term => userMessage.includes(term));
}

// --- Test Functions ---

async function testEnhanceKnowledge() {
    console.log("\n--- Testing enhanceKnowledge ---");
    try {
        const startTime = Date.now();
        // Pass the actual history and user message
        const result = await perplexitySearch.enhanceKnowledge(sampleHistory, userMessage_enhance);
        const timeTaken = Date.now() - startTime;

        // Check if the function should have run based on needsKnowledge
        const shouldRun = needsKnowledge(userMessage_enhance);

        if (result && shouldRun) {
            console.log(`✅ SUCCESS: enhanceKnowledge completed in ${timeTaken} ms.`);
            console.log(`   Sample result: "${result.substring(0, 80)}..."`);
        } else if (result === null && !shouldRun) {
             console.log(`✅ SUCCESS (Skipped): enhanceKnowledge correctly skipped as message didn't meet criteria (in ${timeTaken} ms).`);
        } else if (result === null && shouldRun) {
            console.warn(`⚠️ WARN: enhanceKnowledge returned null even though it should have run (in ${timeTaken} ms). Check API response or logic.`);
        } else if (result && !shouldRun) {
             console.warn(`⚠️ WARN: enhanceKnowledge returned a result even though it should have been skipped (in ${timeTaken} ms).`);
        } else {
            // General fallback warning
            console.warn(`⚠️ WARN: enhanceKnowledge returned unexpected result or null in ${timeTaken} ms.`);
        }
    } catch (error) {
        console.error(`❌ FAILURE: Error in enhanceKnowledge: ${error.message}`);
         // Log more details for debugging network or API errors
        if (error.response) {
            console.error(`   API Status: ${error.response.status}`);
            console.error(`   API Data: ${JSON.stringify(error.response.data)}`);
        } else {
            console.error(`   Error Details: ${error.stack}`);
        }
    }
}


async function testGetJobTrends() {
    console.log("\n--- Testing getJobTrends (Default Query) ---");
    try {
        const startTime = Date.now();
        const result = await perplexitySearch.getJobTrends(); // Use default query
        const timeTaken = Date.now() - startTime;

        if (result && result.analysis && result.analysis.length > 10) {
            console.log(`✅ SUCCESS: getJobTrends completed in ${timeTaken} ms.`);
            console.log(`   Analysis sample: "${result.analysis.substring(0, 80)}..."`);
            console.log(`   URLs found: ${result.urls && result.urls.length > 0 ? 'Yes' : 'No'}`);
        } else {
            console.warn(`⚠️ WARN: getJobTrends returned null or incomplete result in ${timeTaken} ms.`);
            console.log(`   Raw Result: ${JSON.stringify(result)}`);
        }
    } catch (error) {
        console.error(`❌ FAILURE: Error in getJobTrends: ${error.message}`);
        if (error.response) {
            console.error(`   API Status: ${error.response.status}`);
            console.error(`   API Data: ${JSON.stringify(error.response.data)}`);
        } else {
            console.error(`   Error Details: ${error.stack}`);
        }
    }
}

async function testGetJobRecommendations() {
    console.log("\n--- Testing getJobRecommendations ---");
    try {
        const startTime = Date.now();
        // Pass the actual history and user message
        const result = await perplexitySearch.getJobRecommendations(sampleHistory, userMessage_recommend);
        const timeTaken = Date.now() - startTime;

        if (result && result.length > 50) { // Basic check for non-empty response
            console.log(`✅ SUCCESS: getJobRecommendations completed in ${timeTaken} ms.`);
            console.log(`   Sample result: "${result.substring(0, 80)}..."`);
            // Check if common headers are present
             if (result.includes("最適な職業") && result.includes("向いている業界")) {
                console.log("   Result contains expected sections.");
            } else {
                 console.warn("   ⚠️ WARN: Result might be missing expected sections (最適な職業, 向いている業界).");
            }
        } else {
            console.warn(`⚠️ WARN: getJobRecommendations returned short or null result in ${timeTaken} ms.`);
            console.log(`   Raw Result: ${result}`);
        }
    } catch (error) {
        console.error(`❌ FAILURE: Error in getJobRecommendations: ${error.message}`);
         if (error.response) {
            console.error(`   API Status: ${error.response.status}`);
            console.error(`   API Data: ${JSON.stringify(error.response.data)}`);
        } else {
            console.error(`   Error Details: ${error.stack}`);
        }
    }
}


async function testGeneralSearch() {
    console.log("\n--- Testing generalSearch ---");
    try {
        const startTime = Date.now();
        const result = await perplexitySearch.generalSearch(query_general);
        const timeTaken = Date.now() - startTime;

        if (result && result.length > 20 && !result.toLowerCase().includes("エラー") && !result.toLowerCase().includes("sorry")) { // Basic check
            console.log(`✅ SUCCESS: generalSearch completed in ${timeTaken} ms.`);
            console.log(`   Sample result: "${result.substring(0, 80)}..."`);
             if (result.includes("検索結果")) {
                 console.log("   Result contains expected section (検索結果).");
            } else {
                 console.warn("   ⚠️ WARN: Result might be missing expected section (検索結果).");
            }
        } else {
            console.warn(`⚠️ WARN: generalSearch returned short, null, or error message in ${timeTaken} ms.`);
            console.log(`   Raw Result: ${result}`);
        }
    } catch (error) {
        console.error(`❌ FAILURE: Error in generalSearch: ${error.message}`);
        if (error.response) {
            console.error(`   API Status: ${error.response.status}`);
            console.error(`   API Data: ${JSON.stringify(error.response.data)}`);
        } else {
            console.error(`   Error Details: ${error.stack}`);
        }
    }
}


// --- Main Execution Function ---
async function runPerplexityTests() {
    console.log("🚀 Starting Perplexity API Tests...");
    await testEnhanceKnowledge();
    await testGetJobTrends();
    await testGetJobRecommendations();
    await testGeneralSearch();
    console.log("\n🏁 Perplexity API Tests Finished.");
}

// --- Execute Tests ---
runPerplexityTests(); 