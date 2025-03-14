/**
 * ml-enhance/seed-data.js
 * 機械学習の進展を示すためのサンプルデータ初期化スクリプト
 */

const db = require('../db');
const logger = require('./logger');

// サンプルの意図トレーニングデータ
const sampleIntentTrainingData = [
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
  },
  {
    text: 'どの選択肢が良いか教えてください',
    predicted_intent: 'information_request',
    correct_intent: 'decision_support',
    feedback_type: 'correction',
    trained: false
  },
  {
    text: '昨日の会議はどうでしたか？',
    predicted_intent: 'question',
    correct_intent: 'general_inquiry',
    feedback_type: 'correction',
    trained: false
  },
  {
    text: '明日の予定を教えてください',
    predicted_intent: 'schedule_request',
    correct_intent: 'schedule_request',
    feedback_type: 'confirmation',
    trained: true
  },
  {
    text: '気分がとても優れません',
    predicted_intent: 'negative_emotion',
    correct_intent: 'negative_emotion',
    feedback_type: 'confirmation',
    trained: true
  },
  {
    text: '新しい仕事を探しています',
    predicted_intent: 'career_change',
    correct_intent: 'career_inquiry',
    feedback_type: 'correction',
    trained: false
  }
];

// モデルバージョン情報
const modelVersion = {
  version: '1.0.1',
  description: '機械学習ベータモデル',
  training_samples: 5,
  accuracy: 0.75,
  is_active: true
};

// データベースの初期化
async function seedDatabaseWithSampleData() {
  try {
    logger.info('サンプル機械学習データの初期化を開始');
    
    // 既存のレコードをカウント
    const existingTrainingData = await db.query('SELECT COUNT(*) as count FROM intent_training_data');
    const existingModelVersions = await db.query('SELECT COUNT(*) as count FROM intent_model_versions');
    
    // 既存データがなければサンプルデータを追加
    if (existingTrainingData[0].count === 0) {
      logger.info('トレーニングデータの初期化...');
      
      for (const data of sampleIntentTrainingData) {
        await db.query(
          'INSERT INTO intent_training_data (text, predicted_intent, correct_intent, feedback_type, trained) VALUES ($1, $2, $3, $4, $5)',
          [data.text, data.predicted_intent, data.correct_intent, data.feedback_type, data.trained]
        );
      }
      
      logger.info(`${sampleIntentTrainingData.length}件のサンプルトレーニングデータを追加しました`);
    } else {
      logger.info(`既存のトレーニングデータが見つかりました (${existingTrainingData[0].count}件)、初期化をスキップします`);
    }
    
    // モデルバージョン情報の初期化
    if (existingModelVersions[0].count === 0) {
      logger.info('モデルバージョン情報の初期化...');
      
      await db.query(
        'INSERT INTO intent_model_versions (version, description, training_samples, accuracy, is_active) VALUES ($1, $2, $3, $4, $5)',
        [modelVersion.version, modelVersion.description, modelVersion.training_samples, modelVersion.accuracy, modelVersion.is_active]
      );
      
      logger.info('モデルバージョン情報を追加しました');
    } else {
      logger.info(`既存のモデルバージョン情報が見つかりました (${existingModelVersions[0].count}件)、初期化をスキップします`);
    }
    
    // エラーログテーブルの存在確認と作成
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS error_logs (
          id SERIAL PRIMARY KEY,
          error_message TEXT NOT NULL,
          error_type VARCHAR(50) NOT NULL,
          stack_trace TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          severity VARCHAR(20) NOT NULL DEFAULT 'error',
          context JSONB
        )
      `);
      logger.info('エラーログテーブルの確認/作成が完了しました');
    } catch (error) {
      logger.error('エラーログテーブルの作成に失敗:', error);
    }
    
    logger.info('サンプルデータの初期化が完了しました');
    return true;
  } catch (error) {
    logger.error('サンプルデータの初期化に失敗:', error);
    return false;
  }
}

module.exports = {
  seedDatabaseWithSampleData
}; 