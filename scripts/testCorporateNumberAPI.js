// scripts/testCorporateNumberAPI.js - 法人番号API機能テストスクリプト
require('dotenv').config();
const CorporateNumberAPI = require('../corporateNumberAPI');

/**
 * 法人番号API機能のテストスクリプト
 * 実際のサービス名で法人番号検索をテスト
 */
async function testCorporateNumberAPI() {
  console.log('=== 法人番号API機能テスト開始 ===\n');
  
  const corporateAPI = new CorporateNumberAPI();
  
  // テスト対象のサービス（実際のcore.jsonから抜粋）
  const testServices = [
    {
      name: 'LITALICO ワークス',
      url: 'https://works.litalico.jp/',
      description: '障害の有無に関わらず、一人ひとりの「働きたい」を実現するための就労支援サービス'
    },
    {
      name: 'Kaien（カイエン）',
      url: 'https://www.kaien-lab.com/',
      description: '発達障害のある方のためのIT・事務職に特化した就労支援サービス'
    },
    {
      name: 'ウェルビー',
      url: 'https://www.welbe.co.jp/',
      description: '発達障害に特化した就労移行支援'
    },
    {
      name: 'パソナキャリア',
      url: 'https://www.pasonacareer.jp/',
      description: '総合人材紹介'
    },
    {
      name: 'リクルートエージェント',
      url: 'https://www.r-agent.com/',
      description: '国内最大級の転職エージェント'
    }
  ];

  let successCount = 0;
  let totalCount = testServices.length;

  console.log(`テスト対象: ${totalCount}サービス\n`);

  for (let i = 0; i < testServices.length; i++) {
    const service = testServices[i];
    
    console.log(`--- テスト ${i + 1}/${totalCount} ---`);
    console.log(`サービス名: ${service.name}`);
    console.log(`URL: ${service.url}`);
    
    try {
      const startTime = Date.now();
      
      // 法人番号検索実行
      const corporateNumber = await corporateAPI.searchCorporateNumber(
        service.name, 
        service.url
      );
      
      const elapsed = Date.now() - startTime;
      
      if (corporateNumber) {
        console.log(`✅ 法人番号発見: ${corporateNumber} (${elapsed}ms)`);
        successCount++;
        
        // 詳細情報も取得してみる
        try {
          const details = await corporateAPI.getCorporateDetails(corporateNumber);
          if (details && details.name) {
            console.log(`   正式名称: ${details.name}`);
          }
        } catch (detailError) {
          console.log(`   詳細取得エラー: ${detailError.message}`);
        }
      } else {
        console.log(`❌ 法人番号未発見 (${elapsed}ms)`);
      }
      
    } catch (error) {
      console.log(`❌ エラー: ${error.message}`);
    }
    
    console.log('');
    
    // API制限対応のため短い待機
    if (i < testServices.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  // 結果サマリー
  console.log('=== テスト結果サマリー ===');
  console.log(`成功: ${successCount}/${totalCount} (${((successCount/totalCount)*100).toFixed(1)}%)`);
  console.log(`失敗: ${totalCount - successCount}/${totalCount}`);

  // キャッシュ統計
  const cacheStats = corporateAPI.getCacheStats();
  console.log(`\nキャッシュ統計:`);
  console.log(`  総エントリ数: ${cacheStats.total}`);
  console.log(`  有効エントリ数: ${cacheStats.active}`);
  console.log(`  期限切れエントリ数: ${cacheStats.expired}`);

  console.log('\n=== テスト完了 ===');
}

// 重複判定のテスト
async function testDuplicateDetection() {
  console.log('\n=== 重複判定テスト ===');
  
  const corporateAPI = new CorporateNumberAPI();
  
  // 模擬的な既存キー
  const existingKeys = {
    ids: new Set(['litalico', 'kaien']),
    nameSlugs: new Set(['litalico-works', 'kaien']),
    hostKeys: new Set(['works.litalico.jp', 'kaien-lab.com']),
    corporateNumbers: new Set(['1234567890123']) // 仮の法人番号
  };

  // テスト候補
  const testCandidates = [
    {
      name: 'LITALICO ワークス',
      url: 'https://works.litalico.jp/',
      corporateNumber: '1234567890123' // 既存と同じ法人番号
    },
    {
      name: 'テスト株式会社',
      url: 'https://test-company.jp/'
      // 法人番号なし - API検索が実行される
    }
  ];

  // 重複判定関数をインポート（簡易版）
  async function testIsDuplicateCandidate(candidate, keys, corporateAPI) {
    // 法人番号による重複判定
    if (candidate.corporateNumber && keys.corporateNumbers.has(candidate.corporateNumber)) {
      return true;
    }

    // 法人番号がない場合は検索試行
    if (!candidate.corporateNumber && corporateAPI && candidate.name) {
      try {
        const corporateNumber = await corporateAPI.searchCorporateNumber(candidate.name, candidate.url);
        if (corporateNumber) {
          candidate.corporateNumber = corporateNumber;
          if (keys.corporateNumbers.has(corporateNumber)) {
            return true;
          }
        }
      } catch (error) {
        console.warn(`法人番号検索エラー: ${error.message}`);
      }
    }

    return false;
  }

  for (let i = 0; i < testCandidates.length; i++) {
    const candidate = testCandidates[i];
    console.log(`\n候補 ${i + 1}: ${candidate.name}`);
    
    const isDuplicate = await testIsDuplicateCandidate(candidate, existingKeys, corporateAPI);
    
    console.log(`重複判定結果: ${isDuplicate ? '重複あり' : '重複なし'}`);
    if (candidate.corporateNumber) {
      console.log(`法人番号: ${candidate.corporateNumber}`);
    }
  }
}

// メイン実行
if (require.main === module) {
  (async () => {
    try {
      await testCorporateNumberAPI();
      await testDuplicateDetection();
    } catch (error) {
      console.error('テスト実行エラー:', error);
      process.exit(1);
    }
  })();
}

module.exports = { testCorporateNumberAPI, testDuplicateDetection };
