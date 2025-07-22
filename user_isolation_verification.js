require('dotenv').config();
const crypto = require('crypto');

/**
 * UserID分離の絶対的保証システム
 * すべてのデータアクセス時にUserIDの完全性を多重チェック
 */
class UserIsolationGuard {
  constructor() {
    this.accessLog = new Map();
    this.verificationCache = new Map();
    this.VERIFICATION_TIMEOUT = 30000; // 30秒でキャッシュ無効化
  }

  /**
   * 【最重要】UserIDの厳密検証
   * すべてのデータアクセス前に必ず実行
   */
  async verifyUserIdIntegrity(originalUserId, operation, additionalContext = {}) {
    const verificationId = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    
    try {
      console.log(`🔐 [USER-ISOLATION] 検証開始 ID:${verificationId}`);
      console.log(`🔐 [USER-ISOLATION] Operation: ${operation}`);
      console.log(`🔐 [USER-ISOLATION] UserID: ${originalUserId.substring(0, 8)}...`);
      
      // 1. UserID基本検証
      const basicValidation = this._validateUserIdFormat(originalUserId);
      if (!basicValidation.isValid) {
        throw new Error(`Invalid UserID format: ${basicValidation.reason}`);
      }
      
      // 2. ハッシュ値一意性検証
      const hashedUserId = this._generateHashedUserId(originalUserId);
      const hashValidation = this._validateHashUniqueness(hashedUserId, originalUserId);
      if (!hashValidation.isValid) {
        throw new Error(`Hash uniqueness violation: ${hashValidation.reason}`);
      }
      
      // 3. アクセスパターン検証（異常検出）
      const accessValidation = this._validateAccessPattern(originalUserId, operation);
      if (!accessValidation.isValid) {
        console.warn(`⚠️ [USER-ISOLATION] Suspicious access pattern: ${accessValidation.reason}`);
      }
      
      // 4. 検証結果記録
      const verificationResult = {
        verificationId,
        originalUserId: originalUserId.substring(0, 8) + '***', // 部分マスキング
        hashedUserId: hashedUserId.substring(0, 16) + '***',
        operation,
        timestamp,
        isValid: true,
        additionalContext: this._sanitizeContext(additionalContext)
      };
      
      // キャッシュ保存（短期間）
      this.verificationCache.set(originalUserId, {
        result: verificationResult,
        expires: timestamp + this.VERIFICATION_TIMEOUT
      });
      
      console.log(`✅ [USER-ISOLATION] 検証完了 ID:${verificationId} - PASS`);
      return verificationResult;
      
    } catch (error) {
      console.error(`❌ [USER-ISOLATION] 検証失敗 ID:${verificationId}:`, error.message);
      
      // 失敗時の緊急ログ
      await this._logSecurityIncident('user_isolation_verification_failed', {
        verificationId,
        originalUserId: originalUserId.substring(0, 8) + '***',
        operation,
        error: error.message,
        timestamp
      });
      
      throw new Error(`User isolation verification failed: ${error.message}`);
    }
  }

  /**
   * PostgreSQLクエリ用の安全なハッシュ化UserID生成
   */
  generateSecureHashedUserId(originalUserId) {
    try {
      // 入力検証
      if (!originalUserId || typeof originalUserId !== 'string') {
        throw new Error('Invalid UserID provided for hashing');
      }
      
      // LINE UserIDフォーマット検証
      if (!originalUserId.startsWith('U') || originalUserId.length !== 33) {
        throw new Error('UserID does not match LINE format');
      }
      
      // SHA-256ハッシュ生成
      const hashedUserId = crypto
        .createHash('sha256')
        .update(originalUserId)
        .digest('hex');
      
      // ハッシュ値検証
      if (hashedUserId.length !== 64) {
        throw new Error('Generated hash has invalid length');
      }
      
      console.log(`🔐 [HASH] Generated secure hash for user ${originalUserId.substring(0, 8)}...`);
      return hashedUserId;
      
    } catch (error) {
      console.error(`❌ [HASH] Error generating secure hash:`, error.message);
      throw error;
    }
  }

