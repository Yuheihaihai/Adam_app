#!/bin/bash

# This script makes the necessary changes to fix service recommendation issues
# 1. Only show service recommendations for explicit advice requests
# 2. Respect service-specific cooldown periods

# Backup the original files
cp server.js server.js.backup_before_fix
cp serviceRecommender.js serviceRecommender.js.backup_before_fix

echo "Creating backup of original files..."
echo "Backed up server.js to server.js.backup_before_fix"
echo "Backed up serviceRecommender.js to serviceRecommender.js.backup_before_fix"

# Fix 1: Update detectAdviceRequest function in server.js
echo "Updating detectAdviceRequest function in server.js..."

# Create a temporary file with the new function
cat > detectAdviceRequest.temp << 'EOL'
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
EOL

# Find the line number where the detectAdviceRequest function starts
DETECT_ADVICE_LINE=$(grep -n "function detectAdviceRequest" server.js | cut -d':' -f1)

if [ -z "$DETECT_ADVICE_LINE" ]; then
  echo "Error: Could not find detectAdviceRequest function in server.js"
  exit 1
fi

# Find the line number where the detectAdviceRequest function ends
DETECT_ADVICE_END_LINE=$(tail -n +$DETECT_ADVICE_LINE server.js | grep -n "^}" | head -1 | cut -d':' -f1)
DETECT_ADVICE_END_LINE=$((DETECT_ADVICE_LINE + DETECT_ADVICE_END_LINE - 1))

# Replace the function
sed -i.bak "${DETECT_ADVICE_LINE},${DETECT_ADVICE_END_LINE}d" server.js
sed -i.bak "${DETECT_ADVICE_LINE}i\\$(cat detectAdviceRequest.temp)" server.js

echo "Updated detectAdviceRequest function (lines ${DETECT_ADVICE_LINE}-${DETECT_ADVICE_END_LINE})"

# Fix 2: Update service recommendation trigger in processWithAI function
echo "Updating service recommendation trigger in processWithAI function..."

# Find the line number where the service recommendation trigger starts
SERVICE_REC_LINE=$(grep -n "let serviceRecommendationsPromise = Promise.resolve(\[\]);" server.js | cut -d':' -f1)

if [ -z "$SERVICE_REC_LINE" ]; then
  echo "Error: Could not find service recommendation trigger in server.js"
  exit 1
fi

# Create a temporary file with the new code
cat > serviceRec.temp << 'EOL'
    // Get service recommendations only if user preferences allow it AND user explicitly asked for advice
    let serviceRecommendationsPromise = Promise.resolve([]);
    if (userPrefs.showServiceRecommendations && detectAdviceRequest(userMessage, history)) {
EOL

# Replace the line
sed -i.bak "${SERVICE_REC_LINE}d" server.js
sed -i.bak "$((SERVICE_REC_LINE+1))d" server.js
sed -i.bak "${SERVICE_REC_LINE}i\\$(cat serviceRec.temp)" server.js

echo "Updated service recommendation trigger (around line ${SERVICE_REC_LINE})"

# Fix 3: Update wasRecentlyRecommended method in serviceRecommender.js
echo "Updating wasRecentlyRecommended method in serviceRecommender.js..."

# Create a temporary file with the new method
cat > wasRecentlyRecommended.temp << 'EOL'
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
EOL

# Find the line number where the wasRecentlyRecommended method starts
WAS_RECENT_LINE=$(grep -n "async wasRecentlyRecommended" serviceRecommender.js | cut -d':' -f1)

if [ -z "$WAS_RECENT_LINE" ]; then
  echo "Error: Could not find wasRecentlyRecommended method in serviceRecommender.js"
  exit 1
fi

# Find the line number where the wasRecentlyRecommended method ends
WAS_RECENT_END_LINE=$(tail -n +$WAS_RECENT_LINE serviceRecommender.js | grep -n "^  }" | head -1 | cut -d':' -f1)
WAS_RECENT_END_LINE=$((WAS_RECENT_LINE + WAS_RECENT_END_LINE))

# Replace the method
sed -i.bak "${WAS_RECENT_LINE},${WAS_RECENT_END_LINE}d" serviceRecommender.js
sed -i.bak "${WAS_RECENT_LINE}i\\$(cat wasRecentlyRecommended.temp)" serviceRecommender.js

echo "Updated wasRecentlyRecommended method (lines ${WAS_RECENT_LINE}-${WAS_RECENT_END_LINE})"

# Clean up temporary files
rm detectAdviceRequest.temp serviceRec.temp wasRecentlyRecommended.temp

echo "Changes completed successfully!"
echo "Please review the changes and then commit and deploy to Heroku." 