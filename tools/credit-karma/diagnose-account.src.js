// Credit Karma -> account-shape diagnostic (Safari bookmarklet, iOS)
// -----------------------------------------------------------------------
// One-off helper to discover WHERE Credit Karma keeps a card's last-4 digits
// (and issuer) in its GraphQL response, so the exporter can emit a stable
// per-card identity. It does NOT export anything or touch the main bookmarklet.
//
// Run it on https://www.creditkarma.com/networth/transactions while logged in.
// It fetches a few pages, collects one raw `account` object per distinct card,
// and shows them in a copyable box. Copy the whole box and send it back.
//
// Readable source; regenerate the pasteable one-liner with build-bookmarklet.js
// (pass this file as the input) into diagnose-account.txt.

(async () => {
  const ENDPOINT = 'https://api.creditkarma.com/graphql';
  const PAGE_HASH = 'f669c7e42eb464861cb77d9f27826d0847ddfb5f5079a6ab7e5e2470c9617db8';
  const CLIENT_VERSION = '2.0.8';
  const MAX_PAGES = 5;

  function cookie(n) { const m = document.cookie.match(new RegExp('(^| )' + n + '=([^;]+)')); return m ? m[2] : null; }
  function token() {
    let c = cookie('CKAT');
    if (c) { if (c.indexOf('%') >= 0) { try { c = decodeURIComponent(c); } catch (e) {} } const t = c.split(';')[0].trim(); if (t.indexOf('eyJ') === 0) return t; }
    if (window._ACCESS_TOKEN) return window._ACCESS_TOKEN;
    return null;
  }
  function traceId() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); }); }

  function showBox(title, text) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.92);color:#fff;font:14px -apple-system,sans-serif;padding:18px;text-align:center';
    const t1 = document.createElement('div'); t1.textContent = title; t1.style.cssText = 'margin-bottom:10px;max-width:520px';
    const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'width:94%;height:68%;font-size:12px';
    const cb = document.createElement('button'); cb.textContent = 'Fechar'; cb.style.cssText = 'margin-top:12px;padding:10px 18px;border:none;border-radius:10px;background:#444;color:#fff'; cb.onclick = function () { ov.remove(); };
    ov.appendChild(t1); ov.appendChild(ta); ov.appendChild(cb); document.body.appendChild(ov);
  }

  try {
    const tok = token();
    if (!tok) { showBox('NO_TOKEN', 'Nao achei a sessao. Abra a pagina de transacoes logado e tente de novo.'); return; }
    const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok, 'ck-client-name': 'prime_web', 'ck-client-version': CLIENT_VERSION, 'ck-cookie-id': cookie('CKTRKID') || '', 'ck-device-type': 'Desktop', 'ck-trace-id': cookie('CKTRACEID') || traceId() };

    const seen = {}, accounts = [];
    let after = null, pages = 0, txnKeys = null, sampleTxn = null;
    while (pages < MAX_PAGES) {
      pages++;
      const vars = { input: { accountInput: {}, categoryInput: { categoryId: null, primeCategoryType: null }, datePeriodInput: { datePeriod: null }, paginationInput: {} } };
      if (after) vars.input.paginationInput.afterCursor = after;
      const body = { extensions: { persistedQuery: { sha256Hash: PAGE_HASH, version: 1 } }, operationName: 'GetTransactions', variables: vars };
      const r = await fetch(ENDPOINT, { method: 'POST', headers: headers, credentials: 'include', body: JSON.stringify(body) });
      if (!r.ok) break;
      const d = await r.json();
      if (d.errors) { showBox('ERRO_GRAPHQL', JSON.stringify(d.errors).slice(0, 800)); return; }
      const tp = d.data && d.data.prime && d.data.prime.transactionsHub && d.data.prime.transactionsHub.transactionPage;
      if (!tp) break;
      const txns = tp.transactions || [];
      if (txns.length === 0) break;
      if (!txnKeys && txns[0]) { txnKeys = Object.keys(txns[0]); sampleTxn = txns[0]; }
      for (const t of txns) {
        const a = t.account || {};
        const key = (a.providerName || '') + '|' + (a.name || '');
        if (seen[key]) continue;
        seen[key] = 1;
        accounts.push(a);
      }
      after = (tp.pageInfo && tp.pageInfo.endCursor) || null;
      if (!(tp.pageInfo && tp.pageInfo.hasNextPage)) break;
      await new Promise(function (res) { setTimeout(res, 350); });
    }

    const report = {
      transactionLevelKeys: txnKeys || [],
      sampleTransaction: sampleTxn || null,
      distinctAccounts: accounts,
    };
    showBox('Estrutura de conta do CK (' + accounts.length + ' contas). Copie TUDO e me mande. Pode redigir nomes proprios; mantenha os digitos.', JSON.stringify(report, null, 2));
  } catch (e) {
    showBox('EXCEPTION', (e && e.message) || String(e));
  }
})();
