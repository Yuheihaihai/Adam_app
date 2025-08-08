// services.js - Loader for service registry (scalable to 1000+ entries)
const fs = require('fs');
const path = require('path');

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

function loadServices() {
  const defaultDir = path.join(__dirname, 'data', 'services');
  const extraDirs = (process.env.SERVICES_DIRS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const searchDirs = [defaultDir, ...extraDirs];
  const idToService = new Map();

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

module.exports = loadServices();