// cleanup.js - テスト環境クリーンアップスクリプト
const fs = require('fs');
const path = require('path');

// クリーンアップ対象ディレクトリ
const TEST_RESULTS_DIR = path.join(__dirname, 'test_results');
const TEMP_DIR = path.join(__dirname, 'temp');
const DATA_DIR = path.join(__dirname, 'data');

console.log('=== Adam AI テスト環境クリーンアップ ===');

// テスト結果ディレクトリの処理
cleanupTestResults();

// 一時ファイルディレクトリの処理
cleanupTempFiles();

// データディレクトリ内の不要なキャッシュファイルの処理
cleanupDataCache();

console.log('=== クリーンアップ完了 ===');

/**
 * テスト結果ディレクトリをクリーンアップする関数
 */
function cleanupTestResults() {
  console.log('\n-- テスト結果クリーンアップ --');
  
  if (!fs.existsSync(TEST_RESULTS_DIR)) {
    console.log('テスト結果ディレクトリが存在しません。スキップします。');
    return;
  }
  
  try {
    // テスト結果ディレクトリ内のサブディレクトリ作成
    const archiveDir = path.join(TEST_RESULTS_DIR, 'log_archive');
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir);
      console.log('ログアーカイブディレクトリを作成しました: ' + archiveDir);
    }
    
    // 直近のテスト以外のログファイルをアーカイブに移動
    const logFiles = fs.readdirSync(TEST_RESULTS_DIR)
      .filter(file => file.startsWith('full_test_log_') && file.endsWith('.md'));
    
    // ファイルを日付順に並べ替え
    logFiles.sort((a, b) => {
      const statsA = fs.statSync(path.join(TEST_RESULTS_DIR, a));
      const statsB = fs.statSync(path.join(TEST_RESULTS_DIR, b));
      return statsB.mtime.getTime() - statsA.mtime.getTime(); // 新しい順
    });
    
    // 最新のファイルのみ残し、他はアーカイブに移動
    if (logFiles.length > 1) {
      const [latestLog, ...oldLogs] = logFiles;
      console.log(`最新ログファイルを保持: ${latestLog}`);
      
      let movedCount = 0;
      oldLogs.forEach(file => {
        const sourcePath = path.join(TEST_RESULTS_DIR, file);
        const destPath = path.join(archiveDir, file);
        
        try {
          fs.renameSync(sourcePath, destPath);
          movedCount++;
        } catch (error) {
          console.error(`ファイル移動エラー (${file}): ${error.message}`);
        }
      });
      
      console.log(`${movedCount}件の古いログファイルをアーカイブしました`);
    } else {
      console.log('アーカイブ対象のログファイルがありませんでした');
    }
    
    // テスト生成画像の削除
    const imageDir = path.join(TEST_RESULTS_DIR, 'image_tests');
    if (fs.existsSync(imageDir)) {
      const imageFiles = fs.readdirSync(imageDir)
        .filter(file => file.startsWith('generated_image_'));
      
      if (imageFiles.length > 0) {
        imageFiles.forEach(file => {
          try {
            fs.unlinkSync(path.join(imageDir, file));
          } catch (error) {
            console.error(`テスト画像削除エラー (${file}): ${error.message}`);
          }
        });
        
        console.log(`${imageFiles.length}件のテスト画像ファイルを削除しました`);
      }
    }
    
    // テスト音声ファイルの削除
    const audioDir = path.join(TEST_RESULTS_DIR, 'audio_tests');
    if (fs.existsSync(audioDir)) {
      const audioFiles = fs.readdirSync(audioDir)
        .filter(file => file.startsWith('output_') || file.startsWith('mock_audio_'));
      
      if (audioFiles.length > 0) {
        audioFiles.forEach(file => {
          try {
            fs.unlinkSync(path.join(audioDir, file));
          } catch (error) {
            console.error(`テスト音声削除エラー (${file}): ${error.message}`);
          }
        });
        
        console.log(`${audioFiles.length}件のテスト音声ファイルを削除しました`);
      }
    }
    
  } catch (error) {
    console.error('テスト結果クリーンアップエラー:', error.message);
  }
}

/**
 * 一時ファイルディレクトリをクリーンアップする関数
 */
function cleanupTempFiles() {
  console.log('\n-- 一時ファイルクリーンアップ --');
  
  if (!fs.existsSync(TEMP_DIR)) {
    console.log('一時ファイルディレクトリが存在しません。スキップします。');
    return;
  }
  
  try {
    // 7日以上前のファイルを削除
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    let deletedCount = 0;
    
    files.forEach(file => {
      const filePath = path.join(TEMP_DIR, file);
      const stats = fs.statSync(filePath);
      const fileAge = now - stats.mtimeMs;
      
      if (fileAge > ONE_WEEK_MS) {
        try {
          fs.unlinkSync(filePath);
          deletedCount++;
        } catch (error) {
          console.error(`一時ファイル削除エラー (${file}): ${error.message}`);
        }
      }
    });
    
    if (deletedCount > 0) {
      console.log(`${deletedCount}件の古い一時ファイルを削除しました`);
    } else {
      console.log('削除対象の古い一時ファイルはありませんでした');
    }
    
  } catch (error) {
    console.error('一時ファイルクリーンアップエラー:', error.message);
  }
}

/**
 * データディレクトリ内の不要なキャッシュファイルをクリーンアップする関数
 */
function cleanupDataCache() {
  console.log('\n-- データキャッシュクリーンアップ --');
  
  if (!fs.existsSync(DATA_DIR)) {
    console.log('データディレクトリが存在しません。スキップします。');
    return;
  }
  
  try {
    // 特性キャッシュディレクトリの処理
    const cacheDir = path.join(DATA_DIR, 'characteristics_cache');
    if (fs.existsSync(cacheDir)) {
      // 30日以上前のキャッシュファイルを削除
      const cacheFiles = fs.readdirSync(cacheDir);
      const now = Date.now();
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      let deletedCount = 0;
      
      cacheFiles.forEach(file => {
        if (file.endsWith('_characteristics.json')) {
          const filePath = path.join(cacheDir, file);
          const stats = fs.statSync(filePath);
          const fileAge = now - stats.mtimeMs;
          
          if (fileAge > THIRTY_DAYS_MS) {
            try {
              fs.unlinkSync(filePath);
              deletedCount++;
            } catch (error) {
              console.error(`キャッシュファイル削除エラー (${file}): ${error.message}`);
            }
          }
        }
      });
      
      if (deletedCount > 0) {
        console.log(`${deletedCount}件の古いキャッシュファイルを削除しました`);
      } else {
        console.log('削除対象の古いキャッシュファイルはありませんでした');
      }
    }
    
  } catch (error) {
    console.error('データキャッシュクリーンアップエラー:', error.message);
  }
} 