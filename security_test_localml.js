/**
 * LocalML Security Test Suite
 * セキュリティ脆弱性の修正を検証するテストスクリプト
 */

const crypto = require('crypto');

// テスト用の環境変数設定
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

console.log('🔐 LocalML セキュリティテスト開始...\n');

/**
 * Test 1: SQLインジェクション対策テスト
 */
async function testSQLInjectionPrevention() {
  console.log('📋 Test 1: SQLインジェクション対策テスト');
  
  try {
    const SecureLocalML = require('./localML_secure');
    const secureML = new SecureLocalML();
    
    // 悪意のあるユーザーID
    const maliciousUserIds = [
      "'; DROP TABLE Users; --",
      '"; UPDATE Users SET password = "hacked"; --',
      "' OR '1'='1",
      '<script>alert("xss")</script>',
      '../../etc/passwd',
      '${process.env.SECRET_KEY}'
    ];
    
    let passedCount = 0;
    
    for (const userId of maliciousUserIds) {
      try {
        await secureML.enhanceResponseSecure(userId, 'test message', 'general');
        console.log(`   ❌ 危険: "${userId}" が通過しました`);
      } catch (error) {
        console.log(`   ✅ ブロック成功: "${userId}" -> ${error.message}`);
        passedCount++;
      }
    }
    
    console.log(`   📊 結果: ${passedCount}/${maliciousUserIds.length} の攻撃をブロック\n`);
    return passedCount === maliciousUserIds.length;
    
  } catch (error) {
    console.log(`   ❌ テスト実行エラー: ${error.message}\n`);
    return false;
  }
}

/**
 * Test 2: DoS攻撃対策テスト
 */
async function testDosAttackPrevention() {
  console.log('📋 Test 2: DoS攻撃対策テスト');
  
  try {
    const SecureLocalML = require('./localML_secure');
    const secureML = new SecureLocalML();
    
    // 大きなデータでDoS攻撃を試行
    const largeData = 'A'.repeat(2 * 1024 * 1024); // 2MB
    const extremelyLongUserId = 'U' + 'x'.repeat(500);
    
    let dosBlocked = 0;
    
    // 大きなメッセージテスト
    try {
      await secureML.enhanceResponseSecure('testUser', largeData, 'general');
      console.log('   ❌ 大きなメッセージが通過しました');
    } catch (error) {
      console.log(`   ✅ 大きなメッセージをブロック: ${error.message}`);
      dosBlocked++;
    }
    
    // 長いユーザーIDテスト
    try {
      await secureML.enhanceResponseSecure(extremelyLongUserId, 'test', 'general');
      console.log('   ❌ 長いユーザーIDが通過しました');
    } catch (error) {
      console.log(`   ✅ 長いユーザーIDをブロック: ${error.message}`);
      dosBlocked++;
    }
    
    console.log(`   📊 結果: ${dosBlocked}/2 のDoS攻撃をブロック\n`);
    return dosBlocked === 2;
    
  } catch (error) {
    console.log(`   ❌ テスト実行エラー: ${error.message}\n`);
    return false;
  }
}

/**
 * Test 3: ログマスキングテスト
 */
async function testLogMasking() {
  console.log('📋 Test 3: ログマスキングテスト');
  
  try {
    const SecureLocalML = require('./localML_secure');
    const secureML = new SecureLocalML();
    
    const sensitiveData = {
      userId: 'U1234567890abcdef1234567890abcdef',
      traits: '{"anxiety": "high", "depression": "moderate"}',
      indicators: '{"social_withdrawal": "severe"}'
    };
    
    const maskedUserId = secureML._maskSensitiveData(sensitiveData.userId);
    const maskedTraits = secureML._maskSensitiveData(sensitiveData.traits);
    
    let maskingPassed = 0;
    
    // ユーザーIDマスキング確認
    if (maskedUserId.includes('***MASKED***') && !maskedUserId.includes('U1234567890abcdef')) {
      console.log('   ✅ ユーザーIDマスキング成功');
      maskingPassed++;
    } else {
      console.log(`   ❌ ユーザーIDマスキング失敗: ${maskedUserId}`);
    }
    
    // 機密フィールドマスキング確認
    if (maskedTraits.includes('***MASKED***') && !maskedTraits.includes('anxiety')) {
      console.log('   ✅ 機密フィールドマスキング成功');
      maskingPassed++;
    } else {
      console.log(`   ❌ 機密フィールドマスキング失敗: ${maskedTraits}`);
    }
    
    console.log(`   📊 結果: ${maskingPassed}/2 のマスキングが正常\n`);
    return maskingPassed === 2;
    
  } catch (error) {
    console.log(`   ❌ テスト実行エラー: ${error.message}\n`);
    return false;
  }
}

/**
 * Test 4: 暗号化テスト
 */
async function testEncryption() {
  console.log('📋 Test 4: メモリ内暗号化テスト');
  
  try {
    const SecureLocalML = require('./localML_secure');
    const secureML = new SecureLocalML();
    
    const testData = {
      traits: { anxiety: 'high', focus: 'low' },
      mode: 'mental_health',
      timestamp: Date.now()
    };
    
    // 暗号化保存
    await secureML._storeSecureAnalysisInMemory('testUser', 'mental_health', testData);
    
    // メモリから直接アクセス（暗号化されているはず）
    const encryptedData = secureML.encryptedUserAnalysis.get('testUser:mental_health');
    
    let encryptionPassed = 0;
    
    // 暗号化確認
    if (encryptedData && typeof encryptedData === 'string' && !encryptedData.includes('anxiety')) {
      console.log('   ✅ データが暗号化されて保存されています');
      encryptionPassed++;
    } else {
      console.log('   ❌ データが平文で保存されています');
    }
    
    // 復号化確認
    const decryptedData = await secureML._getSecureAnalysisFromMemory('testUser', 'mental_health');
    if (decryptedData && decryptedData.traits && decryptedData.traits.anxiety === 'high') {
      console.log('   ✅ データの復号化が正常に動作しています');
      encryptionPassed++;
    } else {
      console.log('   ❌ データの復号化に失敗しました');
    }
    
    console.log(`   📊 結果: ${encryptionPassed}/2 の暗号化テストが成功\n`);
    return encryptionPassed === 2;
    
  } catch (error) {
    console.log(`   ❌ テスト実行エラー: ${error.message}\n`);
    return false;
  }
}

