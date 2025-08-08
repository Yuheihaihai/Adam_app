#!/usr/bin/env node
/**
 * live-track.js
 * 
 * Purpose: Tail Heroku logs and live-filter events for a specific LINE userId.
 * No external deps. Uses Heroku CLI under the hood.
 *
 * Usage:
 *   node scripts/live-track.js --app <heroku-app-name> --user <LINE_USER_ID>
 *   node scripts/live-track.js --app adam-app-cloud-v2-4 --user Ue649c876a5b17abb6dbbbb6a286c51f0
 *
 * Optional:
 *   --extra "comma,separated,terms"  (additional substring filters)
 *   --all  (show all lines, but highlight matched ones)
 */

const { spawn } = require('child_process');

function parseArgs(argv) {
  const args = { extra: [], all: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--app') args.app = argv[++i];
    else if (a === '--user') args.user = argv[++i];
    else if (a === '--extra') args.extra = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--all') args.all = true;
  }
  return args;
}

function color(text, code) { return `\u001b[${code}m${text}\u001b[0m`; }
const c = {
  dim: (s) => color(s, '2'),
  gray: (s) => color(s, '90'),
  green: (s) => color(s, '32'),
  cyan: (s) => color(s, '36'),
  yellow: (s) => color(s, '33'),
  magenta: (s) => color(s, '35'),
  red: (s) => color(s, '31'),
  bold: (s) => color(s, '1'),
};

function buildFilters(userId, extraTerms) {
  const baseTerms = [
    'Webhook was called',
    'メッセージ処理開始',
    'Checking message for mode',
    '選択されたモード',
    'Attempting primary model',
    'Primary model returned empty response',
    'Falling back to Claude',
    'AI応答生成完了',
    '会話履歴の保存成功',
    '音声応答生成開始',
    '監視開始',
    '監視完了',
    'レスポンス長',
    'Retrieved', // history fetch logs
    'SECURE-QUERY',
    'USER-ISOLATION',
  ];
  const set = new Set([`"userId": "${userId}"`, ...baseTerms, ...extraTerms]);
  return Array.from(set).filter(Boolean);
}

function highlight(line) {
  if (line.includes('"userId"')) return c.cyan(line);
  if (line.includes('メッセージ処理開始')) return c.green(line);
  if (line.includes('選択されたモード') || line.includes('Checking message for mode')) return c.green(line);
  if (line.includes('Attempting primary model')) return c.yellow(line);
  if (line.includes('Primary model returned empty response')) return c.magenta(line);
  if (line.includes('Falling back to Claude')) return c.magenta(line);
  if (line.includes('AI応答生成完了')) return c.green(line);
  if (line.includes('会話履歴の保存成功')) return c.cyan(line);
  if (line.includes('音声応答生成開始')) return c.cyan(line);
  if (line.includes('レスポンス長')) return c.yellow(line);
  if (line.includes('監視開始') || line.includes('監視完了')) return c.gray(line);
  return line;
}

async function main() {
  const { app, user, extra, all } = parseArgs(process.argv);
  if (!app || !user) {
    console.error('Usage: node scripts/live-track.js --app <app> --user <LINE_USER_ID> [--extra "a,b,c"] [--all]');
    process.exit(1);
  }

  const filters = buildFilters(user, extra);
  console.log(c.bold(`Live tracking started for app=${app}, user=${user}`));
  console.log(c.dim(`Filters: ${filters.join(' | ')}`));

  const child = spawn('heroku', ['logs', '--app', app, '--tail'], { stdio: ['ignore', 'pipe', 'pipe'] });

  const idPrefix = user.slice(0, 8);

  function colorizeUserIds(s) {
    // 強調: フルID と 先頭8文字+... の両方を着色
    let out = s.replaceAll(user, c.bold(c.cyan(user)));
    const masked = idPrefix + '...';
    out = out.replaceAll(masked, c.bold(c.cyan(masked)));
    // JSON形式のキー表記
    out = out.replaceAll(`"userId": "${user}"`, c.bold(c.cyan(`"userId": "${user}"`)));
    // ラベル付き（UserID: ...）
    out = out.replaceAll(`UserID: ${idPrefix}...`, `UserID: ${c.bold(c.cyan(masked))}`);
    // 日本語の「ユーザー: 」表記
    out = out.replaceAll(`ユーザー: ${user}`, `ユーザー: ${c.bold(c.cyan(user))}`);
    out = out.replaceAll(`ユーザー: ${idPrefix}...`, `ユーザー: ${c.bold(c.cyan(masked))}`);
    return out;
  }

  function processLine(raw) {
    const line = raw.toString('utf8').replace(/\n+$/, '');
    if (!line) return;
    const isMatch = filters.some(t => line.includes(t));
    if (all || isMatch) {
      const base = isMatch ? highlight(line) : c.dim(line);
      const out = colorizeUserIds(base);
      process.stdout.write(out + '\n');
    }
  }

  // Split stream by lines
  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      processLine(line);
    }
  });

  child.stderr.on('data', (d) => {
    const msg = d.toString('utf8');
    if (!msg.trim()) return;
    process.stderr.write(c.red(msg));
  });

  const shutdown = () => {
    console.log(c.dim('\nStopping live tracking...'));
    try { child.kill('SIGINT'); } catch (_) {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('Fatal:', e && e.message ? e.message : e);
  process.exit(1);
});


