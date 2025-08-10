// scheduler/monthlyServiceUpdate.js - 月次サービス事業者リスト自動更新スケジューラー
require('dotenv').config();
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { runDiscoveryOnce } = require('../vendorDiscovery');
const ExistingServicesUpdater = require('../scripts/updateExistingServicesCorporateNumbers');
const NotificationService = require('../utils/notificationService');
const BackupManager = require('../utils/backupManager');

/**
 * 月次サービス事業者リスト自動更新システム
 * 
 * スケジュール: 毎月1日 03:00 JST (UTC 18:00 前日)
 * 処理内容:
 * 1. 新規事業者発見・追加
 * 2. 既存事業者の法人番号取得・更新
 * 3. 既存事業者情報のリフレッシュ
 * 4. バックアップ作成
 * 5. 更新レポート生成
 */
class MonthlyServiceUpdater {
  constructor() {
    this.updateLogDir = path.join(__dirname, '..', 'logs', 'monthly_updates');
    this.reportDir = path.join(__dirname, '..', 'reports', 'monthly_service_updates');
    this.backupDir = path.join(__dirname, '..', 'data', 'services', 'monthly_backups');
    this.isRunning = false;
    this.lastRunTime = null;
    
    // スケジュール設定: 毎月1日 03:00 JST
    this.cronSchedule = '0 3 1 * *'; // 秒 分 時 日 月 曜日
    
    // サービス初期化
    this.notificationService = new NotificationService();
    this.backupManager = new BackupManager();
    
    this.ensureDirectories();
  }

