// src/ledger.js
// Pure, stateless financial-core helpers extracted from App.jsx so they can
// be unit-tested (Vitest) without dragging in React/recharts. Everything here
// takes its inputs as parameters — no module state, no DOM, no fetch. The
// runtime-configurable pieces (ACCOUNTS/INCOME_CATEGORIES/etc.) stay in
// App.jsx, which passes them in.
//
// Invariants protected by the test suite (see src/ledger.test.js):
// - `amount` is a SIGNED cash flow; aggregations sum signed values and
//   net = income + expenses (never income − expenses, never Math.abs).
// - `Transfer` is excluded from every total.
// - Description-rule order is semantic: first match wins.

export const TRANSFER_CATEGORY = "Transfer";

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

// Signed aggregation core. `incomeCategories` is the current runtime list —
// App.jsx wraps this with its live module state.
export function computeTotalsCore(rows, incomeCategories) {
  let income = 0;
  let expenses = 0;
  for (const t of rows) {
    if (t.category === TRANSFER_CATEGORY) continue; // Transfer excluded from all totals
    const amt = Number(t.amount) || 0; // signed: negatives are refunds/clawbacks
    if (incomeCategories.includes(t.category)) income += amt;
    else expenses += amt;
  }
  return { income, expenses, net: income + expenses };
}

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

// year/month are "All" or "YYYY"/"MM".
export function matchPeriod(dateStr, year, month) {
  if (year === "All" && month === "All") return true;
  const y = (dateStr || "").slice(0, 4);
  const m = (dateStr || "").slice(5, 7);
  if (year !== "All" && y !== year) return false;
  if (month !== "All" && m !== month) return false;
  return true;
}

