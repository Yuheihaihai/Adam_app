// test_embedding.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const EmbeddingService = require('./embeddingService'); // Import the class

// --- Test Data ---
const textPairs = [
  {
    text1: "今日の天気は晴れです。",
    text2: "良い天気ですね。",
    description: "Similar meaning (weather)"
  },
  {
    text1: "猫が窓辺で昼寝をしている。",
    text2: "犬が公園でボールを追いかけている。",
    description: "Different animals, different actions"
  },
  {
    text1: "このリンゴは甘くて美味しい。",
    text2: "このリンゴは甘くて美味しい。",
    description: "Identical sentences"
  },
  {
    text1: "AI技術の進化は目覚ましい。",
    text2: "冷蔵庫に牛乳を買いに行かないと。",
    description: "Completely unrelated topics"
  }
];

// --- Test Function ---
async function runEmbeddingTest() {
    console.log("\n--- Starting Embedding API Test ---");

    // Initialize Embedding Service
    const embeddingService = new EmbeddingService();
    const initialized = await embeddingService.initialize();

    if (!initialized) {
        console.error("FAILURE: Embedding Service initialization failed. Check OPENAI_API_KEY.");
        return; // Stop the test if initialization fails
    }

    console.log("Embedding Service initialized successfully.");

    // Test similarity for each pair
    for (const pair of textPairs) {
        console.log(`\nTesting pair: ${pair.description}`);
        console.log(`  Text 1: "${pair.text1}"`);
        console.log(`  Text 2: "${pair.text2}"`);

        try {
            const startTime = Date.now();
            const similarity = await embeddingService.getTextSimilarity(pair.text1, pair.text2);
            const timeTaken = Date.now() - startTime;

            console.log(`  SUCCESS: Similarity calculated in ${timeTaken} ms.`);
            // Similarity score should be between -1 and 1. Closer to 1 means more similar.
            console.log(`  Similarity Score: ${similarity.toFixed(4)}`);

            // Basic check based on description
            if (pair.description.includes("Similar") || pair.description.includes("Identical")) {
                if (similarity < 0.5) console.warn(`  WARN: Expected high similarity, but score is low.`);
            } else if (pair.description.includes("Different") || pair.description.includes("unrelated")) {
                if (similarity > 0.6) console.warn(`  WARN: Expected low similarity, but score is high.`);
            }

        } catch (error) {
            console.error(`  FAILURE: Error calculating similarity for pair "${pair.description}":`);
             if (error.response) {
                console.error("  Status:", error.response.status);
                console.error("  Data:", error.response.data);
            } else {
                console.error("  Error:", error.message);
            }
        }
    }

    console.log("\n--- Embedding API Test Finished ---");
}

// --- Execute Test ---
runEmbeddingTest(); 