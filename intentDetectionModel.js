// intentDetectionModel.js
let tf;
if (process.env.DISABLE_TENSORFLOW === 'true') {
  // Minimal mock to avoid runtime require in test or lightweight envs
  tf = {
    sequential: () => ({ add: () => {}, compile: () => {}, predict: () => ({ data: async () => new Float32Array(13) }), getWeights: () => [] }),
    layers: { embedding: () => ({}), conv1d: () => ({}), globalMaxPooling1d: () => ({}), dense: () => ({}), dropout: () => ({}) },
    tensor2d: () => ({}),
    dispose: () => {},
    env: () => ({ set: () => {} }),
    train: { adam: () => ({}) },
    models: { modelFromJSON: () => ({}) }
  };
} else {
  tf = require('@tensorflow/tfjs');
  // Suppress TensorFlow warnings by configuring the environment
  try {
    tf.env().set('WEBGL_CPU_FORWARD', false);
    tf.env().set('WEBGL_FORCE_F16_TEXTURES', false);
    tf.env().set('WEBGL_RENDER_FLOAT32_ENABLED', true);
    tf.env().set('WEBGL_FLUSH_THRESHOLD', 1);
  } catch {}
}
const natural = require('natural');
const { WordTokenizer } = natural;
const tokenizer = new WordTokenizer();
const path = require('path');
const fs = require('fs');

// (env configured above when enabled)

// 共有メモリストア
const memoryStore = require('./memoryStore');

