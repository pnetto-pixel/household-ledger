// api/budgets.js
// GET: { budgets: { [category]: number } }
// PUT { budgets: {...} }: { ok, savedAt }
// Auth required (x-google-token or x-app-password).
//
// Storage: derives a household-scoped key from auth.storageKey, same pattern
// as api/transactions.js but with the ":budgets" suffix.
// "portfolio:<scope>:<hash>:holdings" -> "household:<scope>:<hash>:budgets"

import { getRedis } from '../lib/redis.js';
import { authenticate } from '../lib/auth.js';

function budgetsKeyFromAuth(auth) {
  if (!auth?.storageKey) return null;
  return auth.storageKey
    .replace(/^portfolio:/, 'household:')
    .replace(/:holdings$/, ':budgets');
}

export default async function handler(req, res) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const storageKey = budgetsKeyFromAuth(auth);
  if (!storageKey) {
    return res.status(500).json({ error: 'No storage key derived' });
  }

  let redis;
  try {
    redis = getRedis();
  } catch (err) {
    return res.status(503).json({ error: `Storage unavailable: ${err.message}` });
  }

  // CORS headers (same approach as transactions.js — Vercel handles OPTIONS at
  // the routing level, but we set them defensively here too).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-google-token, x-app-password');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    if (req.method === 'GET') {
      const raw = await redis.get(storageKey);
      let budgets = {};
      let savedAt = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.budgets === 'object' && parsed.budgets !== null) {
            budgets = parsed.budgets;
            savedAt = parsed.savedAt || null;
          }
        } catch {
          budgets = {};
        }
      }
      return res.status(200).json({ budgets, savedAt });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const budgets = body.budgets;
      if (!budgets || typeof budgets !== 'object' || Array.isArray(budgets)) {
        return res.status(400).json({ error: 'budgets object required' });
      }
      const savedAt = new Date().toISOString();
      const payload = JSON.stringify({ budgets, savedAt });
      await redis.set(storageKey, payload);
      return res.status(200).json({ ok: true, savedAt });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('budgets handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
