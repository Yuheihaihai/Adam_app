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
      
      // Calculate base confidence score (0.0 to 1.0)
      let baseConfidence = totalCriteria > 0 ? matchCount / totalCriteria : 0;
      
      // Apply emotional context adjustment
      const emotionalContextFactor = this._calculateEmotionalContextFactor(userNeeds);
      const adjustedConfidence = baseConfidence * emotionalContextFactor;
      
      return adjustedConfidence;
    } catch (error) {
      console.error('Error calculating confidence score:', error);
      return 0;
    }
  }
  
  // Calculate a factor to adjust confidence based on emotional context
  _calculateEmotionalContextFactor(userNeeds) {
    try {
      // Default factor is 1.0 (no adjustment)
      let factor = 1.0;
      
      // Check for primarily emotional needs
      const emotionalNeedsCount = this._countEmotionalNeeds(userNeeds);
      const practicalNeedsCount = this._countPracticalNeeds(userNeeds);
      
      // If emotional needs significantly outweigh practical needs, reduce confidence
      if (emotionalNeedsCount > 0 && emotionalNeedsCount > practicalNeedsCount * 2) {
        // Reduce confidence by up to 40% based on the ratio
        const ratio = Math.min(emotionalNeedsCount / (practicalNeedsCount || 1), 5);
        factor = Math.max(0.6, 1 - (ratio * 0.08));
        console.log(`Emotional context adjustment: ${factor.toFixed(2)} (${emotionalNeedsCount} emotional vs ${practicalNeedsCount} practical needs)`);
      }
      
      return factor;
    } catch (error) {
      console.error('Error calculating emotional context factor:', error);
      return 1.0; // Default to no adjustment in case of error
    }
  }
  
  // Count emotional needs in user profile
  _countEmotionalNeeds(userNeeds) {
    let count = 0;
    
    // Mental health emotional indicators
    if (userNeeds.mental_health) {
      if (userNeeds.mental_health.shows_depression) count++;
      if (userNeeds.mental_health.shows_anxiety) count++;
    }
    
    // Social emotional indicators
    if (userNeeds.social) {
      if (userNeeds.social.isolation) count++;
      if (userNeeds.social.social_anxiety) count++;
    }
    
    // Check for romantic/relationship needs (if available in the schema)
    if (userNeeds.relationships && userNeeds.relationships.seeking_romantic_connection) {
      count += 2; // Give higher weight to explicit romantic needs
    }
    
    return count;
  }
  
  // Count practical needs in user profile
  _countPracticalNeeds(userNeeds) {
    let count = 0;
    
    // Employment practical indicators
    if (userNeeds.employment) {
      if (userNeeds.employment.seeking_job) count++;
      if (userNeeds.employment.has_training) count++;
      if (userNeeds.employment.general_employment_interest) count++;
    }
    
    // Education practical indicators
    if (userNeeds.education) {
      if (userNeeds.education.seeking_education) count++;
      if (userNeeds.education.skill_development) count++;
      if (userNeeds.education.certification_interest) count++;
    }
    
    // Daily living practical indicators
    if (userNeeds.daily_living) {
      if (userNeeds.daily_living.housing_needs) count++;
      if (userNeeds.daily_living.financial_assistance) count++;
      if (userNeeds.daily_living.legal_support) count++;
      if (userNeeds.daily_living.healthcare_access) count++;
    }
    
    return count;
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