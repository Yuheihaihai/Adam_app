#!/usr/bin/env node
/**
 * Repair user_messages content encryption in-place.
 * - Encrypt plaintext rows with current key
 * - Optionally decrypt with legacy key then re-encrypt with current key (requires LEGACY envs)
 *
 * Usage:
 *   DATABASE_URL=... node scripts/repair_user_messages.js --user Uxxxxxxxx --limit 500 --dry-run
 *   DATABASE_URL=... ENCRYPTION_KEY=... ENCRYPTION_SALT=... LEGACY_ENCRYPTION_KEY=... LEGACY_ENCRYPTION_SALT=... node scripts/repair_user_messages.js --execute
 */
const { Pool } = require('pg');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { dryRun: false, execute: false, user: null, limit: 1000, restoreFromBackup: false, toleranceSeconds: 600 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--execute') out.execute = true;
    else if (a === '--user') out.user = args[++i];
    else if (a === '--limit') out.limit = parseInt(args[++i], 10);
    else if (a === '--restore-from-backup') out.restoreFromBackup = true;
    else if (a === '--tolerance-seconds') out.toleranceSeconds = parseInt(args[++i], 10);
  }
  return out;
}

function loadEncryptionServiceWithEnv(envOverrides) {
  // Load fresh instance of encryption_utils with given env settings
  const modulePath = path.resolve(__dirname, '../encryption_utils.js');
  // Temporarily override env
  const saved = { ENCRYPTION_KEY: process.env.ENCRYPTION_KEY, ENCRYPTION_SALT: process.env.ENCRYPTION_SALT, PBKDF2_ITERATIONS: process.env.PBKDF2_ITERATIONS, NODE_ENV: process.env.NODE_ENV };
  try {
    if (envOverrides) {
      Object.entries(envOverrides).forEach(([k, v]) => { if (v !== undefined) process.env[k] = String(v); });
    }
    delete require.cache[modulePath];
    return require('../encryption_utils');
  } finally {
    // restore env
    Object.entries(saved).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  }
}

async function main() {
  const opts = parseArgs();
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const currentEnc = require('../encryption_utils');

  const hasLegacy = !!process.env.LEGACY_ENCRYPTION_KEY && !!process.env.LEGACY_ENCRYPTION_SALT;
  let legacyEnc = null;
  if (hasLegacy) {
    legacyEnc = loadEncryptionServiceWithEnv({ ENCRYPTION_KEY: process.env.LEGACY_ENCRYPTION_KEY, ENCRYPTION_SALT: process.env.LEGACY_ENCRYPTION_SALT, NODE_ENV: 'production' });
  }

  const encryptedPattern = /^[0-9a-fA-F]{32}:[0-9a-fA-F]{32}:(?:[0-9a-fA-F]{2})+$/;

  const client = await pool.connect();
  try {
    const whereUser = opts.user ? 'WHERE user_id = $1' : '';
    const params = opts.user ? [require('crypto').createHash('sha256').update(opts.user).digest('hex'), opts.limit] : [opts.limit];
    const sql = `SELECT id, user_id, message_id, role, content, e2ee_key_id, timestamp FROM user_messages ${whereUser} ORDER BY timestamp DESC LIMIT $${opts.user ? 2 : 1}`;
    const res = await client.query(sql, params);

    let cntPlain = 0, cntCurrentOK = 0, cntLegacyOK = 0, cntUnrecoverable = 0, cntRestored = 0, toUpdate = [];
    const unrecoverables = [];

    for (const row of res.rows) {
      const { id, content } = row;
      const isPossiblyEncrypted = typeof content === 'string' && encryptedPattern.test(content);
      if (!isPossiblyEncrypted) {
        // plaintext -> encrypt with current
        const enc = currentEnc.encrypt(content);
        if (enc) {
          cntPlain++;
          toUpdate.push({ id, newContent: enc });
        } else {
          cntUnrecoverable++;
        }
        continue;
      }
      // Try current key
      const decNow = currentEnc.decrypt(content);
      if (decNow) {
        cntCurrentOK++;
        continue; // already fine
      }
      // Try legacy if available
      if (legacyEnc) {
        const decLegacy = legacyEnc.decrypt(content);
        if (decLegacy) {
          cntLegacyOK++;
          const reenc = currentEnc.encrypt(decLegacy);
          if (reenc) {
            toUpdate.push({ id, newContent: reenc });
          } else {
            cntUnrecoverable++;
          }
          continue;
        }
      }
      cntUnrecoverable++;
      unrecoverables.push(row);
    }

    console.log(`[SCAN] rows=${res.rowCount}, plaintext=${cntPlain}, current_ok=${cntCurrentOK}, legacy_ok=${cntLegacyOK}, unrecoverable=${cntUnrecoverable}`);

    if (opts.restoreFromBackup && unrecoverables.length > 0) {
      const tol = Math.max(0, Number(opts.toleranceSeconds) || 0);
      for (const row of unrecoverables) {
        const { id, message_id, role, timestamp, user_id } = row;
        let backupContent = null;
        if (message_id) {
          const q = `SELECT content FROM user_messages_pre_encryption_backup WHERE user_id=$1 AND message_id=$2 ORDER BY timestamp DESC LIMIT 1`;
          const r = await client.query(q, [user_id, message_id]);
          if (r.rows.length > 0) backupContent = r.rows[0].content;
        }
        if (!backupContent && tol > 0) {
          const q2 = `SELECT content FROM user_messages_pre_encryption_backup WHERE user_id=$1 AND role=$2 AND timestamp BETWEEN to_timestamp($3) - interval '${tol} seconds' AND to_timestamp($3) + interval '${tol} seconds' ORDER BY ABS(EXTRACT(EPOCH FROM (timestamp - to_timestamp($3)))) ASC LIMIT 1`;
          const tsSec = Math.floor(new Date(timestamp).getTime() / 1000);
          const r2 = await client.query(q2, [user_id, role, tsSec]);
          if (r2.rows.length > 0) backupContent = r2.rows[0].content;
        }
        if (backupContent && typeof backupContent === 'string' && !encryptedPattern.test(backupContent)) {
          const reenc = currentEnc.encrypt(backupContent);
          if (reenc) {
            toUpdate.push({ id, newContent: reenc });
            cntRestored++;
          }
        }
      }
      console.log(`[RESTORE] from_backup_restored=${cntRestored}`);
    }

    if (opts.execute && toUpdate.length > 0) {
      await client.query('BEGIN');
      try {
        for (const u of toUpdate) {
          await client.query('UPDATE user_messages SET content=$1, e2ee_key_id=COALESCE(e2ee_key_id, $2) WHERE id=$3', [u.newContent, process.env.ENCRYPTION_KEY_ID || 'k_current', u.id]);
        }
        await client.query('COMMIT');
        console.log(`[UPDATE] updated=${toUpdate.length}`);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('Update failed:', e.message);
        process.exit(2);
      }
    } else {
      console.log(`[DRY-RUN] pending updates=${toUpdate.length}. Use --execute to apply.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });


