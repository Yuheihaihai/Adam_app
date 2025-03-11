// embeddingService.js
// Try to use tfjs-node if available, otherwise fallback to regular tfjs
let tf;
try {
  tf = require('@tensorflow/tfjs-node');
  console.log('Using TensorFlow.js Node native backend for embeddings');
} catch (error) {
  tf = require('@tensorflow/tfjs');
  console.log('Using TensorFlow.js JavaScript backend for embeddings (slower performance)');
  // Suppress TensorFlow warnings by configuring the environment
  tf.env().set('WEBGL_CPU_FORWARD', false);
  tf.env().set('WEBGL_FORCE_F16_TEXTURES', false);
  tf.env().set('WEBGL_RENDER_FLOAT32_ENABLED', true);
  tf.env().set('WEBGL_FLUSH_THRESHOLD', 1);
}

const natural = require('natural');
const tokenizer = new natural.WordTokenizer();
const path = require('path');
const fs = require('fs');

class EmbeddingService {
  constructor() {
    this.model = null;
    this.modelLoaded = false;
    this.vocabulary = {};
    this.embeddingSize = 512;
    this.modelPath = path.join(__dirname, 'models', 'embedding');
  }
  
  async initialize() {
    try {
      // モデルディレクトリの確認と作成
      await this._ensureModelDir();
      
      // モデルが存在するかチェック
      const modelExists = fs.existsSync(path.join(this.modelPath, 'model.json'));
      
      if (modelExists) {
        // 既存のモデルを読み込む
        this.model = await tf.loadLayersModel(`file://${path.join(this.modelPath, 'model.json')}`);
        // 語彙ファイルを読み込む
        this.vocabulary = JSON.parse(fs.readFileSync(path.join(this.modelPath, 'vocabulary.json'), 'utf8'));
        this.embeddingSize = this.model.outputs[0].shape[1];
        this.modelLoaded = true;
        console.log('Embedding model loaded successfully');
      } else {
        // サンプルモデルを作成
        await this._createSampleModel();
        this.modelLoaded = true;
        console.log('Sample embedding model created successfully');
      }
      
      return true;
    } catch (error) {
      console.error('Failed to initialize embedding model:', error);
      return false;
    }
  }
  
  async getEmbedding(text) {
    if (!this.modelLoaded) {
      await this.initialize();
    }
    
    try {
      // テキストのトークン化
      const tokens = tokenizer.tokenize(text.toLowerCase());
      
      // トークンをIDに変換
      const tokenIds = tokens.map(token => this.vocabulary[token] || 0);
      
      // 入力の長さを制限または埋める
      const paddedTokenIds = this._padSequence(tokenIds, 100);
      
      // テンソルに変換
      const inputTensor = tf.tensor2d([paddedTokenIds], [1, 100]);
      
      // モデルに入力して埋め込みを取得
      const embedding = this.model.predict(inputTensor);
      
      // JavaScriptの配列に変換
      const embeddingArray = await embedding.data();
      
      // リソースの解放
      tf.dispose([inputTensor, embedding]);
      
      return Array.from(embeddingArray);
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }
  
  // シーケンスをパディング
  _padSequence(sequence, maxLen) {
    if (sequence.length > maxLen) {
      return sequence.slice(0, maxLen);
    }
    return [...sequence, ...Array(maxLen - sequence.length).fill(0)];
  }
  
  // モデルディレクトリの確認・作成
  async _ensureModelDir() {
    const modelsDir = path.join(__dirname, 'models');
    const embeddingDir = this.modelPath;
    
    // modelsディレクトリが存在しない場合は作成
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir);
    }
    
    // 埋め込みモデルディレクトリが存在しない場合は作成
    if (!fs.existsSync(embeddingDir)) {
      fs.mkdirSync(embeddingDir);
    }
  }
  
  // サンプル埋め込みモデルの作成
  async _createSampleModel() {
    // サンプル語彙の作成
    const sampleVocabulary = {};
    const words = ['こんにちは', 'ありがとう', '質問', '助けて', '問題', '解決', 
                  '仕事', '勉強', '家族', '友達', '学校', '会社', '趣味', 
                  '音楽', '映画', '本', 'スポーツ', '料理', '旅行', '健康'];
    
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
      outputDim: this.embeddingSize,
      inputLength: 100
    }));
    
    // 平均プーリング
    model.add(tf.layers.globalAveragePooling1d());
    
    // モデルのコンパイル
    model.compile({
      optimizer: 'adam',
      loss: 'meanSquaredError'
    });
    
    // モデルの保存
    await model.save(`file://${this.modelPath}`);
    
    // 語彙の保存
    fs.writeFileSync(
      path.join(this.modelPath, 'vocabulary.json'),
      JSON.stringify(sampleVocabulary),
      'utf8'
    );
    
    this.model = model;
    this.vocabulary = sampleVocabulary;
  }
}

module.exports = EmbeddingService; 