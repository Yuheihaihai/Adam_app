// serviceRecommender.js - Matches user needs with available services
const services = require('./services');
const fs = require('fs');
const path = require('path');

// Define constants at the module level to prevent accidental changes
const DEFAULT_CONFIDENCE_THRESHOLD = 0.6; // 60% confidence threshold
const DEFAULT_COOLDOWN_DAYS = 7;

class ServiceRecommender {
  constructor(airtableBase) {
    this.airtableBase = airtableBase;
    this.RECOMMENDATIONS_TABLE = 'ServiceRecommendations';
    this.tableExists = false;
    this.localRecommendations = [];
    this.localStoragePath = path.join(__dirname, 'local_recommendations.json');
    
    // Set confidence threshold with validation
    this._setConfidenceThreshold(DEFAULT_CONFIDENCE_THRESHOLD);
    
    // Initialize table check
    this._checkTableExists();
    
    // Load local recommendations if available
    this._loadLocalRecommendations();
    
    // Freeze critical properties to prevent accidental modification
    Object.defineProperty(this, 'CONFIDENCE_THRESHOLD', {
      writable: false,
      configurable: false
    });
  }
  
  // Private method to set confidence threshold with validation
  _setConfidenceThreshold(threshold) {
    // Validate threshold is a number between 0 and 1
    const validatedThreshold = typeof threshold === 'number' && 
                              threshold >= 0 && 
                              threshold <= 1 ? 
                              threshold : DEFAULT_CONFIDENCE_THRESHOLD;
    
    // Set the threshold
    this.CONFIDENCE_THRESHOLD = validatedThreshold;
    console.log(`Service matching confidence threshold set to ${(this.CONFIDENCE_THRESHOLD * 100).toFixed(0)}%`);
  }
  
  // Load local recommendations from file
  _loadLocalRecommendations() {
    try {
      if (fs.existsSync(this.localStoragePath)) {
        const data = fs.readFileSync(this.localStoragePath, 'utf8');
        this.localRecommendations = JSON.parse(data);
        console.log(`Loaded ${this.localRecommendations.length} local recommendations`);
      } else {
        this.localRecommendations = [];
        console.log('No local recommendations file found, starting with empty array');
      }
    } catch (error) {
      console.error('Error loading local recommendations:', error);
      this.localRecommendations = [];
    }
  }
  
  // Save local recommendations to file
  _saveLocalRecommendations() {
    try {
      fs.writeFileSync(
        this.localStoragePath,
        JSON.stringify(this.localRecommendations, null, 2),
        'utf8'
      );
      console.log(`Saved ${this.localRecommendations.length} recommendations to local storage`);
    } catch (error) {
      console.error('Error saving local recommendations:', error);
    }
  }
  
  async _checkTableExists() {
    try {
      await this.airtableBase(this.RECOMMENDATIONS_TABLE).select({ maxRecords: 1 }).firstPage();
      this.tableExists = true;
      console.log('ServiceRecommendations table exists and is accessible');
    } catch (error) {
      if (error.message && error.message.includes('could not be found')) {
        console.log('ServiceRecommendations table does not exist. Attempting to create it...');
        this.tableExists = false;
        this._attemptTableCreation();
      } else if (error.error === 'NOT_AUTHORIZED' || (error.statusCode && error.statusCode === 403)) {
        console.log('Not authorized to access ServiceRecommendations table. Using local storage fallback.');
        this.tableExists = false;
      } else {
        console.error('Error checking ServiceRecommendations table:', error);
        this.tableExists = false;
      }
    }
  }
  
  // Attempt to create the recommendations table
  async _attemptTableCreation() {
    try {
      // Note: Airtable API doesn't directly support table creation
      // This is a placeholder for potential REST API calls or manual instructions
      console.log('Table creation via API not supported. Please create the ServiceRecommendations table manually with fields: UserID, ServiceID, Timestamp');
      
      // Notify about using local storage as fallback
      console.log('Using local storage as fallback until table is created');
    } catch (error) {
      console.error('Error attempting to create table:', error);
    }
  }

