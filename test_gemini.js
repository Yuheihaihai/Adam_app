const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Import the instance of EnhancedCharacteristicsAnalyzer
const analyzer = require('./enhancedCharacteristicsAnalyzer');

// --- Test Data ---
// Sample conversation history (short enough to not require Gemini in normal flow, but good for direct test)
const sampleHistoryData = {
    history: [
        { role: 'user', content: 'こんにちは、最近仕事で悩んでいて。' },
        { role: 'assistant', content: 'こんにちは。どのようなことでお悩みですか？詳しくお聞かせください。' },
        { role: 'user', content: '今の仕事が自分に向いているのか分からなくて。もっと創造的なことがしたいんです。' },
        { role: 'assistant', content: 'なるほど、創造性を活かせるお仕事に関心がおありなのですね。具体的にどのようなことに興味がありますか？' },
        { role: 'user', content: 'デザインとか、文章を書くこととか。でも未経験だし、自信がないんです。' }
    ]
};

// --- Test Function ---
async function runGeminiTest() {
    console.log("\n--- Starting Gemini API Test (via EnhancedCharacteristicsAnalyzer) ---");

    // Check if Gemini is enabled in the analyzer instance
    if (!analyzer.geminiEnabled) {
        console.error("FAILURE: Gemini is not enabled in the analyzer. Check GEMINI_API_KEY.");
        return; // Stop the test if Gemini isn't enabled
    }
    console.log("Analyzer reports Gemini is enabled.");

    // Directly call the _analyzeWithGemini method for testing
    // NOTE: This bypasses the token limit check in analyzeUserCharacteristics
    console.log("\nDirectly calling _analyzeWithGemini...");
    try {
        const startTime = Date.now();
        // Use .call(analyzer, ...) to ensure 'this' context is correct when calling private-like method
        const result = await analyzer._analyzeWithGemini.call(analyzer, sampleHistoryData);
        const timeTaken = Date.now() - startTime;

        console.log(`SUCCESS: _analyzeWithGemini call completed in ${timeTaken} ms.`);

        // Validate the structure of the result (should be a JSON object)
        if (result && typeof result === 'object' && !result.error) {
            console.log("Result structure looks valid (object received).");
            // Check for expected top-level keys
            const expectedKeys = ['communication', 'thinking', 'social', 'emotional'];
            const receivedKeys = Object.keys(result);
            const hasAllKeys = expectedKeys.every(key => receivedKeys.includes(key));

            if (hasAllKeys) {
                console.log("SUCCESS: Received structured data contains expected keys:", receivedKeys.join(', '));
            } else {
                console.warn("WARN: Received object might be missing some expected keys.", receivedKeys);
            }
            // You could add more detailed checks here if needed
            // console.log("Received data:", JSON.stringify(result, null, 2));

        } else if (result && result.error === 'json_parse_error') {
             console.error("FAILURE: Gemini responded, but failed to parse JSON from the response.");
             console.error("Raw text received:", result.raw_text);
        } else {
            console.error("FAILURE: Unexpected result format received from _analyzeWithGemini:", result);
        }

    } catch (error) {
        console.error("FAILURE: Error calling _analyzeWithGemini:");
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", error.response.data);
        } else if (error.message && error.message.includes('FetchError')) {
             console.error("FetchError details:", error); // Log details for network issues
        } else {
             console.error("Error:", error.message);
        }
         console.error("Please ensure GEMINI_API_KEY is valid and the API is accessible.");
    }

    console.log("\n--- Gemini API Test Finished ---");
}

// --- Execute Test ---
runGeminiTest(); 