class IntentDetectionModel {
  constructor() {
    this.model = null;
    this.vocabulary = {};
    this.modelLoaded = false;
    this.intentLabels = [
      'advice_seeking', 'information_request', 'problem_sharing',
      'decision_support', 'emotional_support', 'general_question',
      'recommendation_request', 'feedback', 'greeting', 'farewell',
      'gratitude', 'complaint', 'other'
    ];
    this.patternRules = {
      // 質問や助言を求めるパターン
      'advice_seeking': [
        /どうしたらいい/i, /アドバイス.*ください/i, /助言.*ください/i,
        /教えて.*ください/i, /どう思いますか/i, /どうすれば/i,
        /解決(方法|策)/i, /対処法/i, /どうやって.*したらいい/i,
        /何をすれば/i, /どうすればいい/i, /良い方法/i,
        // ASD特性考慮：具体的な指示を好む表現
        /具体的に教えて/i, /手順を教えて/i, /方法を詳しく/i,
        // ADHD特性考慮：直接的な質問
        /すぐに解決したい/i, /早く何とかしたい/i, /今困っている/i
      ],
      
      // 情報を求めるパターン
      'information_request': [
        /教えて/i, /について知りたい/i, /とは何/i, /どういう意味/i,
        /何ですか/i, /情報.*ください/i, /についての情報/i,
        /を教えてください/i, /とは/i, /を知りたい/i,
        /について詳しく/i, /説明してください/i, /どのように/i,
        // ASD特性考慮：事実・データ指向の表現
        /データはありますか/i, /正確な情報/i, /詳細が知りたい/i,
        // LD特性考慮：理解しやすい説明を求める表現
        /わかりやすく教えて/i, /簡単に説明して/i, /図で示して/i
      ],
      
      // 問題を共有するパターン
      'problem_sharing': [
        /困って/i, /悩んで/i, /問題[があで]/i, /大変[でなだ]/i,
        /苦労して/i, /うまくいかない/i, /ストレス/i, /辛い/i,
        /疲れ/i, /不安/i, /悩み/i, /困難/i, /苦しい/i,
        // ASD特性考慮：感覚過敏や社会的困難の表現
        /音がうるさくて/i, /人が多くて/i, /場の空気がわからない/i,
        /目を合わせるのが難しい/i, /急な予定変更で/i,
        // ADHD特性考慮：注意・集中の困難
        /集中できない/i, /忘れてしまう/i, /整理ができない/i, /時間管理が/i,
        // LD特性考慮：学習・読み書きの困難
        /読むのが遅い/i, /書くのが大変/i, /計算が苦手/i, /覚えられない/i,

        // 感情言語化困難に対応：状況や事実の客観的描写
        /毎日同じことを繰り返している/i, /計画通りにならない/i,
        /予定が変わった/i, /思ったように動けない/i, /何をすればいいかわからない/i,
        /周りの人の反応がわからない/i, /言われたことができない/i,
        /思っていることを言えない/i, /一人でいることが多い/i,
        /うまく伝わらない/i, /会話についていけない/i, /混乱する/i
      ],
      
      // 意思決定支援のパターン
      'decision_support': [
        /どちらが良い/i, /選ぶべき/i, /選択肢/i, /(どっち|どれ)が(いい|良い|適切)/i,
        /決められない/i, /迷って/i, /判断に困る/i, /どうするべき/i,
        /選ん(だら|だほうが)/i, /決断/i, /どちらを選ぶ/i,
        // ASD特性考慮：選択の難しさに関する表現
        /選択肢が多すぎる/i, /どれが正解か/i, /基準がわからない/i,
        // ADHD特性考慮：衝動的決断への不安
        /すぐ決めてしまう/i, /後悔しそう/i, /冷静に選びたい/i
      ],
      
      // 感情的サポートを求めるパターン
      'emotional_support': [
        /つらい/i, /悲しい/i, /寂しい/i, /不安/i, /心配/i,
        /落ち込んで/i, /気持ち/i, /聞いてほしい/i, /共感/i,
        /慰め/i, /辛く/i, /励まし/i, /心が重い/i,
        // ASD特性考慮：感情の認識・表現の困難
        /感情がわからない/i, /どう感じればいいか/i, /反応に困る/i,
        // ADHD特性考慮：感情調整の困難
        /イライラが止まらない/i, /気分が変わりやすい/i, /感情的になってしまう/i,
        // 二次障害に関連する表現
        /周りと違う自分/i, /理解されない/i, /孤独を感じる/i,
        
        // 感情言語化困難に対応：身体感覚や状況描写からの感情推測
        /胸が苦しい/i, /息がしづらい/i, /頭が痛い/i, /体が重い/i,
        /眠れない/i, /食欲がない/i, /動悸がする/i, /震える/i,
        /何も手につかない/i, /一日中横になっている/i, /泣いてしまう/i,
        /急に具合が悪くなる/i, /周りの目が気になる/i, /人と話せない/i
      ],
      
      // 一般的な質問のパターン
      'general_question': [
        /ですか\??$/i, /かな\??$/i, /なの\??$/i, /でしょうか\??$/i,
        /[?？]$/i, /教えて/i, /知りたい/i, /質問/i,
        /を教えて/i, /どうなる/i, /なぜ/i, /なんで/i
      ],
      
      // 推薦依頼のパターン
      'recommendation_request': [
        /おすすめ/i, /オススメ/i, /良い.*教えて/i, /紹介して/i,
        /推薦して/i, /良い.*ありますか/i, /良い.*は何/i,
        /お勧め/i, /何がいい/i, /何が良い/i, /どれがいい/i
      ],
      
      // フィードバックのパターン
      'feedback': [
        /思った/i, /感じた/i, /評価/i, /レビュー/i, /意見/i,
        /フィードバック/i, /良かった/i, /悪かった/i, /改善点/i,
        /提案/i, /してほしい/i, /要望/i
      ],
      
      // 挨拶のパターン
      'greeting': [
        /こんにちは/i, /はじめまして/i, /おはよう/i, /こんばんは/i,
        /よろしく/i, /調子はどう/i, /元気/i, /調子/i, /^や[ー〜]+$/i,
        /^はい$/i, /^ハロー$/i, /^ヤッホー$/i, /今日は/i
      ],
      
      // 別れの挨拶のパターン
      'farewell': [
        /さようなら/i, /またね/i, /じゃあね/i, /バイバイ/i,
        /また(会|あ)おう/i, /お休み/i, /失礼します/i, /失礼いたします/i,
        /また明日/i, /お先に/i, /終わります/i, /終了/i
      ],
      
      // 感謝のパターン
      'gratitude': [
        /ありがとう/i, /感謝/i, /助かり/i, /うれしい/i, /嬉しい/i,
        /助けて(くれて|いただいて)/i, /お礼/i, /サンキュ/i, /thank/i,
        /気持ち/i, /役に立った/i, /参考になった/i
      ],
      
      // 苦情のパターン
      'complaint': [
        /不満/i, /文句/i, /クレーム/i, /苦情/i, /不快/i,
        /ひどい/i, /最悪/i, /良くない/i, /気に入らない/i,
        /不便/i, /使いにくい/i, /不具合/i, /バグ/i
      ]
    };
    this.modelPath = path.join(__dirname, 'models', 'intent');
    this.currentModelVersion = '1.0.0';
    this.trainingInProgress = false;
  }
  
