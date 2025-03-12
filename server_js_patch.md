# Patch for server.js to integrate adviceDetector

## Step 1: Add import at the top of the file

```javascript
// Import the advice detector module
const adviceDetector = require('./adviceDetector');
```

## Step 2: Update the shouldShowServicesToday function

Replace the current implementation of `shouldShowServicesToday` with this enhanced version:

```javascript
function shouldShowServicesToday(userId, history, userMessage) {
  // Check if user explicitly asks for advice using our new detector
  if (userMessage && adviceDetector.isAdviceRequest(userMessage)) {
    // Extract the specific patterns that matched
    const patterns = adviceDetector.extractAdvicePatterns(userMessage);
    
    // Log the detected patterns for debugging
    console.log('Advice request detected with patterns:', {
      explicit: patterns.explicit.length > 0 ? patterns.explicit : 'none',
      polite: patterns.polite.length > 0 ? patterns.polite : 'none',
      casual: patterns.casual.length > 0 ? patterns.casual : 'none'
    });
    
    // If explicit patterns were found, always show services
    if (patterns.explicit.length > 0) {
      console.log('Explicit advice request detected - showing services');
      return true;
    }
    
    // Get confidence score for the advice request
    const confidence = adviceDetector.getAdviceRequestConfidence(userMessage);
    console.log(`Advice request confidence: ${confidence}`);
    
    // If high confidence, show services
    if (confidence >= 0.7) {
      console.log('High confidence advice request detected - showing services');
      return true;
    }
  }
  
  try {
    // Use a shared function to get/set last service time
    const userPrefs = userPreferences.getUserPreferences(userId);
    const lastServiceTime = userPrefs.lastServiceTime || 0;
    const now = Date.now();
    
    // If user recently received service recommendations (within last 4 hours)
    if (lastServiceTime > 0 && now - lastServiceTime < 4 * 60 * 60 * 1000) {
      // Count total service recommendations today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      let servicesToday = 0;
      if (userPrefs.recentlyShownServices) {
        for (const timestamp in userPrefs.recentlyShownServices) {
          if (parseInt(timestamp) > todayStart.getTime()) {
            servicesToday += userPrefs.recentlyShownServices[timestamp].length;
          }
        }
      }
      
      // Limit to no more than 9 service recommendations per day
      if (servicesToday >= 9) {
        return false;
      }
      
      // If fewer than 5 service recommendations today, require a longer minimum gap
      if (servicesToday < 5 && now - lastServiceTime < 45 * 60 * 1000) {
        return false; // Less than 45 minutes since last recommendation
      }
      
      // General rule: Don't recommend more than once per 30 minutes
      return now - lastServiceTime >= 30 * 60 * 1000;
    }
    
    // If it's been more than 4 hours, allow recommendations
    return true;
  } catch (err) {
    console.error('Error in shouldShowServicesToday:', err);
    return true; // Default to showing if there's an error
  }
}
```

## Step 3: Update any code that checks for explicit advice requests

If there are other places in the code that check for explicit advice requests, consider updating them to use the adviceDetector module as well. For example:

```javascript
// Before:
const isExplicitAdviceRequest = explicitAdvicePatterns.some(pattern => userMessage.includes(pattern));

// After:
const isExplicitAdviceRequest = adviceDetector.isAdviceRequest(userMessage);
```

## Step 4: Testing

After making these changes, test the application thoroughly to ensure that:

1. Explicit advice requests are correctly identified
2. Polite and casual advice requests are detected with appropriate confidence
3. The frequency and timing constraints still work as expected
4. Service recommendations are shown at appropriate times

## Benefits of this integration

1. More accurate detection of advice requests using multiple pattern categories
2. Confidence scoring for better decision-making
3. Detailed pattern extraction for debugging and analytics
4. Centralized advice detection logic that can be reused across the application
5. Easier to maintain and extend with new patterns