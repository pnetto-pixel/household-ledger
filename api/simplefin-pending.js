// api/simplefin-pending.js
// GET: read the queue of SimpleFin transactions the daily cron
// (api/cron/simplefin-sync.js) has fetched but the user hasn't reviewed yet.
// DELETE: clear the queue after the user has imported (or dismissed) it.
//
// This is a client-authenticated read/write on a SEPARATE Redis key
// (household:<storageKey>:simplefin-pending) — it never touches the main
// household:*:transactions key. Auth: same shared app password as every
// other /api/* route (x-app-password header, lib/auth.js).

import { getRedis } from '../lib/redis.js';
import { authenticate } from '../lib/auth.js';

function pendingKeyFromAuth(auth) {
  if (!auth?.storageKey) return null;
  const householdKey = auth.storageKey
    .replace(/^portfolio:/, 'household:')
    .replace(/:holdings$/, ':transactions');
  return `${householdKey}:simplefin-pending`;
}

export default async function handler(req, res) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const pendingKey = pendingKeyFromAuth(auth);
  if (!pendingKey) {
    return res.status(500).json({ error: 'No storage key derived' });
  }

  let redis;
  try {
    redis = getRedis();
  } catch (err) {
    return res.status(503).json({ error: `Storage unavailable: ${err.message}` });
  }

  if (req.method === 'GET') {
    try {
      const raw = await redis.get(pendingKey);
      if (!raw) {
        return res.status(200).json({ transactions: [], lastFetchAt: null });
      }
      const parsed = JSON.parse(raw);
      return res.status(200).json({
        transactions: Array.isArray(parsed?.transactions) ? parsed.transactions : [],
        lastFetchAt: parsed?.lastFetchAt || null,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await redis.del(pendingKey);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
