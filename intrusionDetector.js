const logger = require('./logger');

// Regular expressions for detecting common attack patterns
const attackPatterns = {
    sqlInjection: new RegExp(`(\\s*select\\s.*from\\s.*)|(\\s*insert\\s.*into\\s.*)|(\\s*update\\s.*set\\s.*)|(\\s*delete\\s.*from\\s.*)|(--)|(;)|(xp_)|(union\\s*select)`, 'i'),
    xss: new RegExp(`(<\\s*script\\s*>)|(on\\w+\\s*=)|(javascript:)|(<\\s*iframe)|(<\\s*img\\s*src\\s*=\\s*['"]?javascript:)|(alert\\()`, 'i'),
    commandInjection: new RegExp(`(&&)|(\\|\\|)|(;\\s*\\w+)|(\\$\\(|\\\`\\w+)|(>\\s*/dev/null)`, 'i'),
    pathTraversal: new RegExp(`(\\.\\.\\/)|(\\.\\.\\\\)`, 'i'),
};

/**
 * Detects potential attacks in a given text.
 * @param {string} text The text to analyze.
 * @returns {{isAttack: boolean, type: string|null}} Object indicating if an attack is detected and its type.
 */
function detect(text) {
    if (typeof text !== 'string') {
        return { isAttack: false, type: null };
    }
    for (const [type, pattern] of Object.entries(attackPatterns)) {
        if (pattern.test(text)) {
            return { isAttack: true, type: type };
        }
    }
    return { isAttack: false, type: null };
}

/**
 * Middleware to detect and log intrusion attempts.
 */
function intrusionDetectionMiddleware(req, res, next) {
    if (req.body && req.body.events) {
        for (const event of req.body.events) {
            if (event.type === 'message' && event.message.type === 'text') {
                const text = event.message.text;
                const result = detect(text);
                
                if (result.isAttack) {
                    const userId = event.source.userId;
                    const ip = req.ip || req.connection.remoteAddress;

                    const logMessage = `[INTRUSION DETECTED] Type: ${result.type}, UserID: ${userId}, IP: ${ip}, Payload: "${text}"`;
                    console.error(logMessage);
                    logger.warn('IntrusionDetection', 'Potential attack detected', {
                        type: result.type,
                        userId: userId,
                        ip: ip,
                        payload: text
                    });
                }
            }
        }
    }
    next();
}

module.exports = {
    detect,
    intrusionDetectionMiddleware
};
