// api/ck-category-map.js
// GET: { map: { [ckToken]: "ledger category" }, savedAt }
// PUT { map: {...} }: { ok, savedAt }
// Auth required (x-google-token or x-app-password).
//
// Storage: derives a household-scoped key from auth.storageKey, same pattern
// as api/account-aliases.js / api/account-map.js / api/config.js but with the
// ":ckcategorymap" suffix.
// "portfolio:<scope>:<hash>:holdings" -> "household:<scope>:<hash>:ckcategorymap"

import { getRedis } from '../lib/redis.js';
import { authenticate } from '../lib/auth.js';

function ckCategoryMapKeyFromAuth(auth) {
  if (!auth?.storageKey) return null;
  return auth.storageKey
    .replace(/^portfolio:/, 'household:')
    .replace(/:holdings$/, ':ckcategorymap');
}

// Keep only string keys (CK category tokens) mapped to non-empty trimmed
// string values (ledger category names).
function sanitize(map) {
  const out = {};
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
  for (const [token, dest] of Object.entries(map)) {
    const t = typeof token === 'string' ? token.trim() : '';
    const d = typeof dest === 'string' ? dest.trim() : '';
    if (t && d) out[t] = d;
  }
  return out;
}

export default async function handler(req, res) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const storageKey = ckCategoryMapKeyFromAuth(auth);
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
      let map = {};
      let savedAt = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.map === 'object' && parsed.map !== null) {
            map = sanitize(parsed.map);
            savedAt = parsed.savedAt || null;
          }
        } catch {
          map = {};
        }
      }
      return res.status(200).json({ map, savedAt });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const map = body.map;
      if (!map || typeof map !== 'object' || Array.isArray(map)) {
        return res.status(400).json({ error: 'map object required' });
      }
      const clean = sanitize(map);
      const savedAt = new Date().toISOString();
      const payload = JSON.stringify({ map: clean, savedAt });
      await redis.set(storageKey, payload);
      return res.status(200).json({ ok: true, savedAt, map: clean });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('ck-category-map handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
