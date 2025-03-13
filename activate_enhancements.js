/**
 * Enhanced Features Activation for Adam App
 * 
 * This script inserts a single line into the main server.js file to enable
 * the enhanced features without modifying the existing code structure.
 * This is done by looking for the serviceRecommender initialization and
 * adding a require statement for the enhanced features right after it.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const SERVER_FILE = 'server.js';
const TARGET_PATTERN = 'const serviceRecommender = new ServiceRecommender(base);';
const ENHANCEMENT_CODE = "\n// Load enhanced features\nrequire('./loadEnhancements')(serviceRecommender);";

// Main function
async function activateEnhancements() {
  console.log('Activating enhanced features...');
  
  try {
    // Check if server.js exists
    if (!fs.existsSync(SERVER_FILE)) {
      console.error(`ERROR: Server file ${SERVER_FILE} not found. Make sure you run this script from the project root.`);
      return false;
    }
    
    // Read server.js content
    const serverContent = fs.readFileSync(SERVER_FILE, 'utf8');
    
    // Check if the enhancement is already activated
    if (serverContent.includes("require('./loadEnhancements')")) {
      console.log('Enhancements are already activated in server.js');
      return true;
    }
    
    // Find the target pattern
    const targetIndex = serverContent.indexOf(TARGET_PATTERN);
    if (targetIndex === -1) {
      console.error(`ERROR: Target pattern "${TARGET_PATTERN}" not found in server.js.`);
      console.log('You can manually add the following code after serviceRecommender initialization:');
      console.log(ENHANCEMENT_CODE);
      return false;
    }
    
    // Insert the enhancement code after the target pattern
    const insertPosition = targetIndex + TARGET_PATTERN.length;
    const newContent = serverContent.slice(0, insertPosition) + ENHANCEMENT_CODE + serverContent.slice(insertPosition);
    
    // Create a backup first
    const backupFile = `${SERVER_FILE}.bak-${Date.now()}`;
    fs.writeFileSync(backupFile, serverContent, 'utf8');
    console.log(`Created backup file: ${backupFile}`);
    
    // Write the modified content back to server.js
    fs.writeFileSync(SERVER_FILE, newContent, 'utf8');
    console.log('Successfully added enhanced features code to server.js');
    
    // Check that all required files exist
    const requiredFiles = [
      'enhancedConfusionDetector.js',
      'enhancedFeatures.js',
      'enhancedRecommendationTrigger.js',
      'enhancedServiceInit.js',
      'serviceMatchingEnhancement.js',
      'loadEnhancements.js'
    ];
    
    const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));
    if (missingFiles.length > 0) {
      console.error('ERROR: The following required files are missing:');
      missingFiles.forEach(file => console.error(`- ${file}`));
      console.error('Please ensure all enhancement files are in the project root directory.');
      return false;
    }
    
    console.log('All required files are present.');
    console.log('\nEnhanced features have been successfully activated!');
    console.log('To deploy the changes to Heroku, run:');
    console.log('  git add .');
    console.log('  git commit -m "Activate enhanced service recommendation features"');
    console.log('  git push heroku main');
    
    return true;
  } catch (error) {
    console.error('Error activating enhancements:', error);
    return false;
  }
}

// Run the activation
activateEnhancements().then(success => {
  if (!success) {
    console.error('Failed to activate enhancements.');
    process.exit(1);
  }
}); 