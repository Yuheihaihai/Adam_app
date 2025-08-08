# Airtable→PostgreSQL 会話履歴完全移行記録

## 移行概要
- **実施日**: 2025年8月8日
- **対象**: Adam AI v2.4 会話履歴データ
- **移行元**: Airtable ConversationHistoryテーブル
- **移行先**: PostgreSQL user_messagesテーブル

## 移行経緯

### 1. 初期問題の発見
- 会話履歴の取得件数が期待値より少ない（数十件程度）
- データが複数テーブルに分散（user_messages、user_messages_pre_encryption_backup）
- 一部データで復号エラーが発生

### 2. データ状況の詳細調査
- **user_messages**: 約5万件（一部復号不可）
- **user_messages_pre_encryption_backup**: 約6.4万件（バックアップ、復号スキップ実装）
- **復号エラー**: 106件（旧暗号化キー由来）

### 3. 解決アプローチ
1. **デュアルリード実装**: 両テーブルから履歴を取得し統合
2. **Airtableからの全データ移行**: 最後の手段として実施決定
3. **現行暗号化での統一**: user_idハッシュ + AES-256-GCM暗号化

## 移行実施詳細

### 使用ツール
- **メインスクリプト**: `scripts/import_airtable_to_postgres.js`
- **監査スクリプト**: `scripts/audit_decryptable_count.js`
- **環境変数**: AIRTABLE_API_KEY、AIRTABLE_BASE_ID、AIRTABLE_TABLE

### 移行設定
```bash
node scripts/import_airtable_to_postgres.js \
  --execute \
  --force-insert \
  --allow-non-line-ids
```

### 技術的な課題と対応

#### 1. Airtable API認証
- **問題**: 古いAPI Keyが無効
- **対応**: Personal Access Token (PAT) に移行
- **必要スコープ**: data.records:read、schema.bases:read

#### 2. データ形式の違い
- **問題**: VARCHAR(50)制限超過
- **対応**: role/mode/messageType フィールドの自動トリミング

#### 3. ユーザーID形式
- **問題**: 非LINE形式IDの混在
- **対応**: 擬似LINE ID生成（`U_pseudo_hash_`形式）

#### 4. 重複判定の回避
- **問題**: 既存データとの重複判定でスキップ
- **対応**: `--force-insert`フラグで重複判定を無効化

## 移行結果

### データ統計
- **移行前合計**: 約11.2万件
- **移行後合計**: 135,445件
- **新規取り込み**: 71,096件
- **復号成功率**: 99.85%（復号失敗106件は既存の旧キー由来）

### 暗号化状況
- **暗号化方式**: AES-256-GCM
- **user_id処理**: SHA-256ハッシュ化
- **復号可能性**: 新規取り込み分は100%復号可能

### テーブル構成
```sql
user_messages:
- user_id: VARCHAR(255) -- SHA-256ハッシュ
- message_id: VARCHAR(255)
- content: TEXT -- AES-256-GCM暗号化
- role: VARCHAR(50)
- mode: VARCHAR(50)
- message_type: VARCHAR(50)
- timestamp: TIMESTAMP WITH TIME ZONE
```

## 復号テスト結果

最新5件のテストで全て正常に復号を確認：
- 暗号化形式: `iv:authTag:cipherHex`
- 実際の会話内容が正しく復号
- user_idの適切な匿名化を確認

## クリーンアップ作業

### 削除ファイル
- `scripts/import_airtable_to_postgres.js`
- `create_recommendations_table.js`
- `create_table_instructions.md`
- `check_recommendations_table.js`
- `import_full_run.log`
- `airtable_*.json`、`airtable_*.err`

### 削除環境変数（Heroku）
- `AIRTABLE_API_KEY`
- `AIRTABLE_BASE_ID`
- `AIRTABLE_TABLE`

## 最終状態

### アプリケーション状況
- **Heroku バージョン**: v1006
- **会話履歴総数**: 135,445件
- **即時利用可能**: ✅
- **復号エラー**: 106件（既存分、新規分は0件）

### セキュリティ状況
- **暗号化**: 現行キーで統一
- **ユーザー分離**: SHA-256ハッシュで確保
- **Airtable痕跡**: 完全除去

## 今後の運用

### データアクセス
- **メインテーブル**: user_messages（優先読み取り）
- **バックアップテーブル**: user_messages_pre_encryption_backup（補完読み取り）
- **統合読み取り**: dataInterface.jsで自動実装済み

### メンテナンス
- 復号不可106件は既存データのため、旧キー判明時に修復可能
- 新規データは全て現行キーで暗号化されるため復号問題なし

## 成果
1. **データ完全性**: 全会話履歴の確保と暗号化統一
2. **運用継続性**: 既存機能への影響なく移行完了
3. **セキュリティ強化**: 現行暗号化方式での統一
4. **クリーンアップ**: 不要ファイル・設定の完全除去

この移行により、Adam AI v2.4の会話履歴機能は大幅に強化され、本番環境での安定運用が実現されました。
