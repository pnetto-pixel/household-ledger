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

// Extract significant words (>=3 chars, not stop words) from a description
// for fuzzy duplicate detection.
function descWords(desc) {
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

// Parse YYYY-MM-DD into a UTC day integer for date-diff calculations.
export function dateToDayInt(dateStr) {
  const d = new Date(String(dateStr || "") + "T00:00:00Z");
  return isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 86400000);
}

// Flag duplicates in a batch of built rows against existing transactions and
// against earlier rows in the same batch. Hybrid key: when both sides carry a
// source id, compare by id (so two genuinely distinct but identical-looking
// purchases are never merged); otherwise compare by content fingerprint first,
// then fall back to fuzzy matching (same account + same cents + ±2 days +
// at least 1 word in common).
export function markDuplicates(rows, existing) {
  const idSet = new Set();
  const fpNoId = new Set();
  const fpAll = new Set();
  // Index for fuzzy matching: key = "account|amount_cents" -> array of txns
  const fuzzyIdx = new Map();

  const addToFuzzyIdx = (t) => {
    const cents = Math.round((Number(t.amount) || 0) * 100);
    const key = `${t.account || ""}|${cents}`;
    if (!fuzzyIdx.has(key)) fuzzyIdx.set(key, []);
    fuzzyIdx.get(key).push(t);
  };

  const remember = (t) => {
    const fp = txnFingerprint(t);
    fpAll.add(fp);
    if (t.sourceId) idSet.add(t.sourceId);
    else fpNoId.add(fp);
    addToFuzzyIdx(t);
  };
  for (const t of existing) remember(t);

  const isFuzzyDup = (r) => {
    // Only run fuzzy check for rows without a sourceId.
    if (r.sourceId) return false;
    const cents = Math.round((Number(r.amount) || 0) * 100);
    const key = `${r.account || ""}|${cents}`;
    const candidates = fuzzyIdx.get(key);
    if (!candidates || candidates.length === 0) return false;
    const rDay = dateToDayInt(r.date);
    return candidates.some((c) => {
      const dayDiff = Math.abs(dateToDayInt(c.date) - rDay);
      return dayDiff <= 2 && descOverlap(r.description, c.description);
    });
  };

  return rows.map((r) => {
    const exactFp = txnFingerprint(r);
    let dup;
    if (r.sourceId) {
      dup = idSet.has(r.sourceId) || fpNoId.has(exactFp);
    } else {
      dup = fpAll.has(exactFp) || isFuzzyDup(r);
    }
    remember(r);
    return { ...r, _dup: dup };
  });
}
