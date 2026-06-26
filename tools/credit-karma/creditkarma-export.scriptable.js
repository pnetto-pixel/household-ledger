// Credit Karma -> Household Ledger CSV exporter (iOS Scriptable)
// ---------------------------------------------------------------
// Runs entirely on iPhone via the Scriptable app. It opens Credit Karma in
// an in-app WebView, lets you log in, then calls Credit Karma's internal
// GraphQL API *from inside that logged-in page* (so cookies + CORS work just
// like the real web app). The result is written as a CSV whose first five
// columns match the Household Ledger import format:
//
//     date,description,amount,category,account
//
// plus a couple of extra columns (ck_category,type) to help you fix the
// category/account mapping during import.
//
// Setup + usage steps are in tools/credit-karma/README.md.
//
// The GraphQL persisted-query hashes and client version below mirror what
// Credit Karma's web app sends. If Credit Karma updates their schema the
// script reports HASH_OUTDATED and you'll need to refresh these two hashes
// (see README "Troubleshooting").

// ---- Config ---------------------------------------------------------------
const DAYS_BACK = 90; // how far back to export; change as you like
const MAX_PAGES = 60; // safety cap on pagination (each page ~ up to 50 txns)
const TRANSACTIONS_LIST_HASH =
  'c3c0a630b5cd938595c5901807f63b807e63c71f54a8fcb55e8c9084cb70832a';
const TRANSACTIONS_QUERY_HASH =
  'f669c7e42eb464861cb77d9f27826d0847ddfb5f5079a6ab7e5e2470c9617db8';
const CLIENT_VERSION = '2.0.8';

// Credit Karma category -> Household Ledger category.
// Keyed by a normalized token so it matches both the enum form
// ("FOOD_AND_DINING") and a display form ("Food & Dining").
const CATEGORY_MAP = {
  MORTGAGE_AND_RENT: 'Mortgage',
  HOME_AND_GARDEN: 'Home',
  SHOPPING: 'Shopping',
  AUTO_AND_TRANSPORT: 'Transport',
  FOOD_AND_DINING: 'Restaurant',
  HEALTH_AND_FITNESS: 'Medical',
  TRAVEL_AND_VACATION: 'Travel',
  BILLS_AND_UTILITIES: 'Utilities',
  TAXES: 'Other',
  PETS: 'Dog',
  GROCERIES: 'Groceries',
  FEES_AND_CHARGES: 'Services',
  PERSONAL_CARE: 'Services',
  BUSINESS_SERVICES: 'Services',
  ENTERTAINMENT: 'Entertainment',
  GIFTS: 'Other',
  EDUCATION: 'Other',
  DONATIONS: 'Other',
  MISC_EXPENSES: 'Other',
};