  // Find services that match user needs
  findMatchingServices(userNeeds) {
    // Ensure we're using the correct threshold
    if (this.CONFIDENCE_THRESHOLD !== DEFAULT_CONFIDENCE_THRESHOLD) {
      console.warn(`Confidence threshold was changed from ${DEFAULT_CONFIDENCE_THRESHOLD * 100}% to ${this.CONFIDENCE_THRESHOLD * 100}%. Resetting to default.`);
      this._setConfidenceThreshold(DEFAULT_CONFIDENCE_THRESHOLD);
    }
    
    // Get all services from the services.js module
    const services = require('./services');
    
    // Filter services based on user needs and confidence threshold
    const matchingServices = services.filter(service => {
      // Calculate confidence score and check if it meets the threshold
      const confidenceScore = this._calculateConfidenceScore(service.criteria, userNeeds);
      console.log(`Confidence score for ${service.id}: ${(confidenceScore * 100).toFixed(1)}%`);
      
      // Add the confidence score to the service object for later sorting
      service.confidenceScore = confidenceScore * 100; // Convert to percentage
      
      return confidenceScore >= this.CONFIDENCE_THRESHOLD;
    });
    
    console.log(`Found ${matchingServices.length} matching services based on user needs with ${this.CONFIDENCE_THRESHOLD * 100}% confidence threshold`);
    return matchingServices;
  }
  
  // Calculate confidence score for service match (0.0 to 1.0)
  _calculateConfidenceScore(criteria, userNeeds) {
    try {
      if (!criteria || !userNeeds) return 0;
      
      let matchCount = 0;
      let totalCriteria = 0;
      
      // Iterate through each category in the criteria
      Object.keys(criteria).forEach(category => {
        if (userNeeds[category]) {
          // For each need in this category
          Object.keys(criteria[category]).forEach(need => {
            if (criteria[category][need] && userNeeds[category][need]) {
              matchCount++;
            }
            if (criteria[category][need]) {
              totalCriteria++;
            }
          });
        }
      });
      
      // Calculate confidence score (0.0 to 1.0)
      return totalCriteria > 0 ? matchCount / totalCriteria : 0;
    } catch (error) {
      console.error('Error calculating confidence score:', error);
      return 0;
    }
  }
  
  // Check if service was recently recommended to user
  async wasRecentlyRecommended(userId, serviceId) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - DEFAULT_COOLDOWN_DAYS);
      const cutoffDateString = cutoffDate.toISOString();
      
      // Check Airtable if available
      if (this.tableExists) {
        const records = await this.airtableBase(this.RECOMMENDATIONS_TABLE)
          .select({
            filterByFormula: `AND({UserID} = '${userId}', {ServiceID} = '${serviceId}', {Timestamp} > '${cutoffDateString}')`,
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
  }
  
  // Store recommendation record
  async recordRecommendation(userId, serviceId) {
    const timestamp = new Date().toISOString();
    
    try {
      // Try to record in Airtable if table exists
      if (this.tableExists) {
        try {
          await this.airtableBase(this.RECOMMENDATIONS_TABLE).create([
            {
              fields: {
                UserID: userId,
                ServiceID: serviceId,
                Timestamp: timestamp
              }
            }
          ]);
          console.log(`Successfully recorded recommendation in Airtable for user ${userId}, service ${serviceId}`);
          return;
        } catch (airtableError) {
          console.error('Error recording recommendation in Airtable:', airtableError);
          console.log('Falling back to local storage...');
        }
      }
      
      // Fallback to local storage
      this.localRecommendations.push({
        userId,
        serviceId,
        timestamp
      });
      
      this._saveLocalRecommendations();
      console.log(`Recorded recommendation in local storage for user ${userId}, service ${serviceId}`);
    } catch (error) {
      console.error('Error recording recommendation:', error);
    }
  }

  // Get filtered recommendations (not recently recommended)
  async getFilteredRecommendations(userId, userNeeds) {
    // Use the findMatchingServices method which already applies the confidence threshold
    const matchingServices = this.findMatchingServices(userNeeds);
    
    // Filter out services that were recently recommended
    const filteredServices = [];
    
    for (const service of matchingServices) {
      const wasRecommended = await this.wasRecentlyRecommended(userId, service.id);
      if (!wasRecommended) {
        filteredServices.push(service);
      } else {
        console.log(`Service ${service.id} was recently recommended to user ${userId}, skipping`);
      }
    }
    
    return filteredServices;
  }
}

module.exports = ServiceRecommender;