  async initialize() {
    try {
      // モデルディレクトリの確認と作成
      await this._ensureModelDir();
      
      // 最新のアクティブなモデルバージョンを取得
      let activeVersion = null;
      
      try {
        const activeVersions = memoryStore.modelVersions.filter(v => v.is_active);
        if (activeVersions.length > 0) {
          activeVersion = activeVersions[0].version;
        }
      } catch (error) {
        console.warn('アクティブモデルバージョンの取得に失敗しました:', error);
        // エラーが発生しても処理を続行
      }
      
      // 保存されたモデルがある場合は読み込み
      if (activeVersion && await this._canLoadModel(activeVersion)) {
        const loadSuccess = await this._loadModelFromDisk(activeVersion);
        
        if (loadSuccess) {
          console.log(`モデルバージョン ${activeVersion} を読み込みました`);
          return true;
        } else {
          console.warn(`モデルバージョン ${activeVersion} の読み込みに失敗しました`);
        }
      }
      
      // 語彙ファイルが存在する場合は読み込む
      const vocabularyExists = fs.existsSync(path.join(this.modelPath, 'vocabulary.json'));
      
      if (vocabularyExists) {
        this.vocabulary = JSON.parse(fs.readFileSync(path.join(this.modelPath, 'vocabulary.json'), 'utf8'));
        console.log('既存の語彙ファイルを読み込みました');
      }
      
      // モデルが読み込めない場合は新しいサンプルモデルを作成
      const { model } = await this._createSampleModel();
      this.model = model;
      this.modelLoaded = true;
      
      console.log('サンプル意図検出モデルを作成しました');
      return true;
    } catch (error) {
      console.error('意図検出モデルの初期化に失敗しました:', error);
      return false;
    }
  }
  
  async detectIntent(text) {
    // パターンマッチングによる検出
    const patternMatches = this._detectWithPatterns(text);
    
    // 感情言語化困難に対応：文脈や状況描写からの意図推測
    const contextualIntent = this._inferIntentFromContext(text);
    
    // 文脈推測の結果を統合
    Object.keys(contextualIntent).forEach(intent => {
      if (contextualIntent[intent] > 0) {
        patternMatches[intent] = Math.max(patternMatches[intent] || 0, contextualIntent[intent]);
      }
    });
    
    // モデルによる検出（可能な場合）
    let modelPrediction = null;
    
    if (this.modelLoaded) {
      try {
        modelPrediction = await this._predictWithModel(text);
      } catch (error) {
        console.warn('Model prediction failed:', error);
      }
    } else {
      // モデルの初期化を試みる
      try {
        await this.initialize();
        modelPrediction = await this._predictWithModel(text);
      } catch (error) {
        console.warn('Model prediction after initialization failed:', error);
      }
    }
    
    // 結果の統合
    const result = this._combineResults(patternMatches, modelPrediction);
    
    return result;
  }
  
