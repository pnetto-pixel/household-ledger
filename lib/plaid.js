// Server-only, existing Venmo Item. No Link, exchange, refresh or Item mutations.
import { createHash, randomUUID } from 'node:crypto';
import { accountIsIgnored } from './simplefin.js';

const LOCK_MS = 55000;
const COMMIT = `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end redis.call('SET', KEYS[2], ARGV[2]); return 1`;
const UNLOCK = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;

const validId = value => typeof value === 'string' && value.trim().length > 0;
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

function visibleTransactions(state, ignoredPatterns) {
  return state.transactions
    .filter(t => !t.pending && !accountIsIgnored({ name: t.srcAccount, id: t.accountUrn }, ignoredPatterns))
    // Pending is provider state, not an additional field in the user's ledger.
    .map(({ pending, ...row }) => row);
}

export function mapPlaidTransaction(t, account) {
  if (!t || !validId(t.transaction_id) || !validId(t.account_id)
    || !account || account.account_id !== t.account_id || !validDate(t.date)
    || !Number.isFinite(t.amount) || typeof t.pending !== 'boolean'
    || (t.pending_transaction_id != null && !validId(t.pending_transaction_id))) throw new Error('INVALID_DATA');
  if ((t.iso_currency_code != null && t.iso_currency_code !== 'USD') || t.unofficial_currency_code != null) throw new Error('UNSUPPORTED_CURRENCY');
  return { id: `plaid_${t.transaction_id}`, sourceId: `plaid:${t.transaction_id}`, source: 'plaid',
    date: t.date, description: t.name || t.merchant_name || '(no description)', amount: -t.amount,
    category: 'Uncategorized', account: '', srcAccount: /venmo/i.test(account?.name || '') ? account.name : `Venmo ${account?.name || ''}`.trim(),
    accountUrn: `plaid:${t.account_id}`, pending: !!t.pending,
    ...(t.pending_transaction_id ? { altSourceIds: [`plaid:${t.pending_transaction_id}`] } : {}),
  };
}

