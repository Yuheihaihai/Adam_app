# Utility Scripts

This directory contains utility scripts for setup and maintenance of the application.

## TensorFlow.js Node.js Backend

### optional-install.js
This script attempts to install the TensorFlow.js Node.js backend which provides better performance for machine learning operations. If the installation fails, the application will continue to work using the JavaScript implementation.

**Usage:**
```
node scripts/optional-install.js
```

The script runs automatically during `npm install` as a post-install step.

## Airtable Setup

### airtable-setup.js
This script checks if the ServiceRecommendations table exists in your Airtable base and creates it if necessary.

**Requirements:**
- Environment variables or .env file with:
  - `AIRTABLE_API_KEY` - Your Airtable Personal Access Token
  - `AIRTABLE_BASE_ID` - Your Airtable Base ID

**Usage:**
```
node scripts/airtable-setup.js
```

**Permissions required:**
- To check if table exists: `schema.bases:read` scope
- To create table: `schema.bases:write` scope

If you don't have these permissions, you can create the table manually in the Airtable UI with these fields:
- UserID (Single line text)
- ServiceID (Single line text)
- Timestamp (Date/Time)

## Instructions for fixing common issues

### TensorFlow.js Performance Warning
If you see a warning about TensorFlow.js performance, you can:

1. Try installing the Node.js backend manually:
   ```
   npm install @tensorflow/tfjs-node
   ```

2. If installation fails, don't worry. The application will still work fine using the JavaScript implementation.

### ServiceRecommendations Table Access
If you see "Using local storage fallback" for service recommendations:

1. Make sure your Airtable API key has the right permissions
2. Run the setup script:
   ```
   node scripts/airtable-setup.js
   ```
3. Or create the table manually in the Airtable UI 