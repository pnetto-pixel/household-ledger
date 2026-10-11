// One Sync action, independent providers. Never write the user's ledger here.
import { fetchSimplefinTransactions } from './simplefin.js';
import { fetchPlaidTransactions } from './plaid.js';

export async function fetchBankTransactions(redis, householdKey, ignoredPatterns = []) {
  const outcomes = await Promise.allSettled([
    fetchSimplefinTransactions(ignoredPatterns),
    fetchPlaidTransactions(redis, householdKey, ignoredPatterns),
  ]);
  const results = outcomes.map((r, i) => r.status === 'fulfilled' ? r.value : { ok: false, error: `${i ? 'Venmo' : 'SimpleFin'} sync unavailable.` });
  const good = results.filter(r => r.ok && r.configured !== false);
  const errors = results.flatMap(r => r.ok ? r.errors || [] : [r.error]);
  if (!good.length) return { ok: false, status: 503, error: errors.join(' ') || 'No bank connections configured.' };
  const accountBalances = good.flatMap(r => r.accountBalances || []);
  return { ok: true, transactions: good.flatMap(r => r.transactions || []), accountBalances,
    removedSourceIds: good.flatMap(r => r.removedSourceIds || []),
    accountCount: accountBalances.length, holdings: good.flatMap(r => r.holdings || []), errors };
}