export async function fetchPlaidTransactions(redis, householdKey, ignoredPatterns = []) {
  const { PLAID_CLIENT_ID: client_id, PLAID_SECRET: secret, PLAID_VENMO_ACCESS_TOKEN: access_token, PLAID_ENV } = process.env;
  if (!client_id && !secret && !access_token && !PLAID_ENV) return { ok: true, configured: false, transactions: [], accountBalances: [], errors: [] };
  if (!client_id || !secret || !access_token || PLAID_ENV !== 'production') return { ok: false, status: 503, error: 'Venmo: incomplete Production configuration.' };
  const key = `${householdKey}:plaid-venmo`;
  const lockKey = `${key}:lock`;
  const owner = randomUUID();
  let locked = false;
  const deadline = Date.now() + 45000;
  const tokenHash = createHash('sha256').update(access_token).digest('hex');
  const api = async (path, body = {}) => {
    if (Date.now() >= deadline) throw new Error('TIMEOUT');
    const response = await fetch(`https://production.plaid.com${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id, secret, access_token, ...body }),
      signal: AbortSignal.timeout(Math.max(1, Math.min(12000, deadline - Date.now()))),
    });
    const data = await response.json();
    if (!response.ok) {
      // Never surface upstream bodies, request options, credentials or messages.
      const code = /^[A-Z_]+$/.test(data.error_code || '') ? data.error_code : 'API_ERROR';
      throw new Error(code);
    }
    return data;
  };
  const resultFrom = (state, warnings = []) => ({ ok: true, configured: true,
    transactions: visibleTransactions(state, ignoredPatterns),
    accountBalances: state.accountBalances.map(a => ({ ...a, ignored: accountIsIgnored({ name: a.name, id: a.accountUrn }, ignoredPatterns) })),
    errors: warnings, removedSourceIds: state.removedSourceIds || [],
  });
  try {
    locked = (await redis.set(lockKey, owner, 'PX', LOCK_MS, 'NX')) === 'OK';
    if (!locked) return { ok: false, status: 409, error: 'Venmo sync already running. Try Sync again shortly.' };
    const raw = await redis.get(key);
    const previous = raw ? JSON.parse(raw) : null;
    if (previous && previous.tokenHash !== tokenHash) throw new Error('ITEM_CHANGED');
    // A small cache also protects Home/Settings consumers of the same endpoint.
    if (previous && Date.now() - previous.fetchedAt < 60000) return resultFrom(previous);
    if (!previous?.verified) {
      const item = await api('/item/get');
      const institution = await api('/institutions/get_by_id', { access_token: undefined, institution_id: item.item?.institution_id, country_codes: ['US'] });
      if (!/^Venmo(?:\s*-\s*Personal)?$/i.test(institution.institution?.name || '')) throw new Error('NOT_VENMO');
    }
    // Cached account balances, not the separately billed real-time balance call.
    const accountsData = await api('/accounts/get');
    if (!Array.isArray(accountsData.accounts)) throw new Error('INVALID_DATA');
    const accounts = accountsData.accounts;
    if (accounts.some(a => !a || !validId(a.account_id) || !a.balances
      || (a.balances.current != null && !Number.isFinite(a.balances.current))
      || (a.balances.available != null && !Number.isFinite(a.balances.available)))) throw new Error('INVALID_DATA');
    if (accounts.some(a => a.balances?.iso_currency_code !== 'USD')) throw new Error('UNSUPPORTED_CURRENCY');
    const accountMap = new Map(accounts.map(a => [a.account_id, a]));
    if (accountMap.size !== accounts.length) throw new Error('INVALID_DATA');
    let finalRows, finalCursor, finalRemoved;
    for (let attempt = 0; attempt < 2; attempt++) {
      const rows = new Map((previous?.transactions || []).map(t => [t.sourceId, t]));
      let cursor = previous?.cursor;
      const removedIds = new Set(previous?.removedSourceIds || []);
      try {
        for (let page = 0; page < 100; page++) {
          const data = await api('/transactions/sync', { ...(cursor ? { cursor } : {}), count: 500 });
          // An incomplete page must never look like the end of the stream.
          // Validate the whole page before changing the snapshot or cursor.
          if (!Array.isArray(data.added) || !Array.isArray(data.modified) || !Array.isArray(data.removed)
            || typeof data.has_more !== 'boolean' || !validId(data.next_cursor)
            || data.removed.some(t => !t || !validId(t.transaction_id))) throw new Error('INVALID_DATA');
          const mappedRows = [...data.added, ...data.modified].map(t => mapPlaidTransaction(t, accountMap.get(t?.account_id)));
          for (const removed of data.removed) { rows.delete(`plaid:${removed.transaction_id}`); removedIds.add(`plaid:${removed.transaction_id}`); }
          for (const mapped of mappedRows) {
            removedIds.delete(mapped.sourceId);
            for (const pendingId of mapped.altSourceIds || []) rows.delete(pendingId);
            rows.set(mapped.sourceId, mapped);
          }
          cursor = data.next_cursor;
          if (!data.has_more) { finalRows = [...rows.values()]; finalCursor = cursor; finalRemoved = [...removedIds].slice(-2000); break; }
        }
        if (!finalRows) throw new Error('PAGE_LIMIT');
        break;
      } catch (err) {
        if (err.message !== 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' || attempt) throw err;
      }
    }
    const state = { verified: true, tokenHash, cursor: finalCursor, transactions: finalRows,
      removedSourceIds: finalRemoved, fetchedAt: Date.now(), accountBalances: accounts.map(a => ({
        accountUrn: `plaid:${a.account_id}`, name: /venmo/i.test(a.name || '') ? a.name : `Venmo ${a.name || ''}`.trim(), orgName: 'Venmo',
        currency: a.balances?.iso_currency_code || 'USD', balance: a.balances?.current ?? null,
        availableBalance: a.balances?.available ?? null, balanceDate: null, source: 'plaid',
      })) };
    // Cursor and reusable snapshot commit together; expired/stolen leases cannot commit.
    if (!(await redis.eval(COMMIT, 2, lockKey, key, owner, JSON.stringify(state)))) throw new Error('LOCK_EXPIRED');
    return resultFrom(state);
  } catch (err) {
    const safeCodes = ['ITEM_LOGIN_REQUIRED', 'TRANSACTIONS_NOT_READY', 'ITEM_CHANGED', 'NOT_VENMO', 'UNSUPPORTED_CURRENCY', 'LOCK_EXPIRED', 'TIMEOUT'];
    const code = safeCodes.includes(err.message) ? err.message : 'SYNC_FAILED';
    return { ok: false, status: 503, error: `Venmo: ${code}. Existing connection and saved transactions were preserved.` };
  } finally {
    if (locked) await redis.eval(UNLOCK, 1, lockKey, owner).catch(() => {});
  }
}

// Read-only pending review: independent of the disposable SimpleFin cron queue.
export async function readPlaidSnapshot(redis, householdKey, ignoredPatterns = []) {
  const raw = await redis.get(`${householdKey}:plaid-venmo`);
  if (!raw) return { transactions: [], lastFetchAt: null, errors: [] };
  const state = JSON.parse(raw);
  return { transactions: visibleTransactions(state, ignoredPatterns), lastFetchAt: new Date(state.fetchedAt).toISOString(),
    errors: [], removedSourceIds: state.removedSourceIds || [] };
}