// Distinct years present in the data, newest first.
export function availableYears(rows) {
  const years = new Set();
  for (const t of rows) {
    const y = (t.date || "").slice(0, 4);
    if (y) years.add(y);
  }
  return [...years].sort((a, b) => (a < b ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Bucket helpers for Charts granularity
// ---------------------------------------------------------------------------

// Returns the bucket key for a date string given a granularity mode.
// M → "YYYY-MM" · Q → "YYYY-Q1".."YYYY-Q4" · H → "YYYY-H1"/"YYYY-H2" · Y → "YYYY"
export function bucketKey(dateStr, granularity) {
  if (!dateStr) return "";
  const y = dateStr.slice(0, 4);
  const mm = dateStr.slice(5, 7);
  const mo = parseInt(mm, 10); // 1–12
  if (granularity === "Y") return y;
  if (granularity === "H") return `${y}-${mo <= 6 ? "H1" : "H2"}`;
  if (granularity === "Q") {
    const q = mo <= 3 ? "Q1" : mo <= 6 ? "Q2" : mo <= 9 ? "Q3" : "Q4";
    return `${y}-${q}`;
  }
  // "M" (default)
  return `${y}-${mm}`;
}

// Human-readable label for a bucket key.
// "2026-01" → "Jan/26" · "2026-Q1" → "Q1/26" · "2026-H2" → "H2/26" · "2026" → "2026"
export function bucketLabel(key) {
  if (!key) return key;
  if (/^\d{4}$/.test(key)) return key; // Year
  const [y, rest] = key.split("-");
  const yy = y.slice(2); // last 2 digits
  if (rest && (rest.startsWith("Q") || rest.startsWith("H"))) return `${rest}/${yy}`;
  // Month: rest is "MM"
  const mo = parseInt(rest, 10);
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[mo - 1] || rest}/${yy}`;
}

// ---------------------------------------------------------------------------
// CK category mapping
// ---------------------------------------------------------------------------

// Normalize a raw Credit Karma category name into the UPPER_SNAKE_CASE token
// used as the lookup key — identical regex to `mapCat`/`mapCategory` in the
// exporters, so tokens computed here line up with the seed's keys.
export function ckCategoryToken(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/&/g, "AND")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Pure re-implementation of the exporters' `mapCat`/`mapCategory`: Transfer/
// Payment checked first (excluded from all ledger totals), then Income, then
// the table lookup with an "Other" fallback. `mapObj` is a parameter (not the
// live CK_CATEGORY_MAP) so the audit UI can preview a draft mapping before
// saving.
export function mapCkCategory(ckCategoryRaw, ckType, mapObj) {
  const token = ckCategoryToken(ckCategoryRaw);
  const ty = String(ckType || "").toUpperCase();
  if (
    ty === "TRANSFER" || ty === "PAYMENT" ||
    token.indexOf("TRANSFER") >= 0 || token.indexOf("CREDIT_CARD_PAYMENT") >= 0 ||
    token === "PAYMENT" || token === "PAYMENTS" || token === "CARD_PAYMENT"
  ) {
    return TRANSFER_CATEGORY;
  }
  if (ty === "INCOME") return "Other Income";
  return (mapObj && mapObj[token]) || "Other";
}

// ---------------------------------------------------------------------------
// Description rules
// ---------------------------------------------------------------------------

// True when the row matches the rule's substring pattern on the configured
// field(s). Case-insensitive substring match — no regex. A rule MAY carry an
// optional `providerPattern` (an extra AND condition against
// srcAccount||account) — used by rules granted `allowTransferOverride`.
export function descriptionRuleMatches(row, rule) {
  const desc = String(row.description || "").toLowerCase();
  const prov = String(row.srcAccount || row.account || "").toLowerCase();
  const pat = String(rule.pattern || "").toLowerCase();
  if (!pat) return false;
  let baseMatch;
  if (rule.matchField === "description") baseMatch = desc.includes(pat);
  else if (rule.matchField === "provider") baseMatch = prov.includes(pat);
  else baseMatch = desc.includes(pat) || prov.includes(pat); // "both"
  if (!baseMatch) return false;

  const extraProvider = String(rule.providerPattern || "").trim().toLowerCase();
  if (extraProvider && !prov.includes(extraProvider)) return false; // AND extra condition

  return true;
}

// Pre-save conflict check for the Description rules editor (purely
// informational — never blocks, never reprocesses, never mutates anything).
export function computeDescriptionRuleConflicts(transactions, rule) {
  const result = { transferCount: 0, transferExamples: [], manualCount: 0, manualExamples: [] };
  if (!rule || !String(rule.pattern || "").trim()) return result;
  for (const row of transactions || []) {
    if (!descriptionRuleMatches(row, rule)) continue;
    const label = `${String(row.description || row.srcAccount || "").slice(0, 40)} (${row.date || "?"})`;
    if (row.category === TRANSFER_CATEGORY) {
      result.transferCount++;
      if (result.transferExamples.length < 5) result.transferExamples.push(label);
    }
    if (row.categoryManual === true) {
      result.manualCount++;
      if (result.manualExamples.length < 5) result.manualExamples.push(label);
    }
  }
  return result;
}

// Returns the FIRST rule that matches the row, or null when none match. Array
// order is semantic (first match wins). buildRow uses this to also read the
// winning rule's `allowTransferOverride` flag.
export function findMatchingDescriptionRule(row, rules) {
  for (const rule of rules || []) {
    if (descriptionRuleMatches(row, rule)) return rule;
  }
  return null;
}

// Returns the destinationCategory of the FIRST rule that matches, or null when
// none match. Never returns "Transfer" (sanitized out on save).
export function matchDescriptionCategoryRule(row, rules) {
  const r = findMatchingDescriptionRule(row, rules);
  return r ? r.destinationCategory : null;
}

// Resolve a free-text value against a list of allowed options
// (case-insensitive), falling back when it matches nothing. Lived in App.jsx
// until the import-time category pipeline moved here — it's the same function,
// re-exported so both sides keep using ONE implementation.
export function matchOption(value, options, fallback) {
  if (!value) return fallback;
  const v = String(value).toLowerCase();
  const hit = (options || []).find((o) => String(o).toLowerCase() === v);
  return hit || fallback;
}

// ---------------------------------------------------------------------------
// Import-time category resolution
// ---------------------------------------------------------------------------

// The category half of `buildRow`, extracted verbatim so EVERY import path
// (CSV, Credit Karma and SimpleFin) runs the same pipeline. Before this
// extraction SimpleFin rows were classified with a bare
// `matchOption(t.category, CATEGORIES, "Other")`, so they never saw the CK
// category map nor the Description rules and always landed in "Other".
//
// Precedence (PR #135 — must stay byte-for-byte equivalent):
//   1. `csvCategory`   = the source's own category column, matched against the
//                        current category list ("Other" when unknown).
//   2. `recomputed`    = when a raw CK category traveled with the row, the
//                        editable CK map wins over the source's column;
//                        otherwise `csvCategory`.
//   3. the FIRST matching description rule overrides that.
//   4. Transfer safety net: a description rule can NEVER de-transfer a row.
//      The ONLY escape is a winning rule with `allowTransferOverride: true`
//      (which itself requires a non-empty `providerPattern`).
//
// `row` carries { description, srcAccount, account, category, ckCategory,
// ckType }; `ctx` carries the runtime-configurable lists
// { categories, ckCategoryMap, descriptionRules } (App.jsx owns those).
export function resolveImportCategory(row, ctx) {
  const categories = (ctx && ctx.categories) || [];
  const ckCategoryMap = (ctx && ctx.ckCategoryMap) || {};
  const descriptionRules = (ctx && ctx.descriptionRules) || [];

  const csvCategory = matchOption(row.category, categories, "Other");
  const recomputedCategory = row.ckCategory
    ? mapCkCategory(row.ckCategory, row.ckType, ckCategoryMap)
    : csvCategory;

  const matchedRule = findMatchingDescriptionRule(
    { description: row.description, srcAccount: row.srcAccount, account: row.account },
    descriptionRules
  );
  const overridden = matchedRule ? matchedRule.destinationCategory : recomputedCategory;

  const category = (matchedRule && matchedRule.allowTransferOverride)
    ? matchedRule.destinationCategory
    : ((overridden === TRANSFER_CATEGORY || csvCategory === TRANSFER_CATEGORY)
        ? TRANSFER_CATEGORY
        : matchOption(overridden, categories, "Other"));

  return { category, csvCategory, matchedRule };
}

// ---------------------------------------------------------------------------
// Account matching
// ---------------------------------------------------------------------------

// Normalize an account-ish string for matching: lowercase, strip everything
// that isn't a letter or digit ("T-Mobile" / "t mobile" / "AT&T" all collapse).
export function normAccount(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Classify a source account/card value into a canonical account name, given
// the current accounts list and an explicit alias table. Tries an exact
// (normalized) match first, then the alias keyword table. Returns "" when
// nothing matches — unrecognized rows surface as unmapped instead of hiding
// under a guessed account. Returns both the resolved account and a
// plain-text reason for which branch fired.
export function matchAccountWithAliasesReason(rawValue, aliasesArray, accounts) {
  const n = normAccount(rawValue);
  if (!n) return { account: "", reason: "" };
  const exact = (accounts || []).find((a) => normAccount(a) === n);
  if (exact) {
    return { account: exact, reason: `Exact account name match: '${rawValue}' → ${exact}` };
  }
  for (const [account, aliases] of aliasesArray) {
    const hit = aliases.find((al) => n.includes(al));
    if (hit) {
      return { account, reason: `Matched alias fragment: '${hit}' → ${account}` };
    }
  }
  return { account: "", reason: "" };
}

export function matchAccountWithAliases(rawValue, aliasesArray, accounts) {
  return matchAccountWithAliasesReason(rawValue, aliasesArray, accounts).account;
}

// ---------------------------------------------------------------------------
// Import de-duplication
// ---------------------------------------------------------------------------

// Content fingerprint for de-duplication: day + signed cents + normalized
// description + account. Used when a source transaction id isn't available.
// ---------------------------------------------------------------------------
// Ignored SimpleFin accounts
// ---------------------------------------------------------------------------

// Some accounts already reach the ledger through another feed (Credit Karma,
// a CSV), so syncing them from SimpleFin as well only manufactures duplicates
// the user has to reject on every single sync. This is the user-editable
// version of the hardcoded Fidelity skip in lib/simplefin.js — matched on the
// CLIENT, against the mapped row, so adding an account needs no deploy.
//
// Substring match, case-insensitive, against both the account's display name
// (`srcAccount`, e.g. "Chase Auto Lease (0870)") and its stable SimpleFin id
// (`accountUrn`) — so either "auto lease" or "0870" works, and the rule
// survives the institution renaming the account.
export function isIgnoredSimplefinAccount(row, patterns) {
  const list = Array.isArray(patterns) ? patterns : [];
  if (list.length === 0) return false;
  const haystack = `${row?.srcAccount || ""}\n${row?.accountUrn || ""}`.toLowerCase();
  return list.some((p) => {
    const needle = String(p || "").trim().toLowerCase();
    return needle !== "" && haystack.includes(needle);
  });
}

// ---------------------------------------------------------------------------
// Save-blocking row repair
// ---------------------------------------------------------------------------

// The server validates EVERY row on PUT /api/transactions and rejects the
// whole ledger with a 400 if one is malformed (`findInvalidRow`). That makes a
// single bad row permanently fatal: the save fails, the change goes back into
// the local pending mirror, the next load restores it, and it fails again —
// the ledger can never be saved until the row is fixed. Nothing on the server
// can carry a bad row (it would have been rejected on the way in), so the only
// place one can appear is a client-side import or the pending mirror.
//
// Repairing beats blocking: a row with no usable date still holds a real
// amount/description the user wants, and `buildRow` has always applied the
// same today-fallback on the CSV path.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function repairUnsavableRows(transactions, fallbackDate) {
  const rows = Array.isArray(transactions) ? transactions : [];
  const fallback = ISO_DATE_RE.test(String(fallbackDate || ""))
    ? fallbackDate
    : new Date().toISOString().slice(0, 10);
  let repaired = 0;
  const out = rows.map((t) => {
    if (!t || typeof t !== "object") return t;
    const badDate = typeof t.date !== "string" || !ISO_DATE_RE.test(t.date);
    const amount = Number(t.amount);
    const badAmount = typeof t.amount !== "number" || !Number.isFinite(t.amount);
    if (!badDate && !badAmount) return t;
    repaired++;
    return {
      ...t,
      ...(badDate ? { date: fallback } : null),
      ...(badAmount ? { amount: Number.isFinite(amount) ? amount : 0 } : null),
    };
  });
  // Rows that aren't objects at all can't be repaired into anything
  // meaningful — drop them rather than let them wedge the ledger forever.
  const cleaned = out.filter((t) => t && typeof t === "object");
  return { transactions: cleaned, repaired: repaired + (out.length - cleaned.length) };
}

export function txnFingerprint(t) {
  const amt = Math.round((Number(t.amount) || 0) * 100);
  const desc = String(t.description || "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${t.date || ""}|${amt}|${desc}|${t.account || ""}`;
}

// Stop words excluded from the fuzzy description overlap check.
const DEDUP_STOP_WORDS = new Set([
  "the", "at", "de", "da", "do", "em", "um", "uma", "para", "com",
  "and", "in", "on", "of", "to", "a", "an", "is", "it", "by", "or",
]);

// Extract significant words (>=3 chars, not stop words) from a description.
// Used both for fuzzy duplicate detection (descOverlap) and, in App.jsx's
// descFragment, to build the merchant-fragment grouping key for the
// Suggested Rules "Manual category corrections" panel.
export function descWords(desc) {
  return String(desc || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !DEDUP_STOP_WORDS.has(w));
}

// Check if two descriptions share at least one significant word.
export function descOverlap(descA, descB) {
  const wordsA = new Set(descWords(descA));
  if (wordsA.size === 0) return false;
  return descWords(descB).some((w) => wordsA.has(w));
}

// Payment-gateway / POS prefixes that different sources attach to the SAME
// purchase ("SQ *STARBUCKS #1234 SEATTLE WA" vs "Starbucks"). Stripped in a
// loop because they stack (e.g. "PURCHASE AUTHORIZED ON 07/12 SQ *…").
const MERCHANT_PREFIXES = [
  /^sq\s*\*+\s*/,
  /^tst\s*\*+\s*/,
  /^paypal\s*\*+\s*/,
  /^sp\s+/,
  /^pos\s+debit\s+/,
  /^purchase\s+authorized\s+on\s+\d{1,2}\/\d{1,2}\s*/,
];

// Reduce a raw bank description to the merchant-ish core, so the SAME purchase
// seen through two different feeds (Credit Karma vs SimpleFin) tokenizes into
// comparable words. Drops gateway prefixes, digit runs (store/order numbers)
// and a trailing 2-letter city/state code. Lowercased and whitespace-collapsed.
// The trailing-code strip runs ONCE per call on purpose (it is not idempotent:
// "starbucks wa ca" -> "starbucks wa" -> "starbucks"), so that a merchant whose
// real name ends in a two-letter word keeps it. Every consumer calls this on a
// raw description exactly once, never on its own output.
//
// Deliberately NOT wired into `descriptionRuleMatches`: description rules match
// by substring, so a "starbucks" pattern already hits "SQ *STARBUCKS #1234" —
// normalizing there would silently change how saved rules match. The single
// consumer today is the duplicate scorer's description penalty.
export function normalizeMerchant(desc) {
  let s = String(desc || "").toLowerCase().trim();
  for (let guard = 0; guard < 8; guard++) {
    let stripped = false;
    for (const re of MERCHANT_PREFIXES) {
      if (re.test(s)) {
        s = s.replace(re, "");
        stripped = true;
      }
    }
    if (!stripped) break;
  }
  s = s
    .replace(/\d+/g, " ")        // store / order / auth numbers vary per txn
    .replace(/[^a-z\s]/g, " ")   // '#', '*', '-' and friends are noise
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/\s+[a-z]{2}$/, ""); // trailing city/state code ("… SEATTLE WA")
  return s.trim();
}

// Parse YYYY-MM-DD into a UTC day integer for date-diff calculations.
export function dateToDayInt(dateStr) {
  const d = new Date(String(dateStr || "") + "T00:00:00Z");
  return isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 86400000);
}

