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

import { authenticate } from '../lib/auth.js';

// SimpleFin gives no category — this mirrors the CSV import's fallback
// (buildRow defaults to "Other" when nothing else classifies the row) so a
// synced row is never silently miscounted as Transfer/Income.
const DEFAULT_CATEGORY = 'Other';

function mapTransaction(sfTxn, account) {
  // SimpleFin transaction: { id, posted (unix seconds), amount (string,
  // signed), description, payee?, memo? }. `posted` is authoritative;
  // `transacted_at` (also unix seconds) is an optional earlier date some
  // institutions provide — prefer it when present, same "actual transaction
  // date over posted date" preference the Credit Karma export makes.
  const epochSeconds = sfTxn.transacted_at || sfTxn.posted;
  const date = epochSeconds
    ? new Date(epochSeconds * 1000).toISOString().slice(0, 10)
    : '';

  const description = sfTxn.description || sfTxn.payee || sfTxn.memo || '(no description)';

  // Preserve the source sign verbatim — same invariant as the CSV/CK import
  // path (buildRow never applies Math.abs), the category never determines
  // the sign.
  const amount = parseFloat(sfTxn.amount);

  return {
    id: `sf_${sfTxn.id}`,
    date,
    description,
    amount: Number.isFinite(amount) ? amount : 0,
    category: DEFAULT_CATEGORY,
    account: '', // left unmapped — the client's matchAccount/account-map
                 // pipeline (same as CSV import) resolves this from srcAccount
    srcAccount: account?.name || '',
    sourceId: String(sfTxn.id),
  };
}

export default async function handler(req, res) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const accessUrl = process.env.SIMPLEFIN_ACCESS_URL;
  if (!accessUrl) {
    return res.status(501).json({ error: 'SimpleFin is not configured (SIMPLEFIN_ACCESS_URL missing)' });
  }

  let url;
  try {
    url = new URL(accessUrl.replace(/\/$/, '') + '/accounts');
  } catch {
    return res.status(500).json({ error: 'SIMPLEFIN_ACCESS_URL is malformed' });
  }

  let sfRes;
  try {
    sfRes = await fetch(url.toString(), {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64'),
      },
    });
  } catch (err) {
    return res.status(502).json({ error: `Could not reach SimpleFin: ${err.message}` });
  }

  if (!sfRes.ok) {
    let detail = '';
    try { detail = await sfRes.text(); } catch { /* ignore */ }
    return res.status(502).json({
      error: `SimpleFin returned ${sfRes.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`,
    });
  }

  let data;
  try {
    data = await sfRes.json();
  } catch (err) {
    return res.status(502).json({ error: `SimpleFin response was not valid JSON: ${err.message}` });
  }

  const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
  const transactions = [];
  for (const account of accounts) {
    const txns = Array.isArray(account?.transactions) ? account.transactions : [];
    for (const t of txns) {
      if (!t || t.id == null) continue;
      transactions.push(mapTransaction(t, account));
    }
  }

  // Surface SimpleFin's own per-account error/warning strings (e.g. an
  // institution requiring re-auth) without failing the whole sync — the
  // client still gets whatever transactions the healthy accounts returned.
  const errors = Array.isArray(data?.errors) ? data.errors : [];

  return res.status(200).json({ transactions, accountCount: accounts.length, errors });
}
