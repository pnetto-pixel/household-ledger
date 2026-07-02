// api/account-aliases.js
// GET: { aliases: { [accountName]: ["fragment", ...] }, savedAt }
// PUT { aliases: {...} }: { ok, savedAt }
// Auth required (x-google-token or x-app-password).
//
// Storage: derives a household-scoped key from auth.storageKey, same pattern
// as api/account-map.js / api/config.js but with the ":accountaliases" suffix.
// "portfolio:<scope>:<hash>:holdings" -> "household:<scope>:<hash>:accountaliases"

import { getRedis } from '../lib/redis.js';
import { authenticate } from '../lib/auth.js';

function accountAliasesKeyFromAuth(auth) {
  if (!auth?.storageKey) return null;
  return auth.storageKey
    .replace(/^portfolio:/, 'household:')
    .replace(/:holdings$/, ':accountaliases');
}

// Keep only string keys mapped to deduped arrays of non-empty trimmed
// lowercase fragment strings.
function sanitize(aliases) {
  const out = {};
  if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) return out;
  for (const [account, frags] of Object.entries(aliases)) {
    const acc = typeof account === 'string' ? account.trim() : '';
    if (!acc || !Array.isArray(frags)) continue;
    const seen = new Set();
    const clean = [];
    for (const f of frags) {
      const s = typeof f === 'string' ? f.trim().toLowerCase() : '';
      if (s && !seen.has(s)) {
        seen.add(s);
        clean.push(s);
      }
    }
    out[acc] = clean;
  }
  return out;
}

export default async function handler(req, res) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const storageKey = accountAliasesKeyFromAuth(auth);
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
      let aliases = {};
      let savedAt = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.aliases === 'object' && parsed.aliases !== null) {
            aliases = sanitize(parsed.aliases);
            savedAt = parsed.savedAt || null;
          }
        } catch {
          aliases = {};
        }
      }
      return res.status(200).json({ aliases, savedAt });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const aliases = body.aliases;
      if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) {
        return res.status(400).json({ error: 'aliases object required' });
      }
      const clean = sanitize(aliases);
      const savedAt = new Date().toISOString();
      const payload = JSON.stringify({ aliases: clean, savedAt });
      await redis.set(storageKey, payload);
      return res.status(200).json({ ok: true, savedAt, aliases: clean });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('account-aliases handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
