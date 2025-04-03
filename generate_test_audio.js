// generate_test_audio.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') }); // Load .env from this directory
const fs = require('fs');

// Require the exported instance from audioHandler.js
try {
  const audioHandler = require('./audioHandler.js');

  const textToSynthesize = "こんにちは、音声認識のテストです。";
  const outputFileName = "test_audio_input.mp3";
  const dummyUserId = "test-generate-audio-user";

  async function generateAudio() {
    console.log(`Generating test audio file with text: "${textToSynthesize}"`);

    if (!process.env.OPENAI_API_KEY) {
      console.error("Error: OPENAI_API_KEY not found in .env file.");
      return null;
    }

    try {
      const result = await audioHandler.synthesizeSpeech(textToSynthesize, dummyUserId);

      if (result && result.filePath && result.buffer) {
        // Rename the generated file to a fixed name for easier testing
        const generatedPath = result.filePath;
        // Ensure the temp directory exists (audioHandler constructor should create it)
        const tempDir = path.dirname(generatedPath);
        const outputPath = path.join(tempDir, outputFileName);

        // Check if the original file exists before renaming
         if (fs.existsSync(generatedPath)) {
             // Rename (overwrite if exists)
             fs.renameSync(generatedPath, outputPath);
             console.log(`SUCCESS: Test audio file generated and saved as: ${outputPath}`);
             return outputPath;
         } else {
             console.error(`Error: TTS generated a path (${generatedPath}), but the file does not exist.`);
             // Attempt to write buffer directly as fallback
             try {
                 fs.writeFileSync(outputPath, result.buffer);
                 console.log(`Fallback SUCCESS: Test audio file written directly to: ${outputPath}`);
                 return outputPath;
             } catch (writeErr) {
                 console.error(`Fallback FAILED: Could not write buffer to ${outputPath}`, writeErr);
                 return null;
             }
         }
      } else {
        console.error("Error: Failed to synthesize speech. Result:", result);
        return null;
      }
    } catch (error) {
      console.error("Error during audio generation:", error);
      return null;
    }
  }

  generateAudio();

} catch (error) {
  console.error("Error requiring audioHandler.js:", error);
  process.exit(1);
} 