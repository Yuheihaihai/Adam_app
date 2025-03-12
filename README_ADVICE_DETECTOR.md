# Advice Detector Module

## Overview

The Advice Detector module is designed to improve the accuracy of detecting advice requests in user messages. It uses a combination of pattern matching and confidence scoring to determine whether a message contains a request for advice.

## Files Created

1. **advice_patterns.js**: Contains various patterns for detecting advice requests, categorized into:
   - Polite advice patterns
   - Casual advice patterns
   - Problem patterns
   - Question words
   - Explicit advice patterns

2. **adviceDetector.js**: The main module that provides functions for detecting advice requests:
   - `isAdviceRequest(message)`: Determines if a message contains an advice request
   - `getAdviceRequestConfidence(message)`: Calculates a confidence score for an advice request
   - `extractAdvicePatterns(message)`: Extracts the specific patterns found in a message

3. **adviceDetectorDemo.js**: A demonstration of how to use the adviceDetector module with the `shouldShowServicesToday` function.

4. **server_js_patch.md**: Instructions for integrating the adviceDetector module with the existing `server.js` file.

## Integration with Service Recommendations

The adviceDetector module is designed to be integrated with the service recommendation system in `server.js`. The main integration point is the `shouldShowServicesToday` function, which determines whether to show service recommendations based on user interactions and preferences.

### How to Integrate

1. Add the import at the top of `server.js`:
   ```javascript
   const adviceDetector = require('./adviceDetector');
   ```

2. Update the `shouldShowServicesToday` function to use the adviceDetector module:
   - Replace the explicit advice patterns check with `adviceDetector.isAdviceRequest()`
   - Use `adviceDetector.extractAdvicePatterns()` to get detailed pattern matches
   - Use `adviceDetector.getAdviceRequestConfidence()` to get a confidence score

3. Keep the existing timing and frequency logic to ensure that service recommendations are not shown too frequently.

4. Test thoroughly to ensure the integration works as expected.

## Benefits

1. **More accurate detection**: The module uses multiple categories of patterns to detect advice requests, including polite expressions, casual expressions, problem statements, and question words.

2. **Confidence scoring**: The module provides a confidence score for each advice request, allowing for more nuanced decision-making.

3. **Detailed pattern extraction**: The module can extract the specific patterns found in a message, which can be useful for debugging and analytics.

4. **Centralized logic**: The advice detection logic is centralized in a single module, making it easier to maintain and extend.

5. **Reusable**: The module can be reused across the application for other features that need to detect advice requests.

## Testing

The module has been tested with various types of messages, including:
- Explicit advice requests in Japanese
- Polite advice requests
- Casual advice requests
- Problem statements combined with question words
- Non-advice messages

All tests have passed, confirming that the module correctly identifies advice requests and calculates appropriate confidence scores.

## Next Steps

1. **Integration**: Integrate the adviceDetector module with the `server.js` file as described in the patch file.

2. **Monitoring**: Monitor the performance of the adviceDetector in production to ensure it's correctly identifying advice requests.

3. **Refinement**: Refine the patterns and confidence scoring based on real-world usage data.

4. **Extension**: Consider extending the module to support additional languages or more nuanced advice request patterns. 