// Score thresholds for the three-state import preview. Deliberately
// asymmetric, because the two failure modes are NOT equally bad:
// - false positive (we call a real transaction a duplicate and it lands
//   unchecked): the row silently never enters the ledger and the user has no
//   way to notice it is missing;
// - false negative (we miss a duplicate): the row shows up twice in the
//   Transactions tab, where it is visible and removable in bulk.
// Losing money data is worse than duplicating it, so only near-certainty
// (>= DUP_SCORE_CERTAIN, or a hard id/fingerprint match) unchecks a row; the
// whole "probably a duplicate" band stays CHECKED and just gets a badge plus a
// side-by-side comparison so the user decides.
export const DUP_SCORE_CERTAIN = 85;
export const DUP_SCORE_REVIEW = 60;

// Every source id a transaction answers to: its own plus any `altSourceIds`
// the user confirmed (see "mark as duplicate of" in the import preview) —
// that's what turns a fuzzy cross-source match into an exact id match on the
// next sync.
function sourceIdsOf(t) {
  const out = [];
  if (t && t.sourceId) out.push(String(t.sourceId));
  if (t && Array.isArray(t.altSourceIds)) {
    for (const s of t.altSourceIds) if (s) out.push(String(s));
  }
  return out;
}

// Pure similarity score between a candidate NEW row and an EXISTING one.
// Returns null when the pair isn't a candidate at all (different signed cents,
// or more than 5 days apart), otherwise { score, dayDiff, reasons } where
// `reasons` is short human text for the UI — the raw number never reaches the
// screen on its own.
//
//   score = 100 − date penalty − account penalty − description penalty
//
// Date:        0d→0 · 1d→5 · 2d→10 · 3d→18 · 4–5d→28 · >5d→discard
// Account:     same→0 · either side unclassified→10 · different→40
// Description: Jaccard over normalizeMerchant+descWords tokens —
//              >=0.6→0 · >=0.3→10 · at least 1 shared token→20 · none→35
// The value can go negative in the worst combination; that's fine, everything
// below DUP_SCORE_REVIEW is treated as a brand-new row anyway.

