// serviceRecommender.js - Matches user needs with available services
const services = require('./services');

class ServiceRecommender {
  constructor(airtableBase) {
    this.airtableBase = airtableBase;
    this.RECOMMENDATIONS_TABLE = 'ServiceRecommendations';
  }

  // Find services that match user needs
  findMatchingServices(userNeeds) {
    return services.filter(service => {
      // Check if all criteria match
      return this._checkCriteriaMatch(service.criteria, userNeeds);
    });
  }

  // Helper method to check if service criteria match user needs
  _checkCriteriaMatch(criteria, userNeeds) {
    for (const category in criteria) {
      if (!userNeeds[category]) continue;
      
      for (const indicator in criteria[category]) {
        const requiredValue = criteria[category][indicator];
        const userValue = userNeeds[category][indicator] || false;
        
        if (requiredValue !== userValue) {
          return false;
        }
      }
    }
    return true;
  }

  // Check if service was recently recommended to user
  async wasRecentlyRecommended(userId, serviceId) {
    try {
      const records = await this.airtableBase(this.RECOMMENDATIONS_TABLE)
        .select({
          filterByFormula: `AND({UserID} = "${userId}", {ServiceID} = "${serviceId}")`,
          sort: [{ field: 'Timestamp', direction: 'desc' }],
          maxRecords: 1
        })
        .firstPage();
      
      if (records.length === 0) return false;
      
      const service = services.find(s => s.id === serviceId);
      const cooldownDays = service?.cooldown_days || 7;
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
      await this.airtableBase(this.RECOMMENDATIONS_TABLE).create([
        {
          fields: {
            UserID: userId,
            ServiceID: serviceId,
            Timestamp: new Date().toISOString()
          }
        }
      ]);
    } catch (error) {
      console.error('Error recording recommendation:', error);
    }
  }

  // Get filtered recommendations (not recently recommended)
  async getFilteredRecommendations(userId, userNeeds) {
    const matchingServices = this.findMatchingServices(userNeeds);
    const filteredServices = [];
    
    for (const service of matchingServices) {
      const wasRecent = await this.wasRecentlyRecommended(userId, service.id);
      if (!wasRecent) {
        filteredServices.push(service);
      }
    }
    
    return filteredServices;
  }
}

module.exports = ServiceRecommender; 