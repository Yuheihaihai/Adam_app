#!/usr/bin/env node
/**
 * Import chat history from Airtable into PostgreSQL user_messages with current encryption.
 * - Reads from Airtable REST API (no extra deps needed beyond axios)
 * - Encrypts content using encryption_utils (AES-256-GCM current key)
 * - Hashes user_id via userIsolationGuard to match current schema
 * - Preserves original timestamp/role/mode/message_type/message_id when available
 * - Best-effort dedupe: checks existing by message_id, else by (user,timestamp±2s,role)
 *
 * Env:
 *   AIRTABLE_API_KEY           (required)
 *   AIRTABLE_BASE_ID           (required)
 *   AIRTABLE_TABLE             (required)
 *   AIRTABLE_VIEW              (optional)
 *   AIRTABLE_FILTER_FORMULA    (optional, e.g. "{user_id}='Uxxxx'" )
 *   DATABASE_URL               (required)
 *   ENCRYPTION_KEY / ENCRYPTION_SALT (required)
 *
 * Usage:
 *   NODE_ENV=production DATABASE_URL=... ENCRYPTION_KEY=... ENCRYPTION_SALT=... \
 *   AIRTABLE_API_KEY=... AIRTABLE_BASE_ID=... AIRTABLE_TABLE=... \
 *   node scripts/import_airtable_to_postgres.js --batch 100 --limit 500 --dry-run
 *
 *   ...add --execute to insert
 */
const axios = require('axios');
const crypto = require('crypto');
const { Pool } = require('pg');
const path = require('path');

const encryptionService = require(path.resolve(__dirname, '../encryption_utils'));
const { userIsolationGuard } = require(path.resolve(__dirname, '../user_isolation_verification'));

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { batch: 100, limit: null, execute: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--batch') out.batch = parseInt(args[++i], 10);
    else if (a === '--limit') out.limit = parseInt(args[++i], 10);
    else if (a === '--execute') out.execute = true;
    else if (a === '--dry-run') out.execute = false;
  }
  return out;
}

function assertEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`[import] Missing env ${name}`);
  return v;
}

function normalizeRecordFields(fields) {
  // Flexible mapping: try common variants, fallback to undefined
  const pick = (keys) => keys.map(k => fields[k]).find(v => v !== undefined);
  return {
    userId: pick(['user_id', 'User ID', 'userId', 'line_user_id', 'lineUserId']),
    content: pick(['content', 'message', 'text', 'Content']),
    role: pick(['role', 'sender_role', 'Role']) || 'user',
    timestamp: pick(['timestamp', 'created_at', 'time', 'Timestamp']),
    mode: pick(['mode', 'Mode']) || 'general',
    messageType: pick(['message_type', 'messageType', 'type']) || 'text',
    messageId: pick(['message_id', 'messageId', 'Message ID']) || null,
  };
}

function sha256Hex(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

async function fetchAirtableAll({ apiKey, baseId, table, view, filter, batch, limit }) {
  const out = [];
  let offset = undefined;
  const headers = { Authorization: `Bearer ${apiKey}` };
  const baseUrl = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`;
  do {
    const params = {};
    if (view) params.view = view;
    if (filter) params.filterByFormula = filter;
    if (offset) params.offset = offset;
    params.pageSize = Math.min(batch, 100);
    const { data } = await axios.get(baseUrl, { headers, params, timeout: 30000 });
    if (Array.isArray(data.records)) {
      out.push(...data.records);
    }
    offset = data.offset;
    if (limit && out.length >= limit) {
      return out.slice(0, limit);
    }
  } while (offset);
  return out;
}

async function main() {
  const { batch, limit, execute } = parseArgs();
  const apiKey = assertEnv('AIRTABLE_API_KEY');
  const baseId = assertEnv('AIRTABLE_BASE_ID');
  const table = assertEnv('AIRTABLE_TABLE');
  const view = process.env.AIRTABLE_VIEW || undefined;
  const filter = process.env.AIRTABLE_FILTER_FORMULA || undefined;
  const databaseUrl = assertEnv('DATABASE_URL');

  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    console.log(`[import] Fetching from Airtable: base=${baseId} table=${table} view=${view || '-'} filter=${filter || '-'}`);
    const records = await fetchAirtableAll({ apiKey, baseId, table, view, filter, batch, limit });
    console.log(`[import] Retrieved ${records.length} records from Airtable`);

    let toInsert = 0, inserted = 0, skipped = 0;
    for (const rec of records) {
      const f = normalizeRecordFields(rec.fields || {});
      if (!f.userId || !f.content || !f.timestamp) { skipped++; continue; }
      // Verify user id integrity
      await userIsolationGuard.verifyUserIdIntegrity(f.userId, 'airtable_import', { messageId: f.messageId });
      const hashedUserId = userIsolationGuard.generateSecureHashedUserId(f.userId);
      const when = new Date(f.timestamp);
      if (isNaN(when.getTime())) { skipped++; continue; }

      // Dedupe: prefer message_id, else time proximity + role
      let exists = false;
      if (f.messageId) {
        const ex = await client.query(
          'SELECT 1 FROM user_messages WHERE user_id=$1 AND message_id=$2 LIMIT 1',
          [hashedUserId, String(f.messageId)]
        );
        exists = ex.rowCount > 0;
      }
      if (!exists) {
        const ex = await client.query(
          `SELECT 1 FROM user_messages 
             WHERE user_id=$1 AND role=$2 
               AND timestamp BETWEEN to_timestamp($3/1000.0)-interval '2 seconds' 
                               AND to_timestamp($3/1000.0)+interval '2 seconds'
             LIMIT 1`,
          [hashedUserId, f.role, when.getTime()]
        );
        exists = ex.rowCount > 0;
      }
      if (exists) { skipped++; continue; }

      const encrypted = encryptionService.encrypt(String(f.content));
      if (!encrypted) { skipped++; continue; }

      toInsert++;
      if (execute) {
        await client.query(
          `INSERT INTO user_messages (user_id, message_id, content, role, mode, message_type, timestamp)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [hashedUserId, f.messageId, encrypted, f.role, f.mode, f.messageType, when]
        );
        inserted++;
      }
    }

    console.log(JSON.stringify({ source_records: records.length, candidate_inserts: toInsert, inserted, skipped }));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('[import] failed:', err.message);
  process.exit(1);
});


