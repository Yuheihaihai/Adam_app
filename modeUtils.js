/**
 * Lightweight exports for mode detection used in tests and server logic.
 * This module has no side effects (no server/db imports) to keep tests isolated.
 */

const careerKeywords = ['仕事', 'キャリア', '職業', '転職', '就職', '働き方', '業界', '適職診断'];

function isDeepExplorationRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const deepExplorationPhrase = 'もっと深く考えを掘り下げて例を示しながらさらに分かり易く言葉で教えてください。抽象的言葉禁止。';
  const deepExplorationPartial = 'もっと深く考えを掘り下げて';
  const additionalTriggers = ['もっと詳しく', '詳しく教えて', '掘り下げて'];
  return (
    text.includes(deepExplorationPhrase) ||
    text.includes(deepExplorationPartial) ||
    additionalTriggers.some(t => text.includes(t))
  );
}

function determineModeAndLimit(userMessage) {
  if (typeof userMessage !== 'string') {
    return { mode: 'general', limit: 30 };
  }

  if (isDeepExplorationRequest(userMessage)) {
    return { mode: 'deep-exploration', limit: 8000, temperature: 0.7 };
  }

  const hasCareerKeyword = careerKeywords.some(keyword => userMessage.includes(keyword));
  if (hasCareerKeyword) {
    return { mode: 'career', limit: 200 };
  }

  const memoryTestPatterns = ['覚えてる', '覚えていますか', '前の', '過去の', '前回', '以前', '記憶してる', '思い出せる'];
  if (memoryTestPatterns.some(pattern => userMessage.includes(pattern))) {
    return { mode: 'memoryTest', limit: 50 };
  }

  const lcMsg = userMessage.toLowerCase();
  if (
    lcMsg.includes('特性') ||
    lcMsg.includes('分析') ||
    lcMsg.includes('思考') ||
    lcMsg.includes('傾向') ||
    lcMsg.includes('パターン') ||
    lcMsg.includes('コミュニケーション') ||
    lcMsg.includes('対人関係') ||
    lcMsg.includes('性格')
  ) {
    return { mode: 'characteristics', limit: 200 };
  }

  if (
    lcMsg.includes('思い出して') ||
    lcMsg.includes('今までの話') ||
    lcMsg.includes('今までの会話') ||
    lcMsg.includes('要約して')
  ) {
    return { mode: 'memoryRecall', limit: 200 };
  }

  if (
    lcMsg.includes('人間関係') ||
    lcMsg.includes('友人') ||
    lcMsg.includes('同僚') ||
    lcMsg.includes('恋愛') ||
    lcMsg.includes('パートナー')
  ) {
    return { mode: 'humanRelationship', limit: 200 };
  }

  const POSITIVE_KEYWORDS = ['ありがとう', '助かった', '感謝', '嬉しい', '助けられた'];
  const PERSONAL_REFERENCES = ['adam', 'あなた', 'きみ', '君', 'Adam'];
  if (
    PERSONAL_REFERENCES.some(ref => lcMsg.includes(ref)) &&
    POSITIVE_KEYWORDS.some(keyword => lcMsg.includes(keyword))
  ) {
    return { mode: 'share', limit: 10 };
  }

  return { mode: 'general', limit: 30 };
}

module.exports = { determineModeAndLimit, isDeepExplorationRequest };


