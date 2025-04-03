// test_fallback.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { OpenAI } = require('openai');
const { Anthropic } = require('@anthropic-ai/sdk');

// --- Simulate functions from server.js ---

// Simulate OpenAI Client (will fail without API Key)
let openai;
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'dummy_key_will_fail' && !process.env.OPENAI_API_KEY.startsWith('#')) { // Check if key is active
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.warn("Warning: OPENAI_API_KEY seems active. Fallback test might not trigger correctly.");
} else {
    console.log("OpenAI API Key is commented out or missing (as expected for this test).");
    // Create a dummy client that will likely fail requests
    openai = new OpenAI({ apiKey: 'dummy_key_will_fail' });
}

// Simulate Anthropic Client
let anthropic;
if (process.env.ANTHROPIC_API_KEY) {
    try {
        anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        console.log("Anthropic client initialized.");
    } catch (e) {
        console.error("Error initializing Anthropic client:", e.message)
        anthropic = null;
    }
} else {
    console.warn("Warning: ANTHROPIC_API_KEY not found in .env. Fallback test will likely fail.");
    anthropic = null; // Set to null if key is missing
}

// Simulate callPrimaryModel (simplified)
async function callPrimaryModel(gptOptions) {
    console.log("Attempting primary API call (OpenAI)...");
    if (!openai) throw new Error("OpenAI client not initialized.");
    try {
        // This call is expected to fail because the API key is invalid/missing
        const response = await openai.chat.completions.create(gptOptions);
        console.log("Primary API call successful (Unexpected for this test!).");
        return response.choices[0].message.content;
    } catch (error) {
        console.error("Primary API call failed (Expected):", error.message);
        // Simulate specific error types if needed, otherwise just throw
        throw error; // Propagate the error to trigger fallback
    }
}

// Simulate callClaudeModel (simplified)
async function callClaudeModel(messages) {
    console.log("Attempting backup API call (Claude)...");
    if (!anthropic) {
        console.error("Claude client not initialized (Missing or invalid ANTHROPIC_API_KEY). Cannot call backup.");
        throw new Error("Anthropic client not available");
    }
    try {
        const systemPrompt = messages.find(msg => msg.role === 'system')?.content || "";
        const userMessages = messages.filter(msg => msg.role !== 'system');

        const response = await anthropic.messages.create({
            model: "claude-3-opus-20240229", // Or another available Claude model
            max_tokens: 1024,
            system: systemPrompt,
            messages: userMessages,
        });
        console.log("Backup API call successful (Claude).");
        // Extract content based on Claude's response structure
        if (response.content && response.content.length > 0 && response.content[0].text) {
            return response.content[0].text;
        } else {
            console.error("Unexpected response structure from Claude:", response);
            throw new Error("Could not extract text from Claude response");
        }
    } catch (error) {
        console.error("Backup API call failed (Claude):", error.message);
         if (error.response) {
            console.error("Claude Error Status:", error.response.status);
            console.error("Claude Error Data:", error.response.data);
        } else if (error.status) { // Anthropic SDK might throw error with status directly
             console.error("Claude Error Status:", error.status);
        }
        throw error;
    }
}

// Simulate tryPrimaryThenBackup (simplified)
async function tryPrimaryThenBackup(gptOptions) {
    try {
        const result = await callPrimaryModel(gptOptions);
        return { result: result, source: 'primary' };
    } catch (primaryError) {
        console.log("Primary API failed, attempting fallback...");
        // Check if ANTHROPIC_API_KEY exists AND client was initialized
        if (process.env.ANTHROPIC_API_KEY && anthropic) { 
            try {
                // Prepare messages for Claude (map from OpenAI format if needed)
                const claudeMessages = gptOptions.messages; // Assuming format is similar enough for test
                const backupResult = await callClaudeModel(claudeMessages);
                return { result: backupResult, source: 'backup' };
            } catch (backupError) {
                console.error("Fallback API (Claude) also failed.");
                throw backupError; // Throw the backup error if it fails too
            }
        } else {
            console.error("ANTHROPIC_API_KEY not set or client init failed. Cannot use fallback.");
            // Throw the original primary error if no backup key/client is available
            throw primaryError;
        }
    }
}

// --- Test Execution ---
async function runFallbackTest() {
    console.log("\n--- Starting Fallback Test ---");
    const testGptOptions = {
        model: 'gpt-4o', // The model doesn't matter much as the call should fail
        messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello! This is a fallback test.' }
        ],
        temperature: 0.7,
    };

    try {
        const response = await tryPrimaryThenBackup(testGptOptions);
        console.log("\n--- Test Result ---");
        if (response.source === 'backup') {
            console.log("SUCCESS: Fallback to Claude API worked!");
            console.log("Response from Claude:", response.result);
        } else if (response.source === 'primary') {
            console.error("FAILURE: Primary OpenAI API call succeeded unexpectedly (API key might still be active or check test logic?).");
            console.log("Response from OpenAI:", response.result);
        } else {
             console.error("FAILURE: Unknown response source.");
             console.log("Response:", response);
        }
    } catch (error) {
        console.error("\n--- Test Failed Overall ---");
        console.error("Both primary and backup APIs seem to have failed, or no valid backup key/client was available.");
        // Log the final error that caused the failure
        console.error("Final Error:", error.message || error)
    }
}

runFallbackTest(); 