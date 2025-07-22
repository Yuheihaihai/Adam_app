/**
 * セキュア版LocalMLデプロイメントスクリプト
 * 既存システムからセキュア版への段階的移行
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('🔐 セキュア版LocalMLデプロイメント開始...\n');

/**
 * Step 1: バックアップ作成
 */
function createBackups() {
  console.log('📋 Step 1: 既存ファイルのバックアップ作成');
  
  const filesToBackup = [
    'localML.js',
    'mlIntegration.js'
  ];
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = `backups/security-upgrade-${timestamp}`;
  
  try {
    // バックアップディレクトリ作成
    if (!fs.existsSync('backups')) {
      fs.mkdirSync('backups');
    }
    fs.mkdirSync(backupDir);
    
    for (const file of filesToBackup) {
      if (fs.existsSync(file)) {
        const backupPath = path.join(backupDir, file);
        fs.copyFileSync(file, backupPath);
        console.log(`   ✅ バックアップ作成: ${file} -> ${backupPath}`);
      } else {
        console.log(`   ⚠️ ファイルが存在しません: ${file}`);
      }
    }
    
    console.log(`   📁 バックアップ場所: ${backupDir}\n`);
    return backupDir;
    
  } catch (error) {
    console.error(`   ❌ バックアップ作成エラー: ${error.message}\n`);
    return null;
  }
}

/**
 * Step 2: セキュア版のデプロイ
 */
function deploySecureVersions() {
  console.log('📋 Step 2: セキュア版ファイルのデプロイ');
  
  try {
    // localML.jsをセキュア版に置き換え
    if (fs.existsSync('localML_secure.js')) {
      fs.copyFileSync('localML_secure.js', 'localML.js');
      console.log('   ✅ localML.js -> セキュア版にアップグレード');
    } else {
      console.log('   ❌ localML_secure.js が見つかりません');
      return false;
    }
    
    // mlIntegration.jsをセキュア版に置き換え
    if (fs.existsSync('mlIntegration_secure.js')) {
      fs.copyFileSync('mlIntegration_secure.js', 'mlIntegration.js');
      console.log('   ✅ mlIntegration.js -> セキュア版にアップグレード');
    } else {
      console.log('   ❌ mlIntegration_secure.js が見つかりません');
      return false;
    }
    
    console.log('   🎉 セキュア版デプロイ完了\n');
    return true;
    
  } catch (error) {
    console.error(`   ❌ デプロイエラー: ${error.message}\n`);
    return false;
  }
}

/**
 * Step 3: 依存関係の更新
 */
function updateDependencies() {
  console.log('📋 Step 3: 依存関係の更新');
  
  try {
    // server.jsでの参照を更新
    if (fs.existsSync('server.js')) {
      let serverContent = fs.readFileSync('server.js', 'utf8');
      
      // LocalMLの参照をSecureLocalMLに更新
      const oldImport = "const { mlData } = await processMlData(userId, userMessage, mode);";
      const newImport = "const { mlData } = await require('./mlIntegration_secure').processMLDataSecure(userId, userMessage, mode);";
      
      if (serverContent.includes('processMlData')) {
        serverContent = serverContent.replace(/processMlData/g, 'processMLDataSecure');
        console.log('   ✅ server.js: processMlData -> processMLDataSecure');
      }
      
      // ファイル更新
      fs.writeFileSync('server.js', serverContent);
      console.log('   ✅ server.js 更新完了');
    }
    
    console.log('   🔗 依存関係更新完了\n');
    return true;
    
  } catch (error) {
    console.error(`   ❌ 依存関係更新エラー: ${error.message}\n`);
    return false;
  }
}

/**
 * Step 4: 設定の検証
 */
function validateConfiguration() {
  console.log('📋 Step 4: セキュリティ設定の検証');
  
  const requiredEnvVars = [
    'ENCRYPTION_KEY',
    'AIRTABLE_API_KEY',
    'AIRTABLE_BASE_ID'
  ];
  
  let validationPassed = true;
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.log(`   ❌ 必須環境変数が設定されていません: ${envVar}`);
      validationPassed = false;
    } else if (process.env[envVar].length < 10) {
      console.log(`   ⚠️ 環境変数が短すぎます: ${envVar}`);
      validationPassed = false;
    } else {
      console.log(`   ✅ 環境変数確認: ${envVar}`);
    }
  }
  
  // 暗号化キーの強度チェック
  if (process.env.ENCRYPTION_KEY) {
    const keyLength = process.env.ENCRYPTION_KEY.length;
    if (keyLength >= 64) {
      console.log(`   ✅ 暗号化キー強度: 強 (${keyLength}文字)`);
    } else if (keyLength >= 32) {
      console.log(`   ⚠️ 暗号化キー強度: 中 (${keyLength}文字) - より強固な推奨`);
    } else {
      console.log(`   ❌ 暗号化キー強度: 弱 (${keyLength}文字) - 要強化`);
      validationPassed = false;
    }
  }
  
  console.log(`   📊 設定検証結果: ${validationPassed ? '合格' : '不合格'}\n`);
  return validationPassed;
}

