# サービス推奨システムの改善

## 変更点の概要

### 1. 明示的なアドバイス要求のみに対応

サービス推奨が表示される条件を改善し、ユーザーが明示的にアドバイスを求めた場合のみ表示されるようになりました。
これにより、無関係な会話中に不必要なサービス推奨が表示される問題が解決されます。

### 2. サービス固有のクールダウン期間

各サービスはそれぞれ異なるクールダウン期間を持つことができるようになりました。
これにより、同じサービスが短期間に繰り返し推奨されることを防ぎ、ユーザー体験が向上します。

## 詳細な変更内容

The `detectAdviceRequest` function in `server.js` has been updated to:
- Only detect explicit advice requests based on specific patterns
- Use patterns from the new `advice_patterns.js` file
- Log when explicit advice requests are detected

The `wasRecentlyRecommended` method in `serviceRecommender.js` has been updated to:
- Respect service-specific cooldown periods (defined in each service's `cooldown_days` property)
- Use the default cooldown period (7 days) if a service doesn't specify one
- Log detailed information about recommendation cooldowns for debugging

## 最新の改善 (2025-03-12)

### 3. 重複する検出ロジックの統合

`shouldShowServicesToday`関数と`detectAdviceRequest`関数のアドバイス要求検出ロジックを統合しました。
これにより：
- 両方の関数で同じパターンリスト（`advice_patterns.js`）を使用するようになりました
- 検出ロジックの一貫性が保証されます
- 機能の責任が明確に分離されました：
  - `detectAdviceRequest`: アドバイス要求の検出のみを担当
  - `shouldShowServicesToday`: 頻度や時間の制約のみを担当

### 4. ログの改善

サービス推奨のトリガー条件と制約に関するログを改善し、デバッグを容易にしました：
- 明示的なアドバイス要求を検出した場合のログ
- 日次制限に達した場合のログ
- 時間間隔制約に関するログ

## 影響する機能

- サービス推奨表示機能
- 会話分析機能（サービス推奨のための）

## 変更されたファイル

- `server.js` - Update the `detectAdviceRequest` function and service recommendation trigger
- `serviceRecommender.js` - Update the `wasRecentlyRecommended` method
- `advice_patterns.js` - New file with explicit advice request patterns

## Implementation Details

### Files Created/Modified

1. **New Files:**
   - `advice_patterns.js`