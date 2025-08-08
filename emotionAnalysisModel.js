// Try to use tfjs-node if available, otherwise fallback to regular tfjs; allow disabling via env
let tf;
try {
  if (process.env.DISABLE_TENSORFLOW === 'true') {
    throw new Error('TF disabled');
  }
  tf = require('@tensorflow/tfjs-node');
  console.log('Using TensorFlow.js Node native backend');
} catch (error) {
  try {
    if (process.env.DISABLE_TENSORFLOW === 'true') {
      throw new Error('TF disabled');
    }
    tf = require('@tensorflow/tfjs');
    console.log('Using TensorFlow.js JavaScript backend (slower performance)');
    // Suppress TensorFlow warnings by configuring the environment
    tf.env().set('WEBGL_CPU_FORWARD', false);
    tf.env().set('WEBGL_FORCE_F16_TEXTURES', false);
    tf.env().set('WEBGL_RENDER_FLOAT32_ENABLED', true);
    tf.env().set('WEBGL_FLUSH_THRESHOLD', 1);
  } catch (e2) {
    console.warn('TensorFlow not available; using minimal mock for tests');
    tf = {
      sequential: () => ({ add: () => {}, compile: () => {}, predict: () => ({ data: async () => new Float32Array(8) }) }),
      layers: { embedding: () => ({}), bidirectional: () => ({}), lstm: () => ({}), dropout: () => ({}), dense: () => ({}) },
      tensor2d: () => ({}),
      dispose: () => {},
    };
  }
}

const natural = require('natural');
const { WordTokenizer } = natural;
const tokenizer = new WordTokenizer();
const path = require('path');
const fs = require('fs');

class EmotionAnalysisModel {
  constructor() {
    this.model = null;
    this.vocabulary = {};
    this.modelLoaded = false;
    this.emotionLabels = ['喜び', '悲しみ', '怒り', '不安', '驚き', '混乱', '中立', 'その他'];
    this.modelPath = path.join(__dirname, 'models', 'emotion');
  }
  
  async initialize() {
    try {
      console.log('Initializing emotion analysis model...');
      
      // 既存のモデルファイルをチェック
      const modelExists = fs.existsSync(path.join(this.modelPath, 'model.json'));
      
      if (modelExists) {
        try {
          // 既存のモデルを読み込む試行
          const modelLoadPath = `file://${path.join(this.modelPath, 'model.json').replace(/\s+/g, '%20')}`;
          this.model = await tf.loadLayersModel(modelLoadPath);
        this.vocabulary = JSON.parse(fs.readFileSync(path.join(this.modelPath, 'vocabulary.json'), 'utf8'));
        this.modelLoaded = true;
          console.log('Existing emotion analysis model loaded successfully');
          return true;
        } catch (loadError) {
          console.warn('Failed to load existing model, creating new one:', loadError.message);
        }
      }
      
      // 新しいモデルを作成（メモリ内のみ）
      await this._createInMemoryModel();
        this.modelLoaded = true;
      console.log('In-memory emotion analysis model created successfully');
      
      return true;
    } catch (error) {
      console.error('Failed to initialize emotion analysis model:', error);
      return false;
    }
  }
  
  async analyzeEmotion(text) {
    if (!this.modelLoaded) {
      await this.initialize();
    }
    
    try {
      // テキストの前処理とトークン化
      const tokens = tokenizer.tokenize(text.toLowerCase());
      
      // トークンをIDに変換
      const tokenIds = tokens.map(token => this.vocabulary[token] || 0);
      
      // シーケンスのパディング
      const paddedSequence = this._padSequence(tokenIds, 100);
      
      // 推論の実行
      const inputTensor = tf.tensor2d([paddedSequence], [1, 100]);
      const prediction = this.model.predict(inputTensor);
      const emotionScores = await prediction.data();
      
      // リソースの解放
      tf.dispose([inputTensor, prediction]);
      
      // 結果のフォーマット
      const result = {};
      this.emotionLabels.forEach((label, index) => {
        result[label] = emotionScores[index];
      });
      
      // 主要な感情の特定
      const maxIndex = Array.from(emotionScores).indexOf(Math.max(...emotionScores));
      const dominantEmotion = this.emotionLabels[maxIndex];
      
      return {
        scores: result,
        dominant: dominantEmotion,
        intensity: emotionScores[maxIndex]
      };
    } catch (error) {
      console.error('Error analyzing emotion:', error);
      throw error;
    }
  }
  
  _padSequence(sequence, maxLen) {
    if (sequence.length > maxLen) {
      return sequence.slice(0, maxLen);
    }
    return [...sequence, ...Array(maxLen - sequence.length).fill(0)];
  }
  
  // モデルディレクトリの確認・作成
  async _ensureModelDir() {
    const modelsDir = path.join(__dirname, 'models');
    const emotionDir = this.modelPath;
    
    // modelsディレクトリが存在しない場合は作成
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir);
    }
    
    // 感情分析モデルディレクトリが存在しない場合は作成
    if (!fs.existsSync(emotionDir)) {
      fs.mkdirSync(emotionDir);
    }
  }
  
  // メモリ内感情分析モデルの作成
  async _createInMemoryModel() {
    // サンプル語彙の作成
    const sampleVocabulary = {};
    const words = ['嬉しい', '悲しい', '怒り', '不安', '驚き', '混乱', '普通', 
                  '良い', '悪い', '素晴らしい', '最悪', '心配', '恐怖', 
                  '喜び', '楽しい', '辛い', '苦しい', '安心', '困惑'];
    
    words.forEach((word, index) => {
      sampleVocabulary[word] = index + 1; // 0はパディング用
    });
    
    // 語彙サイズ（パディングトークンを含む）
    const vocabSize = Object.keys(sampleVocabulary).length + 1;
    
    // モデルの作成
    const model = tf.sequential();
    
    // 埋め込み層
    model.add(tf.layers.embedding({
      inputDim: vocabSize,
      outputDim: 32,
      inputLength: 100
    }));
    
    // Bidirectional LSTM層
    model.add(tf.layers.bidirectional({
      layer: tf.layers.lstm({
        units: 16,
        returnSequences: false
      }),
      mergeMode: 'concat'
    }));
    
    // ドロップアウト
    model.add(tf.layers.dropout({ rate: 0.5 }));
    
    // 出力層
    model.add(tf.layers.dense({ 
      units: this.emotionLabels.length,
      activation: 'softmax'
    }));
    
    // モデルのコンパイル
    model.compile({
      optimizer: 'adam',
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });
    
    // メモリ内でのみ保持（ファイルに保存しない）
    this.model = model;
    this.vocabulary = sampleVocabulary;
    
    console.log('Model created in memory with vocabulary size:', vocabSize);
  }
  
  // サンプル感情分析モデルの作成（ファイル保存版）
  async _createSampleModel() {
    // モデルディレクトリの確認と作成
    await this._ensureModelDir();
    
    // メモリ内モデルを作成
    await this._createInMemoryModel();
    
    try {
      // モデルの保存を試行 - ディレクトリ名にスペースが含まれる場合の対応
      const modelSavePath = `file://${this.modelPath.replace(/\s+/g, '%20')}`;
      await this.model.save(modelSavePath);
    
    // 語彙の保存
    fs.writeFileSync(
      path.join(this.modelPath, 'vocabulary.json'),
        JSON.stringify(this.vocabulary),
      'utf8'
    );
    
      console.log('Model saved to disk successfully');
    } catch (saveError) {
      console.warn('Failed to save model to disk, using memory-only model:', saveError.message);
    }
  }
}

module.exports = EmotionAnalysisModel; 