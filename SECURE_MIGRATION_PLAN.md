# 🔐 セキュリティ強化型PostgreSQL移行実行計画

## 📋 実装完了項目

### ✅ セキュリティ機能
1. **データ暗号化**
   - AES-256-GCM暗号化実装
   - 個人情報の自動暗号化/復号化
   - ユーザーIDのハッシュ化

2. **アクセス制御**
   - SSL/TLS強制接続
   - 接続プール制限
   - クエリタイムアウト設定

3. **監査ログ**
   - セキュリティイベント記録
   - アクセスログ自動保存
   - 個人情報マスキング

4. **プライバシー保護**
   - ログ出力時の自動マスキング
   - Airtableフォールバック時の内容制限

## 🚀 移行実行手順

### Phase 1: 即座実行（今すぐ）

1. **ローカル環境での暗号化キー生成**
```bash
# 各種キーを生成してメモ
openssl rand -hex 32  # ENCRYPTION_KEY用
openssl rand -hex 32  # E2EE_PASSPHRASE用
openssl rand -hex 32  # AUDIT_HMAC_KEY用
```

2. **Heroku環境変数設定**
```bash
# PostgreSQL優先設定
heroku config:set USE_POSTGRESQL=true

# セキュリティキー設定
heroku config:set ENCRYPTION_KEY=（生成したキー1）
heroku config:set E2EE_PASSPHRASE=（生成したキー2）
heroku config:set AUDIT_HMAC_KEY=（生成したキー3）

# Apple基準設定
heroku config:set PRIVACY_EPSILON=1.0
heroku config:set DATA_RETENTION_DAYS=90
heroku config:set K_ANONYMITY_THRESHOLD=5
```

3. **ファイルコミット & デプロイ**
```bash
# すべての変更をコミット
git add .
git commit -m "Apple並みセキュリティ基準実装 + PostgreSQL移行準備"

# Herokuへデプロイ
git push heroku main
```

4. **データベース初期化**
```bash
# 新しいテーブル構造を作成
heroku run "node -e \"require('./db').initializeTables()\""
```

5. **データ移行実行**
```bash
# ローカルで移行（安全のため）
node migrate_to_postgresql.js

# または、Heroku上で実行
heroku run node migrate_to_postgresql.js
```

### Phase 2: データ移行（週末実行）

1. **Airtableデータエクスポート**
```javascript
// migration_script.js
const exportAirtableData = async () => {
  const records = await airtableBase('ConversationHistory')
    .select({maxRecords: 10000})
    .all();
  
  // JSONファイルに保存
  fs.writeFileSync('airtable_backup.json', JSON.stringify(records));
};
```

2. **PostgreSQLへインポート**
```javascript
const importToPostgreSQL = async () => {
  const data = JSON.parse(fs.readFileSync('airtable_backup.json'));
  
  for (const record of data) {
    await db.storeSecureUserMessage(
      record.fields.UserID,
      record.id,
      record.fields.Content,
      record.fields.Role,
      record.fields.Mode || 'general',
      record.fields.MessageType || 'text'
    );
  }
};
```

### Phase 3: 運用開始

1. **動作確認**
   - メッセージ送信テスト
   - 履歴取得テスト
   - 暗号化確認

2. **監視設定**
   - セキュリティログ確認
   - パフォーマンス監視
   - エラーアラート設定

## 🔒 セキュリティチェックリスト

- [ ] 強力な暗号化キー設定（32文字以上）
- [ ] SSL証明書有効性確認
- [ ] アクセスログ記録確認
- [ ] バックアップ設定
- [ ] 定期的なセキュリティ監査
- [ ] 暗号化キーの定期ローテーション計画

## 📊 期待される効果

### セキュリティ向上
- **データ暗号化**: 100%の個人情報を暗号化
- **アクセス制御**: 内部ネットワークのみ
- **監査証跡**: 全アクセスの記録

### コスト削減
- **月額**: $60 → $0
- **年間**: $720節約
- **将来的拡張性**: 無制限

### パフォーマンス
- **レスポンス**: 高速化（内部通信）
- **スケーラビリティ**: 大幅向上
- **可用性**: 99.9%以上

## ⚠️ 注意事項

1. **暗号化キーは絶対に公開しない**
2. **定期的なバックアップを実施**
3. **セキュリティログを定期確認**
4. **Airtableは完全移行後に無効化**

## 🎯 成功基準

- ✅ 全データの暗号化保存
- ✅ セキュリティイベントログ稼働
- ✅ Airtable容量エラー解消
- ✅ 月額コスト$0達成

---

**実行開始日**: 2025年1月22日
**完了予定日**: 2025年1月末
**責任者**: Adam AI管理者 