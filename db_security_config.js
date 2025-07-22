// PostgreSQL セキュリティ強化設定
const securityConfig = {
  // SSL/TLS強制設定
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.DATABASE_CA_CERT,
    key: process.env.DATABASE_CLIENT_KEY,
    cert: process.env.DATABASE_CLIENT_CERT
  },
  
  // 接続プール設定（攻撃対策）
  connectionPool: {
    max: 10,                    // 最大接続数制限
    idleTimeoutMillis: 30000,   // アイドル接続の早期切断
    connectionTimeoutMillis: 2000,
    statement_timeout: 30000,    // クエリタイムアウト
    query_timeout: 30000
  },
  
  // IPホワイトリスト（Heroku内部のみ）
  allowedIPs: process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',') : [],
  
  // 暗号化設定
  encryption: {
    algorithm: 'aes-256-gcm',
    keyDerivation: 'pbkdf2',
    iterations: 100000
  }
};

module.exports = securityConfig; 