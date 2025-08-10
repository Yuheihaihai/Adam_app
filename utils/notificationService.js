// utils/notificationService.js - 月次更新通知サービス
require('dotenv').config();
const fs = require('fs');
const path = require('path');

/**
 * 月次サービス更新の通知サービス
 * 更新完了・エラー・統計情報の通知を管理
 */
class NotificationService {
  constructor() {
    this.channels = {
      console: true,
      file: true,
      webhook: false, // 将来的にSlack/Discord対応
      email: false    // 将来的にメール通知対応
    };
    
    this.logDir = path.join(__dirname, '..', 'logs', 'notifications');
    this.ensureLogDirectory();
  }

  /**
   * ログディレクトリ確保
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 月次更新完了通知
   */
  async notifyUpdateCompletion(report) {
    const message = this.formatCompletionMessage(report);
    
    await this.sendNotification({
      type: 'success',
      title: '月次サービス更新完了',
      message,
      report,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 月次更新エラー通知
   */
  async notifyUpdateError(updateId, error, context = {}) {
    const message = this.formatErrorMessage(updateId, error, context);
    
    await this.sendNotification({
      type: 'error',
      title: '月次サービス更新エラー',
      message,
      updateId,
      error: {
        message: error.message,
        stack: error.stack
      },
      context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 健全性チェック結果通知
   */
  async notifyHealthCheck(results) {
    const failed = results.filter(r => !r.passed);
    const isHealthy = failed.length === 0;
    
    const message = this.formatHealthCheckMessage(results, isHealthy);
    
    await this.sendNotification({
      type: isHealthy ? 'info' : 'warning',
      title: `システムヘルスチェック${isHealthy ? '正常' : '異常検出'}`,
      message,
      results,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 統計レポート通知（月末）
   */
  async notifyMonthlyStats(stats) {
    const message = this.formatStatsMessage(stats);
    
    await this.sendNotification({
      type: 'info',
      title: '月次統計レポート',
      message,
      stats,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 通知送信（各チャンネルへ）
   */
  async sendNotification(notification) {
    const promises = [];

    // コンソール出力
    if (this.channels.console) {
      promises.push(this.sendToConsole(notification));
    }

    // ファイル出力
    if (this.channels.file) {
      promises.push(this.sendToFile(notification));
    }

    // Webhook通知（将来実装）
    if (this.channels.webhook) {
      promises.push(this.sendToWebhook(notification));
    }

    // メール通知（将来実装）
    if (this.channels.email) {
      promises.push(this.sendToEmail(notification));
    }

    await Promise.allSettled(promises);
  }

  /**
   * コンソール通知
   */
  async sendToConsole(notification) {
    const prefix = this.getTypePrefix(notification.type);
    const timestamp = new Date(notification.timestamp).toLocaleString('ja-JP');
    
    console.log(`\n${prefix} [${timestamp}] ${notification.title}`);
    console.log(notification.message);
    
    if (notification.type === 'error' && notification.error) {
      console.error('Error details:', notification.error.message);
    }
  }

  /**
   * ファイル通知
   */
  async sendToFile(notification) {
    try {
      const date = new Date(notification.timestamp);
      const filename = `notifications_${date.getFullYear()}_${String(date.getMonth() + 1).padStart(2, '0')}.log`;
      const filepath = path.join(this.logDir, filename);
      
      const logEntry = {
        timestamp: notification.timestamp,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: {
          updateId: notification.updateId,
          report: notification.report ? {
            updateId: notification.report.updateId,
            duration: notification.report.duration,
            summary: notification.report.summary
          } : undefined,
          error: notification.error,
          context: notification.context,
          results: notification.results,
          stats: notification.stats
        }
      };
      
      const logLine = JSON.stringify(logEntry) + '\n';
      fs.appendFileSync(filepath, logLine, 'utf8');
      
    } catch (error) {
      console.error('Failed to write notification to file:', error.message);
    }
  }

  /**
   * Webhook通知（将来実装）
   */
  async sendToWebhook(notification) {
    // Slack/Discord webhook統合用
    // 現在は未実装
    console.log('[NotificationService] Webhook notification (not implemented)');
  }

  /**
   * メール通知（将来実装）
   */
  async sendToEmail(notification) {
    // メール通知統合用
    // 現在は未実装
    console.log('[NotificationService] Email notification (not implemented)');
  }

  /**
   * 完了メッセージフォーマット
   */
  formatCompletionMessage(report) {
    const duration = Math.round(report.duration / 1000);
    const date = new Date(report.startTime).toLocaleDateString('ja-JP');
    
    return `Adam AI v2.4 月次サービス更新が完了しました

📊 更新結果:
• 実行日: ${date}
• 実行時間: ${duration}秒
• 更新前サービス数: ${report.summary.totalServicesBefore}
• 更新後サービス数: ${report.summary.totalServicesAfter}
• 新規追加: ${report.summary.newServicesAdded}件
• 法人番号取得: ${report.summary.corporateNumbersAdded}件
• 既存更新: ${report.summary.existingServicesUpdated}件

${report.summary.errors.length > 0 ? `⚠️ エラー: ${report.summary.errors.length}件\n${report.summary.errors.map(e => `  - ${e}`).join('\n')}` : '✅ エラーなし'}

更新ID: ${report.updateId}`;
  }

  /**
   * エラーメッセージフォーマット
   */
  formatErrorMessage(updateId, error, context) {
    return `Adam AI v2.4 月次サービス更新でエラーが発生しました

❌ エラー詳細:
• 更新ID: ${updateId}
• エラー: ${error.message}
• 発生時刻: ${new Date().toLocaleString('ja-JP')}

${context.phase ? `• フェーズ: ${context.phase}` : ''}
${context.step ? `• ステップ: ${context.step}` : ''}

対応が必要です。ログファイルを確認してください。`;
  }

  /**
   * ヘルスチェックメッセージフォーマット
   */
  formatHealthCheckMessage(results, isHealthy) {
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    
    let message = `Adam AI v2.4 週次ヘルスチェック結果

📊 チェック結果: ${passed}/${total} 項目合格

`;

    results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      message += `${status} ${result.name}: ${result.message}\n`;
    });

    if (!isHealthy) {
      message += '\n⚠️ 一部チェックが失敗しています。対応が必要です。';
    }

    return message;
  }

  /**
   * 統計メッセージフォーマット
   */
  formatStatsMessage(stats) {
    return `Adam AI v2.4 月次統計レポート

📈 ${stats.month}月の統計:
• 総サービス数: ${stats.totalServices}
• 月間新規追加: ${stats.newServicesThisMonth}
• 法人番号取得率: ${stats.corporateNumberCoverage}%
• システム稼働時間: ${stats.uptime}%
• 更新実行回数: ${stats.updateExecutions}回

📊 サービス分類別:
• 就労支援: ${stats.categoryBreakdown.employment || 0}件
• メンタルヘルス: ${stats.categoryBreakdown.mentalHealth || 0}件
• 教育支援: ${stats.categoryBreakdown.education || 0}件
• その他: ${stats.categoryBreakdown.other || 0}件`;
  }

  /**
   * 通知タイプ別プレフィックス取得
   */
  getTypePrefix(type) {
    const prefixes = {
      success: '✅ [SUCCESS]',
      error: '❌ [ERROR]',
      warning: '⚠️ [WARNING]',
      info: 'ℹ️ [INFO]'
    };
    return prefixes[type] || '[NOTIFICATION]';
  }

  /**
   * 通知設定更新
   */
  updateChannels(channels) {
    this.channels = { ...this.channels, ...channels };
    console.log('[NotificationService] Notification channels updated:', this.channels);
  }

  /**
   * 通知履歴取得
   */
  async getNotificationHistory(days = 30) {
    try {
      const files = fs.readdirSync(this.logDir).filter(f => f.endsWith('.log'));
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      
      const notifications = [];
      
      for (const file of files) {
        const filepath = path.join(this.logDir, file);
        const content = fs.readFileSync(filepath, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);
        
        for (const line of lines) {
          try {
            const notification = JSON.parse(line);
            const notificationDate = new Date(notification.timestamp);
            
            if (notificationDate >= cutoff) {
              notifications.push(notification);
            }
          } catch (error) {
            // 無効なJSON行をスキップ
          }
        }
      }
      
      return notifications.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      );
    } catch (error) {
      console.error('Failed to read notification history:', error.message);
      return [];
    }
  }

  /**
   * テスト通知送信
   */
  async sendTestNotification() {
    await this.sendNotification({
      type: 'info',
      title: 'テスト通知',
      message: 'NotificationServiceのテスト通知です。システムが正常に動作しています。',
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = NotificationService;
