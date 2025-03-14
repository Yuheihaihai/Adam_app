/**
 * ml-enhance モジュールの使用例
 * 
 * このファイルは既存の server.js を変更せずに機械学習拡張機能を導入する方法を示します。
 */

// 環境変数の設定（通常は.envファイルまたは環境変数で設定）
process.env.ML_ENHANCED = 'true';           // 拡張機能を有効化
process.env.ML_MODE_GENERAL = 'true';       // 一般会話モードで有効化
process.env.ML_LOG_LEVEL = 'debug';         // ログレベルをdebugに設定
process.env.ML_USE_FALLBACK = 'true';       // フォールバックを有効化

// 拡張機械学習モジュールのインポート
// 通常はserver.jsで以下のようにインポートを置き換えるだけ
const localML = require('../index');

// テスト関数
async function testML() {
  try {
    console.log('機械学習拡張モジュールのテスト開始...');
    
    // サンプルユーザー情報
    const userId = 'test-user-123';
    const userMessage = 'こんにちは！今日はとても良い天気ですね。AIについて教えてください。';
    const mode = 'general';
    
    // 拡張機能による分析を実行
    console.log(`ユーザーメッセージ: "${userMessage}"`);
    console.log(`分析モード: ${mode}`);
    
    const analysisResult = await localML.enhanceResponse(userId, userMessage, mode);
    
    console.log('\n--- 分析結果 ---');
    console.log(JSON.stringify(analysisResult, null, 2));
    
    // 拡張機能が正常に動作したかチェック
    if (analysisResult && analysisResult.ml_enhanced) {
      console.log('\n✅ 拡張機能が正常に動作しました');
    } else {
      console.log('\n⚠️ 既存システムが使用されました（フォールバックが発生した可能性があります）');
    }
    
    console.log('\nテスト完了');
  } catch (error) {
    console.error('テスト中にエラーが発生しました:', error);
  }
}

// テスト実行
testML().catch(console.error); 