// serviceRecommender.js - Matches user needs with available services
const services = require('./services');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('./logger'); // Import the logger

// サービスデータが正しく読み込まれているか確認
console.log(`Loaded ${services.length} services from services.js`);
logger.info('ServiceRecommender', `Loaded ${services.length} services from services.js`);

if (services.length > 0) {
  console.log(`First service: ${JSON.stringify(services[0].id)} - ${JSON.stringify(services[0].name)}`);
  console.log(`Sample criteria: ${JSON.stringify(services[0].criteria)}`);
  logger.debug('ServiceRecommender', 'Sample service loaded', {
    id: services[0].id,
    name: services[0].name,
    criteria: services[0].criteria
  });
} else {
  console.log('WARNING: No services found in services.js!');
  logger.warn('ServiceRecommender', 'No services found in services.js!');
}

// Define constants at the module level to prevent accidental changes
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7; // 70%に設定 (元は80%)
console.log(`Service matching module loaded with DEFAULT_CONFIDENCE_THRESHOLD: ${DEFAULT_CONFIDENCE_THRESHOLD} (${DEFAULT_CONFIDENCE_THRESHOLD * 100}%)`);
logger.info('ServiceRecommender', `Service matching module loaded with DEFAULT_CONFIDENCE_THRESHOLD: ${DEFAULT_CONFIDENCE_THRESHOLD * 100}%`);
const DEFAULT_COOLDOWN_DAYS = 7;

class ServiceRecommender {
  constructor(airtableBase) {
    this.airtableBase = airtableBase;
    this.RECOMMENDATIONS_TABLE = 'ServiceRecommendations';
    this.tableExists = false;
    this.localRecommendations = [];
    this.localStoragePath = path.join(__dirname, 'local_recommendations.json');
    this.services = services; // Use the imported services module
    this.CONFIDENCE_THRESHOLD = DEFAULT_CONFIDENCE_THRESHOLD;
    console.log(`Initial CONFIDENCE_THRESHOLD set to: ${this.CONFIDENCE_THRESHOLD} (${this.CONFIDENCE_THRESHOLD * 100}%)`);
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
    
    // Load local recommendations
    this._loadLocalRecommendations();
    
    // Load or generate service embeddings
    this._loadOrGenerateEmbeddings();
    
    // Check if the recommendations table exists
    this._checkTableExists();
  }
  
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
    if (!this.airtableBase) {
      console.log('Airtable not configured. Using local storage fallback.');
      this.tableExists = false;
      return;
    }
    
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
      
      // Add detailed logging
      logger.info('ServiceRecommender', `Getting recommendations for user ${userId}`, {
        confidenceThreshold: this.CONFIDENCE_THRESHOLD,
        userNeedsCount: userNeeds ? Object.keys(userNeeds).length : 0
      });
      logger.debug('ServiceRecommender', 'User needs details', userNeeds);
      
      // Enhanced detection: Check if conversationContext contains messages with keywords
      if (conversationContext && conversationContext.recentMessages && conversationContext.recentMessages.length > 0) {
        const combinedText = conversationContext.recentMessages.join(' ').toLowerCase();
        
        // Add logging for conversation context
        logger.debug('ServiceRecommender', 'Processing conversation context', {
          messageCount: conversationContext.recentMessages.length,
          combinedTextSample: combinedText.substring(0, 100) + (combinedText.length > 100 ? '...' : '')
        });
        
        // Check for developmental disorder keywords
        if (combinedText.includes('発達障害') || 
            combinedText.includes('adhd') || 
            combinedText.includes('asd') || 
            combinedText.includes('自閉症') || 
            combinedText.includes('アスペルガー')) {
          console.log('⚠️ Directly detected developmental disorder keywords in message');
          logger.info('ServiceRecommender', 'Detected developmental disorder keywords in message');
          // Ensure mental_health category exists
          if (!userNeeds.mental_health) userNeeds.mental_health = {};
          // Set neurodivergent_traits flag
          userNeeds.mental_health.neurodivergent_traits = true;
        }
        
        // Check for remote work keywords
        if (combinedText.includes('在宅') || 
            combinedText.includes('リモート') || 
            combinedText.includes('remote') || 
            combinedText.includes('テレワーク') || 
            combinedText.includes('家から働')) {
          console.log('⚠️ Directly detected remote work keywords in message');
          logger.info('ServiceRecommender', 'Detected remote work keywords in message');
          // Ensure employment category exists
          if (!userNeeds.employment) userNeeds.employment = {};
          // Set remote_work_interest flag
          userNeeds.employment.remote_work_interest = true;
        }
        
        // Check for employment-related keywords
        if (combinedText.includes('仕事') || 
            combinedText.includes('就職') || 
            combinedText.includes('就労') || 
            combinedText.includes('働く') || 
            combinedText.includes('転職')) {
          console.log('⚠️ Directly detected employment keywords in message');
          logger.info('ServiceRecommender', 'Detected employment keywords in message');
          // Ensure employment category exists
          if (!userNeeds.employment) userNeeds.employment = {};
          // Set general_employment_interest flag
          userNeeds.employment.general_employment_interest = true;
          // If they're asking about jobs, they're likely seeking one
          userNeeds.employment.seeking_job = true;
        }
      } else {
        logger.debug('ServiceRecommender', 'No conversation context available');
      }
      
