// serviceRecommender.js - Matches user needs with available services
const services = require('./services');

// Define constants at the module level to prevent accidental changes
const DEFAULT_CONFIDENCE_THRESHOLD = 0.6; // 60% confidence threshold
const DEFAULT_COOLDOWN_DAYS = 7;

class ServiceRecommender {
  constructor(airtableBase) {
    this.airtableBase = airtableBase;
    this.RECOMMENDATIONS_TABLE = 'ServiceRecommendations';
    this.tableExists = false;
    
    // Set confidence threshold with validation
    this._setConfidenceThreshold(DEFAULT_CONFIDENCE_THRESHOLD);
    
    // Check if table exists
    this._checkTableExists();
    
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
  
  async _checkTableExists() {
    try {
      await this.airtableBase(this.RECOMMENDATIONS_TABLE).select({ maxRecords: 1 }).firstPage();
      this.tableExists = true;
      console.log('ServiceRecommendations table exists and is accessible');
    } catch (error) {
      if (error.message && error.message.includes('could not be found')) {
        console.log('ServiceRecommendations table does not exist. Some functionality will be limited.');
        this.tableExists = false;
      } else if (error.error === 'NOT_AUTHORIZED' || (error.statusCode && error.statusCode === 403)) {
        console.log('Not authorized to access ServiceRecommendations table. Some functionality will be limited.');
        this.tableExists = false;
      } else {
        console.error('Error checking ServiceRecommendations table:', error);
        this.tableExists = false;
      }
    }
  }

  // Find services that match user needs
  findMatchingServices(userNeeds) {
    try {
      // Ensure we're using the correct threshold
      if (this.CONFIDENCE_THRESHOLD !== DEFAULT_CONFIDENCE_THRESHOLD) {
        console.warn(`Confidence threshold was changed from ${DEFAULT_CONFIDENCE_THRESHOLD * 100}% to ${this.CONFIDENCE_THRESHOLD * 100}%. Resetting to default.`);
        this._setConfidenceThreshold(DEFAULT_CONFIDENCE_THRESHOLD);
      }
      
      const matchingServices = services.filter(service => {
        // Calculate confidence score and check if it meets the threshold
        const confidenceScore = this._calculateConfidenceScore(service.criteria, userNeeds);
        console.log(`Confidence score for ${service.id}: ${(confidenceScore * 100).toFixed(1)}%`);
        return confidenceScore >= this.CONFIDENCE_THRESHOLD;
      });
      console.log(`Found ${matchingServices.length} matching services based on user needs with ${this.CONFIDENCE_THRESHOLD * 100}% confidence threshold`);
      return matchingServices;
    } catch (error) {
      console.error('Error finding matching services:', error);
      return [];
    }
  }

  // Calculate confidence score for service match (0.0 to 1.0)
  _calculateConfidenceScore(criteria, userNeeds) {
    try {
      let totalCriteria = 0;
      let matchedCriteria = 0;
      
      for (const category in criteria) {
        if (!userNeeds[category]) continue;
        
        for (const indicator in criteria[category]) {
          totalCriteria++;
          const requiredValue = criteria[category][indicator];
          const userValue = userNeeds[category][indicator] || false;
          
          if (requiredValue === userValue) {
            matchedCriteria++;
          }
        }
      }
      
      // Avoid division by zero
      if (totalCriteria === 0) return 0;
      
      return matchedCriteria / totalCriteria;
    } catch (error) {
      console.error('Error calculating confidence score:', error);
      return 0;
    }
  }

  // Check if service was recently recommended to user
  async wasRecentlyRecommended(userId, serviceId) {
    try {
      // If table doesn't exist, assume service wasn't recently recommended
      if (!this.tableExists) {
        return false;
      }
      
      const records = await this.airtableBase(this.RECOMMENDATIONS_TABLE)
        .select({
          filterByFormula: `AND({UserID} = "${userId}", {ServiceID} = "${serviceId}")`,
          sort: [{ field: 'Timestamp', direction: 'desc' }],
          maxRecords: 1
        })
        .firstPage();
      
      if (records.length === 0) return false;
      
      const service = services.find(s => s.id === serviceId);
      const cooldownDays = service?.cooldown_days || DEFAULT_COOLDOWN_DAYS;
      const lastRecommended = new Date(records[0].get('Timestamp'));
      const daysSince = (Date.now() - lastRecommended) / (1000 * 60 * 60 * 24);
      
      return daysSince < cooldownDays;
    } catch (error) {
      console.error('Error checking recent recommendations:', error);
      return false;
    }
  }

  // Store recommendation record
  async recordRecommendation(userId, serviceId) {
    try {
      // If table doesn't exist, skip recording
      if (!this.tableExists) {
        console.log(`Table doesn't exist or not accessible, skipping recommendation recording for user ${userId}, service ${serviceId}`);
        return;
      }
      
      await this.airtableBase(this.RECOMMENDATIONS_TABLE).create([
        {
          fields: {
            UserID: userId,
            ServiceID: serviceId,
            Timestamp: new Date().toISOString()
          }
        }
      ]);
      console.log(`Successfully recorded recommendation for user ${userId}, service ${serviceId}`);
    } catch (error) {
      console.error('Error recording recommendation:', error);
    }
  }

  // Get filtered recommendations (not recently recommended)
  async getFilteredRecommendations(userId, userNeeds) {
    try {
      // Use the findMatchingServices method which already applies the confidence threshold
      const matchingServices = this.findMatchingServices(userNeeds);
      
      const filteredServices = [];
      
      for (const service of matchingServices) {
        const wasRecent = await this.wasRecentlyRecommended(userId, service.id);
        if (!wasRecent) {
          filteredServices.push(service);
        } else {
          console.log(`Service ${service.id} was recently recommended to user ${userId}, skipping`);
        }
      }
      
      console.log(`Filtered services after cooldown check: ${filteredServices.length}`);
      return filteredServices;
    } catch (error) {
      console.error('Error getting filtered recommendations:', error);
      return [];
    }
  }
}

module.exports = ServiceRecommender;