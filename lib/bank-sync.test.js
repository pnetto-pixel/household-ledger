import { expect, it, vi } from 'vitest';
vi.mock('./simplefin.js',()=>({fetchSimplefinTransactions:vi.fn()}));
vi.mock('./plaid.js',()=>({fetchPlaidTransactions:vi.fn()}));
import { fetchSimplefinTransactions } from './simplefin.js';
import { fetchPlaidTransactions } from './plaid.js';
import { fetchBankTransactions } from './bank-sync.js';
it('keeps the working provider when the other fails',async()=>{
 fetchSimplefinTransactions.mockResolvedValue({ok:false,error:'SimpleFin unavailable'});
 fetchPlaidTransactions.mockResolvedValue({ok:true,transactions:[{id:'plaid_1'}],accountBalances:[{name:'Venmo'}]});
 const r=await fetchBankTransactions({},'h');expect(r.ok).toBe(true);expect(r.transactions).toHaveLength(1);expect(r.errors).toEqual(['SimpleFin unavailable']);
 fetchSimplefinTransactions.mockResolvedValue({ok:true,transactions:[{id:'sf_1'}],accountBalances:[]});fetchPlaidTransactions.mockRejectedValue(new Error('secret'));
 const reverse=await fetchBankTransactions({},'h');expect(reverse.transactions[0].id).toBe('sf_1');expect(JSON.stringify(reverse)).not.toContain('secret');
});