// Token pool for the description-similarity step: the display `description`
// PLUS the row's `providerDescription` when present. That second field only
// exists on a SimpleFin row where `memo` won and replaced a generic
// description/payee (lib/simplefin.js) — e.g. an Amazon purchase whose
// display description is now an itemized product list ("100 Pack Mini
// Sunscreen…") instead of the generic "AMAZON.COM*RT4XY1" merchant string.
// Without folding providerDescription back in here, that merchant-identifying
// token ("amazon") is gone from the new row entirely, and an existing
// Credit-Karma-imported row for the SAME purchase (whose only description
// ever was the generic merchant string) shares nothing with it — the
// description penalty maxes out at 35 for every single Amazon-style
// duplicate, regardless of how alike the purchases actually are. Unioning the
// two text sources restores that shared token for matching purposes without
// changing what the user sees (the display `description` is untouched).
function descTokenSet(row) {
  const text = [row?.description, row?.providerDescription].filter(Boolean).join(" ");
  return new Set(descWords(normalizeMerchant(text)));
}

export function scoreDuplicateCandidate(a, b) {
  const centsA = Math.round((Number(a.amount) || 0) * 100);
  const centsB = Math.round((Number(b.amount) || 0) * 100);
  if (centsA !== centsB) return null; // hard gate: same signed cents or nothing
  const reasons = ["mesmo valor"];

  const dayDiff = Math.abs(dateToDayInt(a.date) - dateToDayInt(b.date));
  let datePenalty;
  if (dayDiff === 0) { datePenalty = 0; reasons.push("mesmo dia"); }
  else if (dayDiff === 1) { datePenalty = 5; reasons.push("1 dia de diferença"); }
  else if (dayDiff === 2) { datePenalty = 10; reasons.push("2 dias de diferença"); }
  else if (dayDiff === 3) { datePenalty = 18; reasons.push("3 dias de diferença"); }
  else if (dayDiff <= 5) { datePenalty = 28; reasons.push(`${dayDiff} dias de diferença`); }
  else return null;

  const accA = String(a.account || "");
  const accB = String(b.account || "");
  let accountPenalty;
  if (accA && accB && accA === accB) { accountPenalty = 0; reasons.push("mesma conta"); }
  else if (!accA || !accB) { accountPenalty = 10; reasons.push("conta ainda não classificada de um dos lados"); }
  else { accountPenalty = 40; reasons.push("contas diferentes"); }

  const tokensA = descTokenSet(a);
  const tokensB = descTokenSet(b);
  let shared = 0;
  for (const w of tokensA) if (tokensB.has(w)) shared++;
  const union = new Set([...tokensA, ...tokensB]).size;
  const jaccard = union === 0 ? 0 : shared / union;
  let descPenalty;
  if (jaccard >= 0.6) { descPenalty = 0; reasons.push("descrição praticamente igual"); }
  else if (jaccard >= 0.3) { descPenalty = 10; reasons.push("descrição parecida"); }
  else if (shared >= 1) { descPenalty = 20; reasons.push("poucas palavras em comum na descrição"); }
  else { descPenalty = 35; reasons.push("descrição sem tokens em comum"); }

  return { score: 100 - datePenalty - accountPenalty - descPenalty, dayDiff, reasons };
}

