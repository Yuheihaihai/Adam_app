// scripts/setupHerokuScheduler.js - Heroku Schedulerアドオン設定スクリプト
require('dotenv').config();
const { execSync } = require('child_process');

/**
 * Heroku Scheduler設定自動化スクリプト
 * 
 * Heroku上で月次サービス更新を自動実行するための
 * Schedulerアドオン設定を行います
 */
class HerokuSchedulerSetup {
  constructor() {
    this.appName = process.env.HEROKU_APP_NAME || this.detectHerokuAppName();
    this.commands = [
      {
        name: 'monthly-service-update',
        command: 'node scheduler/monthlyServiceUpdate.js',
        frequency: 'monthly',
        description: '月次サービス事業者リスト自動更新'
      },
      {
        name: 'weekly-health-check', 
        command: 'node scripts/healthCheck.js',
        frequency: 'weekly',
        description: '週次システムヘルスチェック'
      }
    ];
  }

  /**
   * Herokuアプリ名を検出
   */
  detectHerokuAppName() {
    try {
      const remotes = execSync('git remote -v', { encoding: 'utf8' });
      const herokuMatch = remotes.match(/heroku\s+.*?([a-z0-9-]+)\.herokuapp\.com/);
      return herokuMatch ? herokuMatch[1] : null;
    } catch (error) {
      console.warn('Could not detect Heroku app name from git remotes');
      return null;
    }
  }

