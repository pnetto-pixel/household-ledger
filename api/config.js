// api/config.js
// GET: { config: { accounts: [...], expenseCategories: [...], incomeCategories: [...] }, savedAt }
// PUT { config: {...} }: { ok, savedAt }
// Auth required (x-google-token or x-app-password).
//
// Storage: derives a household-scoped key from auth.storageKey, same pattern
// as api/budgets.js but with the ":config" suffix.
// "portfolio:<scope>:<hash>:holdings" -> "household:<scope>:<hash>:config"

import { getRedis } from '../lib/redis.js';
import { authenticate } from '../lib/auth.js';

function configKeyFromAuth(auth) {
  if (!auth?.storageKey) return null;
  return auth.storageKey
    .replace(/^portfolio:/, 'household:')
    .replace(/:holdings$/, ':config');
}

const LIST_KEYS = ['accounts', 'expenseCategories', 'incomeCategories'];

// Keep only the known list fields, each a deduped array of non-empty strings.
function sanitize(config) {
  const out = {};
  for (const key of LIST_KEYS) {
    const arr = config?.[key];
    if (!Array.isArray(arr)) continue;
    const seen = new Set();
    const clean = [];
    for (const v of arr) {
      const s = typeof v === 'string' ? v.trim() : '';
      if (s && !seen.has(s)) {
        seen.add(s);
        clean.push(s);
      }
    }
    out[key] = clean;
  }
  return out;
}

export default async function handler(req, res) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const storageKey = configKeyFromAuth(auth);
  if (!storageKey) {
    return res.status(500).json({ error: 'No storage key derived' });
  }

  let redis;
  try {
    redis = getRedis();
  } catch (err) {
    return res.status(503).json({ error: `Storage unavailable: ${err.message}` });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-google-token, x-app-password');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    if (req.method === 'GET') {
      const raw = await redis.get(storageKey);
      let config = {};
      let savedAt = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.config === 'object' && parsed.config !== null) {
            config = sanitize(parsed.config);
            savedAt = parsed.savedAt || null;
          }
        } catch {
          config = {};
        }
      }
      return res.status(200).json({ config, savedAt });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const config = body.config;
      if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return res.status(400).json({ error: 'config object required' });
      }
      const clean = sanitize(config);
      const savedAt = new Date().toISOString();
      const payload = JSON.stringify({ config: clean, savedAt });
      await redis.set(storageKey, payload);
      return res.status(200).json({ ok: true, savedAt, config: clean });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('config handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
