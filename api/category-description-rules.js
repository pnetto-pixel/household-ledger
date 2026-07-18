// api/category-description-rules.js
// GET: { rules: [ { id, matchField, pattern, destinationCategory, providerPattern?, allowTransferOverride? } ], savedAt }
// PUT { rules: [...] }: { ok, savedAt, rules }
// Auth required (x-app-password).
//
// Storage: derives a household-scoped key from auth.storageKey, same pattern
// as api/ck-category-map.js / api/apple-daily-cash-rule.js but with the
// ":categorydescriptionrules" suffix.
// "portfolio:<scope>:<hash>:holdings" -> "household:<scope>:<hash>:categorydescriptionrules"
//
// Semantics: the array ORDER matters — the first rule that matches a row wins.
// A rule's destinationCategory may NEVER be "Transfer" (that would let a
// description rule "de-transfer" a row); such rules are dropped on sanitize.

import { getRedis } from '../lib/redis.js';
import { authenticate } from '../lib/auth.js';

const MATCH_FIELDS = ['description', 'provider', 'both'];
const TRANSFER = 'Transfer';

function keyFromAuth(auth) {
  if (!auth?.storageKey) return null;
  return auth.storageKey
    .replace(/^portfolio:/, 'household:')
    .replace(/:holdings$/, ':categorydescriptionrules');
}

// Drop items without a non-empty pattern OR without a non-empty
// destinationCategory; normalize matchField to one of the 3 values
// (default "both"); generate an id when missing; reject Transfer as a
// destination. Preserves array order.
//
// Optional fields (additive, back-compat): `providerPattern` (string, trimmed —
// an extra AND condition against the row's provider/account) and
// `allowTransferOverride` (boolean — when true, this rule is permitted to move
// a row OUT of Transfer on import; only ever meaningful together with a
// non-empty providerPattern). Both are only persisted when present/meaningful.
function sanitize(rules) {
  const out = [];
  if (!Array.isArray(rules)) return out;
  let n = 0;
  for (const r of rules) {
    if (!r || typeof r !== 'object') continue;
    const pattern = typeof r.pattern === 'string' ? r.pattern.trim() : '';
    const destinationCategory = typeof r.destinationCategory === 'string' ? r.destinationCategory.trim() : '';
    if (!pattern || !destinationCategory) continue;
    if (destinationCategory === TRANSFER) continue;
    const matchField = MATCH_FIELDS.includes(r.matchField) ? r.matchField : 'both';
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `r${Date.now()}${n}`;
    const clean = { id, matchField, pattern, destinationCategory };
    const providerPattern = typeof r.providerPattern === 'string' ? r.providerPattern.trim() : '';
    if (providerPattern) clean.providerPattern = providerPattern;
    // allowTransferOverride is only meaningful together with a non-empty
    // providerPattern (the client already enforces this; enforce it here too
    // so a direct API call can't create an unguarded de-transfer rule).
    if ((r.allowTransferOverride === true || r.allowTransferOverride === 'true') && providerPattern) {
      clean.allowTransferOverride = true;
    }
    out.push(clean);
    n += 1;
  }
  return out;
}

export default async function handler(req, res) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const storageKey = keyFromAuth(auth);
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
      let rules = [];
      let savedAt = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.rules)) {
            rules = sanitize(parsed.rules);
            savedAt = parsed.savedAt || null;
          }
        } catch {
          rules = [];
        }
      }
      return res.status(200).json({ rules, savedAt });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const rules = body.rules;
      if (!Array.isArray(rules)) {
        return res.status(400).json({ error: 'rules array required' });
      }
      const clean = sanitize(rules);
      const savedAt = new Date().toISOString();
      const payload = JSON.stringify({ rules: clean, savedAt });
      await redis.set(storageKey, payload);
      return res.status(200).json({ ok: true, savedAt, rules: clean });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('category-description-rules handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
