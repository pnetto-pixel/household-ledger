// lib/simplefin.js
// Shared fetch+mapping logic for SimpleFin Bridge, used by both the
// on-demand "Sync now" endpoint (api/simplefin-sync.js) and the daily cron
// endpoint (api/cron/simplefin-sync.js). Read-only against SimpleFin — never
// writes to Redis itself; callers decide what (if anything) to persist.

// SimpleFin gives no category — this mirrors the CSV import's fallback
// (buildRow defaults to "Other" when nothing else classifies the row) so a
// synced row is never silently miscounted as Transfer/Income.
const DEFAULT_CATEGORY = 'Other';

// User-configurable equivalent of the old per-institution keyword match,
// checked against a list of patterns (household:*:config's
// `ignoredSimplefinAccounts`) instead of a single hardcoded keyword.
// Case-insensitive substring match against the account's own name/id only —
// deliberately NOT org name/domain here, since the patterns this feeds
// (Settings → "SimpleFin accounts") are authored against what the user sees
// for their own accounts, same fields `isIgnoredSimplefinAccount`
// (src/ledger.js) checks client-side. Kept in this file (not imported from
// src/ledger.js) because lib/ is the server context and src/ is the client
// bundle — they must not cross-import.
export function accountIsIgnored(account, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return false;
  const haystacks = [account?.name, account?.id]
    .map((h) => String(h || '').toLowerCase())
    .filter(Boolean);
  if (haystacks.length === 0) return false;
  return patterns.some((raw) => {
    const p = String(raw || '').trim().toLowerCase();
    if (!p) return false;
    return haystacks.some((h) => h.includes(p));
  });
}

export function mapTransaction(sfTxn, account) {
  // SimpleFin transaction: { id, posted (unix seconds), amount (string,
  // signed), description, payee?, memo? }. `posted` is authoritative;
  // `transacted_at` (also unix seconds) is an optional earlier date some
  // institutions provide — prefer it when present, same "actual transaction
  // date over posted date" preference the Credit Karma export makes.
  // Never emit an empty date. `POST /api/transactions` rejects the WHOLE
  // ledger with a 400 when any row's date isn't YYYY-MM-DD, so a single
  // dateless synced row wedges every future save until it's removed — the
  // CSV path has always guarded this (`buildRow`: `if (!date) date =
  // todayISO()`), and this mapper silently didn't. `posted` is required by
  // the SimpleFin spec, but `0`/null/absent all reach here as falsy.
  const epochSeconds = sfTxn.transacted_at || sfTxn.posted;
  const parsed = epochSeconds ? new Date(epochSeconds * 1000) : null;
  const date = parsed && !isNaN(parsed.getTime())
    ? parsed.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  // `memo` wins whenever the institution actually sent one: several
  // institutions' own `description` is generic boilerplate ("Amazon.com",
  // "Prime Video", a raw merchant code) while `memo` carries the real
  // order/item/merchant detail — first noticed on Amazon's card, but nothing
  // about it is Amazon-specific, so this now applies to every synced account.
  // `.trim()` guards against a whitespace-only memo (seen from some
  // institutions) silently winning over a real description.
  const memo = String(sfTxn.memo || '').trim();
  const rawDescription = String(sfTxn.description || sfTxn.payee || '').trim();
  const description = memo || rawDescription || '(no description)';

  // Preserve the source sign verbatim — same invariant as the CSV/CK import
  // path (buildRow never applies Math.abs), the category never determines
  // the sign.
  const amount = parseFloat(sfTxn.amount);

  const row = {
    id: `sf_${sfTxn.id}`,
    date,
    description,
    amount: Number.isFinite(amount) ? amount : 0,
    category: DEFAULT_CATEGORY,
    account: '', // left unmapped — the client's matchAccount/account-map
                 // pipeline (same as CSV import) resolves this from srcAccount
    srcAccount: account?.name || '',
    // Stable per-account identity from SimpleFin, promoted to a TOP-LEVEL field
    // (it also stays inside `raw` below): the import pipeline strips `raw`
    // before anything reaches the ledger, so a URN kept only there could never
    // feed the client's card map — and without the URN five Chase cards all
    // named "CREDIT CARD" are indistinguishable.
    accountUrn: account?.id ?? '',
    sourceId: String(sfTxn.id),
    // Which feed this row came from. Optional/additive; the client's duplicate
    // detection uses it to tell "same purchase seen through another feed" from
    // "two genuinely distinct charges of the same source".
    source: 'sf',
    // Everything SimpleFin actually sent, untouched — the mapped fields
    // above are our own interpretation; this is for inspecting/debugging
    // that interpretation against the source (e.g. the Preview tab's raw
    // table). Institution-specific fields commonly show up under `extra`.
    raw: {
      ...sfTxn,
      accountId: account?.id ?? null,
      accountName: account?.name ?? null,
      accountCurrency: account?.currency ?? null,
      accountBalance: account?.balance ?? null,
      accountBalanceDate: account?.['balance-date'] ?? null,
      accountAvailableBalance: account?.['available-balance'] ?? null,
      orgName: account?.org?.name ?? null,
      orgDomain: account?.org?.domain ?? null,
    },
  };

  // Only when memo actually won AND replaced something: keep the generic
  // description/payee SimpleFin also sent, so duplicate-scoring can still see
  // it. This matters because the memo text (an itemized product/order list)
  // and the generic description an existing Credit-Karma-imported row for the
  // SAME purchase carries (e.g. "AMAZON.COM*RT4XY1") typically share NO
  // words — the "amazon"/"amzn" token that used to make the merchant
  // recognizable disappears the moment memo replaces it as the display
  // description. Left unaddressed, a same-day/same-account/same-amount
  // Amazon duplicate scores only 65 in the best case (100 − 35 for zero
  // description overlap) and drops below the 60 "review" floor — invisible
  // as "new" — on any realistic day-of-posting or account-mapping noise.
  // scoreDuplicateCandidate (src/ledger.js) folds this into the description
  // token pool for BOTH sides, alongside the display description, so the
  // shared merchant word is available for matching without changing what
  // the user sees. Skipped when memo lost (rawDescription === description)
  // — nothing additive to carry in that, by far more common, case.
  if (rawDescription && rawDescription !== description) {
    row.providerDescription = rawDescription;
  }

  return row;
}

