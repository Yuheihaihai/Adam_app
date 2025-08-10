// utils/backupManager.js - サービスデータバックアップ・ロールバック管理
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * サービスデータのバックアップ・ロールバック管理システム
 * 
 * 機能:
 * - 自動バックアップ作成（更新前・後）
 * - バックアップ検証・整合性チェック
 * - 緊急時ロールバック
 * - バックアップローテーション
 * - 差分バックアップ
 */
class BackupManager {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data', 'services');
    this.backupDir = path.join(__dirname, '..', 'data', 'services', 'backups');
    this.emergencyBackupDir = path.join(__dirname, '..', 'data', 'services', 'emergency_backups');
    this.coreFile = path.join(this.dataDir, 'core.json');
    
    // バックアップ保持設定
    this.retentionPolicy = {
      daily: 30,     // 30日分の日次バックアップ
      monthly: 12,   // 12ヶ月分の月次バックアップ
      emergency: 5   // 5つの緊急バックアップ
    };
    
    this.ensureDirectories();
  }

  /**
   * 必要ディレクトリの作成
   */
  ensureDirectories() {
    [this.backupDir, this.emergencyBackupDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * 更新前バックアップ作成
   */
  async createPreUpdateBackup(updateId) {
    console.log('[BackupManager] Creating pre-update backup...');
    
    const backupId = `pre_update_${updateId}`;
    const backup = await this.createBackup(backupId, 'pre-update');
    
    console.log(`[BackupManager] Pre-update backup created: ${backup.filename}`);
    return backup;
  }

  /**
   * 更新後バックアップ作成
   */
  async createPostUpdateBackup(updateId) {
    console.log('[BackupManager] Creating post-update backup...');
    
    const backupId = `post_update_${updateId}`;
    const backup = await this.createBackup(backupId, 'post-update');
    
    console.log(`[BackupManager] Post-update backup created: ${backup.filename}`);
    return backup;
  }

  /**
   * 緊急バックアップ作成
   */
  async createEmergencyBackup(reason = 'manual') {
    console.log('[BackupManager] Creating emergency backup...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `emergency_${timestamp}`;
    
    const backup = await this.createBackup(backupId, 'emergency', this.emergencyBackupDir);
    
    // 緊急バックアップローテーション
    await this.rotateEmergencyBackups();
    
    console.log(`[BackupManager] Emergency backup created: ${backup.filename}`);
    return backup;
  }

  /**
   * バックアップ作成（共通）
   */
  async createBackup(backupId, type, targetDir = this.backupDir) {
    if (!fs.existsSync(this.coreFile)) {
      throw new Error('Core services file not found');
    }

    const timestamp = new Date();
    const backup = {
      id: backupId,
      type,
      timestamp: timestamp.toISOString(),
      filename: `${backupId}_${timestamp.toISOString().replace(/[:.]/g, '-')}.json`,
      filepath: '',
      metadata: {},
      verification: {}
    };

    backup.filepath = path.join(targetDir, backup.filename);

    try {
      // 元ファイルの情報収集
      const originalStats = fs.statSync(this.coreFile);
      const originalContent = fs.readFileSync(this.coreFile, 'utf8');
      const originalData = JSON.parse(originalContent);

      // メタデータ作成
      backup.metadata = {
        originalSize: originalStats.size,
        originalModified: originalStats.mtime.toISOString(),
        serviceCount: Array.isArray(originalData) ? originalData.length : 0,
        checksum: this.calculateChecksum(originalContent),
        nodeVersion: process.version,
        platform: process.platform
      };

      // バックアップファイル作成
      fs.copyFileSync(this.coreFile, backup.filepath);

      // バックアップ検証
      backup.verification = await this.verifyBackup(backup.filepath, backup.metadata);

      // メタデータファイル作成
      const metadataFile = backup.filepath.replace('.json', '_metadata.json');
      fs.writeFileSync(metadataFile, JSON.stringify(backup, null, 2), 'utf8');

      return backup;
    } catch (error) {
      throw new Error(`Backup creation failed: ${error.message}`);
    }
  }

  /**
   * バックアップ検証
   */
  async verifyBackup(backupFilepath, originalMetadata) {
    try {
      const backupStats = fs.statSync(backupFilepath);
      const backupContent = fs.readFileSync(backupFilepath, 'utf8');
      const backupData = JSON.parse(backupContent);
      const backupChecksum = this.calculateChecksum(backupContent);

      const verification = {
        sizeMatch: backupStats.size === originalMetadata.originalSize,
        checksumMatch: backupChecksum === originalMetadata.checksum,
        validJson: true,
        serviceCountMatch: (Array.isArray(backupData) ? backupData.length : 0) === originalMetadata.serviceCount,
        timestamp: new Date().toISOString(),
        valid: false
      };

      verification.valid = verification.sizeMatch && 
                          verification.checksumMatch && 
                          verification.validJson && 
                          verification.serviceCountMatch;

      return verification;
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * ロールバック実行
   */
  async rollback(backupFilepath, reason = 'manual') {
    console.log(`[BackupManager] Starting rollback from: ${backupFilepath}`);
    
    if (!fs.existsSync(backupFilepath)) {
      throw new Error(`Backup file not found: ${backupFilepath}`);
    }

    // 現在のファイルを緊急バックアップ
    const emergencyBackup = await this.createEmergencyBackup(`rollback_${reason}`);
    
    try {
      // バックアップファイルの検証
      const backupContent = fs.readFileSync(backupFilepath, 'utf8');
      const backupData = JSON.parse(backupContent); // JSON検証
      
      if (!Array.isArray(backupData)) {
        throw new Error('Invalid backup format: not an array');
      }

      // ロールバック実行
      fs.copyFileSync(backupFilepath, this.coreFile);
      
      // ロールバック後検証
      const restoredContent = fs.readFileSync(this.coreFile, 'utf8');
      const restoredData = JSON.parse(restoredContent);
      
      if (JSON.stringify(restoredData) !== JSON.stringify(backupData)) {
        throw new Error('Rollback verification failed: content mismatch');
      }

      const rollbackResult = {
        success: true,
        backupUsed: backupFilepath,
        emergencyBackup: emergencyBackup.filepath,
        restoredServiceCount: restoredData.length,
        timestamp: new Date().toISOString(),
        reason
      };

      console.log(`[BackupManager] Rollback successful: ${restoredData.length} services restored`);
      
      // ロールバックログ記録
      await this.logRollback(rollbackResult);
      
      return rollbackResult;
    } catch (error) {
      // ロールバック失敗時は元に戻す
      if (emergencyBackup && fs.existsSync(emergencyBackup.filepath)) {
        fs.copyFileSync(emergencyBackup.filepath, this.coreFile);
        console.log('[BackupManager] Rollback failed, restored from emergency backup');
      }
      
      throw new Error(`Rollback failed: ${error.message}`);
    }
  }

  /**
   * 利用可能バックアップ一覧取得
   */
  async getAvailableBackups() {
    const backups = [];
    
    // 通常バックアップ
    const regularFiles = fs.readdirSync(this.backupDir)
      .filter(f => f.endsWith('.json') && !f.includes('_metadata'))
      .map(f => ({ file: f, dir: this.backupDir, type: 'regular' }));

    // 緊急バックアップ
    const emergencyFiles = fs.readdirSync(this.emergencyBackupDir)
      .filter(f => f.endsWith('.json') && !f.includes('_metadata'))
      .map(f => ({ file: f, dir: this.emergencyBackupDir, type: 'emergency' }));

    // バックアップ情報収集
    for (const { file, dir, type } of [...regularFiles, ...emergencyFiles]) {
      try {
        const filepath = path.join(dir, file);
        const metadataFile = filepath.replace('.json', '_metadata.json');
        
        const stats = fs.statSync(filepath);
        let metadata = {};
        
        if (fs.existsSync(metadataFile)) {
          metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
        }

        backups.push({
          filename: file,
          filepath,
          type,
          size: stats.size,
          created: stats.birthtime.toISOString(),
          modified: stats.mtime.toISOString(),
          serviceCount: metadata.metadata?.serviceCount || 'unknown',
          valid: metadata.verification?.valid || false,
          id: metadata.id || 'unknown'
        });
      } catch (error) {
        console.warn(`[BackupManager] Cannot read backup info for ${file}:`, error.message);
      }
    }

    // 作成日時順でソート（新しい順）
    return backups.sort((a, b) => new Date(b.created) - new Date(a.created));
  }

  /**
   * バックアップローテーション
   */
  async rotateBackups() {
    console.log('[BackupManager] Starting backup rotation...');
    
    const backups = await this.getAvailableBackups();
    const regularBackups = backups.filter(b => b.type === 'regular');
    
    // 日次バックアップのローテーション
    if (regularBackups.length > this.retentionPolicy.daily) {
      const toDelete = regularBackups.slice(this.retentionPolicy.daily);
      
      for (const backup of toDelete) {
        try {
          fs.unlinkSync(backup.filepath);
          const metadataFile = backup.filepath.replace('.json', '_metadata.json');
          if (fs.existsSync(metadataFile)) {
            fs.unlinkSync(metadataFile);
          }
          console.log(`[BackupManager] Deleted old backup: ${backup.filename}`);
        } catch (error) {
          console.warn(`[BackupManager] Failed to delete backup ${backup.filename}:`, error.message);
        }
      }
    }
  }

  /**
   * 緊急バックアップローテーション
   */
  async rotateEmergencyBackups() {
    const emergencyBackups = (await this.getAvailableBackups())
      .filter(b => b.type === 'emergency');
    
    if (emergencyBackups.length > this.retentionPolicy.emergency) {
      const toDelete = emergencyBackups.slice(this.retentionPolicy.emergency);
      
      for (const backup of toDelete) {
        try {
          fs.unlinkSync(backup.filepath);
          const metadataFile = backup.filepath.replace('.json', '_metadata.json');
          if (fs.existsSync(metadataFile)) {
            fs.unlinkSync(metadataFile);
          }
          console.log(`[BackupManager] Deleted old emergency backup: ${backup.filename}`);
        } catch (error) {
          console.warn(`[BackupManager] Failed to delete emergency backup ${backup.filename}:`, error.message);
        }
      }
    }
  }

  /**
   * チェックサム計算
   */
  calculateChecksum(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * ロールバックログ記録
   */
  async logRollback(rollbackResult) {
    const logDir = path.join(__dirname, '..', 'logs', 'rollbacks');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, `rollback_${new Date().toISOString().split('T')[0]}.log`);
    const logEntry = `${new Date().toISOString()} - ${JSON.stringify(rollbackResult)}\n`;
    
    fs.appendFileSync(logFile, logEntry, 'utf8');
  }

  /**
   * バックアップ統計取得
   */
  async getBackupStats() {
    const backups = await this.getAvailableBackups();
    
    const stats = {
      total: backups.length,
      regular: backups.filter(b => b.type === 'regular').length,
      emergency: backups.filter(b => b.type === 'emergency').length,
      valid: backups.filter(b => b.valid).length,
      totalSize: backups.reduce((sum, b) => sum + b.size, 0),
      oldestBackup: backups.length > 0 ? backups[backups.length - 1].created : null,
      newestBackup: backups.length > 0 ? backups[0].created : null
    };

    return stats;
  }

  /**
   * バックアップ整合性チェック
   */
  async checkBackupIntegrity() {
    console.log('[BackupManager] Starting backup integrity check...');
    
    const backups = await this.getAvailableBackups();
    const results = [];

    for (const backup of backups) {
      try {
        const content = fs.readFileSync(backup.filepath, 'utf8');
        const data = JSON.parse(content);
        
        const check = {
          filename: backup.filename,
          valid: true,
          issues: []
        };

        // JSON構造チェック
        if (!Array.isArray(data)) {
          check.valid = false;
          check.issues.push('Invalid JSON structure: not an array');
        }

        // サービスデータ検証
        for (let i = 0; i < Math.min(data.length, 10); i++) {
          const service = data[i];
          if (!service.id || !service.name || !service.url) {
            check.valid = false;
            check.issues.push(`Service ${i}: missing required fields`);
            break;
          }
        }

        results.push(check);
      } catch (error) {
        results.push({
          filename: backup.filename,
          valid: false,
          issues: [`Read/parse error: ${error.message}`]
        });
      }
    }

    const summary = {
      total: results.length,
      valid: results.filter(r => r.valid).length,
      invalid: results.filter(r => !r.valid).length,
      results
    };

    console.log(`[BackupManager] Integrity check complete: ${summary.valid}/${summary.total} valid`);
    
    return summary;
  }
}

module.exports = BackupManager;
