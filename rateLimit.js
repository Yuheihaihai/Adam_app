/**
 * 音声メッセージAPI用レート制限ミドルウェア
 * 
 * Express.jsのミドルウェアとして使用し、APIリクエストのレート制限を実装します。
 * 月間の総量制限と1日あたりのユーザー制限を監視します。
 */

const insightsService = require('./insightsService');

// ユーザーごとのリクエスト追跡
const requestTracker = new Map();

/**
 * 音声メッセージAPIレート制限ミドルウェア
 * @param {Object} req - Expressリクエストオブジェクト
 * @param {Object} res - Expressレスポンスオブジェクト
 * @param {Function} next - 次のミドルウェア関数
 */
function voiceRateLimiter(req, res, next) {
  const userId = req.body.userId || req.query.userId || 'anonymous';
  
  // 音声メッセージリクエストを追跡
  const result = insightsService.trackAudioRequest(userId);
  
  if (!result.allowed) {
    // レスポンスヘッダーに制限情報を含める
    res.setHeader('X-RateLimit-Limit-Daily', result.userDailyLimit);
    res.setHeader('X-RateLimit-Remaining-Daily', Math.max(0, result.userDailyLimit - result.userDailyCount));
    res.setHeader('X-RateLimit-Limit-Monthly', result.globalMonthlyLimit);
    res.setHeader('X-RateLimit-Remaining-Monthly', Math.max(0, result.globalMonthlyLimit - result.globalMonthlyCount));
    
    // 429 Too Many Requestsエラー
    return res.status(429).json({
      error: 'rate_limit_exceeded',
      message: result.message,
      reason: result.reason,
      retryAfter: result.reason === 'user_daily_limit' ? 
        getSecondsUntilTomorrow() : 
        getSecondsUntilNextMonth()
    });
  }
  
  // 制限内なのでリクエストを処理
  next();
}

/**
 * 翌日までの秒数を計算
 * @returns {number} 翌日までの秒数
 */
function getSecondsUntilTomorrow() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return Math.ceil((tomorrow - now) / 1000);
}

/**
 * 翌月までの秒数を計算
 * @returns {number} 翌月までの秒数
 */
function getSecondsUntilNextMonth() {
  const now = new Date();
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(1);
  nextMonth.setHours(0, 0, 0, 0);
  return Math.ceil((nextMonth - now) / 1000);
}

module.exports = voiceRateLimiter; 