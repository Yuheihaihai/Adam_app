// services.js - Loader for service registry (DB優先・JSONフォールバック)
const fs = require('fs');
const path = require('path');
const db = require('./db');

function readJsonFileSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[services] Failed to read ${filePath}: ${error.message}`);
    return null;
  }
}

function isValidService(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (!obj.id || !obj.name || !obj.url || !obj.description) return false;
  if (!obj.criteria || typeof obj.criteria !== 'object') return false;
  if (!Array.isArray(obj.tags)) return false;
  return true;
}

function normalizeService(obj) {
  const normalized = { ...obj };
  if (typeof normalized.cooldown_days !== 'number') {
    normalized.cooldown_days = 14;
  }
  return normalized;
}

async function loadServicesAsync() {
  const defaultDir = path.join(__dirname, 'data', 'services');
  const extraDirs = (process.env.SERVICES_DIRS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const searchDirs = [defaultDir, ...extraDirs];
  const idToService = new Map();

  // 1) DBから読み込み（成功すればそれを返す）
  try {
    const dbServices = await db.fetchAllServicesFromDB();
    if (Array.isArray(dbServices) && dbServices.length > 0) {
      for (const entry of dbServices) {
        if (!isValidService(entry)) continue;
        idToService.set(entry.id, normalizeService(entry));
      }
      return Array.from(idToService.values());
    }
  } catch (error) {
    console.warn('[services] DB fetch failed, falling back to JSON:', error.message);
  }

  // 2) フォールバック: JSONから集約
  for (const dir of searchDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      // Sort files lexicographically so later files can override earlier ones if needed
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
      for (const file of files) {
        const full = path.join(dir, file);
        const data = readJsonFileSafe(full);
        if (!data) continue;
        const list = Array.isArray(data) ? data : (Array.isArray(data.services) ? data.services : []);
        for (const entry of list) {
          if (!isValidService(entry)) continue;
          // Last-win policy: later files override earlier definitions
          idToService.set(entry.id, normalizeService(entry));
        }
      }
    } catch (error) {
      console.warn(`[services] Failed to scan dir ${dir}: ${error.message}`);
    }
  }

  const aggregated = Array.from(idToService.values());
  if (aggregated.length === 0) {
    console.warn('[services] No services loaded from JSON. Returning empty list.');
  }
  return aggregated;
}

module.exports = (function() {
  // 同期的に読み込む従来のrequire互換のため、即時起動して結果をキャッシュ
  // DB優先のため、初期呼び出し時は非同期→同期問題を避けるため即時フォールバックし、
  // 後続でDB結果が取れたらグローバルを書き換える戦略も可能だが、ここでは簡潔に同期返却。
  // サーバー起動時にdb.initializeTables後の経路では、別箇所で直接db経由の取得を推奨。
  try {
    // ベストエフォートで同期フォールバック
    const defaultDir = path.join(__dirname, 'data', 'services');
    const files = fs.existsSync(defaultDir) ? fs.readdirSync(defaultDir).filter(f => f.endsWith('.json')).sort() : [];
    const idToService = new Map();
    for (const file of files) {
      const full = path.join(defaultDir, file);
      const data = readJsonFileSafe(full);
      const list = Array.isArray(data) ? data : (Array.isArray(data.services) ? data.services : []);
      for (const entry of list) {
        if (!isValidService(entry)) continue;
        idToService.set(entry.id, normalizeService(entry));
      }
    }
    return Array.from(idToService.values());
  } catch (_) {
    return [];
  }
})();

// 追加エクスポート: 非同期DB優先ローダ
module.exports.loadServicesAsync = loadServicesAsync;