  // 文脈や状況描写から意図を推測する新機能
  _inferIntentFromContext(text) {
    const result = {};
    
    // 1. 身体症状や状態の表現からの感情・思考推測
    const physicalSymptoms = [
      /頭が痛い/i, /お腹が痛い/i, /疲れ/i, /眠れない/i, /食欲/i,
      /体が重い/i, /息苦しい/i, /動悸/i, /吐き気/i, /めまい/i
    ];
    
    const physicalMatches = physicalSymptoms.filter(pattern => pattern.test(text));
    if (physicalMatches.length > 0) {
      // 身体症状の表現は問題共有か感情的サポートを求めている可能性が高い
      const score = Math.min(1.0, physicalMatches.length * 0.2);
      result['problem_sharing'] = score;
      result['emotional_support'] = score * 0.8; // 二次的な意図として
    }
    
    // 2. 事実や状況の客観的描写からの意図推測
    const factualDescriptions = [
      /できない/i, /わからない/i, /うまくいかない/i, /失敗/i,
      /困難/i, /問題/i, /状況/i, /変化/i, /出来事/i
    ];
    
    const factualMatches = factualDescriptions.filter(pattern => pattern.test(text));
    if (factualMatches.length > 0) {
      // 状況描写は問題共有の可能性が高い
      const score = Math.min(1.0, factualMatches.length * 0.15);
      result['problem_sharing'] = (result['problem_sharing'] || 0) + score;
    }
    
    // 3. 疑問形での間接的な感情表現
    const indirectQuestions = [
      /どうすれば/i, /どうしたら/i, /なぜ/i, /どうして/i,
      /どんな風に/i, /方法は/i, /可能性/i
    ];
    
    const questionMatches = indirectQuestions.filter(pattern => pattern.test(text));
    if (questionMatches.length > 0) {
      // 疑問形は情報要求か助言を求めている可能性が高い
      const score = Math.min(1.0, questionMatches.length * 0.15);
      result['advice_seeking'] = (result['advice_seeking'] || 0) + score;
      result['information_request'] = (result['information_request'] || 0) + score * 0.7;
    }
    
    // 4. 短いフレーズや単語のみの表現（言語化困難の場合の簡略表現）
    const words = text.trim().split(/\s+/).length;
    if (words <= 3 && text.length < 15) {
      // 非常に短い表現は一般的な質問として扱う
      result['general_question'] = 0.2;
    }
    
    return result;
  }
  
  // パターンマッチングによる意図検出
  _detectWithPatterns(text) {
    const result = {};
    
    // 各意図カテゴリについてパターンマッチングを実行
    Object.entries(this.patternRules).forEach(([intent, patterns]) => {
      // マッチしたパターンの数をカウント
      const matches = patterns.filter(pattern => pattern.test(text));
      
      if (matches.length > 0) {
        // 一致したパターン数に基づいてスコアを計算
        // 発達障害特性を考慮：短い文や繰り返し表現への対応を強化
        const baseScore = Math.min(1.0, matches.length / patterns.length * 1.5);
        
        // 短いテキストの場合（30文字以下）、スコアをやや増加
        // （短い文で主旨を伝えることが難しい場合への配慮）
        const textLengthFactor = text.length <= 30 ? 1.2 : 1.0;
        
        // 繰り返し表現への対応（同じ語句が複数回出現する場合）
        // 繰り返しパターンが観察されることがあるASD特性に配慮
        const wordCounts = this._countWordRepetitions(text);
        const repetitionFactor = wordCounts.some(count => count > 2) ? 1.15 : 1.0;
        
        result[intent] = Math.min(1.0, baseScore * textLengthFactor * repetitionFactor);
      } else {
        result[intent] = 0;
      }
    });
    
    // パターンルールにないラベルにはデフォルト値を設定
    this.intentLabels.forEach(label => {
      if (!(label in result)) {
        result[label] = 0;
      }
    });
    
    // 最低限のスコア保証（すべてが0の場合に備える）
    const hasNonZeroScore = Object.values(result).some(score => score > 0);
    if (!hasNonZeroScore) {
      // 一般質問のデフォルトスコアをやや上げて、不明確な表現に対応
      result['general_question'] = 0.15;
    }
    
    return result;
  }
  
  // 単語の繰り返しを検出するヘルパーメソッド
  _countWordRepetitions(text) {
    // 単語に分割して繰り返しをカウント
    const words = text.toLowerCase().match(/[一-龠ぁ-んァ-ヶa-zA-Z0-9]+/g) || [];
    const wordCounts = {};
    
    words.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
    
    return Object.values(wordCounts);
  }
  