      // Log enhanced userNeeds after direct keyword detection
      console.log('Enhanced user needs after keyword detection:', JSON.stringify(userNeeds, null, 2));
      logger.debug('ServiceRecommender', 'Enhanced user needs after keyword detection', userNeeds);
      
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
      // 閾値チェックを改善: 変更不可から一貫性確認に変更
      if (this.CONFIDENCE_THRESHOLD !== DEFAULT_CONFIDENCE_THRESHOLD) {
        console.log(`Note: Using custom confidence threshold: ${this.CONFIDENCE_THRESHOLD} (${this.CONFIDENCE_THRESHOLD * 100}%) instead of default: ${DEFAULT_CONFIDENCE_THRESHOLD} (${DEFAULT_CONFIDENCE_THRESHOLD * 100}%)`);
      }

      console.log(`Current CONFIDENCE_THRESHOLD: ${this.CONFIDENCE_THRESHOLD} (${this.CONFIDENCE_THRESHOLD * 100}%)`);

      // Use the imported services from services.js instead of fetching from Airtable
      console.log(`Using ${this.services.length} services from local services.js file`);
      
      // Log the first service for debugging
      if (this.services.length > 0) {
        console.log(`First service: ${JSON.stringify(this.services[0].id)} - ${JSON.stringify(this.services[0].name)}`);
        console.log(`Sample service criteria: ${JSON.stringify(this.services[0].criteria)}`);
      } else {
        console.log('WARNING: No services found in services.js');
        return [];
      }
      
      // Add enhanced logging for user needs
      console.log(`User needs for matching: ${JSON.stringify(userNeeds, null, 2)}`);
      
      // Debug: Check if neurodivergent_traits is present
      if (userNeeds.mental_health && userNeeds.mental_health.neurodivergent_traits) {
        console.log('✅ neurodivergent_traits is present in user needs');
        console.log('Services with neurodivergent_traits criteria:');
        
        // List services that may match this need
        let matchingServicesCount = 0;
        for (const service of this.services) {
          if (service.criteria && service.criteria.needs && 
              service.criteria.needs.includes('neurodivergent_traits')) {
            console.log(`- ${service.name} (${service.id})`);
            matchingServicesCount++;
          }
        }
        console.log(`Found ${matchingServicesCount} services with neurodivergent_traits criteria`);
      } else {
        console.log('❌ neurodivergent_traits is NOT present in user needs');
      }
      
      // Debug: Check if remote_work_interest is present
      if (userNeeds.employment && userNeeds.employment.remote_work_interest) {
        console.log('✅ remote_work_interest is present in user needs');
        console.log('Services with remote_work_interest criteria:');
        
        // List services that may match this need
        let matchingServicesCount = 0;
        for (const service of this.services) {
          if (service.criteria && service.criteria.needs && 
              service.criteria.needs.includes('remote_work_interest')) {
            console.log(`- ${service.name} (${service.id})`);
            matchingServicesCount++;
          }
        }
        console.log(`Found ${matchingServicesCount} services with remote_work_interest criteria`);
      } else {
        console.log('❌ remote_work_interest is NOT present in user needs');
      }
      
      const services = this.services.map(service => ({
        ...service,
        confidenceScore: 0
      }));

