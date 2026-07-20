// api/simplefin-sync.js
// GET: pulls transactions from SimpleFin Bridge on demand ("Sync now" in the
// Import tab) and returns them mapped into the ledger's transaction shape.
// This endpoint is READ-ONLY against SimpleFin and does NOT write to Redis —
// persistence still goes through the existing PUT /api/transactions flow on
// the client, same as the Credit Karma/CSV import pipeline (dedup + account
// mapping happen there, not here).
//
// Auth: same shared app password as every other /api/* route
// (x-app-password header, lib/auth.js).
//
// Credential: SIMPLEFIN_ACCESS_URL env var — a SimpleFin Bridge "Access URL"
// in the form https://<user>:<pass>@bridge.simplefin.org/simplefin. The
// username/password are embedded in the URL itself (SimpleFin's own scheme,
// no separate OAuth flow), so we just GET "<access url>/accounts" with those
// credentials attached and SimpleFin returns { accounts: [{ transactions,
// holdings }] } — this handler's live-fetch response also includes
// `holdings` (mapped, minimal interpretation) alongside `transactions`.
//
// The actual fetch+mapping logic lives in lib/simplefin.js, shared with the
// daily cron endpoint (api/cron/simplefin-sync.js, Phase 2) — this handler
// is just the manual/on-demand entry point into it.
//
// This file also serves the pending-queue read/clear routes
// (?pending=1 GET/DELETE) that the daily cron populates — folded in here
// instead of a separate api/simplefin-pending.js file to stay under
// Vercel Hobby's 12-Serverless-Function-per-deployment limit.

import { authenticate } from '../lib/auth.js';
import { fetchSimplefinTransactions } from '../lib/simplefin.js';
import { getRedis } from '../lib/redis.js';

function pendingKeyFromAuth(auth) {
  if (!auth?.storageKey) return null;
  const householdKey = auth.storageKey
    .replace(/^portfolio:/, 'household:')
    .replace(/:holdings$/, ':transactions');
  return `${householdKey}:simplefin-pending`;
}

async function handlePending(req, res, auth) {
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

export default async function handler(req, res) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  if (req.query?.pending !== undefined) {
    return handlePending(req, res, auth);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = await fetchSimplefinTransactions();
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  return res.status(200).json({
    transactions: result.transactions,
    accountCount: result.accountCount,
    errors: result.errors,
    // account.holdings, minimally mapped (lib/simplefin.js mapHolding) —
    // only present on a live fetch; the ?pending=1 queue above is
    // transaction-only (it's an append-only cron queue, holdings is a
    // point-in-time snapshot so it wouldn't make sense to stack there).
    holdings: result.holdings,
  });
}
