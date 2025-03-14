# LINE OpenAI Voice Chat

A Node.js application for integrating LINE messaging with OpenAI's API.

## Recent Updates

### March 2025 Updates
- Implemented new "ML Beta" system powered by TensorFlow.js for advanced pattern analysis
- Enhanced machine learning data storage with historical tracking (no overwriting, preserving user trait evolution)
- Added detailed pattern information to analysis data for improved transparency and debugging
- Increased conversation history analysis from 20 to 200 messages for more accurate user profiling
- Optimized date formatting for Airtable compatibility (MM/DD/YYYY format)
- Improved conversation history retrieval logic for better context understanding
- Added comprehensive logging system for machine learning operations and diagnostics

### May 2024 Updates
- Added LLM-powered X sharing feature with contextual understanding for improved user engagement
- Enhanced trigger detection for social sharing with two-phase verification (simple keyword detection + LLM analysis)
- Improved sharing message UX with clearer guidance and personalized emoji support
- Added robust fallback mechanism for API failures in sharing functionality
- Optimized performance with lightweight GPT-4o-mini model and smart caching
- Enhanced service recommendation system with pure LLM-based context understanding (without trigger words)
- Optimized webhook processing to avoid Heroku timeout issues by implementing immediate response and background processing
- Extended timeout settings to 120 seconds for handling long-running tasks without interruption

### Mar 2024 Updates
- Fixed conversation context extraction and preference command handling
- Added TensorFlow.js optimization and fallback mechanism
- Added Airtable ServiceRecommendations table creation script
- Improved error handling and documentation
- Fixed confidence threshold inconsistencies in ServiceRecommender
- Corrected API parameter ordering in ML integration modules
- Enhanced database connection error handling
- Optimized user preference feedback patterns
- Added comprehensive .gitignore for backup and temporary files
- Enhanced security with input validation, rate limiting, and CSRF protection

## Security Features

This application includes the following security features:

1. **Helmet Security Headers**: Strict CSP, HSTS, and XSS protection headers.
2. **Input Validation**: All user inputs are validated and sanitized.
3. **Rate Limiting**: API endpoints are protected against abuse with rate limiting.
4. **CSRF Protection**: Authenticated routes are protected from CSRF attacks.
5. **XSS Protection**: Input is cleaned and sanitized to prevent XSS attacks.
6. **Environment Variable Validation**: Required environment variables are validated at startup.
7. **JSON Payload Size Limiting**: Prevents large payload attacks.
8. **Database Connection Security**: Secure handling of database credentials and connections.

## Installation

1. Clone this repository
2. Install dependencies:
```
npm install
```

## Configuration

Create a `.env` file with the following variables:

```
# LINE Messaging API
LINE_CHANNEL_SECRET=your_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=your_access_token

# OpenAI API
OPENAI_API_KEY=your_openai_api_key

# Anthropic API (optional)
ANTHROPIC_API_KEY=your_anthropic_api_key

# Perplexity API (optional, for career mode)
PERPLEXITY_API_KEY=your_perplexity_api_key

# Database (PostgreSQL)
DATABASE_URL=your_database_url
# Or individual connection parameters:
DB_HOST=localhost
DB_USER=username
DB_PASSWORD=password
DB_DATABASE=database_name
DB_PORT=5432
DB_SSL=false

# Airtable (optional)
AIRTABLE_API_KEY=your_airtable_api_key
AIRTABLE_BASE_ID=your_airtable_base_id

# Debug mode (optional)
DEBUG_MODE=false
```

## Scripts

### Main Application
- `npm start` - Start the production server
- `npm run dev` - Start development server with auto-reload

### Utility Scripts
- `node scripts/optional-install.js` - Attempt to install TensorFlow.js Node.js backend
- `node scripts/airtable-setup.js` - Check/create the ServiceRecommendations table in Airtable

## Known Issues and Workarounds

### TensorFlow.js Performance

The application uses TensorFlow.js for machine learning features. For optimal performance, the Node.js backend is recommended but not required. The application will automatically attempt to use the Node.js backend if available, or fall back to the JavaScript implementation.

If you see TensorFlow performance warnings, you can:
1. Try installing the Node.js backend manually: `npm install @tensorflow/tfjs-node`
2. If installation fails, the application will still work fine with slightly reduced ML performance

### Airtable ServiceRecommendations

The application uses Airtable to store service recommendation data. If the table doesn't exist or the API key doesn't have the right permissions, the application will fall back to local storage.