      console.log(`Started confidence score calculation for ${services.length} services`);
      const startTime = Date.now();
      
      // Calculate confidence score for each service
      for (const service of services) {
        // Calculate how confident we are that this service matches the user's needs
        service.confidenceScore = this._calculateConfidenceScore(service, userNeeds, conversationContext);
      }
      
      // Filter services by confidence threshold
      const matchingServices = services
        .filter(service => service.confidenceScore >= this.CONFIDENCE_THRESHOLD)
        .sort((a, b) => b.confidenceScore - a.confidenceScore);
      
      // Log performance stats
      const endTime = Date.now();
      console.log(`Confidence score calculation completed in ${endTime - startTime}ms`);
      console.log(`Found ${matchingServices.length} matching services (threshold: ${this.CONFIDENCE_THRESHOLD * 100}%)`);
      
      // Log top matching services
      if (matchingServices.length > 0) {
        const topServices = matchingServices.slice(0, 5);  // Show top 5 at most
        console.log('Top matching services:');
        topServices.forEach((service, i) => {
          console.log(`${i+1}. ${service.name} (${service.id}) - Confidence: ${(service.confidenceScore * 100).toFixed(1)}%`);
        });
      } else {
        console.log('No matching services found above threshold');
      }
      
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
      
      // Enhanced context extraction
      const userMessages = [];
      if (conversationContext && conversationContext.recentMessages) {
        if (Array.isArray(conversationContext.recentMessages)) {
          userMessages.push(...conversationContext.recentMessages);
        } else if (typeof conversationContext.recentMessages === 'string') {
          userMessages.push(conversationContext.recentMessages);
        }
      }
      const messageText = userMessages.join(' ').toLowerCase();
      
      // DEBUG: Log extracted message text for keyword matching
      console.log(`Message text for keyword matching: "${messageText.substring(0, 100)}..."`);
      
