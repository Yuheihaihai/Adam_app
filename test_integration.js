require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { OpenAI } = require('openai');
const { Anthropic } = require('@anthropic-ai/sdk');
const PerplexitySearch = require('./perplexitySearch');
const imageGenerator = require('./imageGenerator'); // Might not be used directly if we call OpenAI
const enhancedCharacteristics = require('./enhancedCharacteristicsAnalyzer');
const Airtable = require('airtable');

// --- Service Initialization and Checks ---
let openai, anthropic, perplexity, geminiAnalyzer, airtableBase;
let configStatus = {
    openai: false, dalle: false, anthropic: false, perplexity: false, gemini: false, airtable: false
};

if (process.env.OPENAI_API_KEY) {
    try {
        openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        console.log("✅ OpenAI client initialized.");
        configStatus.openai = true;
        // DALL-E uses the OpenAI key
        configStatus.dalle = true;
        console.log("✅ DALL-E (via OpenAI key) configured.");
    } catch (error) {
        console.error("❌ OpenAI initialization failed:", error.message);
    }
} else {
    console.warn("⚠️ OpenAI API Key missing.");
}

if (process.env.ANTHROPIC_API_KEY) {
    try {
        anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        console.log("✅ Anthropic client initialized.");
        configStatus.anthropic = true;
    } catch (error) {
        console.error("❌ Anthropic initialization failed:", error.message);
    }
} else {
    console.warn("⚠️ Anthropic API Key missing.");
}

if (process.env.PERPLEXITY_API_KEY) {
    try {
        perplexity = new PerplexitySearch(process.env.PERPLEXITY_API_KEY);
        console.log("✅ PerplexitySearch initialized.");
        configStatus.perplexity = true;
    } catch (error) {
        console.error("❌ PerplexitySearch initialization failed:", error.message);
    }
} else {
    console.warn("⚠️ Perplexity API Key missing.");
}

if (process.env.GEMINI_API_KEY) {
    try {
        // enhancedCharacteristicsAnalyzer initializes Gemini internally based on env var
        if (enhancedCharacteristics.isGeminiEnabled()) {
             console.log("✅ Gemini (via EnhancedCharacteristicsAnalyzer) configured and enabled.");
             geminiAnalyzer = enhancedCharacteristics; // Use the imported instance
             configStatus.gemini = true;
        } else {
             console.warn("⚠️ Gemini API Key present, but Analyzer reports disabled.");
        }
    } catch (error) {
        console.error("❌ Gemini/EnhancedCharacteristicsAnalyzer setup failed:", error.message);
    }
} else {
    console.warn("⚠️ Gemini API Key missing.");
}

if (process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
    try {
        airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
        // Quick check if base object seems valid
        if (airtableBase && airtableBase.getId()) {
             console.log(`✅ Airtable configured (Base ID: ${airtableBase.getId()}).`);
             configStatus.airtable = true;
        } else {
             throw new Error("Airtable base initialization returned invalid object.")
        }
    } catch (error) {
        console.error("❌ Airtable initialization failed:", error.message);
    }
} else {
    console.warn("⚠️ Airtable API Key or Base ID missing.");
}


// --- Test Data ---
const sampleHistory = [
    { role: 'user', content: 'こんにちは' }, { role: 'assistant', content: 'こんにちは' }
];
const userMessageGeneral = "今日の天気は？";
const userMessageCareer = "今の仕事向いてるかな";
const userMessageTrend = "IT業界の求人トレンド教えて";
const userMessageRecommend = "私におすすめの職業は？";
const userMessageSearch = "量子コンピュータの仕組みは？";
const userMessageImage = "かわいい犬の画像";
const userMessageFallback = "フォールバックテストメッセージ";

// --- Test Functions ---

async function testOpenAICall() {
    console.log("\n--- 1. Testing Basic OpenAI Call ---");
    if (!configStatus.openai) { console.log("SKIPPED: OpenAI not configured."); return; }
    try {
        const startTime = Date.now();
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Use a faster/cheaper model for testing
            messages: [{ role: "user", content: userMessageGeneral }],
            max_tokens: 50
        });
        const timeTaken = Date.now() - startTime;
        if (response.choices && response.choices[0].message) {
            console.log(`✅ SUCCESS: OpenAI responded in ${timeTaken} ms.`);
        } else {
            console.warn("⚠️ WARN: OpenAI call succeeded but response format unexpected.");
        }
    } catch (error) {
        console.error(`❌ FAILURE: OpenAI call failed: ${error.message}`);
    }
}

