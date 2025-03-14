/**
 * ml-enhance/monitoring.js
 * 機械学習システムのモニタリング機能
 */

const db = require('../db');
const logger = require('./logger');
const { config } = require('./config');

class MonitoringSystem {
  constructor() {
    this.metrics = {
      lastUpdate: null,
      data: {
        training: {
          totalRecords: 0,
          trainedRecords: 0,
          accuracy: 0
        },
        model: {
          version: null,
          status: null,
          performance: null
        },
        database: {
          size: 0,
          connections: 0,
          tables: 0
        },
        errors: {
          recent: [],
          count: 0
        }
      }
    };
    
    // ログ出力設定
    this.logSettings = {
      // ログにステータスを出力する間隔（ミリ秒）
      statusLogInterval: parseInt(process.env.ML_LOG_INTERVAL || '3600000'),  // デフォルト1時間
      // 詳細なステータスのログ出力を有効にするか
      detailedLogging: process.env.ML_DETAILED_LOGGING === 'true',
      // 最後にログを出力した時刻
      lastLogTime: 0
    };
  }

  async initialize() {
    try {
      logger.info('モニタリングシステムの初期化を開始');
      await this.updateMetrics();
      this.startPeriodicUpdate();
      this.startStatusLogging();
      logger.info('モニタリングシステムの初期化が完了');
    } catch (error) {
      logger.error('モニタリングシステムの初期化に失敗:', error);
    }
  }

  async updateMetrics() {
    try {
      // トレーニングデータの統計
      const trainingStats = await this.getTrainingStats();
      this.metrics.data.training = trainingStats;

      // モデルの状態
      const modelStats = await this.getModelStats();
      this.metrics.data.model = modelStats;

      // データベースの状態
      const dbStats = await this.getDatabaseStats();
      this.metrics.data.database = dbStats;

      // エラー統計
      const errorStats = await this.getErrorStats();
      this.metrics.data.errors = errorStats;

      this.metrics.lastUpdate = new Date();
      logger.info('モニタリングメトリクスを更新しました');
    } catch (error) {
      logger.error('メトリクスの更新に失敗:', error);
    }
  }

  async getTrainingStats() {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(CASE WHEN trained = true THEN 1 END) as trained_records,
        AVG(CASE WHEN trained = true THEN 1 ELSE 0 END) * 100 as accuracy
      FROM intent_training_data
    `);
    return result[0];
  }

  async getModelStats() {
    const result = await db.query(`
      SELECT 
        version,
        description,
        training_samples,
        accuracy,
        is_active
      FROM intent_model_versions
      ORDER BY created_at DESC
      LIMIT 1
    `);
    return result[0] || {};
  }

  async getDatabaseStats() {
    const result = await db.query(`
      SELECT 
        pg_database_size(current_database()) as size,
        count(*) as connections
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);
    return result[0];
  }

  async getErrorStats() {
    const result = await db.query(`
      SELECT 
        COUNT(*) as error_count,
        array_agg(error_message ORDER BY created_at DESC LIMIT 5) as recent_errors
      FROM error_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);
    return result[0] || { error_count: 0, recent_errors: [] };
  }

  startPeriodicUpdate() {
    // 5分ごとにメトリクスを更新
    setInterval(() => this.updateMetrics(), 5 * 60 * 1000);
  }
  
  // 定期的なステータスのログ出力
  startStatusLogging() {
    setInterval(() => {
      try {
        const now = Date.now();
        // 前回のログ出力から設定された間隔が経過しているか確認
        if (now - this.logSettings.lastLogTime >= this.logSettings.statusLogInterval) {
          this.logStatus();
          this.logSettings.lastLogTime = now;
        }
      } catch (error) {
        logger.error('ステータスログの定期出力に失敗:', error);
      }
    }, 60 * 1000); // 1分ごとにチェック
    
    // 初回ログ出力（起動時）
    setTimeout(() => this.logStatus(), 5000);
  }
  
  // ステータスのログ出力
  logStatus() {
    try {
      // log-status.jsモジュールが存在するか確認
      let statusLogger;
      try {
        statusLogger = require('./log-status');
      } catch (error) {
        logger.warn('log-statusモジュールの読み込みに失敗しました。基本的なログのみ出力します。');
        this.logBasicStatus();
        return;
      }
      
      // 詳細ログが有効な場合は詳細を出力、そうでなければ簡易ログ
      if (this.logSettings.detailedLogging) {
        statusLogger.printMachineLearningStatus();
      } else {
        statusLogger.logBriefStatus();
      }
    } catch (error) {
      logger.error('ステータスのログ出力に失敗:', error);
    }
  }
  
  // 基本的なステータスのログ出力（log-statusモジュールがない場合のフォールバック）
  logBasicStatus() {
    try {
      const metrics = this.getMetrics();
      const trainingProgress = metrics.data.training.trainedRecords / 
        (metrics.data.training.totalRecords || 1) * 100;
      
      logger.info(
        `[ML基本状態] 進捗:${Math.round(trainingProgress)}%, ` +
        `精度:${Math.round(metrics.data.model.accuracy * 100 || 0)}%, ` +
        `学習データ:${metrics.data.training.trainedRecords || 0}/${metrics.data.training.totalRecords || 0}`
      );
    } catch (error) {
      logger.error('基本ステータスのログ出力に失敗:', error);
    }
  }

  getMetrics() {
    return this.metrics;
  }

  // アラート条件のチェック
  checkAlerts() {
    const alerts = [];

    // トレーニングデータのアラート
    if (this.metrics.data.training.accuracy < 70) {
      alerts.push({
        type: 'training',
        message: 'モデルの精度が70%を下回っています',
        severity: 'warning'
      });
    }

    // データベース接続のアラート
    if (this.metrics.data.database.connections > 15) {
      alerts.push({
        type: 'database',
        message: 'データベース接続数が15を超えています',
        severity: 'warning'
      });
    }

    // エラー率のアラート
    if (this.metrics.data.errors.count > 10) {
      alerts.push({
        type: 'errors',
        message: '過去24時間で10件以上のエラーが発生しています',
        severity: 'error'
      });
    }

    return alerts;
  }
}

// シングルトンインスタンスの作成
const monitoringSystem = new MonitoringSystem();

module.exports = {
  monitoringSystem,
  MonitoringSystem
}; 