  /**
   * 必要なディレクトリを作成
   */
  ensureDirectories() {
    [this.updateLogDir, this.reportDir, this.backupDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * スケジューラー開始
   */
  start() {
    console.log('[MonthlyUpdater] Starting monthly service update scheduler...');
    console.log(`[MonthlyUpdater] Schedule: ${this.cronSchedule} (Every 1st day of month at 3:00 AM JST)`);
    
    // メインスケジュール
    cron.schedule(this.cronSchedule, async () => {
      await this.executeMonthlyUpdate();
    }, {
      scheduled: true,
      timezone: "Asia/Tokyo"
    });

    // 健全性チェック（毎日 05:00）
    cron.schedule('0 5 * * *', async () => {
      await this.healthCheck();
    }, {
      scheduled: true,
      timezone: "Asia/Tokyo"
    });

    console.log('[MonthlyUpdater] Scheduler started successfully');
  }

  /**
   * 月次更新実行
   */
  async executeMonthlyUpdate() {
    if (this.isRunning) {
      console.warn('[MonthlyUpdater] Update already in progress, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    const updateId = this.generateUpdateId();

    try {
      console.log(`\n=== Monthly Service Update Started (ID: ${updateId}) ===`);
      this.log(updateId, 'Monthly service update process started');

      const report = {
        updateId,
        startTime: new Date().toISOString(),
        endTime: null,
        duration: 0,
        phases: {},
        summary: {
          totalServicesBefore: 0,
          totalServicesAfter: 0,
          newServicesAdded: 0,
          existingServicesUpdated: 0,
          corporateNumbersAdded: 0,
          errors: []
        }
      };

      // フェーズ1: バックアップ作成
      await this.executePhase(report, 'backup', 'Creating backup', async () => {
        return await this.backupManager.createPreUpdateBackup(updateId);
      });

      // フェーズ2: 既存サービス数カウント
      report.summary.totalServicesBefore = await this.countCurrentServices();

      // フェーズ3: 新規サービス発見・追加
      await this.executePhase(report, 'discovery', 'Discovering new services', async () => {
        const discoveryResult = await runDiscoveryOnce();
        report.summary.newServicesAdded = discoveryResult.added || 0;
        return discoveryResult;
      });

      // フェーズ4: 既存サービスの法人番号更新
      await this.executePhase(report, 'corporateNumbers', 'Updating corporate numbers', async () => {
        const updater = new ExistingServicesUpdater();
        const updateResult = await this.runCorporateNumberUpdate(updater);
        report.summary.corporateNumbersAdded = updateResult.found || 0;
        report.summary.existingServicesUpdated = updateResult.updated || 0;
        return updateResult;
      });

      // フェーズ5: 最終サービス数カウント
      report.summary.totalServicesAfter = await this.countCurrentServices();

      // 完了処理
      const endTime = Date.now();
      report.endTime = new Date().toISOString();
      report.duration = endTime - startTime;

      // フェーズ6: 更新後バックアップ作成
      await this.executePhase(report, 'postBackup', 'Creating post-update backup', async () => {
        return await this.backupManager.createPostUpdateBackup(updateId);
      });

      await this.generateReport(report);
      await this.notificationService.notifyUpdateCompletion(report);

      console.log(`=== Monthly Service Update Completed (${report.duration}ms) ===\n`);
      this.log(updateId, `Monthly update completed successfully in ${report.duration}ms`);

    } catch (error) {
      console.error('[MonthlyUpdater] Update failed:', error);
      this.log(updateId, `Update failed: ${error.message}`, 'ERROR');
      await this.notificationService.notifyUpdateError(updateId, error);
    } finally {
      this.isRunning = false;
      this.lastRunTime = new Date();
    }
  }

  /**
   * フェーズ実行ヘルパー
   */
  async executePhase(report, phaseName, description, execution) {
    const phaseStart = Date.now();
    console.log(`[MonthlyUpdater] ${description}...`);
    
    try {
      const result = await execution();
      const phaseEnd = Date.now();
      
      report.phases[phaseName] = {
        description,
        duration: phaseEnd - phaseStart,
        success: true,
        result
      };
      
      console.log(`[MonthlyUpdater] ${description} completed (${phaseEnd - phaseStart}ms)`);
      return result;
    } catch (error) {
      const phaseEnd = Date.now();
      
      report.phases[phaseName] = {
        description,
        duration: phaseEnd - phaseStart,
        success: false,
        error: error.message
      };
      
      report.summary.errors.push(`${phaseName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * 月次バックアップ作成
   */
  async createMonthlyBackup(updateId) {
    const coreFile = path.join(__dirname, '..', 'data', 'services', 'core.json');
    if (!fs.existsSync(coreFile)) {
      throw new Error('Core services file not found');
    }

    const backupFile = path.join(this.backupDir, `core_${updateId}.json`);
    fs.copyFileSync(coreFile, backupFile);
    
    console.log(`[MonthlyUpdater] Backup created: ${backupFile}`);
    return backupFile;
  }

  /**
   * 現在のサービス数カウント
   */
  async countCurrentServices() {
    try {
      const coreFile = path.join(__dirname, '..', 'data', 'services', 'core.json');
      if (!fs.existsSync(coreFile)) return 0;
      
      const services = JSON.parse(fs.readFileSync(coreFile, 'utf8'));
      return Array.isArray(services) ? services.length : 0;
    } catch (error) {
      console.warn('[MonthlyUpdater] Failed to count services:', error.message);
      return 0;
    }
  }

  /**
   * 法人番号更新実行
   */
  async runCorporateNumberUpdate(updater) {
    // ExistingServicesUpdaterを非対話的に実行
    const originalConsoleLog = console.log;
    const logs = [];
    
    // ログをキャプチャ
    console.log = (...args) => {
      logs.push(args.join(' '));
      originalConsoleLog(...args);
    };

    try {
      await updater.run();
      return updater.stats || { found: 0, updated: 0 };
    } finally {
      console.log = originalConsoleLog;
    }
  }

  /**
   * 更新レポート生成
   */
  async generateReport(report) {
    const reportFile = path.join(this.reportDir, `monthly_update_${report.updateId}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');

    // 人間が読みやすいレポートも生成
    const readableReport = this.generateReadableReport(report);
    const readableFile = path.join(this.reportDir, `monthly_update_${report.updateId}.md`);
    fs.writeFileSync(readableFile, readableReport, 'utf8');

    console.log(`[MonthlyUpdater] Reports generated: ${reportFile}, ${readableFile}`);
  }

  /**
   * 人間が読みやすいレポート生成
   */
  generateReadableReport(report) {
    const duration = Math.round(report.duration / 1000);
    const date = new Date(report.startTime).toLocaleDateString('ja-JP');
    
    return `# 月次サービス更新レポート

## 基本情報
- **更新ID**: ${report.updateId}
- **実行日**: ${date}
- **実行時間**: ${duration}秒

## 更新結果サマリー
- **更新前サービス数**: ${report.summary.totalServicesBefore}
- **更新後サービス数**: ${report.summary.totalServicesAfter}
- **新規追加**: ${report.summary.newServicesAdded}件
- **法人番号取得**: ${report.summary.corporateNumbersAdded}件
- **既存更新**: ${report.summary.existingServicesUpdated}件

## フェーズ別実行時間
${Object.entries(report.phases).map(([name, phase]) => 
  `- **${phase.description}**: ${Math.round(phase.duration / 1000)}秒 ${phase.success ? '✅' : '❌'}`
).join('\n')}

${report.summary.errors.length > 0 ? `## エラー
${report.summary.errors.map(error => `- ${error}`).join('\n')}` : '## エラー\nなし'}

---
*自動生成レポート - Adam AI v2.4 月次更新システム*
`;
  }

  /**
   * 完了通知
   */
  async notifyCompletion(report) {
    const message = `[Adam AI] 月次サービス更新完了
- 新規追加: ${report.summary.newServicesAdded}件
- 法人番号取得: ${report.summary.corporateNumbersAdded}件
- 総サービス数: ${report.summary.totalServicesAfter}件
実行時間: ${Math.round(report.duration / 1000)}秒`;

    console.log(message);
    this.log(report.updateId, 'Completion notification sent');
  }

  /**
   * エラー通知
   */
  async notifyError(updateId, error) {
    const message = `[Adam AI] 月次サービス更新エラー (ID: ${updateId})
エラー: ${error.message}`;

    console.error(message);
    this.log(updateId, `Error notification sent: ${error.message}`, 'ERROR');
  }

  /**
   * 健全性チェック
   */
  async healthCheck() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getMonth();
    
    // 前月の更新が実行されたかチェック
    if (this.lastRunTime) {
      const lastRunMonth = this.lastRunTime.getMonth();
      if (lastRunMonth !== lastMonth && currentMonth !== lastRunMonth) {
        console.warn('[MonthlyUpdater] Health check: Previous month update may have been missed');
        this.log('health_check', 'Warning: Previous month update may have been missed', 'WARN');
      }
    }

    // ディスク容量チェック（簡易版）
    try {
      const stats = fs.statSync(path.join(__dirname, '..', 'data', 'services', 'core.json'));
      if (stats.size > 10 * 1024 * 1024) { // 10MB超過
        console.warn('[MonthlyUpdater] Health check: Core services file unusually large');
        this.log('health_check', 'Warning: Core services file unusually large', 'WARN');
      }
    } catch (error) {
      console.warn('[MonthlyUpdater] Health check: Cannot access core services file');
    }
  }

  /**
   * 更新ID生成
   */
  generateUpdateId() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const timestamp = now.getTime().toString().slice(-6);
    return `${year}${month}_${timestamp}`;
  }

  /**
   * ログ出力
   */
  log(updateId, message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} [${level}] [${updateId}] ${message}\n`;
    
    const logFile = path.join(this.updateLogDir, `monthly_update_${new Date().getFullYear()}_${String(new Date().getMonth() + 1).padStart(2, '0')}.log`);
    fs.appendFileSync(logFile, logMessage, 'utf8');
  }

  /**
   * 手動実行（テスト用）
   */
  async runManually() {
    console.log('[MonthlyUpdater] Manual execution triggered');
    await this.executeMonthlyUpdate();
  }

  /**
   * 状態取得
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      cronSchedule: this.cronSchedule,
      nextRun: cron.validate(this.cronSchedule) ? 'Valid schedule' : 'Invalid schedule'
    };
  }
}

module.exports = MonthlyServiceUpdater;

// 直接実行時は手動トリガー
if (require.main === module) {
  const updater = new MonthlyServiceUpdater();
  updater.runManually()
    .then(() => {
      console.log('Manual update completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Manual update failed:', error);
      process.exit(1);
    });
}
