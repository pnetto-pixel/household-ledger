// Credit Karma -> Household Ledger CSV exporter (Safari bookmarklet, iOS)
// -----------------------------------------------------------------------
// Readable source for the bookmarklet. The ready-to-paste one-liner lives in
// tools/credit-karma/bookmarklet.txt (regenerate it with build-bookmarklet.js
// after editing this file).
//
// Run it while you're on https://www.creditkarma.com/networth/transactions and
// already logged in. It calls Credit Karma's internal GraphQL API from the
// logged-in page (cookies + CORS work like the real web app), builds a CSV
// matching the ledger Import format (date,description,amount,category,account
// plus ck_category,type) and hands it to the iOS share sheet so you can
// "Save to Files". No app install required.
//
// If Credit Karma changes their GraphQL schema you'll get a HASH_OUTDATED
// alert; refresh the two hashes (see README "Troubleshooting").

(async () => {
  const ENDPOINT = 'https://api.creditkarma.com/graphql';
  const LIST_HASH = 'c3c0a630b5cd938595c5901807f63b807e63c71f54a8fcb55e8c9084cb70832a';
  const PAGE_HASH = 'f669c7e42eb464861cb77d9f27826d0847ddfb5f5079a6ab7e5e2470c9617db8';
  const CLIENT_VERSION = '2.0.8';
  const DAYS_BACK = 90;
  const MAX_PAGES = 60;
  const CAT = {
    MORTGAGE_AND_RENT: 'Mortgage', HOME_AND_GARDEN: 'Home', SHOPPING: 'Shopping',
    AUTO_AND_TRANSPORT: 'Transport', FOOD_AND_DINING: 'Restaurant',
    HEALTH_AND_FITNESS: 'Medical', TRAVEL_AND_VACATION: 'Travel',
    BILLS_AND_UTILITIES: 'Utilities', TAXES: 'Other', PETS: 'Dog',
    GROCERIES: 'Groceries', FEES_AND_CHARGES: 'Services', PERSONAL_CARE: 'Services',
    BUSINESS_SERVICES: 'Services', ENTERTAINMENT: 'Entertainment', GIFTS: 'Other',
    EDUCATION: 'Other', DONATIONS: 'Other', MISC_EXPENSES: 'Other'
  };
  const START_MS = Date.now() - DAYS_BACK * 864e5;

  function cookie(n) { const m = document.cookie.match(new RegExp('(^| )' + n + '=([^;]+)')); return m ? m[2] : null; }
  function token() {
    let c = cookie('CKAT');
    if (c) { if (c.indexOf('%') >= 0) { try { c = decodeURIComponent(c); } catch (e) {} } const t = c.split(';')[0].trim(); if (t.indexOf('eyJ') === 0) return t; }
    if (window._ACCESS_TOKEN) return window._ACCESS_TOKEN;
    return null;
  }
  function traceId() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); }); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function normDate(s) { if (!s) return ''; if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const d = new Date(s); return isNaN(d.getTime()) ? '' : ymd(d); }
  function mapCat(name, type) {
    const k = String(name || '').toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const ty = (type || '').toUpperCase();
    // Account transfers and credit-card payments -> Transfer (excluded from
    // all ledger totals). Checked first so they never count as income/expense.
    if (ty === 'TRANSFER' || ty === 'PAYMENT' || k.indexOf('TRANSFER') >= 0 || k.indexOf('CREDIT_CARD_PAYMENT') >= 0 || k === 'PAYMENT' || k === 'PAYMENTS' || k === 'CARD_PAYMENT') return 'Transfer';
    if (ty === 'INCOME') return 'Other Income';
    return CAT[k] || 'Other';
  }
  function cell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function acctMask(a) { if (!a) return ''; return String(a.mask || a.lastFour || a.last4 || a.accountNumberMask || a.partialAccountNumber || a.maskedAccountNumber || '').replace(/[^0-9]/g, '').slice(-4); }
  function norm(t) { return { id: t.id, date: t.date, description: (t.description || (t.merchant && t.merchant.name) || ''), category: (t.category && t.category.name) || '', categoryType: (t.category && t.category.type) || '', amount: (t.amount && t.amount.value) || 0, account: (t.account && t.account.name) || '', provider: (t.account && t.account.providerName) || '', mask: acctMask(t.account) }; }
  // Build a useful account label: prefix the bank when the name is just a
  // product type ("CREDIT CARD"), and append the last 4 digits when present.
  function acctLabel(provider, name, mask) {
    const p = (provider || '').trim(), n = (name || '').trim(), m = (mask || '').trim();
    let base;
    if (p && n) base = n.toUpperCase().indexOf(p.toUpperCase()) >= 0 ? n : p + ' ' + n;
    else base = n || p || '';
    return m ? (base + ' ' + m).trim() : base;
  }

  let banner;
  function status(msg) {
    if (!banner) {
      banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;top:12px;left:12px;right:12px;z-index:99999;padding:12px 16px;background:rgba(0,0,0,.85);color:#fff;border-radius:8px;font:14px -apple-system,sans-serif';
      document.body.appendChild(banner);
    }
    banner.textContent = msg;
  }
  function done(msg) { if (banner) banner.remove(); banner = null; alert(msg); }

  try {
    const tok = token();
    if (!tok) return done('NO_TOKEN: nao achei a sessao. Abra a pagina de transacoes logado e tente de novo.');
    status('Conectando ao Credit Karma...');
    const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok, 'ck-client-name': 'prime_web', 'ck-client-version': CLIENT_VERSION, 'ck-cookie-id': cookie('CKTRKID') || '', 'ck-device-type': 'Desktop', 'ck-trace-id': cookie('CKTRACEID') || traceId() };
    const all = [], seen = {}; let sampleRaw = null;
    function add(arr) { if (!arr) return; if (!sampleRaw && arr.length) sampleRaw = arr[0]; for (let i = 0; i < arr.length; i++) { const t = arr[i], k = t.id || ((t.description || '') + '_' + t.date + '_' + ((t.amount && t.amount.value) || 0)); if (seen[k]) continue; seen[k] = 1; all.push(norm(t)); } }

    // Phase 1: GetTransactionsList
    const listBody = { extensions: { persistedQuery: { sha256Hash: LIST_HASH, version: 1 } }, operationName: 'GetTransactionsList', variables: { input: { accountInput: {}, categoryInput: { categoryId: null, primeCategoryType: null } } } };
    const r1 = await fetch(ENDPOINT, { method: 'POST', headers: headers, credentials: 'include', body: JSON.stringify(listBody) });
    const d1 = await r1.json();
    if (d1.errors) { const es = JSON.stringify(d1.errors); if (es.indexOf('PersistedQueryNotFound') >= 0 || es.indexOf('PERSISTED_QUERY_NOT_FOUND') >= 0) return done('HASH_OUTDATED: a API mudou. Atualize os hashes (ver README).'); }
    const p1 = (d1.data && d1.data.prime) || {};
    const listPrimeKeys = Object.keys(p1).join('|') || (d1.data ? Object.keys(d1.data).join('|') : 'no-data');
    add((p1.transactionsHub && p1.transactionsHub.transactionPage && p1.transactionsHub.transactionPage.transactions) || (p1.transactionList && p1.transactionList.transactions) || []);

    // Phase 2: GetTransactions paginated
    let after = null, has = true, pages = 0;
    while (has && pages < MAX_PAGES) {
      pages++;
      status('Buscando pagina ' + pages + ' (' + all.length + ' transacoes)...');
      const vars = { input: { accountInput: {}, categoryInput: { categoryId: null, primeCategoryType: null }, datePeriodInput: { datePeriod: null }, paginationInput: {} } };
      if (after) vars.input.paginationInput.afterCursor = after;
      const body = { extensions: { persistedQuery: { sha256Hash: PAGE_HASH, version: 1 } }, operationName: 'GetTransactions', variables: vars };
      const r = await fetch(ENDPOINT, { method: 'POST', headers: headers, credentials: 'include', body: JSON.stringify(body) });
      if (!r.ok) break;
      const d = await r.json();
      if (d.errors) { const es2 = JSON.stringify(d.errors); if (pages === 1 && (es2.indexOf('PersistedQueryNotFound') >= 0 || es2.indexOf('PERSISTED_QUERY_NOT_FOUND') >= 0)) return done('HASH_OUTDATED: a API mudou. Atualize os hashes (ver README).'); break; }
      const tp = d.data && d.data.prime && d.data.prime.transactionsHub && d.data.prime.transactionsHub.transactionPage;
      if (!tp) break;
      const txns = tp.transactions || [];
      if (txns.length === 0) break;
      add(txns);
      const oldest = new Date(txns[txns.length - 1].date).getTime();
      has = (tp.pageInfo && tp.pageInfo.hasNextPage) || false;
      after = (tp.pageInfo && tp.pageInfo.endCursor) || null;
      if (!isNaN(oldest) && oldest < START_MS) break;
      await new Promise(function (res) { setTimeout(res, 400); });
    }

    // Build rows within the window
    const rows = [];
    for (const t of all) {
      const date = normDate(t.date);
      if (!date) continue;
      if (new Date(date).getTime() < START_MS) continue;
      rows.push({ date: date, description: t.description || '', amount: Math.abs(Number(t.amount) || 0), category: mapCat(t.category, t.categoryType), account: acctLabel(t.provider, t.account, t.mask), ck_account: t.account || '', provider: t.provider || '', ck_category: t.category || '', type: (t.categoryType || '').toUpperCase() === 'INCOME' ? 'income' : 'expense' });
    }
    rows.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    if (rows.length === 0) {
      if (banner) { banner.remove(); banner = null; }
      const diag = 'fetched=' + all.length + '\nlistPrimeKeys=' + listPrimeKeys + '\nsample=' + (sampleRaw ? JSON.stringify(sampleRaw).slice(0, 1200) : 'null');
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.92);color:#fff;font:14px -apple-system,sans-serif;padding:20px;text-align:center';
      const t1 = document.createElement('div'); t1.textContent = '0 linhas no periodo. Copie o diagnostico e me mande:'; t1.style.cssText = 'margin-bottom:10px';
      const ta = document.createElement('textarea'); ta.value = diag; ta.style.cssText = 'width:94%;height:55%;font-size:12px';
      const cb = document.createElement('button'); cb.textContent = 'Fechar'; cb.style.cssText = 'margin-top:12px;padding:10px 18px;border:none;border-radius:10px;background:#444;color:#fff'; cb.onclick = function () { ov.remove(); };
      ov.appendChild(t1); ov.appendChild(ta); ov.appendChild(cb); document.body.appendChild(ov);
      return;
    }

    const header = ['date', 'description', 'amount', 'category', 'account', 'ck_account', 'provider', 'ck_category', 'type'];
    const lines = [header.join(',')];
    for (const r of rows) lines.push([r.date, r.description, r.amount, r.category, r.account, r.ck_account, r.provider, r.ck_category, r.type].map(cell).join(','));
    const csv = lines.join('\n');
    const name = 'creditkarma_' + ymd(new Date(START_MS)) + '_to_' + ymd(new Date()) + '.csv';

    if (banner) banner.remove(); banner = null;
    const file = new File([csv], name, { type: 'text/csv' });

    // iOS only allows navigator.share / clipboard during a *fresh* user
    // gesture. After the long async fetch our tap is no longer "active", so
    // we hand off via a button the user taps now.
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.92);color:#fff;font:16px -apple-system,sans-serif;padding:24px;text-align:center';
    const info = document.createElement('div');
    info.style.cssText = 'margin-bottom:20px;max-width:340px;line-height:1.4';
    info.textContent = rows.length + ' transacoes prontas. Toque em Salvar CSV.';
    const btn = document.createElement('button');
    btn.textContent = 'Salvar CSV';
    btn.style.cssText = 'padding:16px 32px;font-size:18px;font-weight:600;border:none;border-radius:12px;background:#2ecc71;color:#fff';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Cancelar';
    closeBtn.style.cssText = 'margin-top:14px;padding:10px 18px;border:none;border-radius:10px;background:#444;color:#fff';
    overlay.appendChild(info); overlay.appendChild(btn); overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
    closeBtn.onclick = function () { overlay.remove(); };
    btn.onclick = async function () {
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          // Share ONLY the file — passing title/text makes iOS also save a .txt.
          await navigator.share({ files: [file] });
        } else {
          await navigator.clipboard.writeText(csv);
          alert('Share de arquivo indisponivel; CSV copiado pra area de transferencia.');
        }
        overlay.remove();
      } catch (e) {
        try {
          await navigator.clipboard.writeText(csv);
          alert('Compartilhamento cancelado/indisponivel. CSV copiado pra area de transferencia.');
          overlay.remove();
        } catch (e2) {
          info.textContent = 'Copie o CSV abaixo (toque e segure -> Selecionar tudo -> Copiar):';
          btn.style.display = 'none';
          const ta = document.createElement('textarea');
          ta.value = csv;
          ta.style.cssText = 'width:92%;height:45%;margin-top:12px;font-size:12px';
          overlay.appendChild(ta);
        }
      }
    };
  } catch (e) {
    done('EXCEPTION: ' + ((e && e.message) || e));
  }
})();
