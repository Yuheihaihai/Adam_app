#!/usr/bin/env node
/**
 * Archive and delete undecryptable rows from user_messages.
 * - Creates archive table user_messages_unrecoverable if not exists
 * - Scans user_messages in batches, tests decryptability with current key
 * - Moves rows with decrypt failure into archive (full row copy) then deletes from main
 * - Dry-run by default; use --execute to apply changes
 *
 * Usage:
 *   NODE_ENV=production DATABASE_URL=... ENCRYPTION_KEY=... ENCRYPTION_SALT=... \
 *   node scripts/cleanup_undecryptable.js --batch 5000 --dry-run
 *
 *   ...add --execute to actually move+delete
 */
const { Pool } = require('pg');
const path = require('path');

const encryptionService = require(path.resolve(__dirname, '../encryption_utils'));

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { batch: 5000, execute: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--batch') out.batch = parseInt(args[++i], 10);
    else if (a === '--execute') out.execute = true;
    else if (a === '--dry-run') out.execute = false;
  }
  return out;
}

async function ensureArchiveTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_messages_unrecoverable (
      id SERIAL PRIMARY KEY,
      original_id INTEGER,
      user_id VARCHAR(255) NOT NULL,
      message_id VARCHAR(255),
      content TEXT NOT NULL,
      role VARCHAR(50) NOT NULL,
      timestamp TIMESTAMP NOT NULL,
      mode VARCHAR(50),
      message_type VARCHAR(50),
      zk_proof TEXT,
      deletion_scheduled_at TIMESTAMP,
      privacy_level INTEGER,
      e2ee_key_id VARCHAR(255),
      archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function main() {
  const { batch, execute } = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[cleanup] DATABASE_URL is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await ensureArchiveTable(client);
    const encryptedPattern = /^[0-9a-fA-F]{32}:[0-9a-fA-F]{32}:(?:[0-9a-fA-F]{2})+$/;

    let lastId = 0;
    let scanned = 0, failures = 0, moved = 0, deleted = 0;

    while (true) {
      const rows = (await client.query(
        'SELECT * FROM user_messages WHERE id > $1 ORDER BY id ASC LIMIT $2',
        [lastId, batch]
      )).rows;
      if (rows.length === 0) break;

      for (const row of rows) {
        scanned++;
        lastId = row.id;
        const content = row.content;
        const isCipher = typeof content === 'string' && encryptedPattern.test(content);
        if (!isCipher) continue; // plaintextは対象外
        const dec = encryptionService.decrypt(content);
        if (dec !== null) continue; // decryptable: keep

        failures++;
        if (execute) {
          // move to archive table inside a transaction
          await client.query('BEGIN');
          try {
            await client.query(
              `INSERT INTO user_messages_unrecoverable
                 (original_id, user_id, message_id, content, role, timestamp, mode, message_type, zk_proof, deletion_scheduled_at, privacy_level, e2ee_key_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
              [row.id, row.user_id, row.message_id, row.content, row.role, row.timestamp, row.mode, row.message_type, row.zk_proof, row.deletion_scheduled_at, row.privacy_level, row.e2ee_key_id]
            );
            moved++;
            await client.query('DELETE FROM user_messages WHERE id=$1', [row.id]);
            deleted++;
            await client.query('COMMIT');
          } catch (e) {
            await client.query('ROLLBACK');
            throw e;
          }
        }
      }
    }

    console.log(JSON.stringify({ scanned, decrypt_failures: failures, archived: moved, deleted }));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error('[cleanup] failed:', err.message); process.exit(1); });


