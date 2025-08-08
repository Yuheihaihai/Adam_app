#!/usr/bin/env node
/**
 * Adam AI v2.4 サーバー起動・動作確認テスト
 * セキュリティ強化後のfixed_server.jsの起動確認
 */

const http = require('http');
const { spawn } = require('child_process');

console.log('🚀 Adam AI v2.4 サーバー起動テスト');
console.log('='.repeat(50));

let serverProcess = null;
let serverReady = false;

// テストタイムアウト設定
const TEST_TIMEOUT = 30000; // 30秒

// サーバー起動
function startServer() {
  return new Promise((resolve, reject) => {
    console.log('📋 1. メインサーバー（fixed_server.js）起動中...');
    
    // 環境変数設定（テスト用）
    const env = {
      ...process.env,
      PORT: '3001', // テスト用ポート
      NODE_ENV: 'test',
      // セキュリティ設定
      SECURITY_FAIL_CLOSE: 'false', // テスト時はfail-open
      SECURITY_ENABLE_ADMIN_STATS: 'true',
      SECURITY_LOG_BLOCKED_CONTENT: 'false',
      // 依存サービスを無効化
      DISABLE_TENSORFLOW: 'true',
      DISABLE_OPENAI: 'true',
      DISABLE_AZURE: 'true',
      DISABLE_GOOGLE: 'true',
      DISABLE_ANTHROPIC: 'true',
      // DB証明書検証をスキップ（未設定扱いにする）
      DATABASE_CA_CERT: '',
      DATABASE_CLIENT_KEY: '',
      DATABASE_CLIENT_CERT: ''
    };
    
    serverProcess = spawn('node', ['fixed_server.js'], {
      env: env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let startupTimeout = setTimeout(() => {
      if (!serverReady) {
        serverProcess.kill();
        reject(new Error('サーバー起動タイムアウト'));
      }
    }, 15000);
    
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('📄 Server Output:', output.trim());
      
      // サーバー起動完了の検出
      if (output.includes('Server is running') || 
          output.includes('listening on port') || 
          output.includes('3001')) {
        serverReady = true;
        clearTimeout(startupTimeout);
        console.log('✅ サーバー起動完了');
        resolve();
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      const error = data.toString();
      console.error('⚠️ Server Error:', error.trim());
      
      // 致命的エラーの場合は停止
      if (error.includes('EADDRINUSE') || 
          error.includes('Cannot find module') ||
          error.includes('SyntaxError')) {
        clearTimeout(startupTimeout);
        reject(new Error('サーバー起動エラー: ' + error));
      }
    });
    
    serverProcess.on('error', (error) => {
      clearTimeout(startupTimeout);
      reject(new Error('プロセス起動エラー: ' + error.message));
    });
    
    serverProcess.on('close', (code) => {
      if (!serverReady) {
        clearTimeout(startupTimeout);
        reject(new Error(`サーバーが終了しました (終了コード: ${code})`));
      }
    });
  });
}

// ヘルスチェック
function performHealthCheck() {
  return new Promise((resolve, reject) => {
    console.log('\n📋 2. ヘルスチェック実行中...');
    
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/',
      method: 'GET',
      timeout: 5000
    };
    
    const req = http.request(options, (res) => {
      console.log(`✅ HTTP応答ステータス: ${res.statusCode}`);
      console.log(`✅ レスポンスヘッダー:`, res.headers);
      
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        console.log(`✅ レスポンス内容: ${body.substring(0, 200)}...`);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });
    
    req.on('error', (error) => {
      reject(new Error('ヘルスチェック失敗: ' + error.message));
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('ヘルスチェックタイムアウト'));
    });
    
    req.end();
  });
}

// セキュリティヘッダーチェック
function checkSecurityHeaders() {
  return new Promise((resolve, reject) => {
    console.log('\n📋 3. セキュリティヘッダーチェック...');
    
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/',
      method: 'GET',
      timeout: 5000
    };
    
    const req = http.request(options, (res) => {
      const securityHeaders = {
        'x-frame-options': res.headers['x-frame-options'],
        'x-content-type-options': res.headers['x-content-type-options'],
        'strict-transport-security': res.headers['strict-transport-security'],
        'content-security-policy': res.headers['content-security-policy'],
        'x-xss-protection': res.headers['x-xss-protection']
      };
      
      console.log('🛡️ セキュリティヘッダー確認:');
      Object.entries(securityHeaders).forEach(([header, value]) => {
        if (value) {
          console.log(`✅ ${header}: ${value}`);
        } else {
          console.log(`⚠️ ${header}: 設定なし`);
        }
      });
      
      resolve(securityHeaders);
    });
    
    req.on('error', (error) => {
      reject(new Error('セキュリティヘッダーチェック失敗: ' + error.message));
    });
    
    req.end();
  });
}