// ---- Date helpers ---------------------------------------------------------
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}
function ymd(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function normDate(s) {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : ymd(d);
}

const now = new Date();
const startDate = new Date(now.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);
const START_MS = startDate.getTime();
const startStr = ymd(startDate);
const endStr = ymd(now);

// ---- In-page extraction script -------------------------------------------
// This string runs inside the Credit Karma WebView. It avoids backticks and
// ${} so it can live inside the template literal below. It must end by
// calling completion(jsonString).
const PAGE_CODE = `(async () => {
  function cookie(n){var m=document.cookie.match(new RegExp('(^| )'+n+'=([^;]+)'));return m?m[2]:null;}
  function token(){
    var c=cookie('CKAT');
    if(c){ if(c.indexOf('%')>=0){try{c=decodeURIComponent(c);}catch(e){}} var t=c.split(';')[0].trim(); if(t.indexOf('eyJ')===0) return t; }
    if(window._ACCESS_TOKEN) return window._ACCESS_TOKEN;
    return null;
  }
  function traceId(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});}
  function acctMask(a){if(!a)return '';var direct=String(a.mask||a.lastFour||a.last4||a.accountNumberMask||a.partialAccountNumber||a.maskedAccountNumber||'').replace(/[^0-9]/g,'').slice(-4);if(direct)return direct;var m=String(a.accountTypeAndNumberDisplay||'').match(/\(\D*([0-9]{4})\)/);return m?m[1]:'';}
  function norm(t){return {id:t.id,date:t.date,description:(t.description||(t.merchant&&t.merchant.name)||''),category:(t.category&&t.category.name)||'',categoryType:(t.category&&t.category.type)||'',amount:(t.amount&&t.amount.value)||0,account:(t.account&&t.account.name)||'',accountType:(t.account&&t.account.type)||'',provider:(t.account&&t.account.providerName)||'',mask:acctMask(t.account),urn:(t.account&&t.account.accountURN)||'',status:t.status||''};}
  function isPending(t){return String(t.status||'').toUpperCase().indexOf('PENDING')>=0;}
  try {
    var ENDPOINT='https://api.creditkarma.com/graphql';
    var LIST_HASH='__LIST_HASH__';
    var PAGE_HASH='__PAGE_HASH__';
    var START_MS=__START_MS__;
    var MAX_PAGES=__MAX_PAGES__;
    var tok=token();
    if(!tok){ completion(JSON.stringify({error:'NO_TOKEN'})); return; }
    var headers={'Accept':'application/json','Content-Type':'application/json','Authorization':'Bearer '+tok,'ck-client-name':'prime_web','ck-client-version':'__CLIENT_VERSION__','ck-cookie-id':cookie('CKTRKID')||'','ck-device-type':'Desktop','ck-trace-id':cookie('CKTRACEID')||traceId()};
    var all=[]; var seen={};
    function add(arr){ if(!arr) return; for(var i=0;i<arr.length;i++){var t=arr[i]; var k=t.id||((t.description||'')+'_'+t.date+'_'+((t.amount&&t.amount.value)||0)); if(seen[k]) continue; seen[k]=1; all.push(norm(t)); } }
    // Phase 1: GetTransactionsList (fast bulk of recent activity)
    var listBody={extensions:{persistedQuery:{sha256Hash:LIST_HASH,version:1}},operationName:'GetTransactionsList',variables:{input:{accountInput:{},categoryInput:{categoryId:null,primeCategoryType:null}}}};
    var r1=await fetch(ENDPOINT,{method:'POST',headers:headers,credentials:'include',body:JSON.stringify(listBody)});
    var d1=await r1.json();
    if(d1.errors){ var es=JSON.stringify(d1.errors); if(es.indexOf('PersistedQueryNotFound')>=0||es.indexOf('PERSISTED_QUERY_NOT_FOUND')>=0){ completion(JSON.stringify({error:'HASH_OUTDATED',detail:es})); return; } }
    var p1=(d1.data&&d1.data.prime)||{};
    var listTx=(p1.transactionsHub&&p1.transactionsHub.transactionPage&&p1.transactionsHub.transactionPage.transactions)||(p1.transactionList&&p1.transactionList.transactions)||[];
    add(listTx);
    // Phase 2: GetTransactions paginated, walk back until older than START_MS
    var after=null, has=true, pages=0;
    while(has && pages<MAX_PAGES){
      pages++;
      var vars={input:{accountInput:{},categoryInput:{categoryId:null,primeCategoryType:null},datePeriodInput:{datePeriod:null},paginationInput:{}}};
      if(after) vars.input.paginationInput.afterCursor=after;
      var body={extensions:{persistedQuery:{sha256Hash:PAGE_HASH,version:1}},operationName:'GetTransactions',variables:vars};
      var r=await fetch(ENDPOINT,{method:'POST',headers:headers,credentials:'include',body:JSON.stringify(body)});
      if(!r.ok){ break; }
      var d=await r.json();
      if(d.errors){ var es2=JSON.stringify(d.errors); if(pages===1 && (es2.indexOf('PersistedQueryNotFound')>=0||es2.indexOf('PERSISTED_QUERY_NOT_FOUND')>=0)){ completion(JSON.stringify({error:'HASH_OUTDATED',detail:es2})); return; } break; }
      var tp=d.data&&d.data.prime&&d.data.prime.transactionsHub&&d.data.prime.transactionsHub.transactionPage;
      if(!tp){ break; }
      var txns=tp.transactions||[];
      if(txns.length===0){ break; }
      add(txns);
      var oldest=new Date(txns[txns.length-1].date).getTime();
      has=(tp.pageInfo&&tp.pageInfo.hasNextPage)||false;
      after=(tp.pageInfo&&tp.pageInfo.endCursor)||null;
      if(!isNaN(oldest) && oldest<START_MS){ break; }
      await new Promise(function(res){setTimeout(res,400);});
    }
    completion(JSON.stringify({ok:true,transactions:all,pages:pages}));
  } catch(e){ completion(JSON.stringify({error:'EXCEPTION',detail:String((e&&e.message)||e)})); }
})();`
  .replace('__LIST_HASH__', TRANSACTIONS_LIST_HASH)
  .replace('__PAGE_HASH__', TRANSACTIONS_QUERY_HASH)
  .replace('__START_MS__', String(START_MS))
  .replace('__MAX_PAGES__', String(MAX_PAGES))
  .replace('__CLIENT_VERSION__', CLIENT_VERSION);

// ---- Category mapping (Scriptable side) -----------------------------------
function mapCategory(ckName, ckType) {
  const key = String(ckName || '')
    .toUpperCase()
    .replace(/&/g, 'AND')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const ty = (ckType || '').toUpperCase();
  // Account transfers and credit-card payments -> Transfer (excluded from all
  // ledger totals). Checked first so they never count as income/expense.
  if (ty === 'TRANSFER' || ty === 'PAYMENT' || key.indexOf('TRANSFER') >= 0 || key.indexOf('CREDIT_CARD_PAYMENT') >= 0 || key === 'PAYMENT' || key === 'PAYMENTS' || key === 'CARD_PAYMENT') return 'Transfer';
  if (ty === 'INCOME') return 'Other Income';
  return CATEGORY_MAP[key] || 'Other';
}

// ---- CSV ------------------------------------------------------------------
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return '"' + s.replace(/"/g, '""') + '"';
}
// Build a useful account label: prefix the bank when the name is just a
// product type ("CREDIT CARD"), and append the last 4 digits when present.
function acctLabel(provider, name, mask) {
  const p = (provider || '').trim(), n = (name || '').trim(), m = (mask || '').trim();
  let base;
  if (p && n) base = n.toUpperCase().indexOf(p.toUpperCase()) >= 0 ? n : p + ' ' + n;
  else base = n || p || '';
  return m ? (base + ' ' + m).trim() : base;
}
function toCSV(rows) {
  const header = ['date', 'description', 'amount', 'category', 'account', 'ck_account', 'provider', 'ck_category', 'type', 'account_urn', 'last4', 'source_id'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [r.date, r.description, r.amount, r.category, r.account, r.ck_account, r.provider, r.ck_category, r.type, r.account_urn, r.last4, r.source_id]
        .map(csvCell)
        .join(',')
    );
  }
  return lines.join('\n');
}