async function testPerplexityKnowledge() {
    console.log("\n--- 2a. Testing Perplexity enhanceKnowledge ---");
    if (!configStatus.perplexity) { console.log("SKIPPED: Perplexity not configured."); return; }
    try {
        const startTime = Date.now();
        const result = await perplexity.enhanceKnowledge(sampleHistory, userMessageCareer);
        const timeTaken = Date.now() - startTime;
        if (result) {
             console.log(`✅ SUCCESS: Perplexity enhanceKnowledge returned data in ${timeTaken} ms.`);
        } else {
             console.warn(`⚠️ WARN: Perplexity enhanceKnowledge returned null/empty in ${timeTaken} ms.`);
        }
    } catch (error) {
        console.error(`❌ FAILURE: Perplexity enhanceKnowledge failed: ${error.message}`);
    }
}

async function testPerplexityTrends() {
    console.log("\n--- 2b. Testing Perplexity getJobTrends ---");
    if (!configStatus.perplexity) { console.log("SKIPPED: Perplexity not configured."); return; }
    try {
        const startTime = Date.now();
        const result = await perplexity.getJobTrends(userMessageTrend);
        const timeTaken = Date.now() - startTime;
        if (result && result.analysis) {
             console.log(`✅ SUCCESS: Perplexity getJobTrends returned data in ${timeTaken} ms.`);
        } else {
             console.warn(`⚠️ WARN: Perplexity getJobTrends returned null/incomplete in ${timeTaken} ms.`);
             console.log(`   Raw Result: ${JSON.stringify(result)}`);
        }
    } catch (error) {
        console.error(`❌ FAILURE: Perplexity getJobTrends failed: ${error.message}`);
    }
}

async function testPerplexityRecommend() {
    console.log("\n--- 2c. Testing Perplexity getJobRecommendations ---");
    if (!configStatus.perplexity) { console.log("SKIPPED: Perplexity not configured."); return; }
    try {
        const startTime = Date.now();
        const result = await perplexity.getJobRecommendations(sampleHistory, userMessageRecommend);
        const timeTaken = Date.now() - startTime;
        if (result && result.length > 10) {
             console.log(`✅ SUCCESS: Perplexity getJobRecommendations returned data in ${timeTaken} ms.`);
        } else {
             console.warn(`⚠️ WARN: Perplexity getJobRecommendations returned short/null in ${timeTaken} ms.`);
        }
    } catch (error) {
        console.error(`❌ FAILURE: Perplexity getJobRecommendations failed: ${error.message}`);
    }
}

async function testPerplexityGeneral() {
    console.log("\n--- 2d. Testing Perplexity generalSearch ---");
    if (!configStatus.perplexity) { console.log("SKIPPED: Perplexity not configured."); return; }
    try {
        const startTime = Date.now();
        const result = await perplexity.generalSearch(userMessageSearch);
        const timeTaken = Date.now() - startTime;
        if (result && result.length > 10) {
             console.log(`✅ SUCCESS: Perplexity generalSearch returned data in ${timeTaken} ms.`);
        } else {
             console.warn(`⚠️ WARN: Perplexity generalSearch returned short/null in ${timeTaken} ms.`);
        }
    } catch (error) {
        console.error(`❌ FAILURE: Perplexity generalSearch failed: ${error.message}`);
    }
}

async function testDalleCall() {
    console.log("\n--- 3. Testing DALL-E Call ---");
    if (!configStatus.dalle || !openai) { console.log("SKIPPED: DALL-E / OpenAI not configured."); return; }
    try {
        const startTime = Date.now();
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: userMessageImage,
            n: 1,
            size: "1024x1024",
            quality: "standard" // Use standard for faster/cheaper testing
        });
        const timeTaken = Date.now() - startTime;
        if (response.data && response.data[0].url) {
            console.log(`✅ SUCCESS: DALL-E generated an image URL in ${timeTaken} ms.`);
            // console.log(`   URL: ${response.data[0].url}`); // Optional: log URL
        } else {
             console.warn("⚠️ WARN: DALL-E call succeeded but no URL found.");
        }
    } catch (error) {
        console.error(`❌ FAILURE: DALL-E call failed: ${error.message}`);
    }
}

