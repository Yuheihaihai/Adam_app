// 個人情報暗号化ユーティリティ
const crypto = require('crypto');

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.secretKey = this.deriveKey(process.env.ENCRYPTION_KEY || 'default-key-change-this');
  }

  deriveKey(password) {
    // PBKDF2でキー導出（パスワードベース暗号化）
    return crypto.pbkdf2Sync(password, 'adam-ai-salt', 100000, 32, 'sha256');
  }

  encrypt(text) {
    if (!text) return null;
    
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      // IV + AuthTag + 暗号文を結合
      return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('Encryption error:', error);
      return null;
    }
  }

  decrypt(encryptedData) {
    if (!encryptedData) return null;
    
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) return null;
      
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];
      
      const decipher = crypto.createDecipheriv(this.algorithm, this.secretKey, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      return null;
    }
  }

  // 個人情報のマスキング（ログ用）
  maskSensitiveData(data) {
    if (!data || typeof data !== 'string') return data;
    
    // メールアドレスのマスキング
    data = data.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, 
      (match, user, domain) => user.substring(0, 2) + '***@' + domain);
    
    // 電話番号のマスキング
    data = data.replace(/(\d{3})-?(\d{4})-?(\d{4})/g, '$1-****-****');
    
    // LINEユーザーIDのマスキング
    data = data.replace(/U[a-f0-9]{32}/g, 'U**********************');
    
    return data;
  }

  // セキュアランダム文字列生成
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }
}

module.exports = new EncryptionService(); 