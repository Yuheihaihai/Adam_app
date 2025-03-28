# GPT-4o Audioを使用した音声対話機能

## 概要

この機能は、ユーザーがLINE Botに送信した音声メッセージをAzure OpenAIのGPT-4o Audioモデルを使用して処理し、音声で応答する機能です。GPT-4o Audioは、テキストだけでなく音声も直接理解・生成できる最新のモデルを活用しています。

## 前提条件

- Azure OpenAIのアカウントとアクセス権
- Azure OpenAIリソースにGPT-4o Audioモデル（gpt-4o-audio-preview-2024-12-17）のデプロイメント
- LINE Messaging APIのチャネル設定

## 設定方法

1. `.env`ファイルに以下の設定を追加してください：

```
# Azure OpenAI設定 (GPT-4o Audio用)
AZURE_OPENAI_API_KEY=your_azure_openai_api_key
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o-audio-preview-2024-12-17
```

2. 必要なパッケージをインストールします：

```bash
npm install rt-client @azure/core-auth @azure/identity
```

## 動作フロー

1. ユーザーがLINE上で音声メッセージを送信
2. サーバーが音声メッセージを受け取り、音声データを抽出
3. 音声データをWhisper APIでテキストに変換（音声認識）
4. 認識されたテキストをGPT-4o Audioに送信して音声応答を生成
5. 生成された音声応答をユーザーに返信

## フォールバックメカニズム

Azure OpenAIの設定がない場合や、GPT-4o Audioが利用できない場合は、以下のようにフォールバックします：

1. 音声認識 → OpenAI Whisper API
2. 音声合成 → OpenAI TTS API

## 機能一覧

- **音声認識**: ユーザーの音声メッセージをテキストに変換
- **音声応答生成**: テキストからGPT-4o Audioを用いて直接音声応答を生成
- **ユーザー音声設定**: ユーザーごとに音声の種類や速度を設定可能
- **コンテキスト考慮**: 会話の文脈を考慮した応答生成
- **自動分析**: ユーザーの会話パターンから好みの音声設定を推定

## LINE Bot対応

LINE Messaging APIでは音声メッセージの直接送信がサポートされていないため、現在のデモ実装では以下のように動作します：

1. テキスト応答をユーザーに送信
2. 音声ファイルについての説明メッセージを送信

実際の製品実装では、以下の方法で音声ファイルを提供することを推奨します：

- 音声ファイルをクラウドストレージ（S3など）にアップロード
- 音声再生用のWebページへのリンクをFlex Messageで送信
- LINE LIFF機能を使用して音声プレーヤーを埋め込む

## テスト方法

1. LINEボットに音声メッセージを送信する
2. ボットが「音声を処理しています」と応答
3. 音声認識結果がテキストで表示される
4. GPT-4o Audioによる応答テキストが送信される
5. 音声ファイルについての説明メッセージが表示される

## トラブルシューティング

- **音声認識が失敗する場合**: 音声が明瞭でない、環境ノイズが多い、またはファイル形式が適切でない可能性があります
- **音声応答が生成されない場合**: Azure OpenAIの設定を確認し、APIキーや権限が正しいことを確認してください
- **エラーログに「EADDRINUSE」が表示される場合**: すでに使用されているポートを変更するか、既存のサーバープロセスを終了してください

## 参考資料

- [Azure OpenAI GPT-4o Realtime Audioドキュメント](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/audio-real-time) 