async function testClaudeCall() {
    console.log("\n--- 4. Testing Claude Call (Simulating Fallback) ---");
    if (!configStatus.anthropic) { console.log("SKIPPED: Anthropic not configured."); return; }
    try {
        const startTime = Date.now();
        const response = await anthropic.messages.create({
            model: "claude-3-haiku-20240307", // Use a faster/cheaper model for testing
            max_tokens: 50,
            messages: [{ role: "user", content: userMessageFallback }],
        });
        const timeTaken = Date.now() - startTime;
        if (response.content && response.content[0].text) {
            console.log(`✅ SUCCESS: Direct Claude call successful in ${timeTaken} ms.`);
        } else {
             console.warn("⚠️ WARN: Claude call succeeded but response format unexpected.");
        }
    } catch (error) {
        console.error(`❌ FAILURE: Direct Claude call failed: ${error.message}`);
    }
}

async function testGeminiCall() {
    console.log("\n--- 5. Testing Gemini Analysis Call ---");
    if (!configStatus.gemini || !geminiAnalyzer) { console.log("SKIPPED: Gemini not configured or analyzer unavailable."); return; }
    try {
        const startTime = Date.now();
        // Use .call to set 'this' context for the method if needed
        const result = await geminiAnalyzer._analyzeWithGemini.call(geminiAnalyzer, sampleHistory);
        const timeTaken = Date.now() - startTime;
        if (result && typeof result === 'object' && result.communication) {
             console.log(`✅ SUCCESS: Gemini analysis call returned structured data in ${timeTaken} ms.`);
        } else {
            console.warn("⚠️ WARN: Gemini analysis call returned unexpected format:", JSON.stringify(result));
        }
    } catch (error) {
        console.error(`❌ FAILURE: Gemini analysis call failed: ${error.message}`);
         if (error.response) { // Log API error details if available
            console.error(`   API Status: ${error.response.status}`);
            console.error(`   API Data: ${JSON.stringify(error.response.data)}`);
        }
    }
}

async function testAirtableConnection() {
    console.log("\n--- 6. Testing Airtable Connection (Read Only) ---");
    if (!configStatus.airtable || !airtableBase) { console.log("SKIPPED: Airtable not configured."); return; }
    try {
        const startTime = Date.now();
        // Attempt a simple read operation to verify connection/permissions
        // Replace 'YourTableName' with an actual table name from the base
        // Use a known small table or limit results for speed
        const records = await airtableBase('Users').select({ maxRecords: 1, view: 'Grid view' }).firstPage();
        const timeTaken = Date.now() - startTime;
        console.log(`✅ SUCCESS: Airtable connection verified via read in ${timeTaken} ms (read ${records.length} record(s)).`);
    } catch (error) {
         // Provide more specific error feedback
        if (error.message.includes('NOT_FOUND')) {
             console.error(`❌ FAILURE: Airtable connection failed - Table/View 'Users'/'Grid view' not found or permission issue. Please check table/view names and API key permissions.`);
        } else if (error.statusCode === 401 || error.statusCode === 403) {
             console.error(`❌ FAILURE: Airtable connection failed - Authentication error (API Key invalid or insufficient permissions).`);
        } else {
             console.error(`❌ FAILURE: Airtable connection failed: ${error.message}`);
        }
    }
}

// --- Main Execution --- M
async function runIntegrationTests() {
    console.log("\n🚀 Starting Component Integration Tests...");
    console.log("--- Configuration Status ---");
    console.log(configStatus);
    console.log("---------------------------");

    await testOpenAICall();
    await testPerplexityKnowledge();
    await testPerplexityTrends();
    await testPerplexityRecommend();
    await testPerplexityGeneral();
    await testDalleCall();
    await testClaudeCall();
    await testGeminiCall();
    await testAirtableConnection();

    console.log("\n🏁 Component Integration Tests Finished.");
}

runIntegrationTests(); 