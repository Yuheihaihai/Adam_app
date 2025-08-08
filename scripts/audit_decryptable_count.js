#!/usr/bin/env node
/**
 * Audit total message counts and decryptable counts using current encryption key.
 * - Counts rows in user_messages and user_messages_pre_encryption_backup
 * - Iterates user_messages in batches, tests ciphertext shape and actual decryption
 * - Outputs JSON summary to stdout (no sensitive data)
 *
 * Usage:
 *   DATABASE_URL=... ENCRYPTION_KEY=... ENCRYPTION_SALT=... NODE_ENV=production \
 *   node scripts/audit_decryptable_count.js --batch 5000
 */
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { batch: 5000, maxRows: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--batch') out.batch = parseInt(args[++i], 10);
    else if (a === '--max') out.maxRows = parseInt(args[++i], 10);
  }
  return out;
}

async function main() {
  const { batch, maxRows } = parseArgs();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[audit] DATABASE_URL is required');
    process.exit(1);
  }

  // Lazy-load encryption service after env validation
  const encryptionService = require(path.resolve(__dirname, '../encryption_utils'));

  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const [{ total_user_messages }] = (await client.query('SELECT COUNT(*)::bigint AS total_user_messages FROM user_messages')).rows;
    let total_backup = 0n;
    try {
      const r = await client.query('SELECT COUNT(*)::bigint AS total FROM user_messages_pre_encryption_backup');
      total_backup = BigInt(r.rows[0].total);
    } catch (e) {
      // backup table may not exist in some envs
      total_backup = 0n;
    }

    const totalUserMessages = BigInt(total_user_messages);

    // Iterate user_messages to check decryptability
    let lastId = 0;
    let processed = 0n;
    let encryptedShape = 0n;
    let decryptSuccess = 0n;
    let decryptFail = 0n;
    let plaintext = 0n;

    const encryptedPattern = /^[0-9a-fA-F]{32}:[0-9a-fA-F]{32}:(?:[0-9a-fA-F]{2})+$/; // iv:authTag:cipherHex

    while (true) {
      const limit = batch;
      const rows = (await client.query(
        'SELECT id, content FROM user_messages WHERE id > $1 ORDER BY id ASC LIMIT $2',
        [lastId, limit]
      )).rows;
      if (rows.length === 0) break;

      for (const row of rows) {
        processed++;
        const content = row.content;
        if (typeof content === 'string' && encryptedPattern.test(content)) {
          encryptedShape++;
          const dec = encryptionService.decrypt(content);
          if (dec !== null) decryptSuccess++; else decryptFail++;
        } else {
          plaintext++;
        }
        lastId = row.id;
        if (maxRows !== null && processed >= BigInt(maxRows)) {
          lastId = Number.MAX_SAFE_INTEGER; // force break next loop
          break;
        }
      }

      if (rows.length < limit) break;
      if (maxRows !== null && processed >= BigInt(maxRows)) break;
    }

    const summary = {
      total_user_messages: Number(totalUserMessages),
      total_backup_messages: Number(total_backup),
      total_all_messages: Number(totalUserMessages + total_backup),
      scanned_user_messages: Number(processed),
      ciphertext_shape_count: Number(encryptedShape),
      decrypt_success_count: Number(decryptSuccess),
      decrypt_fail_count: Number(decryptFail),
      plaintext_count: Number(plaintext)
    };

    console.log(JSON.stringify(summary));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('[audit] failed:', err.message);
  process.exit(1);
});