      // Check for needs criteria
      if (service.criteria.needs && Array.isArray(service.criteria.needs)) {
        const needsCriteria = service.criteria.needs;
        totalCriteria += needsCriteria.length;
        
        console.log(`Service needs criteria: ${JSON.stringify(needsCriteria)}`);
        
        // Check each need in the criteria
        for (const need of needsCriteria) {
          let needMatched = false;
          
          console.log(`Checking need: ${need}`);
          
          // Define a mapping for needs that might be in different categories
          const needToCategory = {
            "remote_work_interest": ["employment"],
            "neurodivergent_traits": ["mental_health"],
            "seeking_job": ["employment"],
            "isolation": ["social"],
            "is_hikikomori": ["social"],
            "social_anxiety": ["social"],
            "loneliness": ["relationships"],
            "general_employment_interest": ["employment"],
            "technology_interest": ["interests"]
            // Add more mappings as needed
          };
          
          // First try direct match in all categories
          for (const category in userNeeds) {
            if (userNeeds[category] && typeof userNeeds[category] === 'object') {
              // Check if this need exists in this category
              if (userNeeds[category][need] === true) {
                matchCount++;
                needMatched = true;
                console.log(`✅ Need matched directly: ${need} in ${category}`);
                break;
              }
            }
          }
          
          // If not matched, try the mapping
          if (!needMatched && needToCategory[need]) {
            const categories = needToCategory[need];
            for (const category of categories) {
              if (userNeeds[category] && userNeeds[category][need] === true) {
                matchCount++;
                needMatched = true;
                console.log(`✅ Need matched via mapping: ${need} in ${category}`);
                break;
              }
            }
          }
          
          // Enhanced special case handling with strong message-based keyword matching
          if (!needMatched) {
            // Special case: neurodivergent_traits - Enhanced keyword check
            if (need === "neurodivergent_traits") {
              // Check for developmental disorder-related terms in message
              if (messageText.includes('発達障害') || 
                  messageText.includes('adhd') || 
                  messageText.includes('asd') || 
                  messageText.includes('自閉症') || 
                  messageText.includes('アスペルガー') ||
                  messageText.includes('発達特性') ||
                  messageText.includes('神経発達症') ||
                  messageText.includes('注意欠陥') ||
                  messageText.includes('多動性') ||
                  messageText.includes('感覚過敏')) {
                matchCount += 1.0; // Full match based on explicit mention
                console.log(`⚠️ Full match for ${need} via enhanced keyword check: found developmental disorder mention in message`);
                needMatched = true;
              }
            }
            
            // Special case: remote_work_interest - Enhanced keyword check
            if (need === "remote_work_interest") {
              // Check for remote work-related terms in message
              if (messageText.includes('在宅') || 
                  messageText.includes('リモート') || 
                  messageText.includes('remote') || 
                  messageText.includes('テレワーク') || 
                  messageText.includes('家から働') ||
                  messageText.includes('在宅ワーク') ||
                  messageText.includes('オンライン勤務') ||
                  messageText.includes('自宅勤務')) {
                matchCount += 1.0; // Full match based on explicit mention
                console.log(`⚠️ Full match for ${need} via enhanced keyword check: found remote work mention in message`);
                needMatched = true;
              }
            }
            
            // Special case: seeking_job - Enhanced keyword check
            if (need === "seeking_job") {
              // Check for job-seeking terms in message
              if (messageText.includes('仕事を探') || 
                  messageText.includes('就職したい') || 
                  messageText.includes('就労したい') || 
                  messageText.includes('働きたい') || 
                  messageText.includes('転職したい') ||
                  messageText.includes('求人') ||
                  messageText.includes('職を探')) {
                matchCount += 1.0; // Full match based on explicit mention
                console.log(`⚠️ Full match for ${need} via enhanced keyword check: found job-seeking mention in message`);
                needMatched = true;
              }
            }
            
            // Add other special cases as needed
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
                console.log(`⚠️ Exclusion matched: ${exclusion} in ${category} (penalty: 0.3)`);
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

  /**
   * Use AI to find matching services
   * @param {Object} userNeeds - The user's needs
   * @param {number} limit - Maximum number of services to return
   * @returns {Promise<Array>} - Array of matching services
   */
  async findMatchingServicesWithAI(userNeeds, limit = 5) {
    logger.info('ServiceRecommender', 'Starting AI-based service matching', { limit });
    
    if (!this.openaiApiKey) {
      logger.error('ServiceRecommender', 'OpenAI API key is required for AI matching');
      return [];
    }
    
    if (!userNeeds) {
      logger.warn('ServiceRecommender', 'AI matching called with empty userNeeds');
      return [];
    }
    
    try {
      // Create prompt for the model
      const userNeedsStr = JSON.stringify(userNeeds, null, 2);
      
      // Services information for the model
      const servicesInfoArray = this.services.map(service => ({
        id: service.id,
        name: service.name,
        description: service.description,
        criteria: service.criteria,
        tags: service.tags
      }));
      
      const servicesInfoStr = JSON.stringify(servicesInfoArray, null, 2);
      
      logger.debug('ServiceRecommender', 'Preparing AI matching prompt', {
        needsLength: userNeedsStr.length,
        servicesCount: servicesInfoArray.length,
        model: this.aiModel
      });
      
      // Call the model
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.aiModel,
          messages: [
            {
              role: 'system',
              content: `あなたは利用者のニーズとサービス情報をマッチングする専門システムです。利用者の特性やニーズに最も適したサービスを見つけてください。マッチングは以下のルールに従って行います：
1. サービスの criteria.needs に含まれる項目がユーザーニーズに存在する場合、そのサービスは適合の可能性があります
2. サービスの criteria.excludes に含まれる項目がユーザーニーズに存在する場合、そのサービスは除外されます
3. ユーザーのニーズカテゴリ（employment, mental_health など）がサービスの criteria.topics に含まれる場合、より適合度が高まります
4. サービスのタグ（tags）とユーザーニーズの内容の類似性も考慮します

結果は confidence スコア（0.0〜1.0）と共に、JSONフォーマットで以下の構造で返してください：
[
  { "serviceId": "service1", "confidence": 0.95, "reason": "マッチング理由の簡潔な説明" },
  { "serviceId": "service2", "confidence": 0.82, "reason": "マッチング理由の簡潔な説明" }
]

サービスIDが正確であることを確認してください。信頼度（confidence）が ${this.CONFIDENCE_THRESHOLD} 未満のサービスは含めないでください。`
            },
            {
              role: 'user',
              content: `# ユーザーニーズ:\n${userNeedsStr}\n\n# 利用可能なサービス:\n${servicesInfoStr}`
            }
          ],
          temperature: 0.1
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.openaiApiKey}`
          }
        }
      );
      
      // Parse results
      const aiResponseText = response.data.choices[0].message.content;
      logger.debug('ServiceRecommender', 'AI matching raw response', {
        responseSample: aiResponseText.substring(0, 200) + (aiResponseText.length > 200 ? '...' : '')
      });
      
      try {
        const aiResponse = JSON.parse(aiResponseText);
        
        // Validate and filter the results
        const validResults = aiResponse.filter(result => 
          result && 
          typeof result.serviceId === 'string' && 
          typeof result.confidence === 'number' && 
          result.confidence >= this.CONFIDENCE_THRESHOLD
        );
        
        // Get full service objects
        const matchingServices = validResults.map(result => {
          const service = this.services.find(s => s.id === result.serviceId);
          if (service) {
            return {
              ...service,
              confidence: result.confidence,
              matching_reason: result.reason || 'マッチング理由なし'
            };
          }
          return null;
        }).filter(Boolean);
        
        // Sort by confidence
        matchingServices.sort((a, b) => b.confidence - a.confidence);
        
        // Log results
        logger.info('ServiceRecommender', 'AI matching completed', {
          matchCount: matchingServices.length,
          inputCount: servicesInfoArray.length,
          topResult: matchingServices.length > 0 ? 
            `${matchingServices[0].id} (${(matchingServices[0].confidence * 100).toFixed(0)}%)` : 'None'
        });
        
        // Limit results
        return matchingServices.slice(0, limit);
      } catch (parseError) {
        logger.error('ServiceRecommender', 'Failed to parse AI response', parseError);
        return [];
      }
    } catch (error) {
      logger.error('ServiceRecommender', 'AI matching error', error);
      return [];
    }
  }
  
  /**
   * Use vector similarity to find matching services
   * @param {Object} userNeeds - The user's needs
   * @param {number} limit - Maximum number of services to return
   * @returns {Promise<Array>} - Array of matching services
   */
  async findMatchingServicesWithVectors(userNeeds, limit = 5) {
    logger.info('ServiceRecommender', 'Starting vector-based service matching', { limit });
    
    if (!this.openaiApiKey) {
      logger.error('ServiceRecommender', 'OpenAI API key is required for vector matching');
      return [];
    }
    
    if (!userNeeds) {
      logger.warn('ServiceRecommender', 'Vector matching called with empty userNeeds');
      return [];
    }
    
    try {
      // Check if embeddings are loaded
      if (!this.embeddingsLoaded) {
        if (Object.keys(this.serviceEmbeddings).length === 0) {
          // Generate embeddings for services
          const success = await this._generateAllServiceEmbeddings();
          if (!success) {
            logger.error('ServiceRecommender', 'Failed to generate service embeddings');
            return [];
          }
        }
        this.embeddingsLoaded = true;
      }
      
      // Convert userNeeds to text
      const userNeedsText = JSON.stringify(userNeeds);
      
      // Generate embedding for userNeeds
      logger.debug('ServiceRecommender', 'Generating embedding for user needs', { 
        userNeedsLength: userNeedsText.length 
      });
      const userEmbedding = await this._generateEmbedding(userNeedsText);
      
      // Calculate similarity scores
      const scores = [];
      for (const serviceId in this.serviceEmbeddings) {
        const serviceEmbedding = this.serviceEmbeddings[serviceId];
        const similarity = this._cosineSimilarity(userEmbedding, serviceEmbedding);
        
        const service = this.services.find(s => s.id === serviceId);
        if (service && similarity >= this.CONFIDENCE_THRESHOLD) {
          scores.push({
            ...service,
            confidence: similarity,
            matching_reason: 'ベクトル類似度によるマッチング'
          });
        }
      }
      
      // Sort by confidence
      scores.sort((a, b) => b.confidence - a.confidence);
      
      // Log results
      logger.info('ServiceRecommender', 'Vector matching completed', {
        matchCount: scores.length,
        inputCount: Object.keys(this.serviceEmbeddings).length,
        topResult: scores.length > 0 ? 
          `${scores[0].id} (${(scores[0].confidence * 100).toFixed(0)}%)` : 'None'
      });
      
      // Return top matches
      return scores.slice(0, limit);
    } catch (error) {
      logger.error('ServiceRecommender', 'Vector matching error', error);
      return [];
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