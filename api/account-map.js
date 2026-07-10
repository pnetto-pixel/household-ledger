// api/account-map.js
// GET: { map: { [accountURN]: "Friendly Account" }, savedAt }
// PUT { map: {...} }: { ok, savedAt }
// Auth required (x-app-password).
//
// Storage: derives a household-scoped key from auth.storageKey, same pattern
// as api/budgets.js but with the ":accountmap" suffix.
// "portfolio:<scope>:<hash>:holdings" -> "household:<scope>:<hash>:accountmap"

import { getRedis } from '../lib/redis.js';
import { authenticate } from '../lib/auth.js';

function accountMapKeyFromAuth(auth) {
  if (!auth?.storageKey) return null;
  return auth.storageKey
    .replace(/^portfolio:/, 'household:')
    .replace(/:holdings$/, ':accountmap');
}

export default async function handler(req, res) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const storageKey = accountMapKeyFromAuth(auth);
  if (!storageKey) {
    return res.status(500).json({ error: 'No storage key derived' });
  }

  let redis;
  try {
    redis = getRedis();
  } catch (err) {
    return res.status(503).json({ error: `Storage unavailable: ${err.message}` });
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
            map = parsed.map;
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
      const savedAt = new Date().toISOString();
      const payload = JSON.stringify({ map, savedAt });
      await redis.set(storageKey, payload);
      return res.status(200).json({ ok: true, savedAt });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('account-map handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
