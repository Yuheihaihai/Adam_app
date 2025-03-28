// audioHandler.js - GPT-4o Audio対応音声処理ハンドラ
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { OpenAI } = require('openai');
const { AzureKeyCredential } = require('@azure/core-auth');
// ESMモジュールを使用するためのプレースホルダー
let LowLevelRTClient;

// 利用統計サービスのインポート
const insightsService = require('./insightsService');

// ESMモジュールを動的にロードする関数
async function loadRTClient() {
  try {
    // Check if the rt-client module exists before attempting to import it
    if (fs.existsSync(path.join(__dirname, 'node_modules', 'rt-client'))) {
      const rtClient = await import('rt-client');
      LowLevelRTClient = rtClient.LowLevelRTClient;
      console.log('RT Client モジュールを正常にロードしました');
      return true;
    } else {
      console.log('RT Client モジュールが存在しません。音声機能は制限されたモードで動作します。');
      return false;
    }
  } catch (error) {
    console.error('RT Client モジュールのロードに失敗しました:', error.message);
    return false;
  }
}

// モジュールの初期化を非同期で行う
loadRTClient();

class AudioHandler {
  constructor() {
    // OpenAI APIクライアントの初期化（従来のWhisper/TTS用）
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    // Azure OpenAI設定
    this.useAzure = process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT;
    if (this.useAzure) {
      this.azureApiKey = process.env.AZURE_OPENAI_API_KEY;
      this.azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
      this.azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-audio-preview-2024-12-17';
      console.log('Azure OpenAI RTオーディオ設定OK');
    } else {
      console.warn('警告: Azure OpenAIリアルタイム音声の設定がありません。従来のOpenAIモードで動作します。');
    }
    
    // 音声データ一時保存ディレクトリ
    this.tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir);
    }
    
    // 音声特性データ保存ディレクトリ
    this.voiceDataDir = path.join(__dirname, 'data', 'voice_characteristics');
    if (!fs.existsSync(path.join(__dirname, 'data'))) {
      fs.mkdirSync(path.join(__dirname, 'data'));
    }
    if (!fs.existsSync(this.voiceDataDir)) {
      fs.mkdirSync(this.voiceDataDir);
    }
    
    // ユーザー設定保存ディレクトリ
    this.userPrefsDir = path.join(__dirname, 'data', 'user_preferences');
    if (!fs.existsSync(this.userPrefsDir)) {
      fs.mkdirSync(this.userPrefsDir);
    }
    
    // 音声のユーザー設定
    this.voicePreferences = new Map();
    
    // 利用可能な音声タイプ
    this.availableVoices = {
      'shimmer': { description: '柔らかい女性の声', label: '柔らかい女性（デフォルト）' },
      'alloy': { description: '中性的な声', label: '中性的' },
      'echo': { description: '男性の声', label: '男性' },
      'nova': { description: '若い女性の声', label: '若い女性' },
      'fable': { description: 'ナレーター風の声', label: 'ナレーター' }
    };
    
    // 音声タイプ選択指示の埋め込みキャッシュ初期化
    this.embeddingCache = {};
    
    // 初期化時にユーザー設定を読み込む
    this._loadSavedVoicePreferences();
    
    // 音声ファイル型式
    this.audioFormat = 'audio/mpeg'; // LINE Botに返すときのフォーマット
    
    // 初期化ログ
    console.log('音声処理モジュール初期化');
  }
  
  // 音声リクエスト制限をチェック
  async checkVoiceRequestLimit(userId) {
    // insightsServiceを使用して制限をチェック
    const limitResult = insightsService.trackAudioRequest(userId);
    
    if (!limitResult.allowed) {
      console.log(`音声リクエスト制限: ${userId} - ${limitResult.reason}`);
      return {
        allowed: false,
        message: limitResult.message,
        reason: limitResult.reason,
        dailyCount: limitResult.userDailyCount,
        dailyLimit: limitResult.userDailyLimit,
        globalCount: limitResult.globalMonthlyCount,
        globalLimit: limitResult.globalMonthlyLimit
      };
    }
    
    // 利用可能な場合は残りの回数情報も返す
    return {
      allowed: true,
      dailyCount: limitResult.userDailyCount,
      dailyLimit: limitResult.userDailyLimit,
      globalCount: limitResult.globalMonthlyCount,
      globalLimit: limitResult.globalMonthlyLimit
    };
  }
  
  // 音声リクエスト使用状況メッセージを生成
  generateUsageLimitMessage(limitInfo) {
    if (!limitInfo.allowed) {
      return limitInfo.message;
    }
    
    return `音声機能の利用状況:\n・本日: ${limitInfo.dailyCount}/${limitInfo.dailyLimit}回\n・全体: ${limitInfo.globalCount}/${limitInfo.globalLimit}回（月間）`;
  }
  
  // 保存済みのユーザー音声設定を読み込む
  _loadSavedVoicePreferences() {
    try {
      if (!fs.existsSync(this.userPrefsDir)) return;
      
      const files = fs.readdirSync(this.userPrefsDir);
      let loadCount = 0;
      
      files.forEach(file => {
        if (file.endsWith('_voice_prefs.json')) {
          const userId = file.replace('_voice_prefs.json', '');
          try {
            const prefsData = JSON.parse(fs.readFileSync(path.join(this.userPrefsDir, file), 'utf8'));
            this.voicePreferences.set(userId, prefsData);
            loadCount++;
          } catch (e) {
            console.error(`ユーザー(${userId})の音声設定読み込みエラー:`, e.message);
          }
        }
      });
      
      console.log(`${loadCount}件のユーザー音声設定を読み込みました`);
    } catch (error) {
      console.error('ユーザー音声設定の読み込みエラー:', error.message);
    }
  }
  
  // ユーザーの音声設定をファイルに保存
  _saveUserVoicePreferences(userId, preferences) {
    try {
      const filePath = path.join(this.userPrefsDir, `${userId}_voice_prefs.json`);
      fs.writeFileSync(filePath, JSON.stringify(preferences, null, 2));
      console.log(`ユーザー(${userId})の音声設定を保存しました`);
      return true;
    } catch (error) {
      console.error('ユーザー音声設定の保存エラー:', error.message);
      return false;
    }
  }
  
  // 音声ファイルをテキストに変換（Speech-to-Text）し、特性も分析
  async transcribeAudio(audioBuffer, userId, options = {}) {
    console.log('音声テキスト変換と特性分析開始');
    
    // 音声リクエスト制限をチェック
    const limitCheck = await this.checkVoiceRequestLimit(userId);
    if (!limitCheck.allowed) {
      console.log(`音声リクエスト制限により処理中止: ${userId}`);
      return {
        text: null,
        characteristics: {},
        limitExceeded: true,
        limitMessage: limitCheck.message
      };
    }
    
    // 一時ファイルに保存
    const tempFilePath = path.join(this.tempDir, `speech_${Date.now()}.m4a`);
    fs.writeFileSync(tempFilePath, audioBuffer);
    
    try {
      let transcribedText;
      let audioCharacteristics = {};
      
      if (this.useAzure) {
        // Azure GPT-4o Audio APIを使用した変換と特性分析
        console.log('Azure RT クライアントで音声認識と特性分析を実行（今後実装予定）');
        // 現時点ではWhisperにフォールバック
        transcribedText = await this._transcribeWithWhisper(tempFilePath, options);
        // Whisperではトーン分析ができないので、別で分析
        audioCharacteristics = await this._analyzeAudioCharacteristics(tempFilePath, userId);
      } else {
        // OpenAI Whisper APIを使用した変換
        transcribedText = await this._transcribeWithWhisper(tempFilePath, options);
        // Whisperではトーン分析ができないので、別で分析
        audioCharacteristics = await this._analyzeAudioCharacteristics(tempFilePath, userId);
      }
      
      // 音声特性データを保存
      if (transcribedText) {
        await this.saveVoiceCharacteristics(userId, transcribedText, audioCharacteristics);
      }
      
      // 音声タイプの変更リクエストを検出
      if (transcribedText) {
        const isVoiceChangeRequest = await this.detectVoiceChangeRequest(transcribedText, userId);
        if (isVoiceChangeRequest) {
          audioCharacteristics.isVoiceChangeRequest = true;
        }
      }
      
      return {
        text: transcribedText,
        characteristics: audioCharacteristics,
        limitInfo: limitCheck
      };
    } catch (error) {
      console.error('音声テキスト変換エラー:', error.message);
      return { 
        text: null, 
        characteristics: {},
        error: error.message
      };
    } finally {
      // 一時ファイル削除
      try { fs.unlinkSync(tempFilePath); } catch (e) { /* 無視 */ }
    }
  }
  
  // 音声タイプ変更リクエストの検出（埋め込みベクトル使用）
  async detectVoiceChangeRequest(text, userId) {
    try {
      // 直接的なパターンマッチング（LINE Voice Message仕様準拠）
      const lineCompliantPatterns = [
        "声を変えて", "音声設定を教えて",
        "声を男性に変更", "男性の声", "男性の声にして",
        "声を女性に変更", "女性の声", "女性の声に戻して", "女性の声にして",
        "声を若い女性の声に変えて", "若い女性の声",
        "もっとゆっくり話して", "ゆっくり話して",
        "話すスピードを速く", "速く話して", "音声のスピードを上げて",
        "声のタイプを変更", "声のタイプ",
        "どんな声のタイプ", "音声分析", "声のトーン",
        "標準の声に戻して", "普通の速さ", "普通の速度"
      ];
      
      // 直接パターンマッチング（高速で正確）
      for (const pattern of lineCompliantPatterns) {
        if (text.includes(pattern)) {
          console.log(`LINE Voice Message準拠パターン検出: "${pattern}"`);
          return true;
        }
      }
      
      // 変更リクエストパターンの埋め込みベクトルを生成（キャッシュ利用）
      if (!this.embeddingCache.voiceChangePatterns) {
        // 音声変更関連の表現パターン（LINE Voice Message仕様準拠パターンを含む）
        const changePatterns = [
          // LINE仕様準拠
          "声を変えて",
          "音声設定を教えて",
          "声を男性に変更して",
          "声を女性に変更して",
          "もっとゆっくり話して",
          "話すスピードを速くして",
          "声のタイプを変更したい",
          "声を若い女性の声に変えて",
          "標準の声に戻して",
          "音声のスピードを上げて",
          
          // 追加パターン
          "声を変更して",
          "別の声にして",
          "声のタイプを変更",
          "違う声で話して",
          "男性の声に変えて",
          "女性の声に変えて",
          "声を選びたい",
          "声の種類を変えたい",
          "他の声は？",
          "音声を変更したい"
        ];
        
        // 埋め込みベクトル生成
        const embeddings = await this._generateEmbeddings(changePatterns);
        this.embeddingCache.voiceChangePatterns = embeddings;
      }
      
      // ユーザーテキストの埋め込みベクトル生成
      const userTextEmbedding = await this._generateEmbeddings([text]);
      if (!userTextEmbedding || userTextEmbedding.length === 0) return false;
      
      // コサイン類似度で最も近いパターンを見つける
      const similarities = this.embeddingCache.voiceChangePatterns.map(pattern => 
        this._cosineSimilarity(pattern, userTextEmbedding[0])
      );
      
      // 最大類似度と閾値比較
      const maxSimilarity = Math.max(...similarities);
      const isChangeRequest = maxSimilarity > 0.75; // 75%以上の類似度でリクエストと判断
      
      if (isChangeRequest) {
        console.log(`音声タイプ変更リクエスト検出: "${text}" (類似度: ${maxSimilarity.toFixed(2)})`);
      }
      
      return isChangeRequest;
    } catch (error) {
      console.error('音声タイプ変更リクエスト検出エラー:', error.message);
      return false;
    }
  }
  
  // テキストの埋め込みベクトルを生成
  async _generateEmbeddings(texts) {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts
      });
      
      return response.data.map(item => item.embedding);
    } catch (error) {
      console.error('埋め込みベクトル生成エラー:', error.message);
      
      // エラーの種類に応じた処理
      if (error.message.includes('token') || error.message.includes('rate limit')) {
        console.log('トークン超過またはレート制限エラー。5秒後に再試行します...');
        
        // 5秒待機してから再試行
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        try {
          // 再試行
          const retryResponse = await this.openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: texts
          });
          
          return retryResponse.data.map(item => item.embedding);
        } catch (retryError) {
          console.error('埋め込みベクトル生成の再試行にも失敗:', retryError.message);
          // フォールバック: 空の埋め込みベクトルで代用（検出アルゴリズムが機能しない状態）
          return texts.map(() => new Array(1536).fill(0));
        }
      }
      
      // その他のエラーの場合は空の埋め込みベクトルで代用
      return texts.map(() => new Array(1536).fill(0));
    }
  }
  
  // コサイン類似度計算
  _cosineSimilarity(vecA, vecB) {
    // ベクトルの検証
    if (!vecA || !vecB || !Array.isArray(vecA) || !Array.isArray(vecB)) {
      console.error('無効なベクトル入力:', { vecA: !!vecA, vecB: !!vecB });
      return 0; // 類似度がないとして0を返す
    }
    
    // 長さの検証
    if (vecA.length !== vecB.length) {
      console.error(`ベクトル長不一致: ${vecA.length} vs ${vecB.length}`);
      
      // 長さが違う場合は、短い方を0で埋める
      const maxLength = Math.max(vecA.length, vecB.length);
      const normalizedVecA = [...vecA, ...new Array(maxLength - vecA.length).fill(0)];
      const normalizedVecB = [...vecB, ...new Array(maxLength - vecB.length).fill(0)];
      
      return this._cosineSimilarity(normalizedVecA, normalizedVecB);
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    // ゼロ除算の防止
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  
  // 音声の特性（感情、トーン、スピードなど）を分析
  async _analyzeAudioCharacteristics(audioFilePath, userId) {
    try {
      console.log('音声特性分析開始');
      
      // OpenAI GPT-4oを使用して音声特性を推定（実際の音声特性分析機能がないため、テキストからの推定）
      const transcribedText = await this._transcribeWithWhisper(audioFilePath, { language: 'ja' });
      
      // テキストから感情などを推測
      const prompt = `
      以下のテキストを分析し、話者の音声特性を推定してください。
      テキスト: "${transcribedText}"
      
      以下の項目を含むJSON形式で回答してください:
      1. 感情状態(emotion): 喜び/悲しみ/怒り/恐れ/驚き/中立 から最も可能性の高いもの
      2. 感情強度(intensity): 1-5の数値（1が最も弱く、5が最も強い）
      3. 話速の印象(speed_impression): 遅い/普通/速い から最も可能性の高いもの
      4. トーン(tone): 優しい/厳しい/熱意のある/落ち着いた/緊張した から最も可能性の高いもの
      5. ボリューム印象(volume_impression): 小さい/普通/大きい から最も可能性の高いもの
      6. 自信度(confidence): テキストからの推測なので、0-1の値（例: 0.7）
      `;
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'あなたは音声特性分析の専門家です。テキストから話者の感情や話し方の特徴を推定します。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });
      
      // レスポンスをJSON解析
      const characteristics = JSON.parse(response.choices[0].message.content);
      
      // タイムスタンプと元テキストを追加
      characteristics.timestamp = Date.now();
      characteristics.text = transcribedText;
      characteristics.userId = userId;
      
      console.log('音声特性分析結果:', JSON.stringify(characteristics, null, 2).substring(0, 200) + '...');
      
      return characteristics;
    } catch (error) {
      console.error('音声特性分析エラー:', error.message);
      // 基本的な特性データを返す
      return {
        timestamp: Date.now(),
        text: '',
        emotion: 'neutral',
        intensity: 3,
        speed_impression: 'normal',
        tone: 'calm',
        volume_impression: 'normal',
        confidence: 0.5,
        error: error.message
      };
    }
  }
  
  // 音声特性データをファイルに保存
  async saveVoiceCharacteristics(userId, text, characteristics) {
    try {
      // ユーザーごとのディレクトリ作成
      const userDir = path.join(this.voiceDataDir, userId);
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir);
      }
      
      // 保存データ準備
      const saveData = {
        userId,
        timestamp: Date.now(),
        text,
        characteristics
      };
      
      // ファイル名作成（タイムスタンプベース）
      const filename = `voice_data_${Date.now()}.json`;
      const filePath = path.join(userDir, filename);
      
      // データをJSON形式で保存
      fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2));
      
      console.log(`音声特性データを保存しました: ${filePath}`);
      
      // ユーザー集計ファイルも更新
      await this._updateUserVoiceSummary(userId, characteristics);
      
      return filePath;
    } catch (error) {
      console.error('音声特性データ保存エラー:', error.message);
      return null;
    }
  }
  
  // ユーザーごとの音声特性サマリーを更新
  async _updateUserVoiceSummary(userId, newCharacteristics) {
    try {
      const summaryPath = path.join(this.voiceDataDir, `${userId}_summary.json`);
      let summary = {
        userId,
        recordCount: 0,
        lastUpdated: Date.now(),
        emotionCounts: {},
        toneCounts: {},
        speedCounts: {},
        averageIntensity: 0,
        totalIntensity: 0
      };
      
      // 既存のサマリーがあれば読み込む
      if (fs.existsSync(summaryPath)) {
        summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      }
      
      // カウントを更新
      summary.recordCount++;
      summary.lastUpdated = Date.now();
      
      // 感情カウント更新
      if (newCharacteristics.emotion) {
        if (!summary.emotionCounts[newCharacteristics.emotion]) {
          summary.emotionCounts[newCharacteristics.emotion] = 0;
        }
        summary.emotionCounts[newCharacteristics.emotion]++;
      }
      
      // トーンカウント更新
      if (newCharacteristics.tone) {
        if (!summary.toneCounts[newCharacteristics.tone]) {
          summary.toneCounts[newCharacteristics.tone] = 0;
        }
        summary.toneCounts[newCharacteristics.tone]++;
      }
      
      // 話速カウント更新
      if (newCharacteristics.speed_impression) {
        if (!summary.speedCounts[newCharacteristics.speed_impression]) {
          summary.speedCounts[newCharacteristics.speed_impression] = 0;
        }
        summary.speedCounts[newCharacteristics.speed_impression]++;
      }
      
      // 強度平均更新
      if (typeof newCharacteristics.intensity === 'number') {
        summary.totalIntensity += newCharacteristics.intensity;
        summary.averageIntensity = summary.totalIntensity / summary.recordCount;
      }
      
      // サマリーを保存
      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
      console.log(`ユーザー音声特性サマリーを更新しました: ${summaryPath}`);
      
      return summary;
    } catch (error) {
      console.error('ユーザー音声特性サマリー更新エラー:', error.message);
      return null;
    }
  }
  
  // 特定ユーザーの音声特性サマリーを取得
  async getUserVoiceSummary(userId) {
    try {
      const summaryPath = path.join(this.voiceDataDir, `${userId}_summary.json`);
      
      if (fs.existsSync(summaryPath)) {
        return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      } else {
        return {
          userId,
          recordCount: 0,
          lastUpdated: Date.now(),
          emotionCounts: {},
          toneCounts: {},
          speedCounts: {},
          averageIntensity: 0,
          message: 'まだ音声特性データがありません'
        };
      }
    } catch (error) {
      console.error('ユーザー音声特性サマリー取得エラー:', error.message);
      return null;
    }
  }
  
  // Whisperを使用したテキスト変換
  async _transcribeWithWhisper(filePath, options = {}) {
    try {
      const response = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: 'whisper-1',
        language: options.language || 'ja'
      });
      
      console.log('Whisper音声テキスト変換成功:', response.text.substring(0, 30) + '...');
      return response.text;
    } catch (error) {
      console.error('Whisper音声変換エラー:', error.message);
      throw error;
    }
  }
  
  // テキストからの音声応答処理（Azure GPT-4o Audio対応）
  async generateAudioResponse(text, userId, options = {}) {
    // テキストがない場合または文字列でない場合のチェックを追加
    if (!text) {
      console.error(`音声応答生成エラー: テキストが空です。`);
      // デフォルトテキストを設定して処理を続行
      text = "申し訳ありません、応答の生成中に問題が発生しました。もう一度お試しください。";
      console.log('デフォルトテキストを使用して処理を続行します');
    } else if (typeof text !== 'string') {
      console.error(`音声応答生成エラー: 不正なテキスト形式です。type=${typeof text}, value=${JSON.stringify(text).substring(0, 100)}`);
      
      // オブジェクトからテキストを抽出する試み
      if (text.response) {
        text = text.response;
      } else if (text.text) {
        text = text.text;
      } else {
        // デフォルトテキストを設定して処理を続行
        text = "申し訳ありません、応答の生成中に問題が発生しました。もう一度お試しください。";
      }
      console.log(`抽出されたテキスト: ${text.substring(0, 50)}...`);
    }

    // 確実に文字列であることを保証
    text = String(text);
    
    console.log('音声応答生成開始:', text.substring(0, 30) + '...');
    
    // 音声リクエスト制限をチェック（生成も1リクエストとしてカウント）
    const limitCheck = await this.checkVoiceRequestLimit(userId);
    if (!limitCheck.allowed) {
      console.log(`音声リクエスト制限により音声応答生成中止: ${userId}`);
      return {
        buffer: null,
        filePath: null,
        text: text,
        limitExceeded: true,
        limitMessage: limitCheck.message
      };
    }
    
    try {
      let result;
      if (this.useAzure) {
        result = await this._generateWithAzureRT(text, userId, options);
      } else {
        result = await this.synthesizeSpeech(text, userId, options);
      }
      
      // ファイルが実際に生成されたか確認
      if (result && result.filePath) {
        if (!fs.existsSync(result.filePath)) {
          console.error(`警告: 音声ファイルが生成されていません: ${result.filePath}`);
          // ファイルが存在しない場合は、バッファからファイルを再作成してみる
          if (result.buffer) {
            try {
              fs.writeFileSync(result.filePath, result.buffer);
              console.log(`音声ファイルを再作成しました: ${result.filePath}`);
            } catch (writeError) {
              console.error(`音声ファイル再作成エラー: ${writeError.message}`);
            }
          }
        }
      }
      
      return result;
    } catch (error) {
      console.error('音声応答生成エラー:', error.message);
      return {
        buffer: null,
        filePath: null,
        text: text
      };
    }
  }
  
  // Azure GPT-4o Audioを使用した音声応答生成
  async _generateWithAzureRT(text, userId, options = {}) {
    console.log(`Azure GPT-4o Audioで音声応答生成開始`);
    
    try {
      // RTクライアントが読み込まれているか確認
      if (!LowLevelRTClient) {
        console.log('RT Client モジュールが読み込まれていないため、標準のTTS機能を使用します');
        return this.synthesizeSpeech(text, userId, options);
      }
      
      // RTクライアントの初期化
      const client = new LowLevelRTClient(
        new URL(this.azureEndpoint),
        new AzureKeyCredential(this.azureApiKey),
        { deployment: this.azureDeployment }
      );
      
      // ユーザー設定を取得
      const userPrefs = this.voicePreferences.get(userId) || {
        voice: 'shimmer', // デフォルト音声
        speed: 1.0,
      };
      
      // 一時ファイルパス
      const tempFilePath = path.join(this.tempDir, `tts_${Date.now()}.mp3`);
      
      // 音声データを格納するためのバッファ
      let audioChunks = [];
      let transcriptText = '';
      
      // リクエスト送信
      await client.send({
        type: "message.create",
        message: {
          content: [
            {
              type: "text",
              text: text
            }
          ],
          role: "user"
        }
      });
      
      // レスポンス処理
      for await (const message of client.messages()) {
        switch (message.type) {
          case "response.done": {
            console.log("応答完了");
            break;
          }
          case "error": {
            console.error("エラー発生:", message.error);
            break;
          }
          case "response.audio_transcript.delta": {
            transcriptText += message.delta;
            console.log(`テキスト応答: ${message.delta}`);
            break;
          }
          case "response.audio.delta": {
            const buffer = Buffer.from(message.delta, "base64");
            audioChunks.push(buffer);
            console.log(`音声データ受信: ${buffer.length} バイト`);
            break;
          }
        }
        
        if (message.type === "response.done" || message.type === "error") {
          break;
        }
      }
      
      // 接続を閉じる
      client.close();
      
      // 音声データが取得できた場合
      if (audioChunks.length > 0) {
        // 音声バッファを結合
        const buffer = Buffer.concat(audioChunks);
        
        // 一時ファイルに保存
        fs.writeFileSync(tempFilePath, buffer);
        
        console.log('Azure GPT-4o Audio音声合成成功:', tempFilePath);
        return {
          buffer,
          filePath: tempFilePath,
          text: transcriptText
        };
      } else {
        console.warn('音声データが受信できませんでした、OpenAI TTSにフォールバック');
        // 音声データが取得できなかった場合はOpenAI TTSにフォールバック
        return this.synthesizeSpeech(transcriptText || text, userId, options);
      }
    } catch (error) {
      console.error('Azure GPT-4o Audio音声合成エラー:', error.message);
      console.log('OpenAI TTSにフォールバック');
      // エラー時はOpenAI TTSにフォールバック
      return this.synthesizeSpeech(text, userId, options);
    }
  }
  
  // OpenAI TTSを使用したテキスト音声変換（従来の実装）
  async synthesizeSpeech(text, userId, options = {}) {
    // テキストがない場合または文字列でない場合のチェックを追加
    if (!text) {
      console.error(`OpenAI TTS音声合成エラー: テキストが空です。`);
      // デフォルトテキストを設定して処理を続行
      text = "申し訳ありません、応答の生成中に問題が発生しました。もう一度お試しください。";
      console.log('デフォルトテキストを使用して処理を続行します');
    } else if (typeof text !== 'string') {
      console.error(`OpenAI TTS音声合成エラー: 不正なテキスト形式です。type=${typeof text}, value=${JSON.stringify(text).substring(0, 100)}`);
      
      // オブジェクトからテキストを抽出する試み
      if (text.response) {
        text = text.response;
      } else if (text.text) {
        text = text.text;
      } else {
        // デフォルトテキストを設定して処理を続行
        text = "申し訳ありません、応答の生成中に問題が発生しました。もう一度お試しください。";
      }
      console.log(`抽出されたテキスト: ${text.substring(0, 50)}...`);
    }

    // 確実に文字列であることを保証
    text = String(text);
    
    console.log('OpenAI TTS音声合成開始:', text.substring(0, 30) + '...');
    
    // ユーザー設定を取得
    const userPrefs = this.voicePreferences.get(userId) || {
      voice: 'shimmer', // 日本語に適した声
      speed: 1.0,
    };
    
    try {
      // テキストが長すぎる場合は分割
      const maxLength = 4000; // OpenAI TTSの制限
      if (text.length > maxLength) {
        const segments = this._segmentText(text);
        const firstSegment = segments[0];
        console.log(`テキストが長すぎるため分割: ${segments.length}セグメント`);
        
        // 最初のセグメントのみ変換
        return this._synthesizeSegment(firstSegment, userPrefs, options);
      } else {
        return this._synthesizeSegment(text, userPrefs, options);
      }
    } catch (error) {
      console.error('OpenAI TTS音声合成エラー:', error.message);
      // エラー時も何らかの情報を返す
      return {
        buffer: null,
        filePath: null,
        text: text
      };
    }
  }
  
  // 個別のテキストセグメントを音声合成
  async _synthesizeSegment(text, userPrefs, options = {}) {
    try {
      // OpenAI TTS API使用
      const response = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: options.voice || userPrefs.voice,
        input: text,
        speed: options.speed || userPrefs.speed
      });
      
      // レスポンスをBufferに変換
      const buffer = Buffer.from(await response.arrayBuffer());
      
      // 一時ファイルに保存
      const tempFilePath = path.join(this.tempDir, `tts_${Date.now()}.mp3`);
      fs.writeFileSync(tempFilePath, buffer);
      
      // ファイルが実際に保存されたか確認
      if (!fs.existsSync(tempFilePath)) {
        console.error(`警告: 音声ファイルが保存されていません: ${tempFilePath}`);
        // 再試行
        fs.writeFileSync(tempFilePath, buffer);
      }
      
      console.log('OpenAI TTS音声合成成功:', tempFilePath);
      return {
        buffer,
        filePath: tempFilePath,
        text: text
      };
    } catch (error) {
      console.error('OpenAI TTS変換エラー:', error.message);
      // エラー時も情報を返す
      return {
        buffer: null,
        filePath: null,
        text: text
      };
    }
  }
  
  // 長いテキストを適切なチャンクに分割
  _segmentText(text, maxLength = 4000) {
    // 文章の自然な区切りで分割する
    const segments = [];
    let currentSegment = '';
    
    // 日本語と英語の文の区切りパターン
    const sentenceBreaks = text.split(/(?<=[。.!?！？])/);
    
    for (const sentence of sentenceBreaks) {
      if (currentSegment.length + sentence.length <= maxLength) {
        currentSegment += sentence;
      } else {
        segments.push(currentSegment);
        currentSegment = sentence;
      }
    }
    
    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }
    
    return segments;
  }
  
  // 音声設定の更新
  updateVoicePreferences(userId, preferences) {
    const currentPrefs = this.voicePreferences.get(userId) || {
      voice: 'shimmer',
      speed: 1.0
    };
    
    // 設定を更新
    this.voicePreferences.set(userId, {
      ...currentPrefs,
      ...preferences
    });
    
    // 設定をファイルに保存
    this._saveUserVoicePreferences(userId, this.voicePreferences.get(userId));
    
    console.log(`ユーザー(${userId})の音声設定を更新:`, this.voicePreferences.get(userId));
    return this.voicePreferences.get(userId);
  }
  
  // 会話履歴からユーザーの好みの音声設定を分析
  async analyzeVoicePreference(userId, history) {
    try {
      // AIに音声設定を推論させる
      const prompt = `
      以下の会話履歴を分析し、ユーザーが好みそうな音声の特性を推定してください。
      voice: "alloy"（中性的）, "nova"（若い女性）, "shimmer"（柔らかい女性）, "echo"（男性）, "fable"（ナレーター）から選択
      speed: 0.8（遅め）～1.2（速め）
      
      会話履歴:
      ${history.map(msg => `${msg.role}: ${msg.content}`).join('\n\n')}
      
      JSON形式で出力:
      {
        "voice": "選択した声",
        "speed": 数値,
        "reasoning": "この選択をした理由の簡単な説明"
      }
      `;
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'あなたはユーザーの傾向から好みの音声を推定する分析AIです。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      
      // 設定を更新
      this.updateVoicePreferences(userId, {
        voice: result.voice,
        speed: result.speed
      });
      
      console.log(`ユーザー(${userId})の音声設定を分析:`, result);
      return result;
    } catch (error) {
      console.error('音声好み分析エラー:', error.message);
      // エラー時はデフォルト設定を返す
      return {
        voice: 'shimmer',
        speed: 1.0,
        reasoning: 'デフォルト設定を使用'
      };
    }
  }
  
  // ユーザーの現在の音声設定を取得
  getUserVoicePreferences(userId) {
    const userPrefs = this.voicePreferences.get(userId);
    if (!userPrefs) {
      // デフォルト設定を返す
      const defaultPrefs = {
        voice: 'shimmer',
        speed: 1.0
      };
      // 新規ユーザーの場合は設定を保存
      this.voicePreferences.set(userId, defaultPrefs);
      this._saveUserVoicePreferences(userId, defaultPrefs);
      return defaultPrefs;
    }
    return userPrefs;
  }
  
  // 音声タイプ選択メッセージを生成
  generateVoiceSelectionMessage() {
    let message = "【音声タイプ選択】\n以下からお好みの音声タイプを選択できます：\n\n";
    
    Object.entries(this.availableVoices).forEach(([id, info]) => {
      message += `・${info.label}：「${id}の声にして」と送信\n`;
    });
    
    message += "\n音声のスピードも調整できます：\n";
    message += "・「ゆっくり話して」：ゆっくりした速度\n";
    message += "・「普通の速さで話して」：標準速度\n";
    message += "・「速く話して」：速い速度\n";
    
    return message;
  }
  
  // ユーザーのメッセージから音声設定変更を解析
  async parseVoiceChangeRequest(text, userId) {
    try {
      console.log(`音声変更リクエスト解析: "${text}"`);
      
      // LINE Voice Message仕様準拠フラグ
      let isLineCompliant = false;
      
      // LINE Message準拠パターン検出
      const lineCompliantPatterns = [
        "声を変えて", "音声設定を教えて",
        "声を男性に変更", "男性の声", "男性の声にして",
        "声を女性に変更", "女性の声", "女性の声に戻して", "女性の声にして",
        "声を若い女性の声に変えて", "若い女性の声",
        "もっとゆっくり話して", "ゆっくり話して",
        "話すスピードを速く", "速く話して", "音声のスピードを上げて",
        "声のタイプを変更", "声のタイプ",
        "どんな声のタイプ", "音声分析", "声のトーン",
        "標準の声に戻して", "普通の速さ", "普通の速度"
      ];
      
      for (const pattern of lineCompliantPatterns) {
        if (text.includes(pattern)) {
          isLineCompliant = true;
          break;
        }
      }
      
      // 現在の設定を取得
      let currentSettings = this.getUserVoicePreferences(userId);
      if (!currentSettings) {
        currentSettings = { voice: 'shimmer', speed: 1.0 };
      }
      
      // 初期値は変更なし
      let voiceChanged = false;
      let speedChanged = false;
      let confidence = 0;
      
      // 音声タイプ変更検出
      for (const [voiceId, voiceInfo] of Object.entries(this.availableVoices)) {
        // 音声タイプ名指定（例: 「echoの声にして」）
        if (text.includes(`${voiceId}の声`) || text.includes(`${voiceId}にして`)) {
          currentSettings.voice = voiceId;
          voiceChanged = true;
          confidence = 0.95;
          break;
        }
        
        // 音声タイプ説明指定（例: 「男性の声にして」）
        if (voiceInfo.description && text.includes(voiceInfo.description)) {
          currentSettings.voice = voiceId;
          voiceChanged = true;
          confidence = 0.9;
          break;
        }
        
        // 音声タイプラベル指定（例: 「柔らかい女性の声にして」）
        if (voiceInfo.label && text.includes(voiceInfo.label)) {
          currentSettings.voice = voiceId;
          voiceChanged = true;
          confidence = 0.9;
          break;
        }
      }
      
      // 特定の音声タイプ変更検出
      if (!voiceChanged) {
        // 男性声への変更
        if (text.includes('男性の声') || text.includes('男性にして') || text.includes('男の声')) {
          currentSettings.voice = 'echo';  // 男性声のID
          voiceChanged = true;
          confidence = 0.9;
        }
        // 女性声への変更
        else if (text.includes('女性の声') || text.includes('女性にして') || text.includes('女の声')) {
          currentSettings.voice = 'shimmer';  // 女性声のID
          voiceChanged = true;
          confidence = 0.9;
        }
        // 若い女性声への変更
        else if (text.includes('若い女性') || text.includes('若い声')) {
          currentSettings.voice = 'nova';  // 若い女性声のID
          voiceChanged = true;
          confidence = 0.9;
        }
        // ナレーター声への変更
        else if (text.includes('ナレーター') || text.includes('語り手')) {
          currentSettings.voice = 'fable';  // ナレーター声のID
          voiceChanged = true;
          confidence = 0.9;
        }
        // 中性的な声への変更
        else if (text.includes('中性的') || text.includes('ニュートラル')) {
          currentSettings.voice = 'alloy';  // 中性的な声のID
          voiceChanged = true;
          confidence = 0.9;
        }
        // デフォルト/標準声への変更
        else if (text.includes('デフォルト') || text.includes('標準') || text.includes('元に戻')) {
          currentSettings.voice = 'shimmer';  // デフォルト声のID
          voiceChanged = true;
          confidence = 0.9;
        }
      }
      
      // 速度変更検出
      if (text.includes('ゆっくり') || text.includes('遅く')) {
        currentSettings.speed = 0.8;  // ゆっくり
        speedChanged = true;
        confidence = Math.max(confidence, 0.9);
      }
      else if (text.includes('速く') || text.includes('早く') || text.includes('スピードアップ') || text.includes('スピードを上げて')) {
        currentSettings.speed = 1.2;  // 速い
        speedChanged = true;
        confidence = Math.max(confidence, 0.9);
      }
      else if (text.includes('普通') || text.includes('標準の速さ') || text.includes('通常の速度')) {
        currentSettings.speed = 1.0;  // 標準
        speedChanged = true;
        confidence = Math.max(confidence, 0.9);
      }
      
      // 設定が変更された場合は保存
      if (voiceChanged || speedChanged) {
        this.voicePreferences.set(userId, currentSettings);
        this._saveUserVoicePreferences(userId, currentSettings);
        console.log(`ユーザー(${userId})の音声設定を更新: ${JSON.stringify(currentSettings)}`);
      }
      
      // 変更リクエスト分析結果
      return {
        isVoiceChangeRequest: true,
        confidence: confidence,
        voiceChanged: voiceChanged,
        speedChanged: speedChanged,
        currentSettings: currentSettings,
        lineCompliant: isLineCompliant
      };
    } catch (error) {
      console.error('音声変更リクエスト解析エラー:', error);
      return {
        isVoiceChangeRequest: false,
        confidence: 0,
        error: error.message
      };
    }
  }
  
  // 音声特性レポートを生成
  async generateVoiceCharacteristicsReport(userId) {
    try {
      const summary = await this.getUserVoiceSummary(userId);
      
      if (!summary || summary.recordCount === 0) {
        return "音声特性データがまだありません。音声メッセージを送信していただくと、分析結果が表示されます。";
      }
      
      // 最も多い感情を特定
      let dominantEmotion = 'neutral';
      let maxCount = 0;
      for (const [emotion, count] of Object.entries(summary.emotionCounts)) {
        if (count > maxCount) {
          maxCount = count;
          dominantEmotion = emotion;
        }
      }
      
      // 最も多いトーンを特定
      let dominantTone = 'calm';
      maxCount = 0;
      for (const [tone, count] of Object.entries(summary.toneCounts)) {
        if (count > maxCount) {
          maxCount = count;
          dominantTone = tone;
        }
      }
      
      // 最も多い話速を特定
      let dominantSpeed = 'normal';
      maxCount = 0;
      for (const [speed, count] of Object.entries(summary.speedCounts)) {
        if (count > maxCount) {
          maxCount = count;
          dominantSpeed = speed;
        }
      }
      
      // 日時フォーマット
      const formatDate = (timestamp) => {
        return new Date(timestamp).toLocaleString('ja-JP');
      };
      
      // レポート生成
      let report = `【音声特性分析レポート】\n\n`;
      report += `■ 基本情報\n`;
      report += `・分析音声数: ${summary.recordCount}件\n`;
      report += `・最終更新: ${formatDate(summary.lastUpdated)}\n\n`;
      
      report += `■ 感情分析\n`;
      report += `・主要な感情: ${dominantEmotion}\n`;
      report += `・感情強度平均: ${summary.averageIntensity.toFixed(1)}/5.0\n\n`;
      
      report += `■ 話し方の特徴\n`;
      report += `・主要なトーン: ${dominantTone}\n`;
      report += `・主要な話速: ${dominantSpeed}\n\n`;
      
      report += `■ 詳細分布\n`;
      report += `・感情: ${Object.entries(summary.emotionCounts).map(([k, v]) => `${k}(${v})`).join(', ')}\n`;
      report += `・トーン: ${Object.entries(summary.toneCounts).map(([k, v]) => `${k}(${v})`).join(', ')}\n`;
      report += `・話速: ${Object.entries(summary.speedCounts).map(([k, v]) => `${k}(${v})`).join(', ')}\n`;
      
      // 現在の音声設定も追加
      const currentVoiceSettings = this.getUserVoicePreferences(userId);
      report += `\n■ 現在の音声設定\n`;
      report += `・声のタイプ: ${this.availableVoices[currentVoiceSettings.voice]?.label || currentVoiceSettings.voice}\n`;
      report += `・話速: ${currentVoiceSettings.speed === 0.8 ? 'ゆっくり' : currentVoiceSettings.speed === 1.2 ? '速い' : '普通'}\n`;
      report += `\n変更したい場合は「音声タイプを変更したい」とお伝えください。`;
      
      return report;
    } catch (error) {
      console.error('音声特性レポート生成エラー:', error.message);
      return "音声特性レポートの生成中にエラーが発生しました。";
    }
  }
}

// モジュールのエクスポート
module.exports = new AudioHandler(); 