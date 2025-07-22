const fs = require('fs');
const crypto = require('crypto');

console.log('🔧 デモ用環境変数設定...');

// ランダムなキーを生成
const randomKey = crypto.randomBytes(32).toString('hex');
const randomPassphrase = crypto.randomBytes(16).toString('hex') + '-demo-passphrase';

const envContent = `# Demo環境変数設定
# 注意: これらはテスト用の値です。本番環境では実際の値に置き換えてください

# Airtable（データ永続化用）
AIRTABLE_API_KEY=demo_key_${crypto.randomBytes(8).toString('hex')}
AIRTABLE_BASE_ID=demo_base_${crypto.randomBytes(8).toString('hex')}

# データベース設定（PostgreSQL）
DATABASE_URL=postgres://demo:demo@localhost:5432/demo_db

# セキュリティ設定
ENCRYPTION_KEY=${randomKey}

# Apple並みセキュリティ設定
E2EE_PASSPHRASE=${randomPassphrase}
AUDIT_HMAC_KEY=${crypto.randomBytes(32).toString('hex')}
DELETION_CERT_KEY=${crypto.randomBytes(32).toString('hex')}
PRIVACY_EPSILON=1.0
DATA_RETENTION_DAYS=90
K_ANONYMITY_THRESHOLD=5
`;

fs.writeFileSync('.env', envContent);
console.log('✅ .envファイルを作成しました（デモ用設定）');
console.log('\n⚠️ 注意: 本番環境では実際のAPI キーとデータベースURLを設定してください');