  // モデルによる意図検出
  async _predictWithModel(text) {
    if (!this.modelLoaded) {
      throw new Error('Model not loaded');
    }
    
    try {
      // テキストの前処理とトークン化
      const tokens = tokenizer.tokenize(text.toLowerCase());
      
      // トークンをIDに変換
      const tokenIds = tokens.map(token => this.vocabulary[token] || 0);
      
      // シーケンスのパディング
      const paddedSequence = this._padSequence(tokenIds, 50);
      
      // 推論の実行
      const inputTensor = tf.tensor2d([paddedSequence], [1, 50]);
      const prediction = this.model.predict(inputTensor);
      const intentScores = await prediction.data();
      
      // リソースの解放
      tf.dispose([inputTensor, prediction]);
      
      // 結果のフォーマット
      const result = {};
      this.intentLabels.forEach((label, index) => {
        result[label] = intentScores[index];
      });
      
      return result;
    } catch (error) {
      console.error('Error predicting with model:', error);
      throw error;
    }
  }
  
  // パターンマッチングとモデル予測の結果を統合
  _combineResults(patternMatches, modelPrediction) {
    let combinedScores = { ...patternMatches };
    
    // モデル予測があれば統合
    if (modelPrediction) {
      // 各ラベルについて重み付けして統合
      this.intentLabels.forEach(label => {
        // パターンマッチングとモデル予測の重み調整
        // 発達障害特性を考慮：パターンマッチの比重をやや上げる
        const patternWeight = 0.7;  // 以前は0.6
        const modelWeight = 0.3;    // 以前は0.4
        
        const patternScore = patternMatches[label] || 0;
        const modelScore = modelPrediction[label] || 0;
        
        // 重み付き平均
        combinedScores[label] = (patternScore * patternWeight) + (modelScore * modelWeight);
      });
    }
    
    // セカンダリインテントの検出のための準備
    const sortedScores = Object.entries(combinedScores)
      .sort((a, b) => b[1] - a[1])
      .filter(([_, score]) => score > 0);
    
    // 主要な意図と信頼度
    const primaryIntent = sortedScores.length > 0 ? sortedScores[0][0] : 'general_question';
    const primaryScore = sortedScores.length > 0 ? sortedScores[0][1] : 0.1;
    
    // セカンダリインテントの条件を調整
    // 発達障害特性を考慮：複数の意図が混在するケースに対応
    const secondaryIntentThreshold = 0.7; // 以前は0.8
    const secondaryIntent = (sortedScores.length > 1 && 
                            sortedScores[1][1] >= sortedScores[0][1] * secondaryIntentThreshold) 
                            ? sortedScores[1][0] 
                            : null;
    
    return {
      primary: primaryIntent,
      secondary: secondaryIntent,
      confidence: primaryScore,
      scores: combinedScores
    };
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
    const intentDir = this.modelPath;
    
    // modelsディレクトリが存在しない場合は作成
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir);
    }
    
    // 意図検出モデルディレクトリが存在しない場合は作成
    if (!fs.existsSync(intentDir)) {
      fs.mkdirSync(intentDir);
    }
  }
  
  // サンプル意図検出モデルの作成
  async _createSampleModel() {
    // サンプル語彙の作成
    const sampleVocabulary = {};
    const words = [
      // 一般的な単語
      'こんにちは', 'さようなら', 'ありがとう', 'すみません',
      // 質問や助言を求める単語
      'どう', 'どうすれば', 'どうしたら', 'アドバイス', '助言', '教えて',
      // 情報を求める単語
      '何', 'どこ', 'いつ', 'なぜ', 'どのように', '情報',
      // 問題を共有する単語
      '困って', '悩んで', '問題', '大変', '苦労', 'うまくいかない'
    ];
    
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
      inputLength: 50
    }));
    
    // 畳み込み層
    model.add(tf.layers.conv1d({
      filters: 16,
      kernelSize: 3,
      activation: 'relu'
    }));
    
    // プーリング層
    model.add(tf.layers.globalMaxPooling1d());
    
    // 全結合層
    model.add(tf.layers.dense({
      units: 24,
      activation: 'relu'
    }));
    
    // ドロップアウト
    model.add(tf.layers.dropout({ rate: 0.5 }));
    
    // 出力層
    model.add(tf.layers.dense({
      units: this.intentLabels.length,
      activation: 'softmax'
    }));
    
    // モデルのコンパイル
    model.compile({
      optimizer: 'adam',
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });
    
    // 語彙の保存
    fs.writeFileSync(
      path.join(this.modelPath, 'vocabulary.json'),
      JSON.stringify(sampleVocabulary),
      'utf8'
    );
    
    this.model = model;
    this.vocabulary = sampleVocabulary;
    
    return { model, vocabulary: sampleVocabulary };
  }
  
  /**
   * 学習データを保存する
   * @param {string} text ユーザーテキスト
   * @param {string} predictedIntent 予測された意図
   * @param {string} correctIntent 正しい意図
   * @param {string} feedbackType フィードバックタイプ（'correction'または'confirmation'）
   * @param {string|null} userId ユーザーID（オプション）
   * @param {object|null} context コンテキスト情報（オプション）
   * @returns {Promise<boolean>} 保存に成功したかどうか
   */
  async saveTrainingData(text, predictedIntent, correctIntent, feedbackType, userId = null, context = null) {
    try {
      // 学習データをメモリストアに保存
      const trainingItem = {
        text,
        predicted_intent: predictedIntent,
        correct_intent: correctIntent,
        feedback_type: feedbackType,
        user_id: userId,
        context: context,
        created_at: new Date().toISOString(),
        trained: false
      };
      
      // 新しいメモリストアインターフェースを使用
      await memoryStore.addTrainingData(trainingItem);
      
      console.log('学習データが保存されました:', { text, predictedIntent, correctIntent });
      return true;
    } catch (error) {
      console.error('学習データの保存中にエラーが発生しました:', error);
      return false;
    }
  }
  
  /**
   * 未学習のデータを取得する
   * @param {number} limit 取得するデータの最大数
   * @returns {Promise<Array>} 未学習のデータ配列
   */
  async getUntrainedData(limit = 1000) {
    try {
      // メモリストアから未学習データを取得
      return memoryStore.trainingData
        .filter(item => !item.trained)
        .slice(0, limit);
    } catch (error) {
      console.error('未学習データの取得中にエラーが発生しました:', error);
      return [];
    }
  }
  
  /**
   * 未学習データを使用してモデルを再トレーニングする
   * @returns {Promise<boolean>} トレーニングが成功したかどうか
   */
  async retrainModel() {
    // すでにトレーニング中の場合は拒否
    if (this.trainingInProgress) {
      console.log('トレーニングはすでに進行中です');
      return false;
    }
    
    this.trainingInProgress = true;
    
    try {
      // 未学習データの取得
      const trainingData = await this.getUntrainedData();
      
      if (trainingData.length === 0) {
        console.log('トレーニングデータがありません');
        this.trainingInProgress = false;
        return false;
      }
      
      console.log(`${trainingData.length}件のトレーニングデータで学習を開始します`);
      
      // 語彙の拡張
      const texts = trainingData.map(item => item.text);
      const newWordsCount = await this._expandVocabulary(texts);
      console.log(`新しい単語を ${newWordsCount} 個発見しました`);
      console.log(`語彙が拡張されました: 合計 ${Object.keys(this.vocabulary).length} 単語`);
      
      // トレーニングデータの準備
      const { inputData, outputData } = await this._prepareTrainingData(trainingData);
      
      // 新しいバージョン番号の生成
      const newVersion = this._incrementVersion(this.currentModelVersion);
      
      // モデルがない場合は作成
      if (!this.model) {
        await this._createSampleModel();
      }
      
      // トレーニングの実行
      console.log('モデルのトレーニングを開始...');
      
      // 発達障害特性を考慮：学習パラメータを調整
      const batchSize = 2;  // 小さいバッチサイズでより細かく学習（以前は4）
      const epochs = 10;    // エポック数（変更なし）
      
      const callbacks = {
        onEpochEnd: async (epoch, logs) => {
          console.log(`エポック ${epoch + 1}/${epochs}: 損失 = ${logs.loss.toFixed(4)}, 精度 = ${logs.acc.toFixed(4)}`);
        }
      };
      
      // 学習率の調整：ゆるやかな学習を促進
      const learningRate = 0.001;  // 以前は0.01
      const optimizer = tf.train.adam(learningRate);
      
      // モデルのコンパイル（発達障害特性考慮：ゆるやかな学習に適したオプティマイザ設定）
      this.model.compile({
        optimizer: optimizer,
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
      });
      
      // トレーニングの実行
      const trainResult = await this.model.fit(inputData, outputData, {
        batchSize: batchSize,
        epochs: epochs,
        shuffle: true,
        callbacks: callbacks
      });
      
      // 最終精度の確認
      const finalAccuracy = trainResult.history.acc[trainResult.history.acc.length - 1];
      console.log(`トレーニング完了 - 最終精度: ${(finalAccuracy * 100).toFixed(2)}%`);
      
      // モデルの保存
      await this._saveModelToDisk(newVersion);
      console.log(`モデルが ${this.modelPath}/${newVersion} に保存されました`);
      
      // メモリストアのアップデート
      // トレーニングしたデータにフラグを設定
      for (const item of trainingData) {
        // 学習済みフラグを更新
        item.trained = true;
        
        // メモリストアを通じてデータを更新
        await memoryStore.updateTrainingData(item);
      }
      
      // 新しいモデルバージョンの追加
      const modelVersionInfo = {
        version: newVersion,
        description: `トレーニングデータ ${trainingData.length} 件で学習`,
        model_path: `models/intent/${newVersion}`,
        training_samples: trainingData.length,
        accuracy: finalAccuracy,
        created_at: new Date().toISOString(),
        is_active: true
      };
      
      // メモリストアを通じてモデルバージョンを追加
      await memoryStore.addModelVersion(modelVersionInfo);
      
      // 現在のモデルバージョンを更新
      this.currentModelVersion = newVersion;
      
      this.trainingInProgress = false;
      return true;
    } catch (error) {
      console.error('モデルのトレーニング中にエラーが発生しました:', error);
      this.trainingInProgress = false;
      return false;
    }
  }
  
  /**
   * バージョン番号をインクリメントする
   * @param {string} version 現在のバージョン
   * @returns {string} 新しいバージョン
   */
  _incrementVersion(version) {
    const parts = version.split('.');
    parts[2] = (parseInt(parts[2]) + 1).toString();
    return parts.join('.');
  }
  
  /**
   * モデルをディスクに保存する
   * @param {string} version バージョン
   * @returns {Promise<void>}
   */
  async _saveModelToDisk(version) {
    const modelDir = path.join(this.modelPath, version);
    
    try {
      // モデル構造をJSONに変換
      const modelConfig = this.model.toJSON();
      
      // モデル構造を保存
      fs.writeFileSync(
        path.join(modelDir, 'model-topology.json'),
        JSON.stringify(modelConfig),
        'utf8'
      );
      
      // 語彙を保存
      fs.writeFileSync(
        path.join(modelDir, 'vocabulary.json'),
        JSON.stringify(this.vocabulary),
        'utf8'
      );
      
      // 重みを保存
      const weights = this.model.getWeights();
      const weightData = [];
      
      for (let i = 0; i < weights.length; i++) {
        const data = await weights[i].data();
        weightData.push({
          name: `weight_${i}`,
          shape: weights[i].shape,
          dtype: weights[i].dtype,
          data: Array.from(data)
        });
      }
      
      fs.writeFileSync(
        path.join(modelDir, 'weights.json'),
        JSON.stringify(weightData),
        'utf8'
      );
      
      console.log(`モデルが ${modelDir} に保存されました`);
    } catch (error) {
      console.error('モデルの保存中にエラーが発生しました:', error);
      throw error;
    }
  }
  
  /**
   * ディスクからモデルを読み込む
   * @param {string} version バージョン
   * @returns {Promise<boolean>} 読み込みが成功したかどうか
   */
  async _loadModelFromDisk(version) {
    const modelDir = path.join(this.modelPath, version);
    
    try {
      // モデル構造を読み込む
      const modelConfigPath = path.join(modelDir, 'model-topology.json');
      
      if (!fs.existsSync(modelConfigPath)) {
        console.error(`モデル構造ファイル ${modelConfigPath} が見つかりません`);
        return false;
      }
      
      const modelConfig = JSON.parse(fs.readFileSync(modelConfigPath, 'utf8'));
      
      // 語彙を読み込む
      const vocabPath = path.join(modelDir, 'vocabulary.json');
      
      if (!fs.existsSync(vocabPath)) {
        console.error(`語彙ファイル ${vocabPath} が見つかりません`);
        return false;
      }
      
      this.vocabulary = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
      
      // モデルを再構築
      this.model = tf.models.modelFromJSON(modelConfig);
      
      // 重みを読み込む
      const weightsPath = path.join(modelDir, 'weights.json');
      
      if (!fs.existsSync(weightsPath)) {
        console.error(`重みファイル ${weightsPath} が見つかりません`);
        return false;
      }
      
      const weightData = JSON.parse(fs.readFileSync(weightsPath, 'utf8'));
      const weights = [];
      
      for (const weightInfo of weightData) {
        const tensor = tf.tensor(weightInfo.data, weightInfo.shape, weightInfo.dtype);
        weights.push(tensor);
      }
      
      this.model.setWeights(weights);
      
      this.currentModelVersion = version;
      this.modelLoaded = true;
      
      console.log(`モデルバージョン ${version} を読み込みました`);
      return true;
    } catch (error) {
      console.error('モデルの読み込み中にエラーが発生しました:', error);
      return false;
    }
  }
  
  /**
   * 語彙を拡張する
   * @param {Array<string>} texts テキスト配列
   * @returns {Promise<void>}
   */
  async _expandVocabulary(texts) {
    try {
      // 現在の語彙の最大IDを取得
      const maxId = Math.max(0, ...Object.values(this.vocabulary));
      let nextId = maxId + 1;
      
      // 新しい単語を収集
      const newWords = new Set();
      
      for (const text of texts) {
        const tokens = tokenizer.tokenize(text.toLowerCase());
        for (const token of tokens) {
          if (!(token in this.vocabulary)) {
            newWords.add(token);
          }
        }
      }
      
      console.log(`新しい単語を ${newWords.size} 個発見しました`);
      
      // 新しい単語を語彙に追加
      for (const word of newWords) {
        this.vocabulary[word] = nextId++;
        
        // 語彙をメモリに保存
        memoryStore.vocabulary[word] = this.vocabulary[word];
      }
      
      console.log(`語彙が拡張されました: 合計 ${Object.keys(this.vocabulary).length} 単語`);
    } catch (error) {
      console.error('語彙の拡張中にエラーが発生しました:', error);
      throw error;
    }
  }
  
  /**
   * トレーニングデータを準備する
   * @param {Array<Object>} trainingData トレーニングデータ配列
   * @returns {Promise<{xs: tf.Tensor, ys: tf.Tensor}>} 準備されたデータ
   */
  async _prepareTrainingData(trainingData) {
    try {
      const sequences = [];
      const labels = [];
      
      for (const item of trainingData) {
        // テキストをトークン化
        const tokens = tokenizer.tokenize(item.text.toLowerCase());
        
        // トークンをIDに変換
        const tokenIds = tokens.map(token => this.vocabulary[token] || 0);
        
        // シーケンスをパディング
        const paddedSequence = this._padSequence(tokenIds, 50);
        sequences.push(paddedSequence);
        
        // ラベルをone-hotエンコーディング
        const label = new Array(this.intentLabels.length).fill(0);
        const labelIndex = this.intentLabels.indexOf(item.correct_intent);
        
        if (labelIndex >= 0) {
          label[labelIndex] = 1;
        }
        
        labels.push(label);
      }
      
      // テンソルに変換
      const xs = tf.tensor2d(sequences, [sequences.length, 50]);
      const ys = tf.tensor2d(labels, [labels.length, this.intentLabels.length]);
      
      return { xs, ys };
    } catch (error) {
      console.error('トレーニングデータの準備中にエラーが発生しました:', error);
      throw error;
    }
  }
  
  /**
   * モデルが読み込み可能かどうかを確認
   * @param {string} version バージョン
   * @returns {Promise<boolean>} 読み込み可能かどうか
   */
  async _canLoadModel(version) {
    try {
      const modelDir = path.join(this.modelPath, version);
      const configExists = fs.existsSync(path.join(modelDir, 'model-topology.json'));
      const vocabExists = fs.existsSync(path.join(modelDir, 'vocabulary.json'));
      const weightsExists = fs.existsSync(path.join(modelDir, 'weights.json'));
      
      return configExists && vocabExists && weightsExists;
    } catch (error) {
      console.error('モデル読み込み可能性チェック中にエラーが発生しました:', error);
      return false;
    }
  }
}

module.exports = IntentDetectionModel; 