// ---- Main -----------------------------------------------------------------
async function main() {
  const intro = new Alert();
  intro.title = 'Credit Karma export';
  intro.message =
    'Vou abrir o Credit Karma. Faça login (se pedir), espere a página de ' +
    'transações carregar e toque em "Done" no canto superior. Período: ' +
    startStr + ' a ' + endStr + ' (' + DAYS_BACK + ' dias).';
  intro.addAction('Abrir Credit Karma');
  intro.addCancelAction('Cancelar');
  if ((await intro.presentAlert()) === -1) return;

  const wv = new WebView();
  await wv.loadURL('https://www.creditkarma.com/networth/transactions');
  await wv.present(true); // user logs in, then taps Done

  let raw;
  try {
    raw = await wv.evaluateJavaScript(PAGE_CODE, true);
  } catch (e) {
    return showError('Falha ao executar na página: ' + e.message);
  }

  let res;
  try {
    res = JSON.parse(raw);
  } catch (e) {
    return showError('Resposta inesperada da página.');
  }

  if (res.error === 'NO_TOKEN')
    return showError(
      'Não achei o token de sessão. Você está logado no Credit Karma? ' +
        'Reabra e confirme que a página de transações carregou antes de tocar em Done.'
    );
  if (res.error === 'HASH_OUTDATED')
    return showError(
      'A API do Credit Karma mudou (PersistedQueryNotFound). É preciso ' +
        'atualizar os hashes GraphQL no script — veja o README (Troubleshooting).'
    );
  if (res.error) return showError('Erro: ' + res.error + ' ' + (res.detail || ''));

  const txns = res.transactions || [];
  // Apple Card "Daily Cash" cashback. Credit Karma reports it on the Apple
  // accounts as a Transfer, never as income, with a sign that is the OPPOSITE
  // of the ledger's income convention:
  //   - "Deposit"    = cashback earned, paid into Apple Savings (CK: negative)
  //   - "Adjustment" = cashback clawed back when a purchase is refunded,
  //                    charged on the Apple Card (CK: positive)
  // Both belong in "Other Income": the deposit adds, the adjustment nets it
  // back out. The correct ledger amount is simply the negation of CK's raw
  // value (see naturalAmount). Heuristic: Apple provider + a "Deposit" or
  // "Adjustment" description. A manual deposit into Apple Savings would also
  // match (accepted trade-off — those are rare).
  const isAppleDailyCash = (t) => {
    const acct = (String(t.provider || '') + ' ' + String(t.account || '')).toUpperCase();
    if (acct.indexOf('APPLE CARD') < 0) return false;
    const desc = String(t.description || '').toUpperCase();
    return desc.indexOf('DEPOSIT') >= 0 || desc.indexOf('ADJUSTMENT') >= 0;
  };
  // Reversal detection for EXPENSE transactions (refund = minority sign).
  // Income is always emitted as positive (Math.abs) regardless of the raw CK
  // sign; the calibration heuristic would otherwise mis-classify a minority
  // sign as a reversal. Income clawbacks (very rare) can be corrected manually
  // in EditModal. Apple Daily Cash is handled separately above.
  const isInc = (t) => (t.categoryType || '').toUpperCase() === 'INCOME' || isAppleDailyCash(t);
  let expPos = 0, expNeg = 0;
  for (const t of txns) {
    const v = Number(t.amount) || 0;
    if (!v || isInc(t)) continue;
    v > 0 ? expPos++ : expNeg++;
  }
  const expSign = expPos === expNeg ? 0 : expPos > expNeg ? 1 : -1;
  const signsReliable = expSign !== 0;
  const naturalAmount = (t) => {
    const raw = Number(t.amount) || 0;
    const mag = Math.abs(raw);
    // Apple Daily Cash: negate CK's raw amount. "Deposit" (CK-negative)
    // becomes a positive credit; "Adjustment" (CK-positive) becomes a
    // negative clawback that nets the earned cashback back out.
    if (isAppleDailyCash(t)) return -raw;
    // Other income is always a credit to the user — always positive. Clawbacks
    // are rare enough to fix manually in EditModal.
    if (isInc(t)) return mag;
    // Expense: use calibrated sign to detect refunds (minority sign = reversal).
    if (!signsReliable) return mag;
    const rs = raw > 0 ? 1 : raw < 0 ? -1 : 0;
    // minority sign (opposite to expSign majority) = refund/reversal
    const reversal = rs !== expSign;
    return reversal ? -mag : mag;
  };

  // Filter to the requested window + normalize to ledger rows.
  const rows = [];
  for (const t of txns) {
    const date = normDate(t.date);
    if (!date) continue;
    if (isPending(t)) continue;
    const ms = new Date(date).getTime();
    if (ms < START_MS) continue;
    rows.push({
      date,
      description: t.description || '',
      amount: naturalAmount(t),
      category: isAppleDailyCash(t) ? 'Other Income' : mapCategory(t.category, t.categoryType),
      account: acctLabel(t.provider, t.account, t.mask),
      ck_account: t.account || '',
      provider: t.provider || '',
      ck_category: t.category || '',
      type: isInc(t) ? 'income' : 'expense',
      account_urn: t.urn || '',
      last4: t.mask || '',
      source_id: t.id || '',
    });
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  if (rows.length === 0)
    return showError('Nenhuma transação encontrada no período. Tente aumentar DAYS_BACK.');

  const csv = toCSV(rows);
  const fm = FileManager.iCloud();
  const dir = fm.documentsDirectory();
  const fileName = 'creditkarma_' + startStr + '_to_' + endStr + '.csv';
  const path = fm.joinPath(dir, fileName);
  fm.writeString(path, csv);

  const done = new Alert();
  done.title = 'Pronto';
  done.message =
    rows.length + ' transações exportadas (' + (res.pages || 0) + ' páginas).\n' +
    'Arquivo salvo no Scriptable (iCloud Drive):\n' + fileName;
  done.addAction('Compartilhar / Salvar em Arquivos');
  done.addAction('OK');
  const choice = await done.presentAlert();
  if (choice === 0) {
    // Share the actual file so you can drop it straight into Files / the importer.
    await ShareSheet.present([path]);
  }
}

function showError(msg) {
  const a = new Alert();
  a.title = 'Credit Karma export';
  a.message = msg;
  a.addAction('OK');
  return a.presentAlert();
}

await main();
