/**
 * Script to apply changes to server.js and serviceRecommender.js
 * 
 * This script:
 * 1. Updates the detectAdviceRequest function in server.js to only detect explicit advice requests
 * 2. Updates the service recommendation trigger in server.js to only show recommendations for explicit advice requests
 * 3. Updates the wasRecentlyRecommended method in serviceRecommender.js to respect service-specific cooldown periods
 */

const fs = require('fs');
const path = require('path');

// Create backup files
console.log('Creating backup files...');
fs.copyFileSync('server.js', 'server.js.backup_script');
fs.copyFileSync('serviceRecommender.js', 'serviceRecommender.js.backup_script');
console.log('Backup files created.');

// Read the original files
const serverJs = fs.readFileSync('server.js', 'utf8');
const serviceRecommenderJs = fs.readFileSync('serviceRecommender.js', 'utf8');

// 1. Update the detectAdviceRequest function in server.js
console.log('Updating detectAdviceRequest function in server.js...');

const newDetectAdviceFunction = `function detectAdviceRequest(userMessage, history) {
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
      console.log(\`Explicit advice request detected: "\${pattern}"\`);
      return true;
    }
  }
  
  // No explicit advice request found
  console.log('No explicit advice request detected');
  return false;
}`;

// Find the detectAdviceRequest function and replace it
const detectAdviceFunctionRegex = /function detectAdviceRequest\(userMessage, history\) \{[\s\S]*?(?=\/\*\*|$)/;
const updatedServerJs = serverJs.replace(detectAdviceFunctionRegex, newDetectAdviceFunction + '\n\n');

// 2. Update the service recommendation trigger in server.js
console.log('Updating service recommendation trigger in server.js...');

const oldServiceRecTrigger = `    // Get service recommendations only if user preferences allow it
    let serviceRecommendationsPromise = Promise.resolve([]);
    if (userPrefs.showServiceRecommendations) {
      // Enhance conversationContext with the latest user message`;

const newServiceRecTrigger = `    // Get service recommendations only if user preferences allow it AND user explicitly asked for advice
    let serviceRecommendationsPromise = Promise.resolve([]);
    if (userPrefs.showServiceRecommendations && detectAdviceRequest(userMessage, history)) {
      // Enhance conversationContext with the latest user message`;

const updatedServerJs2 = updatedServerJs.replace(oldServiceRecTrigger, newServiceRecTrigger);

// 3. Update the wasRecentlyRecommended method in serviceRecommender.js
console.log('Updating wasRecentlyRecommended method in serviceRecommender.js...');

const oldWasRecentlyRecommendedMethod = `  // Check if service was recently recommended to user
  async wasRecentlyRecommended(userId, serviceId) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - DEFAULT_COOLDOWN_DAYS);
      const cutoffDateString = cutoffDate.toISOString();
      
      // Check Airtable if available
      if (this.tableExists) {
        const records = await this.airtableBase(this.RECOMMENDATIONS_TABLE)
          .select({
            filterByFormula: \`AND({UserID} = '\${userId}', {ServiceID} = '\${serviceId}', {Timestamp} > '\${cutoffDateString}')\`,
            maxRecords: 1
          })
          .firstPage();
        
        return records.length > 0;
      } else {
        // Use local storage as fallback
        return this.localRecommendations.some(rec => 
          rec.userId === userId && 
          rec.serviceId === serviceId && 
          rec.timestamp > cutoffDateString
        );
      }
    } catch (error) {
      console.error('Error checking recent recommendations:', error);
      return false; // Assume not recently recommended if there's an error
    }
  }`;

const newWasRecentlyRecommendedMethod = `  // Check if service was recently recommended to user
  async wasRecentlyRecommended(userId, serviceId) {
    try {
      // Get service-specific cooldown period
      const serviceData = this.services.find(s => s.id === serviceId);
      const serviceCooldownDays = serviceData && serviceData.cooldown_days 
        ? serviceData.cooldown_days 
        : DEFAULT_COOLDOWN_DAYS;
      
      console.log(\`Checking if service \${serviceId} was recently recommended to user \${userId} (cooldown: \${serviceCooldownDays} days)\`);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - serviceCooldownDays);
      const cutoffDateString = cutoffDate.toISOString();
      
      // Check Airtable if available
      if (this.tableExists) {
        const records = await this.airtableBase(this.RECOMMENDATIONS_TABLE)
          .select({
            filterByFormula: \`AND({UserID} = '\${userId}', {ServiceID} = '\${serviceId}', {Timestamp} > '\${cutoffDateString}')\`,
            maxRecords: 1
          })
          .firstPage();
        
        const wasRecent = records.length > 0;
        if (wasRecent) {
          console.log(\`Service \${serviceId} was recommended to user \${userId} within the cooldown period of \${serviceCooldownDays} days\`);
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
          console.log(\`Service \${serviceId} was recommended to user \${userId} within the cooldown period of \${serviceCooldownDays} days\`);
        }
        return wasRecent;
      }
    } catch (error) {
      console.error('Error checking recent recommendations:', error);
      return false; // Assume not recently recommended if there's an error
    }
  }`;

const updatedServiceRecommenderJs = serviceRecommenderJs.replace(oldWasRecentlyRecommendedMethod, newWasRecentlyRecommendedMethod);

// Write the updated files
console.log('Writing updated files...');
fs.writeFileSync('server.js', updatedServerJs2);
fs.writeFileSync('serviceRecommender.js', updatedServiceRecommenderJs);

console.log('Changes applied successfully!');
console.log('Please review the changes and then commit and deploy to Heroku.'); 