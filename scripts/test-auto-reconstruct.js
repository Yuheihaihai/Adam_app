#!/usr/bin/env node
// 暗号化テーブルのみ運用時の「欠落→自動再生成→取得」フローを実環境で検証

(async () => {
  try {
    const LocalML = require('../localML_postgresql');
    const ml = new LocalML();
    const userId = process.env.TEST_USER_ID || 'Ue649c876a5b17abb6dbbbb6a286c51f0';
    const mode = process.env.TEST_MODE || 'general';

    const ok = await ml.initialize();
    console.log('[TEST-AUTO-RECONSTRUCT] initialize:', ok);

    // 1回目: まだ暗号データが無い/復号不可→自動再生成が走る想定
    const first = await ml.getUserAnalysisSecure(userId, mode);
    console.log('[TEST-AUTO-RECONSTRUCT] first:', first ? 'hit' : 'miss');

    // 2回目: 直前の再生成で暗号テーブル保存済み→ヒットする想定
    const second = await ml.getUserAnalysisSecure(userId, mode);
    console.log('[TEST-AUTO-RECONSTRUCT] second:', second ? 'hit' : 'miss');
    if (second) console.log('[TEST-AUTO-RECONSTRUCT] keys:', Object.keys(second).slice(0, 10));

    process.exit(0);
  } catch (e) {
    console.error('[TEST-AUTO-RECONSTRUCT] error:', e && e.message);
    process.exit(1);
  }
})();


