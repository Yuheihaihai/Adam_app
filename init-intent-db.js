// init-intent-db.js
// PostgreSQLテーブルを初期化し、必要な場合はサンプルデータを追加する

require('dotenv').config();
const db = require('./db');

// サンプルの語彙データ
const sampleVocabulary = {
  'こんにちは': 1,
  'おはよう': 2,
  'お元気ですか': 3,
  'ありがとう': 4,
  '問題': 5,
  '助けて': 6,
  '困って': 7,
  'どうすれば': 8,
  'アドバイス': 9,
  '情報': 10
};

// サンプルのトレーニングデータ
const sampleTrainingData = [
  {
    text: 'こんにちは、元気ですか？',
    predicted_intent: 'greeting',
    correct_intent: 'greeting',
    feedback_type: 'confirmation',
    trained: true
  },
  {
    text: 'ありがとうございます',
    predicted_intent: 'gratitude',
    correct_intent: 'gratitude',
    feedback_type: 'confirmation',
    trained: true
  },
  {
    text: '最近眠れなくて困っています',
    predicted_intent: 'problem_sharing',
    correct_intent: 'problem_sharing',
    feedback_type: 'confirmation',
    trained: true
  }
];

// サンプルのモデルバージョン
const sampleModelVersion = {
  version: '1.0.0',
  description: '初期モデル',
  model_path: 'models/intent/1.0.0',
  training_samples: 3,
  accuracy: 0.8,
  created_at: new Date().toISOString(),
  is_active: true
};

// テーブルの作成とサンプルデータの挿入
async function initializeDatabase() {
  try {
    // データベース接続のテスト
    const connected = await db.testConnection();
    if (!connected) {
      console.error('データベースに接続できませんでした。設定を確認してください。');
      process.exit(1);
    }

    console.log('データベースに接続しました。テーブルを初期化します...');
    
    // テーブルの作成
    await db.initializeTables();
    console.log('テーブルの初期化が完了しました');
    
    // サンプルデータの挿入
    if (process.env.ADD_SAMPLE_DATA === 'true') {
      // 語彙データの挿入
      for (const [token, tokenId] of Object.entries(sampleVocabulary)) {
        await db.query(
          'INSERT INTO intent_vocabulary (token, token_id) VALUES ($1, $2) ON CONFLICT (token) DO NOTHING',
          [token, tokenId]
        );
      }
      console.log(`${Object.keys(sampleVocabulary).length}件の語彙データを挿入しました`);
      
      // トレーニングデータの挿入
      for (const data of sampleTrainingData) {
        await db.query(
          'INSERT INTO intent_training_data (text, predicted_intent, correct_intent, feedback_type, trained) VALUES ($1, $2, $3, $4, $5)',
          [data.text, data.predicted_intent, data.correct_intent, data.feedback_type, data.trained]
        );
      }
      console.log(`${sampleTrainingData.length}件のトレーニングデータを挿入しました`);
      
      // モデルバージョンの挿入
      await db.query(
        'INSERT INTO intent_model_versions (version, description, model_path, training_samples, accuracy, created_at, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [
          sampleModelVersion.version,
          sampleModelVersion.description,
          sampleModelVersion.model_path,
          sampleModelVersion.training_samples,
          sampleModelVersion.accuracy,
          sampleModelVersion.created_at,
          sampleModelVersion.is_active
        ]
      );
      console.log('モデルバージョン情報を挿入しました');
    }
    
    console.log('データベースの初期化が完了しました');
    process.exit(0);
  } catch (error) {
    console.error('初期化中にエラーが発生しました:', error);
    process.exit(1);
  }
}

// 実行
initializeDatabase();
