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
// credentials attached and SimpleFin returns { accounts: [{ transactions }] }.
//
// The actual fetch+mapping logic lives in lib/simplefin.js, shared with the
// daily cron endpoint (api/cron/simplefin-sync.js, Phase 2) — this handler
// is just the manual/on-demand entry point into it.

import { authenticate } from '../lib/auth.js';
import { fetchSimplefinTransactions } from '../lib/simplefin.js';

export default async function handler(req, res) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
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
  });
}