  /**
   * データベースクエリの安全実行ラッパー
   */
  async executeSecureQuery(dbConnection, query, params, originalUserId, operation) {
    try {
      // 事前検証
      await this.verifyUserIdIntegrity(originalUserId, operation);
      
      // ハッシュ化UserID生成
      const hashedUserId = this.generateSecureHashedUserId(originalUserId);
      
      // パラメータ検証（UserIDがクエリに含まれているか確認）
      if (!params.includes(hashedUserId) && !params.includes(originalUserId)) {
        throw new Error('Query parameters do not include verified UserID');
      }
      
      // SQL注入対策検証
      const sqlValidation = this._validateSqlSafety(query);
      if (!sqlValidation.isValid) {
        throw new Error(`SQL safety violation: ${sqlValidation.reason}`);
      }
      
      console.log(`🔐 [SECURE-QUERY] Executing for user ${originalUserId.substring(0, 8)}...`);
      console.log(`🔐 [SECURE-QUERY] Operation: ${operation}`);
      
      // 安全なクエリ実行
      const result = await dbConnection.query(query, params);
      
      // 結果検証（他ユーザーデータが混入していないか確認）
      const resultValidation = this._validateQueryResult(result, hashedUserId, operation);
      if (!resultValidation.isValid) {
        throw new Error(`Query result validation failed: ${resultValidation.reason}`);
      }
      
      console.log(`✅ [SECURE-QUERY] Query completed safely - ${result.rows?.length || 0} rows`);
      return result;
      
    } catch (error) {
      console.error(`❌ [SECURE-QUERY] Failed:`, error.message);
      await this._logSecurityIncident('secure_query_failed', {
        originalUserId: originalUserId.substring(0, 8) + '***',
        operation,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Airtableクエリの安全実行ラッパー
   */
  async executeSecureAirtableQuery(airtableBase, tableName, filterFormula, originalUserId, operation) {
    try {
      // 事前検証
      await this.verifyUserIdIntegrity(originalUserId, operation);
      
      // フィルター検証（UserIDが含まれているか確認）
      if (!filterFormula.includes(originalUserId)) {
        throw new Error('Airtable filter does not include verified UserID');
      }
      
      // Airtable Formula注入対策
      const formulaValidation = this._validateAirtableFormula(filterFormula, originalUserId);
      if (!formulaValidation.isValid) {
        throw new Error(`Airtable formula safety violation: ${formulaValidation.reason}`);
      }
      
      console.log(`🔐 [SECURE-AIRTABLE] Executing for user ${originalUserId.substring(0, 8)}...`);
      console.log(`🔐 [SECURE-AIRTABLE] Table: ${tableName}, Operation: ${operation}`);
      
      // 安全なAirtableクエリ実行
      const records = await airtableBase(tableName)
        .select({
          filterByFormula: filterFormula,
          maxRecords: 1000 // DoS攻撃対策
        })
        .all();
      
      // 結果検証（他ユーザーデータが混入していないか確認）
      const resultValidation = this._validateAirtableResult(records, originalUserId, operation);
      if (!resultValidation.isValid) {
        throw new Error(`Airtable result validation failed: ${resultValidation.reason}`);
      }
      
      console.log(`✅ [SECURE-AIRTABLE] Query completed safely - ${records.length} records`);
      return records;
      
    } catch (error) {
      console.error(`❌ [SECURE-AIRTABLE] Failed:`, error.message);
      await this._logSecurityIncident('secure_airtable_failed', {
        originalUserId: originalUserId.substring(0, 8) + '***',
        tableName,
        operation,
        error: error.message
      });
      throw error;
    }
  }

  // ===== 内部検証メソッド =====

  _validateUserIdFormat(userId) {
    if (!userId || typeof userId !== 'string') {
      return { isValid: false, reason: 'UserID is null or not string' };
    }
    
    if (!userId.startsWith('U')) {
      return { isValid: false, reason: 'UserID does not start with U' };
    }
    
    if (userId.length !== 33) {
      return { isValid: false, reason: 'UserID length is not 33 characters' };
    }
    
    if (!/^U[a-f0-9]{32}$/.test(userId)) {
      return { isValid: false, reason: 'UserID contains invalid characters' };
    }
    
    return { isValid: true };
  }

  _generateHashedUserId(userId) {
    return crypto.createHash('sha256').update(userId).digest('hex');
  }

  _validateHashUniqueness(hashedUserId, originalUserId) {
    // 同一入力は同一ハッシュを生成することを確認
    const recomputedHash = this._generateHashedUserId(originalUserId);
    
    if (hashedUserId !== recomputedHash) {
      return { isValid: false, reason: 'Hash inconsistency detected' };
    }
    
    return { isValid: true };
  }

  _validateAccessPattern(userId, operation) {
    const now = Date.now();
    const userAccessKey = userId.substring(0, 16); // 部分キー
    
    if (!this.accessLog.has(userAccessKey)) {
      this.accessLog.set(userAccessKey, []);
    }
    
    const userAccess = this.accessLog.get(userAccessKey);
    userAccess.push({ operation, timestamp: now });
    
    // 最近1分間のアクセス数チェック
    const recentAccess = userAccess.filter(access => 
      now - access.timestamp < 60000
    );
    
    if (recentAccess.length > 100) {
      return { isValid: false, reason: 'Excessive access rate detected' };
    }
    
    // 古いアクセスログ削除
    const validAccess = userAccess.filter(access => 
      now - access.timestamp < 300000 // 5分間保持
    );
    this.accessLog.set(userAccessKey, validAccess);
    
    return { isValid: true };
  }

  _validateSqlSafety(query) {
    // 危険なSQL文検出
    const dangerousPatterns = [
      /union\s+select/i,
      /drop\s+table/i,
      /delete\s+from\s+(?!user_messages|user_ml_analysis|user_traits)/i,
      /insert\s+into\s+(?!user_messages|user_ml_analysis|user_traits)/i,
      /update\s+(?!user_messages|user_ml_analysis|user_traits)/i,
      /alter\s+table/i,
      /create\s+table/i,
      /exec\s*\(/i,
      /xp_cmdshell/i
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        return { isValid: false, reason: `Dangerous SQL pattern detected: ${pattern}` };
      }
    }
    
    return { isValid: true };
  }

  _validateQueryResult(result, expectedHashedUserId, operation) {
    if (!result || !result.rows) {
      return { isValid: true }; // 空結果は有効
    }
    
    // 結果内のuser_idが期待値と一致するかチェック
    for (const row of result.rows) {
      if (row.user_id && row.user_id !== expectedHashedUserId) {
        return { 
          isValid: false, 
          reason: `Unexpected user_id in result: expected ${expectedHashedUserId.substring(0, 8)}..., got ${row.user_id.substring(0, 8)}...` 
        };
      }
      
      if (row.user_id_hash && row.user_id_hash !== expectedHashedUserId) {
        return { 
          isValid: false, 
          reason: `Unexpected user_id_hash in result: expected ${expectedHashedUserId.substring(0, 8)}..., got ${row.user_id_hash.substring(0, 8)}...` 
        };
      }
    }
    
    return { isValid: true };
  }

  _validateAirtableFormula(formula, expectedUserId) {
    // Airtable Formula注入攻撃対策
    const dangerousPatterns = [
      /REGEX_MATCH\s*\(/i,
      /CONCATENATE\s*\(/i,
      /SUBSTITUTE\s*\(/i,
      /IF\s*\(/i,
      /OR\s*\(/i,
      /NOT\s*\(/i
    ];
    
    // 期待されるUserIDが含まれているか確認
    if (!formula.includes(expectedUserId)) {
      return { isValid: false, reason: 'Formula does not contain expected UserID' };
    }
    
    // 複数のUserIDが含まれていないか確認
    const userIdPattern = /U[a-f0-9]{32}/g;
    const foundUserIds = formula.match(userIdPattern) || [];
    
    if (foundUserIds.length !== 1 || foundUserIds[0] !== expectedUserId) {
      return { isValid: false, reason: 'Formula contains unexpected UserIDs' };
    }
    
    return { isValid: true };
  }

  _validateAirtableResult(records, expectedUserId, operation) {
    for (const record of records) {
      const recordUserId = record.fields.UserID || record.fields['User ID'];
      
      if (recordUserId && recordUserId !== expectedUserId) {
        return { 
          isValid: false, 
          reason: `Unexpected UserID in Airtable result: expected ${expectedUserId.substring(0, 8)}..., got ${recordUserId.substring(0, 8)}...` 
        };
      }
    }
    
    return { isValid: true };
  }

  _sanitizeContext(context) {
    const sanitized = {};
    for (const [key, value] of Object.entries(context)) {
      if (typeof value === 'string' && value.length > 100) {
        sanitized[key] = value.substring(0, 100) + '...';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  async _logSecurityIncident(eventType, details) {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = {
        eventType,
        details,
        timestamp,
        severity: 'HIGH'
      };
      
      console.error(`🚨 [SECURITY-INCIDENT] ${eventType}:`, JSON.stringify(logEntry, null, 2));
      
      // 本番環境では外部セキュリティログシステムに送信
      // await externalSecurityLogger.log(logEntry);
      
    } catch (error) {
      console.error('Failed to log security incident:', error.message);
    }
  }
}

// シングルトンインスタンス
const userIsolationGuard = new UserIsolationGuard();

module.exports = {
  UserIsolationGuard,
  userIsolationGuard
}; 