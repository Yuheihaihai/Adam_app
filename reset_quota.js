// Reset the audio quota removal flag
const insightsService = require('./insightsService.js');

// Set the quota removal flag to false (enable limits)
insightsService.setAudioQuotaStatus(false);

console.log('Audio quota status set to:', insightsService.getAudioQuotaStatus());
console.log('Audio limits:', {
  userDailyLimit: insightsService.audioLimits.userDailyLimit,
  globalMonthlyLimit: insightsService.audioLimits.globalMonthlyLimit
}); 