// api/cron/simplefin-sync.js
// Daily Vercel Cron entry point (see vercel.json "crons") — Phase 2 of the
// SimpleFin integration. Unlike api/simplefin-sync.js (the manual "Sync now"
// button), this endpoint is NOT triggered by the user and NEVER writes to
// the main ledger (household:*:transactions). It only appends newly seen
// transactions to a SEPARATE pending queue
// (household:<storageKey>:simplefin-pending) that the client reads and
// reviews through the exact same preview/dedup/confirm pipeline used for
// every other import — the actual PUT /api/transactions write still only
// ever happens from a manual user action.
//
// Auth: Vercel Cron Jobs send `Authorization: Bearer <CRON_SECRET>`
// automatically when the CRON_SECRET env var is configured on the project
// (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
// This is a single-tenant app (one household, one APP_PASSWORD), so instead
// of a human x-app-password header we derive the one-and-only storage key
// straight from process.env.APP_PASSWORD via the same passwordStorageKey()
// used everywhere else.

import { getRedis } from '../../lib/redis.js';
import { passwordStorageKey } from '../../lib/auth.js';
import { fetchSimplefinTransactions } from '../../lib/simplefin.js';

function pendingKeyFromAppPassword() {
  const pwd = process.env.APP_PASSWORD;
  if (!pwd) return null;
  const storageKey = passwordStorageKey(pwd); // "portfolio:pwd:<hash>:holdings"
  const householdKey = storageKey
    .replace(/^portfolio:/, 'household:')
    .replace(/:holdings$/, ':transactions');
  return `${householdKey}:simplefin-pending`;
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const expected = process.env.CRON_SECRET;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pendingKey = pendingKeyFromAppPassword();
  if (!pendingKey) {
    return res.status(500).json({ error: 'APP_PASSWORD not configured' });
  }

  const result = await fetchSimplefinTransactions();
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  let redis;
  try {
    redis = getRedis();
  } catch (err) {
    return res.status(503).json({ error: `Storage unavailable: ${err.message}` });
  }

  let existingPending = [];
  try {
    const raw = await redis.get(pendingKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.transactions)) existingPending = parsed.transactions;
    }
  } catch (err) {
    console.error('simplefin-pending read failed:', err.message);
  }

  // Append-only merge: only transactions whose id isn't already queued get
  // added. This does NOT check the already-persisted ledger (that would
  // require the client's account-map/category pipeline, which lives on the
  // client) — at minimum it guarantees the cron never queues the same
  // pending item twice across daily runs.
  const existingIds = new Set(existingPending.map((t) => t.id));
  const newOnes = result.transactions.filter((t) => !existingIds.has(t.id));
  const merged = existingPending.concat(newOnes);

  try {
    await redis.set(pendingKey, JSON.stringify({ transactions: merged, lastFetchAt: new Date().toISOString(), errors: result.errors || [] }));
  } catch (err) {
    return res.status(503).json({ error: `Failed to write pending queue: ${err.message}` });
  }

  return res.status(200).json({
    ok: true,
    fetched: result.transactions.length,
    added: newOnes.length,
    pendingTotal: merged.length,
    errors: result.errors,
  });
}
