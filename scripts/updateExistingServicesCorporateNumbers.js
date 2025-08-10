// scripts/updateExistingServicesCorporateNumbers.js - 既存サービスの法人番号取得・更新スクリプト
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const CorporateNumberAPI = require('../corporateNumberAPI');

/**
 * 既存サービスの法人番号を取得・更新するスクリプト
 * 585サービスの法人番号を段階的に取得し、core.jsonを更新
 */
class ExistingServicesUpdater {
  constructor() {
    this.corporateAPI = new CorporateNumberAPI();
    this.coreFilePath = path.join(__dirname, '..', 'data', 'services', 'core.json');
    this.backupDir = path.join(__dirname, '..', 'data', 'services', 'backups');
    this.logFile = path.join(__dirname, '..', 'logs', 'corporate_number_update.log');
    this.stats = {
      total: 0,
      processed: 0,
      found: 0,
      updated: 0,
      errors: 0,
      skipped: 0
    };
  }

  /**
   * メイン実行関数
   */
  async run() {
    try {
      console.log('=== 既存サービス法人番号更新開始 ===');
      this.log('Starting corporate number update process');

      // 1. バックアップ作成
      await this.createBackup();

      // 2. 既存サービス読み込み
      const services = await this.loadExistingServices();
      this.stats.total = services.length;

      console.log(`対象サービス数: ${this.stats.total}`);
      this.log(`Total services to process: ${this.stats.total}`);

      // 3. 法人番号がないサービスを特定
      const needsUpdate = services.filter(s => !s.corporateNumber);
      console.log(`法人番号更新対象: ${needsUpdate.length}件`);

      // 4. 段階的更新実行
      await this.updateServicesCorporateNumbers(services, needsUpdate);

      // 5. 結果保存
      await this.saveUpdatedServices(services);

      // 6. 統計出力
      this.printStats();

    } catch (error) {
      console.error('更新処理でエラーが発生:', error);
      this.log(`Fatal error: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * バックアップ作成
   */
  async createBackup() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `core_${timestamp}.json`);
    
    if (fs.existsSync(this.coreFilePath)) {
      fs.copyFileSync(this.coreFilePath, backupPath);
      console.log(`バックアップ作成: ${backupPath}`);
      this.log(`Backup created: ${backupPath}`);
    }
  }

  /**
   * 既存サービス読み込み
   */
  async loadExistingServices() {
    if (!fs.existsSync(this.coreFilePath)) {
      throw new Error(`Core file not found: ${this.coreFilePath}`);
    }

    const content = fs.readFileSync(this.coreFilePath, 'utf8');
    const services = JSON.parse(content);

    if (!Array.isArray(services)) {
      throw new Error('Invalid core.json format - expected array');
    }

    return services;
  }

  /**
   * サービスの法人番号更新
   */
  async updateServicesCorporateNumbers(services, needsUpdate) {
    console.log('\n法人番号取得開始...');
    
    const batchSize = 5; // 5件ずつ処理（API制限対応）
    
    for (let i = 0; i < needsUpdate.length; i += batchSize) {
      const batch = needsUpdate.slice(i, i + batchSize);
      
      console.log(`\nバッチ ${Math.floor(i/batchSize) + 1}/${Math.ceil(needsUpdate.length/batchSize)} 処理中...`);
      
      await Promise.all(batch.map(async (service) => {
        await this.updateSingleService(service);
        this.stats.processed++;
      }));

      // API制限対応のため短い待機
      if (i + batchSize < needsUpdate.length) {
        console.log('API制限対応のため2秒待機...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  /**
   * 単一サービスの法人番号更新
   */
  async updateSingleService(service) {
    try {
      console.log(`処理中: ${service.name || service.id}`);
      
      // 既に法人番号がある場合はスキップ
      if (service.corporateNumber) {
        console.log(`  -> スキップ（既に法人番号有り: ${service.corporateNumber}）`);
        this.stats.skipped++;
        return;
      }

      // 法人番号検索
      const corporateNumber = await this.corporateAPI.searchCorporateNumber(
        service.name, 
        service.url
      );

      if (corporateNumber) {
        service.corporateNumber = corporateNumber;
        console.log(`  -> 法人番号取得: ${corporateNumber}`);
        this.log(`Found corporate number for ${service.name}: ${corporateNumber}`);
        this.stats.found++;
        this.stats.updated++;
      } else {
        console.log(`  -> 法人番号未発見`);
        this.log(`No corporate number found for ${service.name}`);
      }

    } catch (error) {
      console.error(`  -> エラー: ${error.message}`);
      this.log(`Error processing ${service.name}: ${error.message}`);
      this.stats.errors++;
    }
  }

  /**
   * 更新されたサービス保存
   */
  async saveUpdatedServices(services) {
    try {
      const updatedContent = JSON.stringify(services, null, 2);
      fs.writeFileSync(this.coreFilePath, updatedContent, 'utf8');
      
      console.log(`\n更新されたcore.jsonを保存しました`);
      this.log('Updated core.json saved successfully');
      
    } catch (error) {
      throw new Error(`Failed to save updated services: ${error.message}`);
    }
  }

  /**
   * 統計情報出力
   */
  printStats() {
    console.log('\n=== 更新統計 ===');
    console.log(`総対象数: ${this.stats.total}`);
    console.log(`処理完了: ${this.stats.processed}`);
    console.log(`法人番号発見: ${this.stats.found}`);
    console.log(`更新済み: ${this.stats.updated}`);
    console.log(`スキップ: ${this.stats.skipped}`);
    console.log(`エラー: ${this.stats.errors}`);
    console.log(`成功率: ${((this.stats.found / this.stats.processed) * 100).toFixed(1)}%`);

    this.log(`Update completed - Total: ${this.stats.total}, Processed: ${this.stats.processed}, Found: ${this.stats.found}, Updated: ${this.stats.updated}, Errors: ${this.stats.errors}`);
  }

  /**
   * ログ出力
   */
  log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${message}\n`;
    
    // ログディレクトリ作成
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFileSync(this.logFile, logMessage, 'utf8');
  }

  /**
   * キャッシュ統計表示
   */
  showCacheStats() {
    const stats = this.corporateAPI.getCacheStats();
    console.log(`\nキャッシュ統計: 総数${stats.total}, 有効${stats.active}, 期限切れ${stats.expired}`);
  }
}

// スクリプト実行部分
if (require.main === module) {
  const updater = new ExistingServicesUpdater();
  updater.run()
    .then(() => {
      updater.showCacheStats();
      console.log('\n=== 法人番号更新完了 ===');
      process.exit(0);
    })
    .catch((error) => {
      console.error('スクリプト実行エラー:', error);
      process.exit(1);
    });
}

module.exports = ExistingServicesUpdater;
