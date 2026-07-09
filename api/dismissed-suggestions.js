// api/dismissed-suggestions.js
// GET: { dismissed: ["frag:...", "tok:...", "manual:...", ...], savedAt }
// PUT { dismissed: [...] }: { ok, savedAt, dismissed }
// Auth required (x-google-token or x-app-password).
//
// Storage: derives a household-scoped key from auth.storageKey, same pattern
// as api/account-aliases.js but with the ":dismissedsuggestions" suffix.
// "portfolio:<scope>:<hash>:holdings" -> "household:<scope>:<hash>:dismissedsuggestions"
//
// Persists which "Suggested rules" cards (Settings tab) the user has
// dismissed, so dismissals survive tab switches / reloads / other devices
// instead of resetting on every remount (see household-ledger.md changelog).

import { getRedis } from '../lib/redis.js';
import { authenticate } from '../lib/auth.js';

function dismissedSuggestionsKeyFromAuth(auth) {
  if (!auth?.storageKey) return null;
  return auth.storageKey
    .replace(/^portfolio:/, 'household:')
    .replace(/:holdings$/, ':dismissedsuggestions');
}

// Keep only a deduped array of non-empty trimmed strings.
function sanitize(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const clean = [];
  for (const item of list) {
    const s = typeof item === 'string' ? item.trim() : '';
    if (s && !seen.has(s)) {
      seen.add(s);
      clean.push(s);
    }
  }
  return clean;
}

export default async function handler(req, res) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const storageKey = dismissedSuggestionsKeyFromAuth(auth);
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
      let dismissed = [];
      let savedAt = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.dismissed)) {
            dismissed = sanitize(parsed.dismissed);
            savedAt = parsed.savedAt || null;
          }
        } catch {
          dismissed = [];
        }
      }
      return res.status(200).json({ dismissed, savedAt });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const dismissed = body.dismissed;
      if (!Array.isArray(dismissed)) {
        return res.status(400).json({ error: 'dismissed array required' });
      }
      const clean = sanitize(dismissed);
      const savedAt = new Date().toISOString();
      const payload = JSON.stringify({ dismissed: clean, savedAt });
      await redis.set(storageKey, payload);
      return res.status(200).json({ ok: true, savedAt, dismissed: clean });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('dismissed-suggestions handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
