# ADAM APP DOCUMENTATION

## 変更履歴 (Change Log)

### [2023-9-1] セマンティック意図検出システムの実装と既存関数の統合
- **新機能**: AIによるユーザー意図の理解と分類を実装
- **追加機能**: `detectIntention`関数と`detectIntentionWithAI`関数を新規作成
- **変更**: `processMessage`関数にセマンティック意図検出を統合
- **改善**: `containsSpecialCommand`関数と`isJobRequest`関数を新しい意図検出システムと統合
- **特徴**: キーワードベースの検出とAIベースの検出を組み合わせた高度な意図理解
- **関連ファイル**: `app/api/chat/route.js`

### [2023-8-20] キャリア分析機能の改善
- **改善**: 職業推薦の精度を向上させるための専門プロンプト追加
- **変更**: 意味解析ベースのキャリアリクエスト検出機能を追加
- **新機能**: `isJobRequestSemantic`関数の追加
- **関連ファイル**: `server.js`

### [2023-8-10] Claude AI統合
- **新機能**: Claude AIとの直接対話機能を実装
- **追加**: Anthropic APIとの連携
- **変更**: 「Claudeモードで〜」や「クロードに〜」などのコマンドでClaudeを直接利用可能に
- **関連ファイル**: `server.js`

### [2023-8-1] 適職診断向け情報検索機能の実装
- **新機能**: Perplexity APIを使用した適職診断専用の情報検索機能の追加
- **制限**: 一般的なWeb検索は無効化、適職診断時のみシステムが自動実行
- **変更**: キャリア情報をAIプロンプトに統合する処理を追加
- **関連ファイル**: `server.js`

### [2023-7-15] Gemini APIエラーハンドリング改善
- **修正**: Gemini APIエラー時のOpenAIへのフォールバック処理を追加
- **改善**: エラーログと再試行メカニズムの強化
- **関連ファイル**: `server.js`

## アーキテクチャ (Architecture)

### コア機能

#### 1. ユーザー意図検出システム
- **関数**: `detectIntention`, `detectIntentionWithAI`, `containsSpecialCommand`, `isJobRequest`
- **目的**: ユーザーメッセージから意図を理解し適切な処理を割り当てる
- **2層構造**:
  - **1層目**: 高速なパターンマッチング（`containsSpecialCommand`, `isJobRequest`）
  - **2層目**: AI意味解析（`detectIntentionWithAI`）
- **検出カテゴリ**: 
  * `career`: キャリア・職業相談
  * `history`: 過去の会話記録取得
  * `search`: Web検索リクエスト（※現在利用不可、適職診断時のみ自動実行）
  * `analysis`: 詳細分析リクエスト
  * `model_claude`: Claude AIモデル使用リクエスト
  * `model_gpt4`: GPT-4モデル使用リクエスト
  * `general`: 一般的な質問・会話

#### 2. メッセージ処理システム
- **関数**: `processMessage`, `processWithAI`
- **目的**: 検出された意図に基づきメッセージを適切に処理
- **モード**:
  * `normal`: 通常会話モード
  * `career`: キャリア分析モード
  * `deep`: 詳細分析モード
  * `search`: 検索モード（※現在無効）
  * `claude`: Claude AIモード
  * `gpt4`: GPT-4モード

#### 3. 外部API統合
- **機能**:
  - `searchWithPerplexity`: Web検索機能（Perplexity API）
  - `callClaudeAPI`: Claude AIとの統合（Anthropic API）
  - OpenAI API: 主要AIモデル
  - Gemini API: バックアップAIモデル

#### 4. ユーザー履歴管理
- **関数**: `fetchUserHistory`, `handleChatRecallWithRetries`
- **目的**: ユーザーとの会話履歴の保存・取得・分析
- **特徴**: 過去の会話を思い出して分析する機能

### 処理フロー