// Flag duplicates in a batch of built rows against existing transactions AND
// against earlier rows in the same batch, with 1:1 consumption (an existing
// row can absorb at most one incoming row, so two identical charges never both
// collapse onto the same previous one).
//
// Each returned row carries:
//   _dupState   "certain" | "uncertain" | "new"
//   _dup        boolean — kept for the existing consumers; true only for "certain"
//   _dupScore   number | null (100 for id/fingerprint matches)
//   _dupReasons string[] — short PT explanations for the preview
//   _dupMatch   { id, date, description, account, amount, existing } | null
//   _dupNearMiss { ...same shape as _dupMatch, dayDiff, score } | null — only
//               set on a row that stayed "new": the closest same-amount
//               existing row, kept for diagnostics even though it didn't
//               score high enough (or was >5 days apart) to count as a match.
//
// Matching order per row:
//   1. shared source id with any unconsumed known row → certain. Id overlap is
//      checked ACROSS sources on purpose: that's what `altSourceIds` is for.
//   2. otherwise, candidates are unconsumed rows with the same signed cents,
//      minus those PROVEN distinct: both sides carry a sourceId, belong to the
//      same source, AND that source's ids are known to be stable per physical
//      transaction (legacy/untagged data), yet the ids differ (PR #51 — two
//      identical coffees on the same day are two coffees). SimpleFin ("sf")
//      is excluded from this veto even when both sides are "sf": SimpleFin
//      can reissue a card transaction's sourceId when it moves from pending
//      to posted, so two "sf" rows with different ids are NOT proof of
//      distinctness — they fall through to scoring instead (bugfix, see
//      test "SimpleFin pending->posted resurfaces as a duplicate
//      candidate"). An explicit cross-source difference ("ck" vs "sf") still
//      unlocks fuzzy matching as before.
//   3. identical content fingerprint among those → certain.
//   4. otherwise the best scoring candidate decides (see scoreDuplicateCandidate).
export function markDuplicates(rows, existing) {
  const pool = [];
  const centsIdx = new Map(); // signed cents -> pool entries
  const idIdx = new Map();    // source id (own or alt) -> pool entries

  const addToPool = (t, fromExisting) => {
    const entry = { t, fromExisting, consumed: false };
    pool.push(entry);
    const cents = Math.round((Number(t.amount) || 0) * 100);
    if (!centsIdx.has(cents)) centsIdx.set(cents, []);
    centsIdx.get(cents).push(entry);
    for (const id of sourceIdsOf(t)) {
      if (!idIdx.has(id)) idIdx.set(id, []);
      idIdx.get(id).push(entry);
    }
    return entry;
  };
  for (const t of existing || []) addToPool(t, true);

  const summarize = (entry) => ({
    id: entry.t.id ?? null,
    date: entry.t.date || "",
    description: entry.t.description || "",
    account: entry.t.account || "",
    amount: Number(entry.t.amount) || 0,
    sourceId: entry.t.sourceId || "",
    // false when the match is another row of the same import batch — the UI
    // can only offer "confirm this match" against a persisted transaction.
    existing: entry.fromExisting === true,
  });

  return (rows || []).map((r) => {
    let state = "new";
    let score = null;
    let reasons = [];
    let match = null;
    let nearMiss = null;

    let idHit = null;
    for (const id of sourceIdsOf(r)) {
      const list = idIdx.get(id);
      if (!list) continue;
      const hit = list.find((e) => !e.consumed);
      if (hit) { idHit = hit; break; }
    }

    if (idHit) {
      idHit.consumed = true;
      state = "certain";
      score = 100;
      reasons = ["mesmo id de origem"];
      match = summarize(idHit);
    } else {
      const cents = Math.round((Number(r.amount) || 0) * 100);
      const candidates = (centsIdx.get(cents) || []).filter((e) => {
        if (e.consumed) return false;
        // Both sides carry a source id and step 1 found no overlap. Differing
        // ids only PROVE two distinct transactions when they come from the
        // same id space — across feeds they are just two numberings of one
        // purchase. So "not proven different" must BLOCK the fuzzy path, never
        // open it: `source` is born in this version, so the entire
        // pre-existing ledger is untagged, and comparing with a plain `!==`
        // would read legacy-vs-"ck" as a feed change and re-merge genuinely
        // distinct rows — the exact guarantee PR #51 added. Only SimpleFin
        // ever writes "sf" (lib/simplefin.js), so an untagged row is provably
        // NOT SimpleFin, which is enough to decide without tagging history.
        if (r.sourceId && e.t.sourceId) {
          const sameFeed = (r.source === "sf") === (e.t.source === "sf");
          const bothSf = r.source === "sf" && e.t.source === "sf";
          // Block the fuzzy path only within a feed whose ids are known to be
          // stable per physical transaction (legacy/"ck", untagged on both
          // sides) — that's what proves two same-day, same-amount rows are
          // genuinely distinct (PR #51). SimpleFin ("sf") can reissue a new
          // sourceId when a card transaction moves from pending to posted, so
          // two "sf" rows with different ids are NOT proof of distinctness —
          // let scoreDuplicateCandidate decide instead of vetoing them here.
          if (sameFeed && !bothSf) return false;
        }
        return true;
      });
      const fp = txnFingerprint(r);
      const exact = candidates.find((e) => txnFingerprint(e.t) === fp);
      if (exact) {
        exact.consumed = true;
        state = "certain";
        score = 100;
        reasons = ["conteúdo idêntico (data, valor, descrição e conta)"];
        match = summarize(exact);
      } else {
        let best = null;
        let bestEntry = null;
        // Closest same-amount candidate by day gap, kept even when it's
        // disqualified (score < DUP_SCORE_REVIEW, or scoreDuplicateCandidate
        // returned null for being >5 days apart). Without this, a row that
        // stays "new" gives no clue WHY the near-identical existing row
        // didn't match — surfaced to the UI as _dupNearMiss so the gap (date,
        // account, or description) is visible instead of guessed at.
        let closest = null;
        for (const e of candidates) {
          const s = scoreDuplicateCandidate(r, e.t);
          if (s && (!best || s.score > best.score)) { best = s; bestEntry = e; }
          const dayDiff = Math.abs(dateToDayInt(r.date) - dateToDayInt(e.t.date));
          if (!closest || dayDiff < closest.dayDiff) closest = { entry: e, dayDiff, score: s ? s.score : null };
        }
        if (best && best.score >= DUP_SCORE_REVIEW) {
          bestEntry.consumed = true;
          state = best.score >= DUP_SCORE_CERTAIN ? "certain" : "uncertain";
          score = best.score;
          reasons = best.reasons;
          match = summarize(bestEntry);
        } else if (closest) {
          nearMiss = { ...summarize(closest.entry), dayDiff: closest.dayDiff, score: closest.score };
        }
      }
    }

    addToPool(r, false);
    return {
      ...r,
      _dup: state === "certain",
      _dupState: state,
      _dupScore: score,
      _dupReasons: reasons,
      _dupMatch: match,
      _dupNearMiss: nearMiss,
    };
  });
}

