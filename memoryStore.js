// memoryStore.js
// データベース接続とメモリキャッシュを組み合わせたストア
const db = require('./db');

// メモリキャッシュ
const memoryCache = {
  trainingData: [],
  vocabulary: {},
  modelVersions: []
};

// メモリストアクラス
class MemoryStore {
  constructor() {
    this.useDatabase = process.env.USE_DATABASE === 'true';
    this.initialized = false;
  }

  // 初期化：データベースからデータを読み込む
  async initialize() {
    if (this.initialized) return;
    
    if (this.useDatabase) {
      try {
        console.log('メモリストア: データベースからデータを読み込んでいます...');
        
        // トレーニングデータの読み込み
        const trainingData = await db.query('SELECT * FROM intent_training_data ORDER BY created_at DESC');
        memoryCache.trainingData = trainingData;
        
        // 語彙データの読み込み
        const vocabulary = await db.query('SELECT token, token_id FROM intent_vocabulary');
        memoryCache.vocabulary = vocabulary.reduce((acc, item) => {
          acc[item.token] = item.token_id;
          return acc;
        }, {});
        
        // モデルバージョンの読み込み
        const modelVersions = await db.query('SELECT * FROM intent_model_versions ORDER BY created_at DESC');
        memoryCache.modelVersions = modelVersions;
        
        console.log(`メモリストア: 読み込み完了 (トレーニングデータ: ${trainingData.length}件, 語彙: ${vocabulary.length}語, モデルバージョン: ${modelVersions.length}件)`);
      } catch (error) {
        console.error('メモリストア: データベースからの読み込みに失敗しました:', error);
        console.log('メモリストア: メモリキャッシュのみを使用します');
      }
    } else {
      console.log('メモリストア: データベース接続が無効です。メモリキャッシュのみを使用します');
    }
    
    this.initialized = true;
  }

  // トレーニングデータ関連のメソッド
  get trainingData() {
    return memoryCache.trainingData;
  }
  
  async addTrainingData(data) {
    // メモリに追加
    memoryCache.trainingData.push(data);
    
    // データベースに保存
    if (this.useDatabase) {
      try {
        const result = await db.query(
          'INSERT INTO intent_training_data (text, predicted_intent, correct_intent, feedback_type, user_id, context, trained) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
          [data.text, data.predicted_intent, data.correct_intent, data.feedback_type, data.user_id, data.context, data.trained || false]
        );
        
        // 生成されたIDを設定
        if (result && result.length > 0) {
          data.id = result[0].id;
        }
      } catch (error) {
        console.error('メモリストア: トレーニングデータの保存に失敗しました:', error);
      }
    }
    
    return data;
  }
  
  async updateTrainingData(data) {
    // メモリのデータを更新
    const index = memoryCache.trainingData.findIndex(item => item.id === data.id);
    if (index !== -1) {
      memoryCache.trainingData[index] = { ...memoryCache.trainingData[index], ...data };
    }
    
    // データベースを更新
    if (this.useDatabase && data.id) {
      try {
        await db.query(
          'UPDATE intent_training_data SET trained = $1 WHERE id = $2',
          [data.trained, data.id]
        );
      } catch (error) {
        console.error('メモリストア: トレーニングデータの更新に失敗しました:', error);
      }
    }
  }

  // 語彙データ関連のメソッド
  get vocabulary() {
    return memoryCache.vocabulary;
  }
  
  async addVocabularyItem(token, tokenId) {
    // メモリに追加
    memoryCache.vocabulary[token] = tokenId;
    
    // データベースに保存
    if (this.useDatabase) {
      try {
        await db.query(
          'INSERT INTO intent_vocabulary (token, token_id) VALUES ($1, $2) ON CONFLICT (token) DO UPDATE SET token_id = $2',
          [token, tokenId]
        );
      } catch (error) {
        console.error('メモリストア: 語彙データの保存に失敗しました:', error);
      }
    }
  }
  
  // モデルバージョン関連のメソッド
  get modelVersions() {
    return memoryCache.modelVersions;
  }
  
  async addModelVersion(versionData) {
    // メモリに追加
    memoryCache.modelVersions.push(versionData);
    
    // データベースに保存
    if (this.useDatabase) {
      try {
        // 他のバージョンを非アクティブに
        if (versionData.is_active) {
          await db.query('UPDATE intent_model_versions SET is_active = false');
        }
        
        const result = await db.query(
          'INSERT INTO intent_model_versions (version, description, model_path, training_samples, accuracy, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
          [versionData.version, versionData.description, versionData.model_path, versionData.training_samples, versionData.accuracy, versionData.is_active]
        );
        
        // 生成されたIDを設定
        if (result && result.length > 0) {
          versionData.id = result[0].id;
        }
      } catch (error) {
        console.error('メモリストア: モデルバージョンの保存に失敗しました:', error);
      }
    }
    
    return versionData;
  }
  
  async updateModelVersions(isActiveMap) {
    // メモリのデータを更新
    memoryCache.modelVersions.forEach(version => {
      version.is_active = !!isActiveMap[version.id];
    });
    
    // データベースを更新
    if (this.useDatabase) {
      try {
        // まず全てを非アクティブに
        await db.query('UPDATE intent_model_versions SET is_active = false');
        
        // アクティブにするバージョンのIDがある場合
        const activeIds = Object.entries(isActiveMap)
          .filter(([_, isActive]) => isActive)
          .map(([id, _]) => id);
          
        if (activeIds.length > 0) {
          await db.query(
            `UPDATE intent_model_versions SET is_active = true WHERE id IN (${activeIds.join(',')})`
          );
        }
      } catch (error) {
        console.error('メモリストア: モデルバージョンの更新に失敗しました:', error);
      }
    }
  }
}

// シングルトンインスタンスを作成
const memoryStore = new MemoryStore();

// 非同期イニシャライザを実行
(async () => {
  try {
    await memoryStore.initialize();
  } catch (error) {
    console.error('メモリストアの初期化中にエラーが発生しました:', error);
  }
})();

module.exports = memoryStore; 