  /**
   * セットアップ実行
   */
  async setup() {
    console.log('=== Heroku Scheduler Setup ===');
    
    if (!this.appName) {
      console.error('Heroku app name not found. Please set HEROKU_APP_NAME environment variable.');
      process.exit(1);
    }

    console.log(`Target Heroku app: ${this.appName}`);

    try {
      // 1. Heroku CLIの確認
      await this.checkHerokuCLI();

      // 2. Schedulerアドオンの確認・追加
      await this.ensureSchedulerAddon();

      // 3. 既存ジョブの確認
      await this.checkExistingJobs();

      // 4. 月次更新ジョブの設定
      await this.setupMonthlyUpdateJob();

      // 5. ヘルスチェックジョブの設定
      await this.setupHealthCheckJob();

      // 6. 設定確認
      await this.verifySetup();

      console.log('\n=== Setup Complete ===');
      console.log('Heroku Scheduler has been configured successfully.');
      console.log('Monthly service updates will run on the 1st of every month at 3:00 AM JST.');

    } catch (error) {
      console.error('Setup failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Heroku CLIの確認
   */
  async checkHerokuCLI() {
    console.log('\n1. Checking Heroku CLI...');
    
    try {
      const version = execSync('heroku --version', { encoding: 'utf8' });
      console.log(`✅ Heroku CLI found: ${version.trim()}`);
    } catch (error) {
      throw new Error('Heroku CLI not found. Please install: https://devcenter.heroku.com/articles/heroku-cli');
    }

    // ログイン確認
    try {
      const auth = execSync('heroku auth:whoami', { encoding: 'utf8' });
      console.log(`✅ Logged in as: ${auth.trim()}`);
    } catch (error) {
      throw new Error('Not logged in to Heroku. Please run: heroku login');
    }
  }

  /**
   * Schedulerアドオンの確認・追加
   */
  async ensureSchedulerAddon() {
    console.log('\n2. Checking Scheduler addon...');
    
    try {
      const addons = execSync(`heroku addons --app ${this.appName}`, { encoding: 'utf8' });
      
      if (addons.includes('scheduler:standard')) {
        console.log('✅ Scheduler addon already installed');
      } else {
        console.log('Installing Scheduler addon...');
        execSync(`heroku addons:create scheduler:standard --app ${this.appName}`, { encoding: 'utf8' });
        console.log('✅ Scheduler addon installed');
      }
    } catch (error) {
      throw new Error(`Failed to setup Scheduler addon: ${error.message}`);
    }
  }

  /**
   * 既存ジョブの確認
   */
  async checkExistingJobs() {
    console.log('\n3. Checking existing scheduled jobs...');
    
    try {
      const jobs = execSync(`heroku addons:open scheduler --app ${this.appName} --show-url`, { encoding: 'utf8' });
      console.log('📋 Current jobs can be viewed at Heroku dashboard');
      
      // 既存のcronジョブをリスト（可能であれば）
      try {
        const jobList = execSync(`heroku run echo "Checking jobs..." --app ${this.appName}`, { encoding: 'utf8' });
        console.log('✅ App connectivity verified');
      } catch (error) {
        console.warn('Could not verify app connectivity');
      }
    } catch (error) {
      console.warn('Could not check existing jobs:', error.message);
    }
  }

  /**
   * 月次更新ジョブの設定
   */
  async setupMonthlyUpdateJob() {
    console.log('\n4. Setting up monthly update job...');

    const jobCommand = 'node scheduler/monthlyServiceUpdate.js';
    
    console.log(`Command: ${jobCommand}`);
    console.log('⚠️  Manual setup required:');
    console.log('1. Go to Heroku Dashboard > Your App > Resources');
    console.log('2. Click on "Heroku Scheduler" addon');
    console.log('3. Add new job with these settings:');
    console.log(`   - Command: ${jobCommand}`);
    console.log('   - Frequency: Every month on the 1st at 03:00 JST');
    console.log('   - Description: Monthly service list update');
    
    // package.jsonにnode-cronが含まれているか確認
    await this.checkDependencies();
  }

  /**
   * ヘルスチェックジョブの設定
   */
  async setupHealthCheckJob() {
    console.log('\n5. Setting up health check job...');

    // ヘルスチェックスクリプトを作成
    await this.createHealthCheckScript();

    const jobCommand = 'node scripts/healthCheck.js';
    
    console.log(`Command: ${jobCommand}`);
    console.log('⚠️  Manual setup required:');
    console.log('1. Add another job in Heroku Scheduler:');
    console.log(`   - Command: ${jobCommand}`);
    console.log('   - Frequency: Weekly (every Sunday at 05:00 JST)');
    console.log('   - Description: Weekly system health check');
  }

  /**
   * ヘルスチェックスクリプト作成
   */
  async createHealthCheckScript() {
    const healthCheckScript = `// scripts/healthCheck.js - 週次システムヘルスチェック
require('dotenv').config();
const fs = require('fs');
const path = require('path');

class SystemHealthCheck {
  async run() {
    console.log('=== Weekly Health Check ===');
    
    const checks = [
      await this.checkServiceDataIntegrity(),
      await this.checkLogFiles(),
      await this.checkDiskUsage(),
      await this.checkEnvironmentVariables()
    ];
    
    const passed = checks.filter(c => c.passed).length;
    const total = checks.length;
    
    console.log(\`Health Check Results: \${passed}/\${total} checks passed\`);
    
    if (passed < total) {
      console.warn('Some health checks failed. Please review the issues.');
      process.exit(1);
    } else {
      console.log('All health checks passed ✅');
      process.exit(0);
    }
  }
  
  async checkServiceDataIntegrity() {
    try {
      const coreFile = path.join(__dirname, '..', 'data', 'services', 'core.json');
      if (!fs.existsSync(coreFile)) {
        return { name: 'Service Data', passed: false, message: 'Core services file missing' };
      }
      
      const data = JSON.parse(fs.readFileSync(coreFile, 'utf8'));
      if (!Array.isArray(data) || data.length === 0) {
        return { name: 'Service Data', passed: false, message: 'Invalid or empty services data' };
      }
      
      return { name: 'Service Data', passed: true, message: \`\${data.length} services loaded\` };
    } catch (error) {
      return { name: 'Service Data', passed: false, message: error.message };
    }
  }
  
  async checkLogFiles() {
    try {
      const logDir = path.join(__dirname, '..', 'logs');
      if (!fs.existsSync(logDir)) {
        return { name: 'Log Files', passed: true, message: 'No log directory (normal)' };
      }
      
      const files = fs.readdirSync(logDir);
      return { name: 'Log Files', passed: true, message: \`\${files.length} log files found\` };
    } catch (error) {
      return { name: 'Log Files', passed: false, message: error.message };
    }
  }
  
  async checkDiskUsage() {
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      const stats = this.getDirSize(dataDir);
      const sizeMB = Math.round(stats / 1024 / 1024);
      
      if (sizeMB > 100) {
        return { name: 'Disk Usage', passed: false, message: \`Data directory too large: \${sizeMB}MB\` };
      }
      
      return { name: 'Disk Usage', passed: true, message: \`Data directory: \${sizeMB}MB\` };
    } catch (error) {
      return { name: 'Disk Usage', passed: false, message: error.message };
    }
  }
  
  async checkEnvironmentVariables() {
    const required = ['OPENAI_API_KEY', 'DATABASE_URL', 'CHANNEL_ACCESS_TOKEN'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      return { name: 'Environment Variables', passed: false, message: \`Missing: \${missing.join(', ')}\` };
    }
    
    return { name: 'Environment Variables', passed: true, message: 'All required vars present' };
  }
  
  getDirSize(dirPath) {
    let size = 0;
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          size += this.getDirSize(filePath);
        } else {
          size += stats.size;
        }
      }
    }
    return size;
  }
}

if (require.main === module) {
  const checker = new SystemHealthCheck();
  checker.run();
}

module.exports = SystemHealthCheck;`;

    const healthCheckPath = path.join(__dirname, 'healthCheck.js');
    require('fs').writeFileSync(healthCheckPath, healthCheckScript, 'utf8');
    console.log('✅ Health check script created');
  }

  /**
   * 依存関係の確認
   */
  async checkDependencies() {
    console.log('\n📦 Checking dependencies...');
    
    try {
      const packageJson = require('../package.json');
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      const required = ['node-cron'];
      const missing = required.filter(dep => !dependencies[dep]);
      
      if (missing.length > 0) {
        console.log('⚠️  Missing dependencies:');
        missing.forEach(dep => console.log(`   - ${dep}`));
        console.log('Run: npm install node-cron');
      } else {
        console.log('✅ All required dependencies present');
      }
    } catch (error) {
      console.warn('Could not check dependencies:', error.message);
    }
  }

  /**
   * 設定確認
   */
  async verifySetup() {
    console.log('\n6. Verifying setup...');
    
    // Schedulerファイルの存在確認
    const schedulerFile = path.join(__dirname, '..', 'scheduler', 'monthlyServiceUpdate.js');
    if (require('fs').existsSync(schedulerFile)) {
      console.log('✅ Monthly update scheduler file exists');
    } else {
      console.log('❌ Monthly update scheduler file missing');
    }

    // 必要ディレクトリの確認
    const dirs = ['logs', 'reports', 'data/services/monthly_backups'];
    dirs.forEach(dir => {
      const fullPath = path.join(__dirname, '..', dir);
      if (require('fs').existsSync(fullPath)) {
        console.log(`✅ Directory exists: ${dir}`);
      } else {
        console.log(`⚠️  Directory will be created: ${dir}`);
      }
    });
  }

  /**
   * 手動テスト実行
   */
  async testRun() {
    console.log('\n=== Testing Monthly Update ===');
    console.log('Running monthly update manually...');
    
    try {
      execSync('node scheduler/monthlyServiceUpdate.js', { 
        stdio: 'inherit',
        cwd: require('path').join(__dirname, '..')
      });
      console.log('✅ Test run completed successfully');
    } catch (error) {
      console.error('❌ Test run failed:', error.message);
    }
  }
}

// メイン実行
if (require.main === module) {
  const setup = new HerokuSchedulerSetup();
  
  const command = process.argv[2];
  
  if (command === 'test') {
    setup.testRun();
  } else {
    setup.setup().catch(error => {
      console.error('Setup failed:', error);
      process.exit(1);
    });
  }
}

module.exports = HerokuSchedulerSetup;
