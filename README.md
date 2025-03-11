# LINE OpenAI Voice Chat

A Node.js application for integrating LINE messaging with OpenAI's API.

## Recent Updates

### Mar 2024 Updates
- Fixed conversation context extraction and preference command handling
- Added TensorFlow.js optimization and fallback mechanism
- Added Airtable ServiceRecommendations table creation script
- Improved error handling and documentation

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

# Airtable (optional)
AIRTABLE_API_KEY=your_airtable_api_key
AIRTABLE_BASE_ID=your_airtable_base_id
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