To fix this:
1. Make sure your Airtable API key has the right permissions
2. Run `node scripts/airtable-setup.js` to check/create the table
3. Or create the table manually in the Airtable UI

See `scripts/readme.md` for more detailed instructions.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

# Service Recommendation System Improvements

This document provides instructions for improving the service recommendation system to:

1. Only show service recommendations for explicit advice requests
2. Respect service-specific cooldown periods

## Changes Required

### 1. Update the `detectAdviceRequest` function in `server.js`

Find the `detectAdviceRequest` function in `server.js` and replace it with the following:

```javascript
function detectAdviceRequest(userMessage, history) {
  if (!userMessage) return false;
  
  // Explicit advice request patterns - ONLY these patterns should return true
  const explicitAdvicePatterns = [
    'アドバイスください', 'アドバイス下さい', 'アドバイスをください',
    'アドバイスが欲しい', 'アドバイスをお願い', '助言ください',
    'おすすめを教えて', 'サービスを教えて', 'サービスある'
  ];
  
  // Check for explicit advice requests ONLY
  for (const pattern of explicitAdvicePatterns) {
    if (userMessage.includes(pattern)) {
      console.log(`Explicit advice request detected: "${pattern}"`);
      return true;
    }
  }
  
  // No explicit advice request found
  console.log('No explicit advice request detected');
  return false;
}
```

### 2. Update the service recommendation trigger in `server.js`

Find the following code in the `processWithAI` function:

```javascript
// Get service recommendations only if user preferences allow it
let serviceRecommendationsPromise = Promise.resolve([]);
if (userPrefs.showServiceRecommendations) {
  // Enhance conversationContext with the latest user message
```

Replace it with:

```javascript
// Get service recommendations only if user preferences allow it AND user explicitly asked for advice
let serviceRecommendationsPromise = Promise.resolve([]);
if (userPrefs.showServiceRecommendations && detectAdviceRequest(userMessage, history)) {
  // Enhance conversationContext with the latest user message
```

### 3. Update the `wasRecentlyRecommended` method in `serviceRecommender.js`

Find the `wasRecentlyRecommended` method in `serviceRecommender.js` and replace it with:

```javascript
// Check if service was recently recommended to user
async wasRecentlyRecommended(userId, serviceId) {
  try {
    // Get service-specific cooldown period
    const serviceData = this.services.find(s => s.id === serviceId);
    const serviceCooldownDays = serviceData && serviceData.cooldown_days 
      ? serviceData.cooldown_days 
      : DEFAULT_COOLDOWN_DAYS;
    
    console.log(`Checking if service ${serviceId} was recently recommended to user ${userId} (cooldown: ${serviceCooldownDays} days)`);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - serviceCooldownDays);
    const cutoffDateString = cutoffDate.toISOString();
    
    // Check Airtable if available
    if (this.tableExists) {
      const records = await this.airtableBase(this.RECOMMENDATIONS_TABLE)
        .select({
          filterByFormula: `AND({UserID} = '${userId}', {ServiceID} = '${serviceId}', {Timestamp} > '${cutoffDateString}')`,
          maxRecords: 1
        })
        .firstPage();
      
      const wasRecent = records.length > 0;
      if (wasRecent) {
        console.log(`Service ${serviceId} was recommended to user ${userId} within the cooldown period of ${serviceCooldownDays} days`);
      }
      return wasRecent;
    } else {
      // Use local storage as fallback
      const wasRecent = this.localRecommendations.some(rec => 
        rec.userId === userId && 
        rec.serviceId === serviceId && 
        rec.timestamp > cutoffDateString
      );
      
      if (wasRecent) {
        console.log(`Service ${serviceId} was recommended to user ${userId} within the cooldown period of ${serviceCooldownDays} days`);
      }
      return wasRecent;
    }
  } catch (error) {
    console.error('Error checking recent recommendations:', error);
    return false; // Assume not recently recommended if there's an error
  }
}
```

## After Making Changes

After making these changes:

1. Test the application to ensure it only shows service recommendations when a user explicitly asks for advice using one of the specified patterns.
2. Verify that the service-specific cooldown periods are respected.
3. Commit the changes and deploy to Heroku.

## Benefits of These Changes

1. **More Precise Advice Detection**: By only showing service recommendations for explicit advice requests, we avoid showing recommendations when the user is not actually seeking advice.
2. **Improved User Experience**: Users will only see service recommendations when they explicitly ask for them, making the experience less intrusive.
3. **Service-Specific Cooldowns**: Different services can have different cooldown periods, allowing for more fine-grained control over how often a service is recommended to a user. 