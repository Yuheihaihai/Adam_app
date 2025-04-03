// test_dalle.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { OpenAI } = require('openai'); // Directly use OpenAI library

// Initialize OpenAI client here for the test
let openai;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("OpenAI client initialized for DALL-E test.");
} else {
    console.error("Error: OPENAI_API_KEY not found in .env file!");
    process.exit(1);
}

// Simplified function to call DALL-E API
async function testGenerateImageApi(prompt) {
    console.log(`Testing DALL-E API with prompt: "${prompt}"`);
    try {
        // Directly call the OpenAI images.generate function
        const response = await openai.images.generate({
            model: "dall-e-3",      // Use DALL-E 3
            prompt: prompt,
            n: 1,                   // Generate 1 image
            size: "1024x1024",      // Specify size
            quality: "standard",    // standard or hd
            response_format: "url"  // Get URL back
        });

        if (response.data && response.data[0] && response.data[0].url) {
            const imageUrl = response.data[0].url;
            console.log("\nSUCCESS: Image generated successfully!");
            console.log("Image URL:", imageUrl);
            // Optionally, add revised_prompt if needed
             if (response.data[0].revised_prompt) {
                 console.log("Revised Prompt:", response.data[0].revised_prompt);
             }
            return imageUrl;
        } else {
            console.error("\nFAILURE: Image generation failed. Response format unexpected.");
            console.error("Response:", response);
            return null;
        }
    } catch (error) {
        console.error("\nFAILURE: Error calling DALL-E API:");
        if (error.response) {
            // Log detailed error response from OpenAI if available
            console.error("Status:", error.response.status);
            console.error("Data:", error.response.data);
        } else {
            console.error("Error:", error.message);
        }
        return null;
    }
}

// --- Test Execution ---
const testPrompt = "A cute cat wearing sunglasses, digital art style.";
testGenerateImageApi(testPrompt); 