// Minimal-interpretation mapping for account.holdings — a sibling array to
// account.transactions in the same SimpleFin Bridge /accounts response.
// Some institutions (e.g. this Fidelity "Individual - TOD" account) never
// report stock/bond trades or bond maturities in `transactions`; if that
// data exists at all via SimpleFin, it's here. Deliberately no attempt yet
// to interpret "buy" vs "sell" vs "maturity" or derive an event date — we
// don't know the real shape of what Fidelity sends, so `raw` is preserved
// untouched (same pattern as mapTransaction's `raw`) for the Preview tab's
// raw table to show as-is.
function mapHolding(sfHolding, account) {
  return {
    id: `sf_h_${sfHolding.id}`,
    sourceId: String(sfHolding.id),
    raw: {
      ...sfHolding,
      accountId: account?.id ?? null,
      accountName: account?.name ?? null,
      accountCurrency: account?.currency ?? null,
      orgName: account?.org?.name ?? null,
      orgDomain: account?.org?.domain ?? null,
    },
  };
}

const LOOKBACK_DAYS = 30;

// Returns { ok: true, transactions, accountCount, errors, holdings,
// accountBalances } on success, or { ok: false, status, error } on failure
// (status mirrors the HTTP status callers should surface: 501 = not
// configured, 500 = malformed env var, 502 = SimpleFin unreachable/errored).
// `ignoredPatterns` (default none) are substrings matched against each
// account's name/id via `accountIsIgnored` — a matching account is skipped
// for transactions/holdings/accountCount (no rows, no duplicates), but is
// STILL included in `accountBalances` (with `ignored: true`) — Settings'
// consolidated SimpleFin accounts table (v1.59.0) needs to see and manage an
// ignored account (unignore it, or just show it in the list) even though its
// transactions never reach the ledger.
export async function fetchSimplefinTransactions(ignoredPatterns = []) {
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

  // SimpleFin Bridge returns little/no transaction history without an
  // explicit start-date — request the last LOOKBACK_DAYS explicitly instead
  // of relying on whatever short default window the bridge/institution uses.
  const startDateSeconds = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 24 * 60 * 60;
  url.searchParams.set('start-date', String(startDateSeconds));

  // Node's fetch (undici) refuses to construct a Request from a URL that
  // still carries userinfo (https://user:pass@host/...), even though we
  // send the same credentials via the Authorization header below — so pull
  // them out and fetch a credential-free URL instead.
  const authHeader = 'Basic ' + Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64');
  url.username = '';
  url.password = '';

  let sfRes;
  try {
    sfRes = await fetch(url.toString(), {
      headers: { Authorization: authHeader },
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
  const holdings = [];
  const accountBalances = [];
  let syncedAccountCount = 0;
  for (const account of accounts) {
    // Accounts the user chose to ignore (Settings → SimpleFin accounts table,
    // household:*:config's `ignoredSimplefinAccounts`) never contribute
    // transactions/holdings/accountCount — skipped before the pending queue
    // or the live fetch ever sees them, so ignoring an account that already
    // reaches the ledger via another feed can't manufacture duplicates.
    const ignored = accountIsIgnored(account, ignoredPatterns);

    // accountBalances is pushed for EVERY account (ignored or not, additive
    // `ignored` flag below) — it's the only response field that lets the
    // client see an account that has synced a balance but has no
    // transactions in the ledger yet, which the Settings table needs even
    // when the account is ignored (to display/unignore it).
    const balance = parseFloat(account?.balance);
    const availableBalance = parseFloat(account?.['available-balance']);
    accountBalances.push({
      accountUrn: account.id,
      name: account.name || '',
      orgName: account?.org?.name || null,
      currency: account?.currency || null,
      balance: Number.isFinite(balance) ? balance : null,
      balanceDate: account?.['balance-date'] ?? null,
      availableBalance: Number.isFinite(availableBalance) ? availableBalance : null,
      ignored,
    });

    if (ignored) continue;
    syncedAccountCount++;

    const txns = Array.isArray(account?.transactions) ? account.transactions : [];
    for (const t of txns) {
      if (!t || t.id == null) continue;
      transactions.push(mapTransaction(t, account));
    }

    // Same array-or-absent shape as transactions — most accounts (checking,
    // credit cards) simply won't have this key at all.
    const sfHoldings = Array.isArray(account?.holdings) ? account.holdings : [];
    for (const h of sfHoldings) {
      if (!h || h.id == null) continue;
      holdings.push(mapHolding(h, account));
    }
  }

  // Surface SimpleFin's own per-account error/warning strings (e.g. an
  // institution requiring re-auth) without failing the whole sync — the
  // caller still gets whatever transactions the healthy accounts returned.
  const errors = Array.isArray(data?.errors) ? data.errors : [];

  return { ok: true, transactions, accountCount: syncedAccountCount, errors, holdings, accountBalances };
}
