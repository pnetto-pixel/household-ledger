// lib/simplefin.js
// Shared fetch+mapping logic for SimpleFin Bridge, used by both the
// on-demand "Sync now" endpoint (api/simplefin-sync.js) and the daily cron
// endpoint (api/cron/simplefin-sync.js). Read-only against SimpleFin — never
// writes to Redis itself; callers decide what (if anything) to persist.

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

// Returns { ok: true, transactions, accountCount, errors } on success, or
// { ok: false, status, error } on failure (status mirrors the HTTP status
// callers should surface: 501 = not configured, 500 = malformed env var,
// 502 = SimpleFin unreachable/errored).
export async function fetchSimplefinTransactions() {
  const accessUrl = process.env.SIMPLEFIN_ACCESS_URL;
  if (!accessUrl) {
    return { ok: false, status: 501, error: 'SimpleFin is not configured (SIMPLEFIN_ACCESS_URL missing)' };
  }

  let url;
  try {
    url = new URL(accessUrl.replace(/\/$/, '') + '/accounts');
  } catch {
    return { ok: false, status: 500, error: 'SIMPLEFIN_ACCESS_URL is malformed' };
  }

  let sfRes;
  try {
    sfRes = await fetch(url.toString(), {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64'),
      },
    });
  } catch (err) {
    return { ok: false, status: 502, error: `Could not reach SimpleFin: ${err.message}` };
  }

  if (!sfRes.ok) {
    let detail = '';
    try { detail = await sfRes.text(); } catch { /* ignore */ }
    return {
      ok: false,
      status: 502,
      error: `SimpleFin returned ${sfRes.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`,
    };
  }

  let data;
  try {
    data = await sfRes.json();
  } catch (err) {
    return { ok: false, status: 502, error: `SimpleFin response was not valid JSON: ${err.message}` };
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
  // caller still gets whatever transactions the healthy accounts returned.
  const errors = Array.isArray(data?.errors) ? data.errors : [];

  return { ok: true, transactions, accountCount: accounts.length, errors };
}
