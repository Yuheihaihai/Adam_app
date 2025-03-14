# 機械学習拡張モジュール (ML-Enhance)

このモジュールは、既存の機械学習システムを変更せずに拡張するためのアドオンです。TensorFlow.jsを活用して、より高度な機械学習機能を提供します。

## 特徴

- **非侵襲的な拡張**: 既存コードを一切変更せずに機能を追加
- **フォールバック機構**: 問題発生時に自動的に既存システムを使用
- **詳細なログ記録**: すべての処理を詳細にログに記録
- **環境変数による制御**: 即時に機能のオン/オフが可能

## 導入方法

### 1. 必要なパッケージのインストール

```bash
npm install @tensorflow/tfjs
# または Node.js バックエンド（オプション、パフォーマンス向上）
npm install @tensorflow/tfjs-node
```

### 2. モジュールの配置

このフォルダを既存プロジェクトの直下に配置してください。既存のファイルは一切変更しません。

### 3. 環境変数の設定

以下の環境変数を設定して機能の有効/無効を制御できます：

```
# メイン設定
ML_ENHANCED=false        # 拡張機能の有効/無効（true/false）

# モード別設定
ML_MODE_GENERAL=true     # 一般会話モードでの拡張機能の有効/無効
ML_MODE_CAREER=false     # キャリアモードでの拡張機能の有効/無効

# フォールバック設定
ML_USE_FALLBACK=true     # エラー時のフォールバックの有効/無効
ML_MAX_RETRIES=3         # 再試行回数

# 学習設定
ML_HISTORY_LIMIT=200     # 分析対象の会話履歴数
ML_CONFIDENCE_THRESHOLD=0.7  # 判断を下す信頼度の閾値

# ロギング設定
ML_LOG_LEVEL=info        # ログレベル（debug/info/warn/error）
ML_LOG_PERFORMANCE=false  # パフォーマンス測定の記録

# TensorFlow.js設定
ML_TF_BACKEND=cpu        # TensorFlow.jsバックエンド
ML_TF_MEMORY_LIMIT=4096  # メモリ制限（MB）
```

## 使用方法

既存のコードで `localML` を使用している箇所を変更する代わりに、`server.js` で以下のように記述します：

```javascript
// 従来のimport
// const localML = require('./localML');

// 新しいimport（機能拡張が無効の場合は自動的に既存機能を使用）
const localML = require('./ml-enhance');

// 残りのコードはそのまま
```

## デプロイ手順

1. 環境変数で機能を無効化した状態（`ML_ENHANCED=false`）でデプロイ
2. ログを監視して問題がないことを確認
3. 段階的に機能を有効化：
   - `ML_ENHANCED=true` に設定
   - `ML_MODE_GENERAL=true` など、特定のモードだけ有効化

## リスク軽減策

本モジュールには以下のリスク軽減策が組み込まれています：

1. **コードの分離**: 既存コードと完全に分離された実装
2. **フォールバック機構**: あらゆる処理でエラーが発生した場合、自動的に既存機能を使用
3. **詳細なログ記録**: `logs/ml-enhance.log` に詳細なログを記録
4. **環境変数制御**: 問題発生時は環境変数で即座に機能をオフに切り替え可能

## ログファイル

拡張機能の動作記録は `logs/ml-enhance.log` に保存されます。ログレベルは環境変数 `ML_LOG_LEVEL` で制御できます。

## ライセンス

[MIT License](LICENSE) 