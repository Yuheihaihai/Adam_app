# 変更履歴

## 2025-03-22 11:30:00

### テスト用ファイル削除とサービスマッチング機能の改善必要性

- テスト用ファイル（test-full-features.js、test-service-matching.js）を削除
- 実運用環境のクリーンアップ完了

**特記事項:** サービスマッチング機能の表示回数や精度の改善が必要。現状では表示頻度が少なすぎる可能性がある。ユーザーにとって有益なサービス推奨の機会を増やすため、表示トリガーの調整や閾値の見直しを検討すべき。

## 2025-03-22 11:03:24

### サービスマッチング機能動作テスト結果

- ローカルテストでサービスマッチング機能が正常に動作することを確認
- `shouldShowServiceRecommendation`関数が正しく判断できることを確認
- テスト結果: 「最近仕事のストレスで悩んでいます。メンタルヘルスについてアドバイスいただけますか？」というメッセージに対して「表示する」と判断
- Herokuのログから、ML機能とサービスマッチング機能が正常に初期化されていることを確認:
  ```
  Service matching enhancement initialized
  [EnhancedInit] Service recommendation enhancement successfully initialized!
  [EnhancedInit] The existing service recommender has been enhanced with better detection.
  ✅ Enhanced service recommendations initialized
  ```

## 2025-03-22 11:01:12

### Heroku設定変更

- `ML_ENHANCED`環境変数を`true`に設定
- ML機能とサービスマッチング機能を有効化
- 以下のログで正常に初期化されたことを確認:
  ```
  2025-03-22T02:01:26.510129+00:00 app[web.1]: Service matching enhancement initialized
  2025-03-22T02:01:26.510146+00:00 app[web.1]: [EnhancedInit] Service recommendation enhancement successfully initialized!
  2025-03-22T02:01:26.510159+00:00 app[web.1]: ✅ Enhanced service recommendations initialized
  ```

## 2025-03-22 10:14:35

### enhancedRecommendationTrigger.js

- モデルを`gpt-4o-mini`から`gpt-4o`に変更
- レート制限機能を追加（1時間あたり20リクエスト）
- 制限を超えた場合は自動的に`gpt-4o-mini`にフォールバック
- 1時間ごとにリクエストカウンターをリセット


