#!/usr/bin/env node
// 暗号化テーブルのみを用いたML保存/取得の実動テスト

(async () => {
  try {
    const LocalML = require('../localML_postgresql');
    const ml = new LocalML();

    const ok = await ml.initialize();
    console.log('[TEST-ENCRYPTED-ML] initialize:', ok);

    const userId = 'ml-encrypted-test-user-001';
    const mode = 'general';
    const analysisData = {
      traits: { conscientiousness: 0.72, openness: 0.65 },
      indicators: { prefers_concise: true },
      notes: 'encrypted-only test'
    };

    // 保存（暗号テーブル）
    const saved = await ml.saveUserAnalysisSecure(userId, mode, analysisData);
    console.log('[TEST-ENCRYPTED-ML] saved:', saved);

    // 取得（暗号テーブル→復号）
    const fetched = await ml.getUserAnalysisSecure(userId, mode);
    console.log('[TEST-ENCRYPTED-ML] fetched:', fetched ? JSON.stringify(fetched).slice(0, 200) : 'null');

    // 簡易一致チェック
    const okMatch = fetched && fetched.traits && fetched.traits.conscientiousness === analysisData.traits.conscientiousness;
    console.log('[TEST-ENCRYPTED-ML] match:', !!okMatch);

    process.exit(ok && saved && okMatch ? 0 : 1);
  } catch (e) {
    console.error('[TEST-ENCRYPTED-ML] error:', e && e.message);
    process.exit(1);
  }
})();


