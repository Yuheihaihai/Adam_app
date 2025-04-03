// test_whisper.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const fs = require('fs');

// Require the exported instance from audioHandler.js
try {
  const audioHandler = require('./audioHandler.js');

  // Path to the test audio file generated previously
  const audioFilePath = path.join(__dirname, 'temp', 'test_audio_input.mp3');
  const dummyUserId = "test-whisper-user-001";
  const expectedText = "こんにちは、音声認識のテストです。"; // Expected transcription

  async function runWhisperTest() {
    console.log(`Testing Whisper API with audio file: ${audioFilePath}`);

    if (!process.env.OPENAI_API_KEY) {
      console.error("Error: OPENAI_API_KEY not found in .env file.");
      return;
    }

    if (!fs.existsSync(audioFilePath)) {
        console.error(`Error: Test audio file not found at ${audioFilePath}`);
        console.error("Please run generate_test_audio.js first.");
        return;
    }

    try {
      // Read the audio file into a buffer
      const audioBuffer = fs.readFileSync(audioFilePath);

      // Call transcribeAudio (which should use _transcribeWithWhisper)
      // Pass userId for limit checking, though it might be checked elsewhere too
      const result = await audioHandler.transcribeAudio(audioBuffer, dummyUserId);

      console.log("Transcription Result:", result);

      if (result && result.text) {
        console.log(`\nTranscribed Text: "${result.text}"`);
        // Simple comparison (case-insensitive, ignoring punctuation for robustness)
        const formatText = (text) => text.toLowerCase().replace(/[、。？！「」.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").replace(/\s/g,'');
        if (formatText(result.text) === formatText(expectedText)) {
            console.log("\nSUCCESS: Transcription matches expected text!");
        } else {
            console.error("\nFAILURE: Transcription does not match expected text.");
            console.error(`Expected: "${expectedText}"`);
            console.error(`Received: "${result.text}"`);
        }
      } else if (result && result.limitExceeded) {
          console.error("\nFAILURE: Transcription failed due to rate limit.");
          console.error(result.limitMessage);
      }
       else {
        console.error("\nFAILURE: Transcription failed. No text returned or error occurred.");
      }
    } catch (error) {
      console.error("\nError during Whisper test:", error);
    }
  }

  runWhisperTest();

} catch (error) {
  console.error("Error requiring audioHandler.js:", error);
  process.exit(1);
} 