1. ユーザーがメッセージを送信
2. `processMessage`が呼び出される
3. `detectIntention`がメッセージの意図を分析
   - パターンマッチングで明確な意図を検出
   - 不明確な場合はAIで意味解析
4. 意図に応じた処理を実行:
   - `career`: キャリア分析モード
   - `history`: 過去の会話記録取得
   - `search`: 検索機能の制限説明（一般Web検索は無効）
   - `model_claude`: Claude APIへの転送
   - `model_gpt4`: GPT-4モードでの処理
   - `analysis`: 詳細分析モード
   - `general`: 通常会話モード
5. 適切なAIモデルとプロンプトで応答を生成
6. 応答をユーザーに返し、会話履歴を保存

### コードファイル構成

- `app/api/chat/route.js`: メインのチャット処理ロジック
- `server.js`: サーバーサイド機能とユーティリティ関数

## 共通パターン

### コマンド認識パターン

#### Web検索（※現在利用不可）
```
一般的なWeb検索機能は提供されていません。
適職診断時にシステムが自動的にキャリア情報を検索します。
```

#### 過去の記録取得
```
過去の記録を全て思い出して
過去の記録を思い出してください
```

#### モデル選択
```
Claudeモードで[質問]
クロードに[質問]
GPT-4モードで[質問]
```

#### 詳細分析
```
もっと深く考えを掘り下げて例を示しながらさらに分かり易く教えてください。抽象的言葉禁止。
詳しく教えて
詳細を教えて
もっと詳しく
```

## デプロイガイド (Deployment Guide)

### セマンティック意図検出システムのデプロイ

セマンティック意図検出システムを本番環境にデプロイするには、以下の手順に従ってください。

#### 1. 前提条件

- OpenAI APIキーが設定済みであること
- 最小限のAPIコールで動作するよう最適化されていること

#### 2. デプロイ前チェックリスト

- [ ] 意図検出のテストが完了している
- [ ] AI呼び出しの頻度とコストが見積もられている
- [ ] APIキーの使用量制限を設定している
- [ ] エラーハンドリングが実装されている
- [ ] ログ出力が適切に設定されている

#### 3. デプロイ手順

1. **ファイルの配置**
   ```bash
   # app/api/chat/route.js ファイルを本番環境に配置
   git add app/api/chat/route.js
   git commit -m "Implement semantic intention detection system"
   git push heroku main
   ```

2. **環境変数の設定**
   ```bash
   # Heroku環境変数の設定（必要に応じて）
   heroku config:set OPENAI_API_KEY=your_api_key
   heroku config:set USE_INTENTION_DETECTION=true
   heroku config:set INTENTION_DETECTION_MODEL=o3-mini-2025-01-31
   ```

3. **デプロイの確認**
   ```bash
   # デプロイログの確認
   heroku logs --tail
   ```

#### 4. リソース最適化

セマンティック意図検出はAI呼び出しを行うため、以下の点に注意してください：

1. **キャッシュの活用**
   - 同一セッション内での類似メッセージは結果をキャッシュして再利用
   - 例: 「詳しく教えて」のような単純なメッセージはキャッシュ対象に

2. **コスト削減策**
   - パターンマッチングでの検出を優先し、AIによる意図検出は必要な場合のみ実行
   - 小さなモデル（o3-mini等）を使用してコストを抑制
   - バッチ処理が可能な場合は呼び出しを集約

3. **モニタリング設定**
   - API呼び出し数の監視
   - レスポンスタイムの監視
   - エラー率の監視

#### 5. トラブルシューティング

よくある問題と解決策：

1. **検出精度の問題**
   - プロンプトの調整
   - より大きなモデルへの一時的な切り替え
   - 特定のパターンに対するルールの追加

2. **レイテンシの問題**
   - パターンマッチングの比率を高める
   - インスタンスのスケールアップ
   - 地理的に近いAPIエンドポイントの選択

3. **コスト超過**
   - 使用量上限の設定
   - キャッシュ戦略の見直し
   - 低コストモデルへの切り替え検討 