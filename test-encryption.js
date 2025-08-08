#!/usr/bin/env node
/**
 * EncryptionService 検証テスト
 * - ラウンドトリップ（暗号化→復号）
 * - 改ざん検知（復号失敗を期待）
 * - 異なる鍵での復号失敗（鍵相違検知）
 * - ユーティリティの基本検証（トークン長/設定情報）
 */

const assert = require('assert');

function log(step, ok, extra) {
  const mark = ok ? '✅' : '❌';
  console.log(`${mark} ${step}${extra ? `: ${extra}` : ''}`);
}

function setTestEnv(key, salt, iterations = 20000) {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.ENCRYPTION_KEY = key;
  process.env.ENCRYPTION_SALT = salt;
  process.env.PBKDF2_ITERATIONS = String(iterations);
}

async function main() {
  try {
    // 1) 安全なテスト用キー/ソルトを設定し、モジュールをロード
    setTestEnv('TEST_KEY_' + Date.now() + '_A', 'TEST_SALT_' + Math.random().toString(36).slice(2), 20000);
    const encA = require('./encryption_utils');

    // 2) ラウンドトリップ検証
    const samples = [
      'hello world',
      '日本語テキストと絵文字🙂🚀',
      'JSON:{"user":"U0123456789abcdef0123456789abcdef","mail":"user@example.com"}',
      '長文'.repeat(1000)
    ];

    samples.forEach((plain, idx) => {
      const encrypted = encA.encrypt(plain);
      assert(encrypted && typeof encrypted === 'string', '暗号文が不正');
      const parts = encrypted.split(':');
      assert(parts.length === 3, 'フォーマット不正 (IV:AuthTag:Cipher)');
      const decrypted = encA.decrypt(encrypted);
      assert.strictEqual(decrypted, plain, `復号結果不一致 (index=${idx})`);
    });
    log('ラウンドトリップ', true);

    // 3) 改ざん検知（暗号文末尾を1文字改変）
    {
      const plain = 'tamper-test-' + Date.now();
      const encrypted = encA.encrypt(plain);
      const tampered = encrypted.slice(0, -1) + (encrypted.slice(-1) === '0' ? '1' : '0');
      const dec = encA.decrypt(tampered);
      assert.strictEqual(dec, null, '改ざんデータが復号できてしまいました');
      log('改ざん検知（復号失敗）', true);
    }

    // 4) 鍵相違検知（別鍵インスタンスで復号）
    {
      const plain = 'wrong-key-test-' + Date.now();
      const encrypted = encA.encrypt(plain);

      // 別の鍵/ソルトで再ロード
      delete require.cache[require.resolve('./encryption_utils')];
      setTestEnv('TEST_KEY_' + Date.now() + '_B', 'TEST_SALT_' + Math.random().toString(36).slice(2), 20000);
      const encB = require('./encryption_utils');

      const decWrong = encB.decrypt(encrypted);
      assert.strictEqual(decWrong, null, '鍵相違でも復号できてしまいました');
      log('鍵相違検知（復号失敗）', true);

      // 元のキーに戻して以降の検証も安定させる
      delete require.cache[require.resolve('./encryption_utils')];
      setTestEnv('TEST_KEY_' + Date.now() + '_A2', 'TEST_SALT_' + Math.random().toString(36).slice(2), 20000);
      // eslint-disable-next-line no-unused-vars
      const _encA2 = require('./encryption_utils');
    }

    // 5) ユーティリティ検証
    {
      const enc = require('./encryption_utils');
      const token = enc.generateSecureToken();
      assert(/^[0-9a-f]+$/.test(token), 'トークンはhexである必要があります');
      assert.strictEqual(token.length, 64, 'デフォルト32バイトはHEXで64文字のはず');

      const info = enc.getEncryptionInfo();
      assert.strictEqual(info.algorithm, 'aes-256-gcm', 'アルゴリズム不一致');
      assert.strictEqual(info.keyDerivation, 'PBKDF2-SHA256', 'KDF不一致');
      assert(info.iterations >= 10000, 'PBKDF2_ITERATIONSが弱すぎます');
      log('ユーティリティ検証（トークン/設定情報）', true);
    }

    console.log('\n🎉 全テスト成功');
    process.exit(0);
  } catch (err) {
    console.error('\n💥 テスト失敗:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

main();


