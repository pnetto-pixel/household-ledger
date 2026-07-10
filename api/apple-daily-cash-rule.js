// api/apple-daily-cash-rule.js
// GET/PUT: { providerPattern, keywords: string[], destinationCategory, savedAt }
// Auth required (x-app-password).
//
// Storage: derives a household-scoped key from auth.storageKey, same pattern
// as api/ck-category-map.js but with the ":appledailycashrule" suffix.
// "portfolio:<scope>:<hash>:holdings" -> "household:<scope>:<hash>:appledailycashrule"
//
// No "enabled" flag by design: if `keywords` is empty, the rule simply never
// matches — one less piece of state to track.

import { getRedis } from '../lib/redis.js';
import { authenticate } from '../lib/auth.js';

function appleDailyCashRuleKeyFromAuth(auth) {
  if (!auth?.storageKey) return null;
  return auth.storageKey
    .replace(/^portfolio:/, 'household:')
    .replace(/:holdings$/, ':appledailycashrule');
}

function sanitize(rule) {
  const out = { providerPattern: '', keywords: [], destinationCategory: '' };
  if (!rule || typeof rule !== 'object') return out;
  out.providerPattern = typeof rule.providerPattern === 'string' ? rule.providerPattern.trim() : '';
  out.destinationCategory = typeof rule.destinationCategory === 'string' ? rule.destinationCategory.trim() : '';
  if (Array.isArray(rule.keywords)) {
    out.keywords = rule.keywords
      .map((k) => (typeof k === 'string' ? k.trim() : ''))
      .filter(Boolean);
  }
  return out;
}

export default async function handler(req, res) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const storageKey = appleDailyCashRuleKeyFromAuth(auth);
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
      let rule = {};
      let savedAt = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            rule = sanitize(parsed);
            savedAt = parsed.savedAt || null;
          }
        } catch {
          rule = {};
        }
      }
      return res.status(200).json({ rule, savedAt });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const rule = body.rule;
      if (!rule || typeof rule !== 'object') {
        return res.status(400).json({ error: 'rule object required' });
      }
      const clean = sanitize(rule);
      const savedAt = new Date().toISOString();
      const payload = JSON.stringify({ ...clean, savedAt });
      await redis.set(storageKey, payload);
      return res.status(200).json({ ok: true, savedAt, rule: clean });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('apple-daily-cash-rule handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
