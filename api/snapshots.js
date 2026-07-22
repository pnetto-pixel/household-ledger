// api/snapshots.js
// GET:            { snapshots: [ "YYYY-MM-DD", ... ] }   (newest first)
// GET ?date=...:  { date, transactions, savedAt, count }
// Auth required (x-app-password). Read-only — restoring goes through the
// normal client restore flow (PUT /api/transactions), so optimistic
// concurrency and server-side validation still apply.
//
// Snapshots are written by api/transactions.js on the first successful PUT
// of each UTC day under "<transactionsKey>:snapshot:YYYY-MM-DD" (TTL 7d).
// This endpoint only lists/reads them for the Settings UI.

import { getRedis } from '../lib/redis.js';
import { authenticate } from '../lib/auth.js';

function transactionsKeyFromAuth(auth) {
  if (!auth?.storageKey) return null;
  return auth.storageKey
    .replace(/^portfolio:/, 'household:')
    .replace(/:holdings$/, ':transactions');
}

export default async function handler(req, res) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const baseKey = transactionsKeyFromAuth(auth);
  if (!baseKey) {
    return res.status(500).json({ error: 'No storage key derived' });
  }

  let redis;
  try {
    redis = getRedis();
  } catch (err) {
    return res.status(503).json({ error: `Storage unavailable: ${err.message}` });
  }

  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const date =
      new URL(req.url || '', 'http://localhost').searchParams.get('date') || '';
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Invalid date' });
      }
      const raw = await redis.get(`${baseKey}:snapshot:${date}`);
      if (!raw) return res.status(404).json({ error: 'Snapshot not found' });
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return res.status(500).json({ error: 'Snapshot is corrupted' });
      }
      const transactions = Array.isArray(parsed?.transactions) ? parsed.transactions : [];
      return res.status(200).json({
        date,
        transactions,
        savedAt: parsed?.savedAt || null,
        count: transactions.length,
      });
    }

    // List available snapshot dates. TTL caps this at ~7 keys per user, so
    // KEYS on the exact prefix is fine here.
    const keys = await redis.keys(`${baseKey}:snapshot:*`);
    const snapshots = keys
      .map((k) => k.slice(k.lastIndexOf(':') + 1))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort((a, b) => (a < b ? 1 : -1));
    return res.status(200).json({ snapshots });
  } catch (err) {
    console.error('snapshots handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
