# Change Log

## 2024-05-13

### Fixed Reference Error in Feedback Processing

#### Changes Made:
1. **server.js**:
   - Fixed `ReferenceError: FEEDBACK_PATTERNS is not defined` error in `handleText` function
   - Added local declaration of `FEEDBACK_PATTERNS` variable with positive and negative feedback patterns
   - This ensures the sentiment detection for user feedback works properly

#### Reason for Change:
The application was throwing a reference error when processing text messages containing feedback. The variable `FEEDBACK_PATTERNS` was being used in the `handleText` function but wasn't defined in its scope. Adding the definition resolves the error and ensures proper feedback processing.

## 2024-05-30

### Updated X Sharing Feature to use GPT-4o-mini model

#### Changes Made:
1. **server.js**: 
   - Changed the model used in `checkEngagementWithLLM` function from "gpt-3.5-turbo" to "gpt-4o-mini"
   - This change improves the contextual understanding for the X sharing feature

2. **README.md**:
   - Updated the May 2024 Updates section to reflect the use of GPT-4o-mini model instead of GPT-3.5-turbo

3. **ENHANCED_FEATURES_DOCUMENTATION.md**:
   - Updated the LLM-Powered X Sharing Feature section to reference GPT-4o-mini model
   - Changed all mentions of GPT-3.5-turbo to GPT-4o-mini in the technical details section

4. **USER_MANUAL.md**:
   - Updated the Technical Improvements section to specify that the X sharing feature uses GPT-4o-mini model

5. **USER_MANUAL_JA.md**:
   - Updated the Technical Improvements section (技術的改良点) to specify that the X sharing feature uses GPT-4o-mini model

#### Reason for Change:
The GPT-4o-mini model provides better performance and more accurate contextual understanding for the X sharing feature, while still maintaining good efficiency. This change ensures that the system uses the most appropriate model for detecting user engagement and sharing intent.

## 2024-05-31

### Enhanced Service Recommendation Trigger System with LLM Context Understanding

#### Changes Made:
1. **server.js**:
   - Modified `detectAdviceRequest` function to use LLM context understanding instead of trigger words
   - Added new `detectAdviceRequestWithLLM` function using GPT-4o-mini model
   - Updated related functions to work with async/await for the LLM-based detection
   - Made `shouldShowServicesToday` an async function

#### Reason for Change:
Removed explicit trigger word detection in favor of more intelligent contextual understanding using LLM. This allows the system to recommend services when the user is implicitly asking for help or advice, not just when they use specific trigger words. The GPT-4o-mini model can better understand user intent and provide more relevant service recommendations. 