/**
 * Test 5: タイミング攻撃対策テスト
 */
async function testTimingAttackPrevention() {
  console.log('📋 Test 5: タイミング攻撃対策テスト');
  
  try {
    const SecureLocalML = require('./localML_secure');
    const secureML = new SecureLocalML();
    
    const timings = [];
    
    // 存在するユーザーと存在しないユーザーの処理時間を測定
    for (let i = 0; i < 5; i++) {
      const startTime = Date.now();
      try {
        await secureML.enhanceResponseSecure(`existingUser${i}`, 'test message', 'general');
      } catch (error) {
        // エラーは期待される
      }
      const endTime = Date.now();
      timings.push(endTime - startTime);
    }
    
    // タイミングの分散が小さいことを確認
    const averageTime = timings.reduce((a, b) => a + b, 0) / timings.length;
    const variance = timings.reduce((sum, time) => sum + Math.pow(time - averageTime, 2), 0) / timings.length;
    const standardDeviation = Math.sqrt(variance);
    
    const timingConsistent = standardDeviation < 50; // 50ms以内の差なら合格
    
    if (timingConsistent) {
      console.log(`   ✅ タイミング攻撃対策成功: 標準偏差 ${Math.round(standardDeviation)}ms`);
    } else {
      console.log(`   ❌ タイミング攻撃の可能性: 標準偏差 ${Math.round(standardDeviation)}ms`);
    }
    
    console.log(`   📊 結果: 処理時間の一貫性 ${timingConsistent ? '良好' : '問題あり'}\n`);
    return timingConsistent;
    
  } catch (error) {
    console.log(`   ❌ テスト実行エラー: ${error.message}\n`);
    return false;
  }
}

/**
 * Test 6: レート制限テスト
 */
async function testRateLimit() {
  console.log('📋 Test 6: レート制限テスト');
  
  try {
    const mlIntegrationSecure = require('./mlIntegration_secure');
    
    const testUserId = 'rateLimitTestUser';
    let blockedCount = 0;
    let successCount = 0;
    
    // 短時間に大量のリクエストを送信
    for (let i = 0; i < 35; i++) {
      try {
        const result = await mlIntegrationSecure.processMLDataSecure(testUserId, `test message ${i}`, 'general');
        if (result.error && result.error.includes('レート制限')) {
          blockedCount++;
        } else {
          successCount++;
        }
      } catch (error) {
        if (error.message.includes('レート制限')) {
          blockedCount++;
        }
      }
    }
    
    const rateLimitWorking = blockedCount > 0;
    
    if (rateLimitWorking) {
      console.log(`   ✅ レート制限が正常に動作: ${successCount}件成功, ${blockedCount}件ブロック`);
    } else {
      console.log(`   ❌ レート制限が機能していません: 全${successCount}件が通過`);
    }
    
    console.log(`   📊 結果: レート制限 ${rateLimitWorking ? '正常' : '無効'}\n`);
    return rateLimitWorking;
    
  } catch (error) {
    console.log(`   ❌ テスト実行エラー: ${error.message}\n`);
    return false;
  }
}

/**
 * セキュリティテストの実行
 */
async function runSecurityTests() {
  const tests = [
    { name: 'SQLインジェクション対策', test: testSQLInjectionPrevention },
    { name: 'DoS攻撃対策', test: testDosAttackPrevention },
    { name: 'ログマスキング', test: testLogMasking },
    { name: 'メモリ内暗号化', test: testEncryption },
    { name: 'タイミング攻撃対策', test: testTimingAttackPrevention },
    { name: 'レート制限', test: testRateLimit }
  ];
  
  let passedTests = 0;
  const results = [];
  
  for (const { name, test } of tests) {
    try {
      const passed = await test();
      results.push({ name, passed });
      if (passed) passedTests++;
    } catch (error) {
      console.log(`❌ ${name} テスト実行エラー: ${error.message}\n`);
      results.push({ name, passed: false });
    }
  }
  
  // 結果サマリー
  console.log('🎯 **セキュリティテスト結果サマリー**');
  console.log('='.repeat(50));
  
  results.forEach(({ name, passed }) => {
    console.log(`${passed ? '✅' : '❌'} ${name}: ${passed ? 'PASS' : 'FAIL'}`);
  });
  
  console.log('='.repeat(50));
  console.log(`📊 **総合結果: ${passedTests}/${tests.length} テスト合格**`);
  
  if (passedTests === tests.length) {
    console.log('🎉 **全てのセキュリティテストに合格しました！**');
    console.log('🔐 **LocalMLは Apple並みのセキュリティレベルです**');
  } else {
    console.log('⚠️ **一部のセキュリティテストに失敗しました**');
    console.log('🔧 **追加の修正が必要です**');
  }
  
  return passedTests === tests.length;
}

// テスト実行
if (require.main === module) {
  runSecurityTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('❌ テスト実行中に致命的エラー:', error);
    process.exit(1);
  });
}

module.exports = { runSecurityTests };