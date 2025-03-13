#!/bin/bash

# This script makes the necessary changes to fix service recommendation issues
# 1. Only show service recommendations for explicit advice requests
# 2. Respect service-specific cooldown periods

# Backup the original files
cp server.js server.js.backup_v2
cp serviceRecommender.js serviceRecommender.js.backup_v2

echo "Creating backup of original files..."
echo "Backed up server.js to server.js.backup_v2"
echo "Backed up serviceRecommender.js to serviceRecommender.js.backup_v2"

# Fix 1: Create a new server.js file with the updated detectAdviceRequest function
echo "Updating detectAdviceRequest function in server.js..."

# Create the new detectAdviceRequest function
NEW_DETECT_ADVICE_FUNCTION='function detectAdviceRequest(userMessage, history) {
  if (!userMessage) return false;
  
  // Explicit advice request patterns - ONLY these patterns should return true
  const explicitAdvicePatterns = [
    "アドバイスください", "アドバイス下さい", "アドバイスをください",
    "アドバイスが欲しい", "アドバイスをお願い", "助言ください",
    "おすすめを教えて", "サービスを教えて", "サービスある"
  ];
  
  // Check for explicit advice requests ONLY
  for (const pattern of explicitAdvicePatterns) {
    if (userMessage.includes(pattern)) {
      console.log(`Explicit advice request detected: "${pattern}"`);
      return true;
    }
  }
  
  // No explicit advice request found
  console.log("No explicit advice request detected");
  return false;
}'

# Create a new server.js file with the updated function
awk -v new_func="$NEW_DETECT_ADVICE_FUNCTION" '
/function detectAdviceRequest\(userMessage, history\)/ {
  print "/**\n * Detect if the user is asking for advice or recommendations\n */";
  print new_func;
  in_func = 1;
  next;
}
/^}/ {
  if (in_func) {
    in_func = 0;
    next;
  }
}
!in_func {
  print;
}
' server.js.backup_v2 > server.js.new

# Fix 2: Update service recommendation trigger in processWithAI function
echo "Updating service recommendation trigger in processWithAI function..."

# Create the new service recommendation trigger code
NEW_SERVICE_REC_CODE='    // Get service recommendations only if user preferences allow it AND user explicitly asked for advice
    let serviceRecommendationsPromise = Promise.resolve([]);
    if (userPrefs.showServiceRecommendations && detectAdviceRequest(userMessage, history)) {'

# Update the service recommendation trigger
awk -v new_code="$NEW_SERVICE_REC_CODE" '
/let serviceRecommendationsPromise = Promise\.resolve\(\[\]\);/ {
  in_block = 1;
  print new_code;
  next;
}
/if \(userPrefs\.showServiceRecommendations\)/ {
  if (in_block) {
    in_block = 0;
    next;
  }
}
!in_block {
  print;
}
' server.js.new > server.js.new2

# Fix 3: Update wasRecentlyRecommended method in serviceRecommender.js
echo "Updating wasRecentlyRecommended method in serviceRecommender.js..."

# Create the new wasRecentlyRecommended method
NEW_WAS_RECENTLY_RECOMMENDED='  // Check if service was recently recommended to user
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
            filterByFormula: `AND({UserID} = "${userId}", {ServiceID} = "${serviceId}", {Timestamp} > "${cutoffDateString}")`,
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
      console.error("Error checking recent recommendations:", error);
      return false; // Assume not recently recommended if there's an error
    }
  }'

# Update the wasRecentlyRecommended method
awk -v new_method="$NEW_WAS_RECENTLY_RECOMMENDED" '
/async wasRecentlyRecommended\(userId, serviceId\)/ {
  print new_method;
  in_method = 1;
  next;
}
/^  }/ {
  if (in_method) {
    in_method = 0;
    next;
  }
}
!in_method {
  print;
}
' serviceRecommender.js.backup_v2 > serviceRecommender.js.new

# Replace the original files with the new ones
mv server.js.new2 server.js
mv serviceRecommender.js.new serviceRecommender.js

echo "Changes completed successfully!"
echo "Please review the changes and then commit and deploy to Heroku." 