// serviceRecommender.js - Matches user needs with available services
const services = require('./services');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// サービスデータが正しく読み込まれているか確認
console.log(`Loaded ${services.length} services from services.js`);
if (services.length > 0) {
  console.log(`First service: ${JSON.stringify(services[0].id)} - ${JSON.stringify(services[0].name)}`);
  console.log(`Sample criteria: ${JSON.stringify(services[0].criteria)}`);
} else {
  console.log('WARNING: No services found in services.js!');
}

// Define constants at the module level to prevent accidental changes
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7; // 70%に設定 (元は80%)
console.log(`Service matching module loaded with DEFAULT_CONFIDENCE_THRESHOLD: ${DEFAULT_CONFIDENCE_THRESHOLD} (${DEFAULT_CONFIDENCE_THRESHOLD * 100}%)`);
const DEFAULT_COOLDOWN_DAYS = 7;

class ServiceRecommender {
  constructor(airtableBase) {
    this.airtableBase = airtableBase;
    this.RECOMMENDATIONS_TABLE = 'ServiceRecommendations';
    this.tableExists = false;
    this.localRecommendations = [];
    this.localStoragePath = path.join(__dirname, 'local_recommendations.json');
    this.services = services; // Use the imported services module
    this.confidenceThreshold = 0.4;
    console.log(`Initial confidenceThreshold set to: ${this.confidenceThreshold} (${this.confidenceThreshold * 100}%)`);
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.useAiMatching = true; // Always use AI matching
    this.aiModel = "gpt-4o-mini"; // Always use GPT-4o-mini
    
    // Vector matching
    this.serviceEmbeddings = {};
    this.embeddingsPath = path.join(__dirname, 'service_embeddings.json');
    this.embeddingModel = "text-embedding-3-small";
    this.embeddingDimension = 1536;
    this.embeddingsLoaded = false;
    
    // Cache for matching results
    this.matchingCache = new Map();
    this.CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    
    // Set confidence threshold with validation
    this._setConfidenceThreshold(DEFAULT_CONFIDENCE_THRESHOLD);
    
    // Load local recommendations
    this._loadLocalRecommendations();
    
    // Load or generate service embeddings
    this._loadOrGenerateEmbeddings();
    
    // Check if the recommendations table exists
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
    console.log(`Service matching confidence threshold set to ${(this.CONFIDENCE_THRESHOLD * 100).toFixed(0)}% (input was: ${threshold}, validated to: ${validatedThreshold})`);
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

  async _loadOrGenerateEmbeddings() {
    try {
      if (fs.existsSync(this.embeddingsPath)) {
        const data = fs.readFileSync(this.embeddingsPath, 'utf8');
        this.serviceEmbeddings = JSON.parse(data);
        this.embeddingsLoaded = true;
        console.log(`Loaded ${Object.keys(this.serviceEmbeddings).length} service embeddings from file`);
      } else {
        console.log('No embeddings file found, will generate embeddings on first use');
      }
    } catch (error) {
      console.error('Error loading service embeddings:', error);
      console.log('Will generate embeddings on first use');
    }
  }
  
  async _saveEmbeddings() {
    try {
      fs.writeFileSync(this.embeddingsPath, JSON.stringify(this.serviceEmbeddings), 'utf8');
      console.log(`Saved ${Object.keys(this.serviceEmbeddings).length} service embeddings to file`);
    } catch (error) {
      console.error('Error saving service embeddings:', error);
    }
  }
  
  async _generateEmbedding(text) {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          input: text,
          model: this.embeddingModel
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.openaiApiKey}`
          }
        }
      );
      
      return response.data.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }
  
  async _generateAllServiceEmbeddings() {
    if (!this.openaiApiKey) {
      console.error('OpenAI API key is required for generating embeddings');
      return false;
    }
    
    try {
      console.log('Generating embeddings for all services...');
      for (const service of this.services) {
        // Create a text representation of the service criteria
        const criteriaText = JSON.stringify(service.criteria);
        
        // Generate embedding
        const embedding = await this._generateEmbedding(criteriaText);
        
        // Store embedding
        this.serviceEmbeddings[service.id] = embedding;
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Save embeddings to file
      await this._saveEmbeddings();
      this.embeddingsLoaded = true;
      
      console.log(`Generated embeddings for ${this.services.length} services`);
      return true;
    } catch (error) {
      console.error('Error generating service embeddings:', error);
      return false;
    }
  }
  
  _cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (normA * normB);
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
      console.log(`Current CONFIDENCE_THRESHOLD: ${this.CONFIDENCE_THRESHOLD} (${this.CONFIDENCE_THRESHOLD * 100}%)`);
      console.log('User needs (detailed):', JSON.stringify(userNeeds, null, 2));
      
      // Check if userNeeds is empty or has empty categories
      let hasNeeds = false;
      if (userNeeds) {
        for (const category in userNeeds) {
          if (userNeeds[category] && Object.keys(userNeeds[category]).length > 0) {
            for (const need in userNeeds[category]) {
              if (userNeeds[category][need] === true) {
                hasNeeds = true;
                break;
              }
            }
            if (hasNeeds) break;
          }
        }
      }
      
      if (!hasNeeds) {
        console.log('WARNING: No user needs detected. This may prevent service matching.');
      }
      
      if (conversationContext) {
        console.log('Conversation context:', JSON.stringify(conversationContext, null, 2));
      }
      
      // Create a cache key based on user needs and context
      const cacheKey = JSON.stringify({
        userNeeds,
        context: conversationContext ? {
          topics: conversationContext.recentTopics,
          mood: conversationContext.currentMood,
          urgency: conversationContext.urgency
        } : null
      });
      
      // Check cache first
      const now = Date.now();
      if (this.matchingCache.has(cacheKey)) {
        const cached = this.matchingCache.get(cacheKey);
        if (now - cached.timestamp < this.CACHE_TTL) {
          console.log('Cache hit for service matching');
          const startTime = Date.now();
          
          // Filter out recently recommended services
          const filteredServices = [];
          for (const service of cached.services) {
            const wasRecent = await this.wasRecentlyRecommended(userId, service.id);
            if (!wasRecent) {
              filteredServices.push(service);
            } else {
              console.log(`Service ${service.id} was recently recommended to user ${userId}, filtering out`);
            }
          }
          
          this._logPerformanceMetrics('Cached matching (with cooldown check)', startTime);
          return filteredServices;
        }
      }

      let matchingServices;
      const startTime = Date.now();
      
      // Try vector-based matching first if embeddings are loaded
      if (this.embeddingsLoaded && this.openaiApiKey) {
        try {
          matchingServices = await this.findMatchingServicesWithVectors(userNeeds, conversationContext);
          this._logPerformanceMetrics('Vector-based matching', startTime);
        } catch (error) {
          console.error('Error in vector-based matching:', error);
          // Fall back to AI-based matching
          matchingServices = await this.findMatchingServicesWithAI(userNeeds, conversationContext);
          this._logPerformanceMetrics('AI-based matching (fallback)', startTime);
        }
      } else if (this.openaiApiKey) {
        // Use AI-based matching if embeddings aren't loaded
        matchingServices = await this.findMatchingServicesWithAI(userNeeds, conversationContext);
        this._logPerformanceMetrics('AI-based matching', startTime);
        
        // Generate embeddings for future use if they don't exist
        if (!this.embeddingsLoaded) {
          this._generateAllServiceEmbeddings().then(success => {
            if (success) {
              console.log('Service embeddings generated successfully for future use');
            }
          });
        }
      } else {
        // Fall back to rule-based matching if OpenAI API key is missing
        matchingServices = await this.findMatchingServices(userNeeds, conversationContext);
        this._logPerformanceMetrics('Rule-based matching', startTime);
      }
      
      // Cache the results
      this.matchingCache.set(cacheKey, {
        services: matchingServices,
        timestamp: now
      });

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

      console.log(`Current DEFAULT_CONFIDENCE_THRESHOLD: ${DEFAULT_CONFIDENCE_THRESHOLD} (${DEFAULT_CONFIDENCE_THRESHOLD * 100}%)`);
      console.log(`Current CONFIDENCE_THRESHOLD: ${this.CONFIDENCE_THRESHOLD} (${this.CONFIDENCE_THRESHOLD * 100}%)`);

      // Use the imported services from services.js instead of fetching from Airtable
      console.log(`Using ${this.services.length} services from local services.js file`);
      
      // Log the first service for debugging
      if (this.services.length > 0) {
        console.log(`First service: ${JSON.stringify(this.services[0], null, 2)}`);
      } else {
        console.log('WARNING: No services found in services.js');
        return [];
      }
      
      console.log(`User needs for matching: ${JSON.stringify(userNeeds, null, 2)}`);
      
      const services = this.services.map(service => ({
        ...service,
        confidenceScore: 0
      }));

      // Calculate confidence score for each service
      for (const service of services) {
        service.confidenceScore = this._calculateConfidenceScore(service, userNeeds, conversationContext);
        console.log(`Service ${service.name} confidence score: ${service.confidenceScore.toFixed(2)}`);
      }

      // Filter services by confidence threshold
      const matchingServices = services.filter(service => service.confidenceScore >= this.CONFIDENCE_THRESHOLD);
      console.log(`Found ${matchingServices.length} matching services with confidence >= ${this.CONFIDENCE_THRESHOLD}`);
      
      if (matchingServices.length === 0) {
        console.log('DEBUG: No services matched. Confidence threshold may be too high or user needs may not match any services.');
        
        // Log the highest scoring services for debugging
        const sortedServices = [...services].sort((a, b) => b.confidenceScore - a.confidenceScore);
        const topServices = sortedServices.slice(0, 3);
        console.log('Top scoring services (even though below threshold):');
        topServices.forEach(service => {
          console.log(`- ${service.name}: ${service.confidenceScore.toFixed(2)}`);
        });
      }
      
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
      // If no criteria defined, return 0
      if (!service.criteria || Object.keys(service.criteria).length === 0) {
        return 0;
      }

      let totalCriteria = 0;
      let matchCount = 0;
      let negativePenalty = 0;
      
      console.log(`Calculating score for service: ${service.name}`);
      
      // Check for needs criteria
      if (service.criteria.needs && Array.isArray(service.criteria.needs)) {
        const needsCriteria = service.criteria.needs;
        totalCriteria += needsCriteria.length;
        
        console.log(`Service needs criteria: ${JSON.stringify(needsCriteria)}`);
        
        // Check each need in the criteria
        for (const need of needsCriteria) {
          let needMatched = false;
          
          // Check all categories in userNeeds
          for (const category in userNeeds) {
            if (userNeeds[category] && typeof userNeeds[category] === 'object') {
              // Check if this need exists in this category
              if (userNeeds[category][need] === true) {
                matchCount++;
                needMatched = true;
                console.log(`✅ Need matched: ${need}`);
                break;
              }
            }
          }
          
          if (!needMatched) {
            console.log(`❌ Need not matched: ${need}`);
          }
        }
      }
      
      // Check for exclusion criteria
      if (service.criteria.excludes && Array.isArray(service.criteria.excludes)) {
        const exclusionCriteria = service.criteria.excludes;
        console.log(`Service exclusion criteria: ${JSON.stringify(exclusionCriteria)}`);
        
        // Check each exclusion criterion
        for (const exclusion of exclusionCriteria) {
          // Check all categories in userNeeds
          for (const category in userNeeds) {
            if (userNeeds[category] && typeof userNeeds[category] === 'object') {
              // If the user has this excluded need, apply a penalty
              if (userNeeds[category][exclusion] === true) {
                negativePenalty += 0.3; // 30% penalty for each exclusion match
                console.log(`⚠️ Exclusion matched: ${exclusion} (penalty: 0.3)`);
                break;
              }
            }
          }
        }
      }
      
      // Calculate base score from needs match
      let score = totalCriteria > 0 ? matchCount / totalCriteria : 0;
      console.log(`Base score from needs: ${score.toFixed(2)} (matched ${matchCount}/${totalCriteria} criteria)`);
      
      // Apply context-based adjustments if available
      if (conversationContext) {
        // Topic-based adjustment
        if (service.criteria.topics && Array.isArray(service.criteria.topics) && 
            conversationContext.recentTopics && Array.isArray(conversationContext.recentTopics)) {
          const topicOverlap = conversationContext.recentTopics.filter(
            topic => service.criteria.topics.includes(topic)
          ).length;
          
          if (topicOverlap > 0) {
            const topicBoost = 0.1 * topicOverlap;
            score += topicBoost;
            console.log(`Adding ${topicBoost.toFixed(2)} boost for ${topicOverlap} topic matches`);
          }
        }
        
        // Mood-based adjustment
        if (service.criteria.moods && Array.isArray(service.criteria.moods) && 
            conversationContext.currentMood) {
          if (service.criteria.moods.includes(conversationContext.currentMood)) {
            // Boost score for mood-appropriate services (15%)
            score += 0.15;
            console.log(`Adding 0.15 boost for mood relevance`);
          }
        }
        
        // Urgency-based adjustment
        if (service.criteria.urgent === true && conversationContext.urgency > 0.5) {
          // Boost score for urgent services when urgency is detected (up to 25%)
          const urgencyBoost = conversationContext.urgency * 0.25;
          score += urgencyBoost;
          console.log(`Adding ${urgencyBoost.toFixed(2)} boost for urgency`);
        }
      }
      
      // Apply negative penalty after all boosts
      if (negativePenalty > 0) {
        score = Math.max(0, score - negativePenalty);
        console.log(`Applied exclusion penalty: -${negativePenalty.toFixed(2)}, new score: ${score.toFixed(2)}`);
      }
      
      // Cap at 1.0
      const finalScore = Math.min(1.0, score);
      console.log(`Service ${service.name} final confidence score: ${finalScore.toFixed(2)}`);
      return finalScore;
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
        model: "gpt-4o-mini",
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

  async findMatchingServicesWithVectors(userNeeds, conversationContext = null) {
    try {
      // Ensure embeddings are loaded
      if (!this.embeddingsLoaded) {
        const success = await this._generateAllServiceEmbeddings();
        if (!success) {
          throw new Error('Failed to generate service embeddings');
        }
      }
      
      // Create a text representation of the user needs and context
      const userNeedsText = JSON.stringify(userNeeds);
      const contextText = conversationContext ? JSON.stringify({
        topics: conversationContext.recentTopics,
        mood: conversationContext.currentMood,
        urgency: conversationContext.urgency
      }) : '';
      
      const queryText = `${userNeedsText} ${contextText}`.trim();
      
      // Generate embedding for the query
      console.log('Generating embedding for user query...');
      const queryEmbedding = await this._generateEmbedding(queryText);
      
      // Calculate similarity scores for all services
      const matches = [];
      for (const service of this.services) {
        try {
          const serviceEmbedding = this.serviceEmbeddings[service.id];
          if (!serviceEmbedding) {
            console.warn(`No embedding found for service ${service.id}`);
            continue;
          }
          
          const similarityScore = this._cosineSimilarity(queryEmbedding, serviceEmbedding);
          
          // Apply additional adjustments based on context if available
          let finalScore = similarityScore;
          if (conversationContext) {
            // Adjust score based on topic match
            if (conversationContext.recentTopics && service.criteria && service.criteria.topics) {
              const topicOverlap = conversationContext.recentTopics.filter(
                topic => service.criteria.topics.includes(topic)
              ).length;
              
              if (topicOverlap > 0) {
                finalScore += 0.05 * topicOverlap;
              }
            }
            
            // Adjust score based on mood match
            if (conversationContext.currentMood && service.criteria && service.criteria.moods) {
              if (service.criteria.moods.includes(conversationContext.currentMood)) {
                finalScore += 0.1;
              }
            }
            
            // Adjust score based on urgency
            if (conversationContext.urgency > 0 && service.criteria && service.criteria.urgent) {
              finalScore += 0.15;
            }
          }
          
          // Cap the score at 1.0
          finalScore = Math.min(finalScore, 1.0);
          
          matches.push({
            service,
            score: finalScore
          });
        } catch (error) {
          console.error(`Error processing service ${service.id}:`, error);
          // Continue with other services
        }
      }
      
      // Filter services that meet the confidence threshold
      const filteredMatches = matches.filter(match => match.score >= this.confidenceThreshold);
      
      // Sort by score in descending order
      filteredMatches.sort((a, b) => b.score - a.score);
      
      console.log(`Vector matching found ${filteredMatches.length} services above threshold`);
      
      // Return just the service objects
      return filteredMatches.map(match => match.service);
    } catch (error) {
      console.error('Error in vector-based service matching:', error);
      throw error;
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