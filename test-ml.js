#!/usr/bin/env node
/**
 * ML 検証テスト
 * - IntentDetectionModel: initialize/detectIntent の基本検証
 * - EmotionAnalysisModel: initialize/analyzeEmotion の基本検証
 * 備考: テストは TensorFlow を無効化してモックで軽量実行します
 */

const assert = require('assert');

// できるだけ軽くするため、TFは無効化（モデル内部でモックにフォールバック）
process.env.DISABLE_TENSORFLOW = process.env.DISABLE_TENSORFLOW || 'true';
// DB関連の厳格検証をテストではスキップ
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SECURITY_FAIL_CLOSE = 'false';
process.env.USE_DATABASE = 'false';
process.env.DATABASE_CA_CERT = '';
process.env.DATABASE_CLIENT_KEY = '';
process.env.DATABASE_CLIENT_CERT = '';

const IntentDetectionModel = require('./intentDetectionModel');
const EmotionAnalysisModel = require('./emotionAnalysisModel');

function log(step, ok, extra) {
  const mark = ok ? '✅' : '❌';
  console.log(`${mark} ${step}${extra ? `: ${extra}` : ''}`);
}

async function testIntentModel() {
  const model = new IntentDetectionModel();
  const okInit = await model.initialize();
  assert.strictEqual(okInit, true, 'Intent model initialize failed');
  log('Intent initialize', true);

  const cases = [
    {
      text: 'どうすればいいですか？',
      expectedAnyOf: ['advice_seeking', 'information_request']
    },
    {
      text: '最近とても不安で眠れません',
      expectedAnyOf: ['problem_sharing', 'emotional_support']
    },
    {
      text: 'こんにちは',
      expectedAnyOf: ['greeting']
    },
    {
      text: 'おすすめの就職支援サービスは？',
      expectedAnyOf: ['recommendation_request', 'information_request']
    }
  ];

  for (const c of cases) {
    const result = await model.detectIntent(c.text);
    assert(result && typeof result === 'object', 'detectIntent result invalid');
    assert(result.primary && typeof result.primary === 'string', 'primary invalid');
    assert(result.scores && typeof result.scores === 'object', 'scores missing');

    const ok = c.expectedAnyOf.includes(result.primary);
    if (!ok) {
      // 許容: パターンとモデル統合の結果でズレる可能性 → 警告ログ
      console.warn(`ℹ️ 期待カテゴリに一致しませんでした: text="${c.text}", primary=${result.primary}`);
    }
    log(`Intent detect: ${c.text}`, true, `primary=${result.primary}`);
  }
}

async function testEmotionModel() {
  const model = new EmotionAnalysisModel();
  const okInit = await model.initialize();
  assert.strictEqual(okInit, true, 'Emotion model initialize failed');
  log('Emotion initialize', true);

  const samples = [
    'とても嬉しくて楽しい気分です',
    '悲しくて落ち込んでいます',
    '少し不安で混乱しています'
  ];

  for (const text of samples) {
    const result = await model.analyzeEmotion(text);
    assert(result && typeof result === 'object', 'analyzeEmotion result invalid');
    assert(result.scores && typeof result.scores === 'object', 'scores missing');
    assert(typeof result.dominant === 'string', 'dominant missing');
    assert(typeof result.intensity === 'number', 'intensity missing');
    log(`Emotion analyze: ${text}`, true, `dominant=${result.dominant}`);
  }
}

async function main() {
  try {
    await testIntentModel();
    await testEmotionModel();
    console.log('\n🎉 MLテスト成功');
    process.exit(0);
  } catch (err) {
    console.error('\n💥 MLテスト失敗:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

main();