// ---------------------------------------------------------------------------
// Three-way merge for save conflicts (v1.46.0)
// ---------------------------------------------------------------------------
// When a PUT hits a 409 (another device saved since we loaded), the old
// behavior discarded the local change ("server wins, please redo") — which
// makes the slower device lose an entire import every time two instances are
// open. Instead the client now merges: `base` is the last state this device
// knew the server had, `local` is what it just tried to save, `server` is
// what the other device wrote. Row identity is `t.id` (uid assigned on every
// add/import path).
//
// Per-row rules (user intent on THIS device wins ties):
// - added locally (not in base/server)            -> kept (prepended, like addTransactions)
// - added on server                               -> kept
// - deleted locally (in base, not in local)       -> stays deleted, even if server edited it
// - deleted on server, untouched locally          -> stays deleted
// - deleted on server, but edited locally         -> kept (an active local edit is not silently dropped)
// - edited on one side only                       -> that side's version
// - edited on both sides                          -> local wins
//
// Duplicate risk: the same external rows imported independently on two
// devices get different uids and both survive the union — the Import
// preview's duplicate detection already covers that case at import time.
export function mergeTransactions(base, local, server) {
  const byId = (arr) => {
    const m = new Map();
    for (const t of arr) if (t && t.id != null) m.set(t.id, t);
    return m;
  };
  const baseM = byId(base);
  const localM = byId(local);
  const serverM = byId(server);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const out = [];
  // Local additions first — mirrors addTransactions prepending new rows.
  // Rows without an id can't be matched; treat them as additions too.
  for (const t of local) {
    if (!t) continue;
    if (t.id == null || (!baseM.has(t.id) && !serverM.has(t.id))) out.push(t);
  }
  for (const t of server) {
    if (!t) continue;
    if (t.id == null) {
      out.push(t);
      continue;
    }
    const l = localM.get(t.id);
    if (l === undefined) {
      // Missing locally: locally deleted (row was in base) or server addition.
      if (!baseM.has(t.id)) out.push(t);
      continue;
    }
    if (same(l, t)) {
      out.push(t);
      continue;
    }
    const b = baseM.get(t.id);
    const localChanged = b === undefined || !same(l, b);
    out.push(localChanged ? l : t);
  }
  // Rows the server deleted but this device edited since base — keep them.
  for (const t of local) {
    if (!t || t.id == null || serverM.has(t.id) || !baseM.has(t.id)) continue;
    if (!same(t, baseM.get(t.id))) out.push(t);
  }
  return out;
}
