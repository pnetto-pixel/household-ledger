import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPlaidTransactions, mapPlaidTransaction, readPlaidSnapshot } from './plaid.js';

const txn = (id, amount = 14) => ({ transaction_id: id, account_id: 'a', date: '2026-09-23', amount, name: 'Payment', pending: false });
const account = { account_id: 'a', name: 'Venmo', balances: { current: 40, available: 40, iso_currency_code: 'USD' } };
const page = (overrides = {}) => ({ added: [], modified: [], removed: [], next_cursor: 'done', has_more: false, ...overrides });
function storage() {
  const data = new Map();
  return { data, get: vi.fn(async k => data.get(k) || null),
    set: vi.fn(async (k,v,...args) => { if (args.includes('NX') && data.has(k)) return null; data.set(k,v); return 'OK'; }),
    eval: vi.fn(async (script,n,...args) => { const [lock,key,owner,value] = args; if (n === 2) { if (data.get(lock) !== owner) return 0; data.set(key,value); return 1; } if (data.get(lock) === key) data.delete(lock); return 1; }),
  };
}
function provider(pages) {
  return vi.fn(async (url, options) => {
    const path = new URL(url).pathname;
    let data;
    if (path === '/item/get') data = { item: { institution_id: 'venmo' } };
    else if (path === '/institutions/get_by_id') data = { institution: { name: 'Venmo - Personal' } };
    else if (path === '/accounts/get') data = { accounts: [account] };
    else if (path === '/transactions/sync') data = pages.shift();
    else throw Error('Unexpected API');
    if (data instanceof Error) throw data;
    return { ok: !data.error_code, json: async () => data };
  });
}
beforeEach(() => { vi.stubEnv('PLAID_CLIENT_ID','fake-client'); vi.stubEnv('PLAID_SECRET','test-secret'); vi.stubEnv('PLAID_VENMO_ACCESS_TOKEN','fake-access'); vi.stubEnv('PLAID_ENV','production'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('existing Venmo Item sync', () => {
  it('inverts provider sign and preserves distinct stable identities', () => {
    expect(mapPlaidTransaction(txn('x'), account)).toMatchObject({ amount:-14,source:'plaid',sourceId:'plaid:x',accountUrn:'plaid:a' });
    expect(mapPlaidTransaction(txn('y',-12), account).amount).toBe(12);
  });
  it('commits all pages with cursor and keeps reusable snapshot after reads', async () => {
    const redis = storage(); const mock = provider([page({ added:[txn('one')],next_cursor:'p1',has_more:true }),page({ added:[txn('two'),{...txn('pending'),pending:true}],next_cursor:'p2' })]); vi.stubGlobal('fetch',mock);
    const result = await fetchPlaidTransactions(redis,'household:test');
    expect(result.transactions).toHaveLength(2); expect(result.accountBalances[0].balance).toBe(40);
    expect(JSON.parse(redis.data.get('household:test:plaid-venmo')).cursor).toBe('p2');
    expect((await readPlaidSnapshot(redis,'household:test')).transactions).toHaveLength(2);
    expect((await fetchPlaidTransactions(redis,'household:test')).transactions).toHaveLength(2);
    expect(mock).toHaveBeenCalledTimes(5);
    expect(mock.mock.calls.map(c=>new URL(c[0]).pathname)).not.toContain('/accounts/balance/get');
  });
  it('restarts pagination from the original cursor after provider mutation', async () => {
    const mock = provider([page({added:[txn('discard')],next_cursor:'partial',has_more:true}),{error_code:'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION'}, page({added:[txn('final')]})]); vi.stubGlobal('fetch',mock);
    const result = await fetchPlaidTransactions(storage(),'h');
    expect(result.transactions.map(t=>t.sourceId)).toEqual(['plaid:final']);
    const calls = mock.mock.calls.filter(c=>c[0].endsWith('/transactions/sync')).map(c=>JSON.parse(c[1].body));
    expect(calls[2]).not.toHaveProperty('cursor');
  });
  it('does not persist a partial cursor and redacts upstream errors', async () => {
    const redis=storage();vi.stubGlobal('fetch',provider([page({added:[txn('one')],next_cursor:'p1',has_more:true}),new Error('test-secret fake-access')]));
    const result=await fetchPlaidTransactions(redis,'h');expect(result.ok).toBe(false);expect(JSON.stringify(result)).not.toContain('test-secret');expect(redis.data.has('h:plaid-venmo')).toBe(false);
  });
  it('rejects simultaneous sync and does not release another owner lock', async () => {
    const redis=storage();redis.data.set('h:plaid-venmo:lock','another');vi.stubGlobal('fetch',vi.fn());
    expect((await fetchPlaidTransactions(redis,'h')).status).toBe(409);expect(fetch).not.toHaveBeenCalled();expect(redis.data.get('h:plaid-venmo:lock')).toBe('another');
  });
  it('refuses to commit after losing the lease', async () => {
    const redis=storage();const mock=provider([page({added:[txn('one')]})]);vi.stubGlobal('fetch', async (...args)=>{const response=await mock(...args);if(args[0].endsWith('/transactions/sync'))redis.data.set('h:plaid-venmo:lock','another');return response;});
    expect((await fetchPlaidTransactions(redis,'h')).ok).toBe(false);expect(redis.data.has('h:plaid-venmo')).toBe(false);
  });
  it('applies modifications and removals atomically, leaving the ledger untouched', async () => {
    const redis=storage();vi.stubGlobal('fetch',provider([page({added:[txn('one'),txn('two')],next_cursor:'first'})]));
    await fetchPlaidTransactions(redis,'h');
    const state=JSON.parse(redis.data.get('h:plaid-venmo'));state.fetchedAt=0;redis.data.set('h:plaid-venmo',JSON.stringify(state));
    const mock=provider([page({modified:[txn('one',25)],removed:[{transaction_id:'two'}],next_cursor:'second'})]);vi.stubGlobal('fetch',mock);
    const result=await fetchPlaidTransactions(redis,'h');expect(result.transactions).toHaveLength(1);expect(result.transactions[0].amount).toBe(-25);expect(result.removedSourceIds).toEqual(['plaid:two']);
    expect(JSON.parse(mock.mock.calls.find(c=>c[0].endsWith('/transactions/sync'))[1].body).cursor).toBe('first');
    expect(redis.data.has('h')).toBe(false);
  });
  it('does not advance after malformed pagination data', async () => {
    const redis=storage();vi.stubGlobal('fetch',provider([{added:[txn('one')],has_more:false}]));
    expect((await fetchPlaidTransactions(redis,'h')).ok).toBe(false);expect(redis.data.has('h:plaid-venmo')).toBe(false);
  });
  it('refuses a different institution before requesting transactions', async () => {
    const mock=provider([]);vi.stubGlobal('fetch',async (url,options)=>url.endsWith('/institutions/get_by_id')?{ok:true,json:async()=>({institution:{name:'Other Bank'}})}:mock(url,options));
    expect((await fetchPlaidTransactions(storage(),'h')).error).toContain('NOT_VENMO');
    expect(mock.mock.calls.some(c=>c[0].endsWith('/transactions/sync'))).toBe(false);
  });

  it.each([
    { next_cursor: 'bad', has_more: false },
    { added: [], modified: [], removed: [], next_cursor: 'bad' },
    page({ modified: null }),
    page({ removed: [{ transaction_id: 123 }] }),
    page({ added: [{ ...txn('bad'), account_id: 'unknown' }] }),
    page({ added: [{ ...txn('bad'), date: '2026-02-30' }] }),
  ])('preserves an existing snapshot and cursor after an invalid page %#', async invalid => {
    const redis = storage();
    vi.stubGlobal('fetch', provider([page({ added: [txn('saved')], next_cursor: 'previous' })]));
    expect((await fetchPlaidTransactions(redis, 'h')).ok).toBe(true);
    const previous = JSON.parse(redis.data.get('h:plaid-venmo'));
    previous.fetchedAt = 0;
    const saved = JSON.stringify(previous);
    redis.data.set('h:plaid-venmo', saved);
    vi.stubGlobal('fetch', provider([page({ added: [txn('partial')], next_cursor: 'partial', has_more: true }), invalid]));
    expect((await fetchPlaidTransactions(redis, 'h')).ok).toBe(false);
    expect(redis.data.get('h:plaid-venmo')).toBe(saved);
  });

  it('applies current ignored accounts to pending reads without deleting the snapshot', async () => {
    const redis = storage();
    vi.stubGlobal('fetch', provider([page({ added: [txn('saved')] })]));
    await fetchPlaidTransactions(redis, 'h');
    const saved = redis.data.get('h:plaid-venmo');
    expect((await readPlaidSnapshot(redis, 'h', ['plaid:a'])).transactions).toEqual([]);
    const visible = await readPlaidSnapshot(redis, 'h');
    expect(visible.transactions).toHaveLength(1);
    expect(visible.transactions[0]).not.toHaveProperty('pending');
    expect(redis.data.get('h:plaid-venmo')).toBe(saved);
  });

});
