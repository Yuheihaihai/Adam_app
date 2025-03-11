// create_intent_training_table.js
require('dotenv').config();
const mysql = require('mysql2/promise');

async function createIntentTrainingTable() {
  try {
    // データベース接続
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE
    });

    console.log('データベースに接続しました');

    // インテント学習データテーブルの作成
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS intent_training_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        text TEXT NOT NULL,
        predicted_intent VARCHAR(50) NOT NULL,
        correct_intent VARCHAR(50) NOT NULL,
        feedback_type ENUM('correction', 'confirmation') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_id VARCHAR(100),
        context JSON,
        trained BOOLEAN DEFAULT FALSE,
        INDEX (predicted_intent),
        INDEX (correct_intent),
        INDEX (trained)
      )
    `;

    await connection.execute(createTableSql);
    console.log('intent_training_dataテーブルが正常に作成されました');

    // 語彙データテーブルの作成 (モデルの語彙を保存)
    const createVocabTableSql = `
      CREATE TABLE IF NOT EXISTS intent_vocabulary (
        id INT AUTO_INCREMENT PRIMARY KEY,
        word VARCHAR(100) NOT NULL,
        word_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY (word)
      )
    `;

    await connection.execute(createVocabTableSql);
    console.log('intent_vocabularyテーブルが正常に作成されました');

    // モデルバージョン管理テーブル
    const createModelVersionTableSql = `
      CREATE TABLE IF NOT EXISTS intent_model_versions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        version VARCHAR(50) NOT NULL,
        description TEXT,
        model_path VARCHAR(255) NOT NULL,
        training_samples INT NOT NULL DEFAULT 0,
        accuracy FLOAT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT FALSE,
        UNIQUE KEY (version)
      )
    `;

    await connection.execute(createModelVersionTableSql);
    console.log('intent_model_versionsテーブルが正常に作成されました');

    await connection.end();
    console.log('データベース接続を閉じました');
    
    return true;
  } catch (error) {
    console.error('テーブル作成中にエラーが発生しました:', error);
    return false;
  }
}

// スクリプトが直接実行された場合のみテーブル作成を実行
if (require.main === module) {
  createIntentTrainingTable()
    .then(success => {
      if (success) {
        console.log('処理が正常に完了しました');
        process.exit(0);
      } else {
        console.error('処理が失敗しました');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('予期せぬエラーが発生しました:', err);
      process.exit(1);
    });
} 