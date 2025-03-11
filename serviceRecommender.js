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
    this.services = require('./services.js');
    this.confidenceThreshold = 0.4;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.useAiMatching = process.env.USE_AI_MATCHING === 'true';
    
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

  /**
   * Get services that match user needs and have not been recently recommended
   * @param {string} userId - The user ID
   * @param {Object} userNeeds - The user's needs
   * @param {Object} conversationContext - Context extracted from the conversation
   * @returns {Promise<Array>} - Array of services that match the user's needs
   */
  async getFilteredRecommendations(userId, userNeeds, conversationContext = null) {
    try {
      console.log(`Getting recommendations for user ${userId}`);
      console.log('User needs:', JSON.stringify(userNeeds));
      if (conversationContext) {
        console.log('Conversation context:', JSON.stringify(conversationContext));
      }

      let matchingServices;
      const startTime = Date.now();
      
      // Use AI matching if enabled, otherwise use rule-based matching
      if (this.useAiMatching && this.openaiApiKey) {
        matchingServices = await this.findMatchingServicesWithAI(userNeeds, conversationContext);
        this._logPerformanceMetrics('AI-based matching', startTime);
      } else {
        matchingServices = await this.findMatchingServices(userNeeds, conversationContext);
        this._logPerformanceMetrics('Rule-based matching', startTime);
      }

      // Filter out recently recommended services
      const filteredServices = [];
      for (const service of matchingServices) {
        const wasRecent = await this.wasRecentlyRecommended(userId, service.id);
        if (!wasRecent) {
          filteredServices.push(service);
        } else {
          console.log(`Service ${service.id} was recently recommended to user ${userId}, filtering out`);
        }
      }

      return filteredServices;
    } catch (error) {
      console.error('Error getting filtered recommendations:', error);
      return [];
    }
  }

  /**
   * Find services that match the user's needs
   * @param {Object} userNeeds - The user's needs
   * @param {Object} conversationContext - Context extracted from the conversation
   * @returns {Promise<Array>} - Array of services that match the user's needs
   */
  async findMatchingServices(userNeeds, conversationContext = null) {
    try {
      // Ensure the confidence threshold hasn't been altered
      if (this.CONFIDENCE_THRESHOLD !== DEFAULT_CONFIDENCE_THRESHOLD) {
        console.warn('Confidence threshold was altered, resetting to default');
        this._setConfidenceThreshold(DEFAULT_CONFIDENCE_THRESHOLD);
      }

      // Get all services from the 'Services' table
      const records = await this.airtableBase('Services').select().all();
      const services = records.map(record => ({
        id: record.id,
        name: record.get('Name'),
        description: record.get('Description'),
        url: record.get('URL'),
        criteria: record.get('Criteria') ? JSON.parse(record.get('Criteria')) : {},
        confidenceScore: 0
      }));

      // Calculate confidence score for each service
      for (const service of services) {
        service.confidenceScore = this._calculateConfidenceScore(service, userNeeds, conversationContext);
        console.log(`Service ${service.name} confidence score: ${service.confidenceScore}`);
      }

      // Filter services by confidence threshold
      const matchingServices = services.filter(service => service.confidenceScore >= this.CONFIDENCE_THRESHOLD);
      
      // Sort by confidence score (highest first)
      matchingServices.sort((a, b) => b.confidenceScore - a.confidenceScore);
      
      return matchingServices;
    } catch (error) {
      console.error('Error finding matching services:', error);
      return [];
    }
  }

  /**
   * Calculate the confidence score for a service based on matching criteria
   * @param {Object} service - The service to calculate the confidence score for
   * @param {Object} userNeeds - The user's needs
   * @param {Object} conversationContext - Context extracted from the conversation
   * @returns {number} - The confidence score (0-1)
   */
  _calculateConfidenceScore(service, userNeeds, conversationContext = null) {
    try {
      if (!service.criteria || Object.keys(service.criteria).length === 0) {
        return 0;
      }

      let totalCriteria = 0;
      let matchCount = 0;
      let negativeMatchCount = 0;
      
      // Process positive criteria (needs that should match)
      if (service.criteria.needs && Array.isArray(service.criteria.needs)) {
        totalCriteria += service.criteria.needs.length;
        
        for (const need of service.criteria.needs) {
          if (userNeeds[need] && userNeeds[need] > 0) {
            // Weight the match based on the strength of the need
            matchCount += (userNeeds[need] / 5); // Normalize to 0-1 range (assuming needs are 1-5)
          }
        }
      }
      
      // Process negative criteria (needs that should NOT match)
      if (service.criteria.excludes && Array.isArray(service.criteria.excludes)) {
        for (const exclude of service.criteria.excludes) {
          if (userNeeds[exclude] && userNeeds[exclude] > 3) { // Only count strong negative matches
            negativeMatchCount++;
          }
        }
      }
      
      // Apply negative matches as penalties
      const negativePenalty = negativeMatchCount * 0.2; // Each negative match reduces score by 20%
      
      // Calculate base score from positive matches
      let score = totalCriteria > 0 ? matchCount / totalCriteria : 0;
      
      // Apply context-based adjustments if context is available
      if (conversationContext) {
        // Topic relevance boost
        if (service.criteria.topics && Array.isArray(service.criteria.topics) && 
            conversationContext.recentTopics && conversationContext.recentTopics.length > 0) {
          const topicMatches = service.criteria.topics.filter(topic => 
            conversationContext.recentTopics.includes(topic));
          
          if (topicMatches.length > 0) {
            // Boost score based on topic relevance (up to 20%)
            const topicBoost = Math.min(0.2, topicMatches.length * 0.1);
            score += topicBoost;
          }
        }
        
        // Mood-based adjustment
        if (service.criteria.moods && Array.isArray(service.criteria.moods) && 
            conversationContext.currentMood) {
          if (service.criteria.moods.includes(conversationContext.currentMood)) {
            // Boost score for mood-appropriate services (15%)
            score += 0.15;
          }
        }
        
        // Urgency-based adjustment
        if (service.criteria.urgent === true && conversationContext.urgency > 0.5) {
          // Boost score for urgent services when urgency is detected (up to 25%)
          score += conversationContext.urgency * 0.25;
        }
      }
      
      // Apply negative penalty after all boosts
      score = Math.max(0, score - negativePenalty);
      
      // Cap at 1.0
      return Math.min(1.0, score);
    } catch (error) {
      console.error('Error calculating confidence score:', error);
      return 0;
    }
  }
  
  // Check if user needs match any exclusion criteria
  _matchesExclusionCriteria(exclusionCriteria, userNeeds) {
    try {
      // If no exclusion criteria defined, nothing to exclude
      if (!exclusionCriteria || Object.keys(exclusionCriteria).length === 0) {
        return false;
      }
      
      // Check each category in the exclusion criteria
      for (const category in exclusionCriteria) {
        if (userNeeds[category]) {
          // Check each need in this category
          for (const need in exclusionCriteria[category]) {
            // If the exclusion criterion is true and the user has this need, exclude the service
            if (exclusionCriteria[category][need] === true && userNeeds[category][need] === true) {
              console.log(`Exclusion criterion matched: ${category}.${need}`);
              return true;
            }
          }
        }
      }
      
      // No exclusion criteria matched
      return false;
    } catch (error) {
      console.error('Error checking exclusion criteria:', error);
      return false; // Default to not excluding in case of error
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

  // Adjust service relevance based on conversation context
  _adjustRelevanceByContext(services, conversationContext) {
    try {
      if (!conversationContext || !conversationContext.recentTopics || services.length === 0) {
        return; // No adjustment needed
      }
      
      // Extract recent topics from conversation context
      const { recentTopics, currentMood, urgency } = conversationContext;
      
      // Adjust confidence scores based on topic relevance
      services.forEach(service => {
        let contextBoost = 1.0; // Default: no change
        
        // Check if service tags match recent conversation topics
        if (service.tags && recentTopics) {
          const matchingTopics = service.tags.filter(tag => 
            recentTopics.some(topic => topic.toLowerCase().includes(tag.toLowerCase()))
          );
          
          if (matchingTopics.length > 0) {
            // Boost based on number of matching topics (up to 30%)
            const topicBoost = Math.min(0.3, matchingTopics.length * 0.1);
            contextBoost += topicBoost;
            console.log(`Service ${service.id} boosted by ${(topicBoost * 100).toFixed(1)}% due to topic relevance`);
          }
        }
        
        // Adjust for urgency if present
        if (urgency && urgency > 0.5 && service.providesImmediateHelp) {
          contextBoost += 0.2; // Boost services that provide immediate help
          console.log(`Service ${service.id} boosted by 20% due to urgency`);
        }
        
        // Adjust for current mood if present
        if (currentMood && service.moodRelevance) {
          if (
            (currentMood === 'anxious' && service.moodRelevance.includes('anxiety')) ||
            (currentMood === 'depressed' && service.moodRelevance.includes('depression')) ||
            (currentMood === 'overwhelmed' && service.moodRelevance.includes('stress'))
          ) {
            contextBoost += 0.15; // Boost mood-relevant services
            console.log(`Service ${service.id} boosted by 15% due to mood relevance`);
          }
        }
        
        // Apply the context boost to the confidence score
        if (contextBoost !== 1.0) {
          const originalScore = service.confidenceScore;
          service.confidenceScore = Math.min(100, originalScore * contextBoost);
          console.log(`Service ${service.id} confidence adjusted from ${originalScore.toFixed(1)}% to ${service.confidenceScore.toFixed(1)}% based on conversation context`);
        }
      });
      
      // Re-sort services by adjusted confidence score
      services.sort((a, b) => b.confidenceScore - a.confidenceScore);
      
    } catch (error) {
      console.error('Error adjusting relevance by context:', error);
      // Continue without context adjustment in case of error
    }
  }

  // New method to use AI for service matching
  async findMatchingServicesWithAI(userNeeds, conversationContext = null) {
    try {
      const axios = require('axios');
      
      // Prepare the services data
      const servicesData = this.services.map(service => ({
        id: service.id,
        name: service.name,
        criteria: service.criteria
      }));
      
      // Prepare the prompt for the AI model
      const prompt = {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a service matching assistant. Your task is to match user needs and conversation context with appropriate services. Return a JSON object with a 'matchingServices' property containing an array of service IDs, sorted by relevance. Include only services with a confidence score of 0.4 or higher."
          },
          {
            role: "user",
            content: JSON.stringify({
              userNeeds: userNeeds,
              conversationContext: conversationContext,
              availableServices: servicesData
            })
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: "json_object" }
      };
      
      console.log('Calling OpenAI API for service matching...');
      
      // Call the OpenAI API
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        prompt,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.openaiApiKey}`
          }
        }
      );
      
      // Parse the response
      const result = response.data.choices[0].message.content;
      console.log('AI response:', result);
      
      let matchedServiceIds = [];
      try {
        const parsedResult = JSON.parse(result);
        if (parsedResult && Array.isArray(parsedResult.matchingServices)) {
          matchedServiceIds = parsedResult.matchingServices;
        } else {
          console.error('Invalid AI response format, expected array of service IDs');
          return this.findMatchingServices(userNeeds, conversationContext);
        }
      } catch (parseError) {
        console.error('Error parsing AI response:', parseError);
        return this.findMatchingServices(userNeeds, conversationContext);
      }
      
      // Get the full service objects for the matched IDs
      const matchingServices = matchedServiceIds
        .map(id => this.services.find(service => service.id === id))
        .filter(service => service !== undefined);
      
      console.log(`AI matched ${matchingServices.length} services`);
      
      if (matchingServices.length === 0) {
        console.log('No services matched by AI, falling back to rule-based matching');
        return this.findMatchingServices(userNeeds, conversationContext);
      }
      
      return matchingServices;
    } catch (error) {
      console.error('Error in AI service matching:', error);
      // Fallback to rule-based matching if AI fails
      console.log('Falling back to rule-based matching');
      return this.findMatchingServices(userNeeds, conversationContext);
    }
  }

  // Helper method to log performance metrics
  _logPerformanceMetrics(methodName, startTime) {
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    console.log(`Performance: ${methodName} took ${executionTime}ms`);
  }
}

module.exports = ServiceRecommender;