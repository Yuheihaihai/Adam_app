const { 
  politeAdvicePatterns, 
  casualAdvicePatterns, 
  problemPatterns, 
  questionWords, 
  explicitAdvicePatterns 
} = require('./advice_patterns');

/**
 * Detects if a message contains a request for advice
 * @param {string} message - The user message to analyze
 * @returns {boolean} - True if the message contains an advice request
 */
function isAdviceRequest(message) {
  if (!message || typeof message !== 'string') {
    return false;
  }

  // Convert to lowercase for case-insensitive matching
  const lowerMessage = message.toLowerCase();

  // Check for explicit advice patterns first (most reliable)
  for (const pattern of explicitAdvicePatterns) {
    if (lowerMessage.includes(pattern.toLowerCase())) {
      console.log(`Advice request detected: explicit pattern "${pattern}" found`);
      return true;
    }
  }

  // Check for polite advice patterns
  for (const pattern of politeAdvicePatterns) {
    if (lowerMessage.includes(pattern.toLowerCase())) {
      console.log(`Advice request detected: polite pattern "${pattern}" found`);
      return true;
    }
  }

  // Check for casual advice patterns
  for (const pattern of casualAdvicePatterns) {
    if (lowerMessage.includes(pattern.toLowerCase())) {
      console.log(`Advice request detected: casual pattern "${pattern}" found`);
      return true;
    }
  }

  // Check for problem statements combined with question words
  // This is a more nuanced check for implicit advice requests
  let hasQuestionWord = false;
  let hasProblemPattern = false;

  for (const word of questionWords) {
    if (lowerMessage.includes(word)) {
      hasQuestionWord = true;
      break;
    }
  }

  for (const pattern of problemPatterns) {
    if (lowerMessage.includes(pattern)) {
      hasProblemPattern = true;
      break;
    }
  }

  // If both a question word and problem pattern are present, it's likely an advice request
  if (hasQuestionWord && hasProblemPattern) {
    console.log('Advice request detected: question word + problem pattern combination');
    return true;
  }

  return false;
}

/**
 * Gets the confidence level that a message is requesting advice
 * @param {string} message - The user message to analyze
 * @returns {number} - Confidence score between 0 and 1
 */
function getAdviceRequestConfidence(message) {
  if (!message || typeof message !== 'string') {
    return 0;
  }

  const lowerMessage = message.toLowerCase();
  let score = 0;
  let matchCount = 0;

  // Check explicit patterns (highest confidence)
  for (const pattern of explicitAdvicePatterns) {
    if (lowerMessage.includes(pattern.toLowerCase())) {
      score += 0.9; // Very high confidence
      matchCount++;
    }
  }

  // Check polite patterns
  for (const pattern of politeAdvicePatterns) {
    if (lowerMessage.includes(pattern.toLowerCase())) {
      score += 0.7; // High confidence
      matchCount++;
    }
  }

  // Check casual patterns
  for (const pattern of casualAdvicePatterns) {
    if (lowerMessage.includes(pattern.toLowerCase())) {
      score += 0.6; // Moderate-high confidence
      matchCount++;
    }
  }

  // Check for problem statements
  let problemCount = 0;
  for (const pattern of problemPatterns) {
    if (lowerMessage.includes(pattern)) {
      problemCount++;
    }
  }

  // Check for question words
  let questionWordCount = 0;
  for (const word of questionWords) {
    if (lowerMessage.includes(word)) {
      questionWordCount++;
    }
  }

  // Add score for problem + question word combinations
  if (problemCount > 0 && questionWordCount > 0) {
    score += 0.5 * Math.min(problemCount, questionWordCount);
    matchCount += Math.min(problemCount, questionWordCount);
  }

  // Normalize score based on match count
  if (matchCount > 0) {
    return Math.min(score / matchCount, 1.0);
  }

  return 0;
}

/**
 * Extracts the specific advice patterns found in a message
 * @param {string} message - The user message to analyze
 * @returns {Object} - Object containing matched patterns by category
 */
function extractAdvicePatterns(message) {
  if (!message || typeof message !== 'string') {
    return { 
      explicit: [], 
      polite: [], 
      casual: [], 
      problems: [], 
      questionWords: [] 
    };
  }

  const lowerMessage = message.toLowerCase();
  const result = {
    explicit: [],
    polite: [],
    casual: [],
    problems: [],
    questionWords: []
  };

  // Extract explicit patterns
  for (const pattern of explicitAdvicePatterns) {
    if (lowerMessage.includes(pattern.toLowerCase())) {
      result.explicit.push(pattern);
    }
  }

  // Extract polite patterns
  for (const pattern of politeAdvicePatterns) {
    if (lowerMessage.includes(pattern.toLowerCase())) {
      result.polite.push(pattern);
    }
  }

  // Extract casual patterns
  for (const pattern of casualAdvicePatterns) {
    if (lowerMessage.includes(pattern.toLowerCase())) {
      result.casual.push(pattern);
    }
  }

  // Extract problem patterns
  for (const pattern of problemPatterns) {
    if (lowerMessage.includes(pattern)) {
      result.problems.push(pattern);
    }
  }

  // Extract question words
  for (const word of questionWords) {
    if (lowerMessage.includes(word)) {
      result.questionWords.push(word);
    }
  }

  return result;
}

module.exports = {
  isAdviceRequest,
  getAdviceRequestConfidence,
  extractAdvicePatterns
}; 