// API エンドポイントテスト
function testAPIEndpoints() {
  return new Promise((resolve, reject) => {
    console.log('\n📋 4. APIエンドポイントテスト...');
    
    const endpoints = [
      { path: '/api/intent/categories', method: 'GET', description: '意図カテゴリ一覧' },
      { path: '/api/intent/detect', method: 'POST', description: '意図検出', body: { text: 'キャリアについて相談したいです' } },
      { path: '/security/stats', method: 'GET', description: 'セキュリティ統計' }
    ];
    
    const results = [];
    let completed = 0;
    
    endpoints.forEach((endpoint, index) => {
      const options = {
        hostname: 'localhost',
        port: 3001,
        path: endpoint.path,
        method: endpoint.method,
        timeout: 5000,
        headers: endpoint.method === 'POST' ? { 'Content-Type': 'application/json' } : {}
      };
      
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk.toString(); });
        res.on('end', () => {
          console.log(`${endpoint.description}: ${res.statusCode}`);
          if (body) {
            console.log(`→ Body: ${body.substring(0,120)}${body.length>120?'...':''}`);
          }
          results[index] = {
            endpoint: endpoint.path,
            statusCode: res.statusCode,
            success: res.statusCode < 400
          };
          completed++;
          if (completed === endpoints.length) {
            resolve(results);
          }
        });
      });
      
      req.on('error', (error) => {
        console.log(`${endpoint.description}: エラー - ${error.message}`);
        
        results[index] = {
          endpoint: endpoint.path,
          error: error.message,
          success: false
        };
        
        completed++;
        if (completed === endpoints.length) {
          resolve(results);
        }
      });

      if (endpoint.method === 'POST' && endpoint.body) {
        req.write(JSON.stringify(endpoint.body));
      }
      req.end();
    });
  });
}

// サーバー停止
function stopServer() {
  return new Promise((resolve) => {
    console.log('\n📋 5. サーバー停止中...');
    
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      
      setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          serverProcess.kill('SIGKILL');
        }
        console.log('✅ サーバー停止完了');
        resolve();
      }, 3000);
    } else {
      resolve();
    }
  });
}

// メインテスト実行
async function runServerTest() {
  let testResults = {
    startup: false,
    healthCheck: false,
    securityHeaders: false,
    apiEndpoints: false,
    overall: false
  };
  
  try {
    // タイムアウト設定
    const testTimeout = setTimeout(() => {
      console.error('💥 テスト全体がタイムアウトしました');
      process.exit(1);
    }, TEST_TIMEOUT);
    
    // 1. サーバー起動
    await startServer();
    testResults.startup = true;
    
    // 少し待機
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 2. ヘルスチェック
    try {
      await performHealthCheck();
      testResults.healthCheck = true;
    } catch (error) {
      console.error('❌ ヘルスチェック失敗:', error.message);
    }
    
    // 3. セキュリティヘッダーチェック
    try {
      await checkSecurityHeaders();
      testResults.securityHeaders = true;
    } catch (error) {
      console.error('❌ セキュリティヘッダーチェック失敗:', error.message);
    }
    
    // 4. APIエンドポイントテスト（起動直後の負荷軽減のため少し待機）
    try {
      await new Promise(r => setTimeout(r, 1500));
      const apiResults = await testAPIEndpoints();
      testResults.apiEndpoints = apiResults.some(r => r.success);
    } catch (error) {
      console.error('❌ APIエンドポイントテスト失敗:', error.message);
    }
    
    clearTimeout(testTimeout);
    
  } catch (error) {
    console.error('💥 メインテストエラー:', error.message);
  } finally {
    // 5. サーバー停止
    await stopServer();
  }
  
  // 結果サマリー
  console.log('\n' + '='.repeat(50));
  console.log('📊 サーバーテスト結果サマリー');
  console.log('='.repeat(50));
  
  const tests = [
    { name: 'サーバー起動', result: testResults.startup },
    { name: 'ヘルスチェック', result: testResults.healthCheck },
    { name: 'セキュリティヘッダー', result: testResults.securityHeaders },
    { name: 'APIエンドポイント', result: testResults.apiEndpoints }
  ];
  
  tests.forEach(test => {
    console.log(`${test.result ? '✅' : '❌'} ${test.name}: ${test.result ? '成功' : '失敗'}`);
  });
  
  const successCount = tests.filter(t => t.result).length;
  const totalTests = tests.length;
  const successRate = Math.round((successCount / totalTests) * 100);
  
  testResults.overall = successRate >= 75;
  
  console.log(`\n🎯 総合結果: ${successCount}/${totalTests} (${successRate}%)`);
  
  if (testResults.overall) {
    console.log('🟢 サーバー動作: 正常');
  } else if (successRate >= 50) {
    console.log('🟡 サーバー動作: 部分的に動作（要注意）');
  } else {
    console.log('🔴 サーバー動作: 異常（修正必要）');
  }
  
  return testResults;
}

// 実行
if (require.main === module) {
  runServerTest().then((results) => {
    process.exit(results.overall ? 0 : 1);
  }).catch((error) => {
    console.error('💥 テスト実行エラー:', error);
    process.exit(1);
  });
}

module.exports = { runServerTest };