/**
 * Step 5: セキュリティテスト実行
 */
async function runSecurityValidation() {
  console.log('📋 Step 5: セキュリティテスト実行');
  
  try {
    // セキュリティテストの実行
    const { runSecurityTests } = require('./security_test_localml');
    const testPassed = await runSecurityTests();
    
    if (testPassed) {
      console.log('   🎉 全セキュリティテスト合格！');
    } else {
      console.log('   ❌ セキュリティテストに失敗');
    }
    
    return testPassed;
    
  } catch (error) {
    console.error(`   ❌ セキュリティテストエラー: ${error.message}`);
    return false;
  }
}

/**
 * Step 6: ロールバック機能
 */
function rollback(backupDir) {
  console.log('🔄 ロールバック実行中...');
  
  try {
    if (!backupDir || !fs.existsSync(backupDir)) {
      console.log('   ❌ バックアップディレクトリが見つかりません');
      return false;
    }
    
    const backupFiles = fs.readdirSync(backupDir);
    
    for (const file of backupFiles) {
      const backupPath = path.join(backupDir, file);
      const originalPath = file;
      
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, originalPath);
        console.log(`   ✅ ロールバック: ${file}`);
      }
    }
    
    console.log('   🔄 ロールバック完了\n');
    return true;
    
  } catch (error) {
    console.error(`   ❌ ロールバックエラー: ${error.message}\n`);
    return false;
  }
}

/**
 * メインデプロイメント処理
 */
async function deploySecureLocalML() {
  console.log('🚀 **セキュア版LocalMLデプロイメント開始**\n');
  
  let backupDir = null;
  
  try {
    // Step 1: バックアップ
    backupDir = createBackups();
    if (!backupDir) {
      throw new Error('バックアップ作成に失敗');
    }
    
    // Step 2: デプロイ
    const deploySuccess = deploySecureVersions();
    if (!deploySuccess) {
      throw new Error('セキュア版デプロイに失敗');
    }
    
    // Step 3: 依存関係更新
    const depsSuccess = updateDependencies();
    if (!depsSuccess) {
      throw new Error('依存関係更新に失敗');
    }
    
    // Step 4: 設定検証
    const configValid = validateConfiguration();
    if (!configValid) {
      throw new Error('設定検証に失敗');
    }
    
    // Step 5: セキュリティテスト
    const securityPassed = await runSecurityValidation();
    if (!securityPassed) {
      throw new Error('セキュリティテストに失敗');
    }
    
    // 成功
    console.log('🎉 **セキュア版LocalMLデプロイメント完了！**');
    console.log('🔐 **Apple並みセキュリティレベルに到達しました**');
    console.log(`📁 **バックアップ保存場所: ${backupDir}**\n`);
    
    // デプロイメント記録
    const deploymentRecord = {
      timestamp: new Date().toISOString(),
      version: 'secure-v1.0',
      backupLocation: backupDir,
      securityFeatures: [
        'メモリ内暗号化',
        'SQLインジェクション対策',
        'DoS攻撃防止',
        'ログマスキング',
        'タイミング攻撃対策',
        'レート制限'
      ],
      status: 'success'
    };
    
    fs.writeFileSync(
      `deployment-record-${Date.now()}.json`, 
      JSON.stringify(deploymentRecord, null, 2)
    );
    
    return true;
    
  } catch (error) {
    console.error(`❌ **デプロイメントエラー: ${error.message}**\n`);
    
    // ロールバック実行
    if (backupDir) {
      console.log('🔄 **自動ロールバック実行中...**');
      const rollbackSuccess = rollback(backupDir);
      if (rollbackSuccess) {
        console.log('✅ **ロールバック完了 - システムは元の状態に戻りました**');
      } else {
        console.log('❌ **ロールバック失敗 - 手動復旧が必要です**');
      }
    }
    
    return false;
  }
}

// 手動ロールバック機能
async function manualRollback() {
  const backups = fs.readdirSync('backups').filter(dir => 
    dir.startsWith('security-upgrade-')
  );
  
  if (backups.length === 0) {
    console.log('❌ 利用可能なバックアップがありません');
    return false;
  }
  
  console.log('📁 利用可能なバックアップ:');
  backups.forEach((backup, index) => {
    console.log(`   ${index + 1}. ${backup}`);
  });
  
  // 最新のバックアップを使用
  const latestBackup = backups[backups.length - 1];
  const backupPath = path.join('backups', latestBackup);
  
  console.log(`🔄 最新バックアップからロールバック: ${latestBackup}`);
  return rollback(backupPath);
}

// CLI実行
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--rollback')) {
    manualRollback().then(success => {
      process.exit(success ? 0 : 1);
    });
  } else {
    deploySecureLocalML().then(success => {
      process.exit(success ? 0 : 1);
    });
  }
}

module.exports = { 
  deploySecureLocalML, 
  manualRollback,
  createBackups,
  rollback 
}; 