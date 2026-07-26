// Unit tests for the pure financial core (src/ledger.js). These protect the
// invariants that have already been broken once by a refactor (v1.5.10):
// signed amounts, net = income + expenses, and Transfer excluded everywhere.

import { describe, it, expect } from "vitest";
import {
  TRANSFER_CATEGORY,
  computeTotalsCore,
  matchPeriod,
  availableYears,
  bucketKey,
  bucketLabel,
  ckCategoryToken,
  mapCkCategory,
  descriptionRuleMatches,
  findMatchingDescriptionRule,
  matchDescriptionCategoryRule,
  computeDescriptionRuleConflicts,
  normAccount,
  matchAccountWithAliases,
  txnFingerprint,
  markDuplicates,
  scoreDuplicateCandidate,
  normalizeMerchant,
  resolveImportCategory,
  matchOption,
  DUP_SCORE_CERTAIN,
  DUP_SCORE_REVIEW,
  descWords,
  mergeTransactions,
  repairUnsavableRows,
  isIgnoredSimplefinAccount,
} from "./ledger.js";

const INCOME = ["Salary", "Bonus", "Bela Income", "Other Income"];

describe("computeTotalsCore", () => {
  it("sums signed amounts and net = income + expenses", () => {
    const rows = [
      { category: "Salary", amount: 5000 },
      { category: "Groceries", amount: -142.37 },
      { category: "Restaurant", amount: -60 },
    ];
    const t = computeTotalsCore(rows, INCOME);
    expect(t.income).toBe(5000);
    expect(t.expenses).toBeCloseTo(-202.37);
    expect(t.net).toBeCloseTo(5000 - 202.37);
  });

  it("excludes Transfer from every total", () => {
    const rows = [
      { category: TRANSFER_CATEGORY, amount: -999 },
      { category: TRANSFER_CATEGORY, amount: 999 },
      { category: "Groceries", amount: -10 },
    ];
    const t = computeTotalsCore(rows, INCOME);
    expect(t.income).toBe(0);
    expect(t.expenses).toBe(-10);
    expect(t.net).toBe(-10);
  });

  it("keeps refund-dominated expense buckets positive (the v1.5.10 bug)", () => {
    // Refund larger than the period's spend: expenses must be POSITIVE and
    // contribute positively to net — income − expenses or Math.abs would flip it.
    const rows = [
      { category: "Shopping", amount: -52.71 },
      { category: "Shopping", amount: 300 }, // refund
    ];
    const t = computeTotalsCore(rows, INCOME);
    expect(t.expenses).toBeCloseTo(247.29);
    expect(t.net).toBeCloseTo(247.29);
  });

  it("negative income (clawback) reduces income, never becomes expense", () => {
    const rows = [
      { category: "Other Income", amount: 50 },
      { category: "Other Income", amount: -20 }, // cashback clawback
    ];
    const t = computeTotalsCore(rows, INCOME);
    expect(t.income).toBe(30);
    expect(t.expenses).toBe(0);
  });
});

describe("matchPeriod", () => {
  it("All/All matches everything", () => {
    expect(matchPeriod("2026-07-18", "All", "All")).toBe(true);
    expect(matchPeriod("", "All", "All")).toBe(true);
  });
  it("filters by year, month, and both", () => {
    expect(matchPeriod("2026-07-18", "2026", "All")).toBe(true);
    expect(matchPeriod("2025-07-18", "2026", "All")).toBe(false);
    expect(matchPeriod("2026-07-18", "All", "07")).toBe(true);
    expect(matchPeriod("2026-06-18", "All", "07")).toBe(false);
    expect(matchPeriod("2026-07-18", "2026", "07")).toBe(true);
    expect(matchPeriod("2026-07-18", "2026", "06")).toBe(false);
  });
});

describe("availableYears", () => {
  it("returns distinct years, newest first", () => {
    const rows = [{ date: "2024-01-01" }, { date: "2026-05-05" }, { date: "2024-12-31" }, { date: "" }];
    expect(availableYears(rows)).toEqual(["2026", "2024"]);
  });
});

describe("bucketKey / bucketLabel", () => {
  it("buckets by granularity", () => {
    expect(bucketKey("2026-07-18", "M")).toBe("2026-07");
    expect(bucketKey("2026-07-18", "Q")).toBe("2026-Q3");
    expect(bucketKey("2026-07-18", "H")).toBe("2026-H2");
    expect(bucketKey("2026-07-18", "Y")).toBe("2026");
    expect(bucketKey("", "M")).toBe("");
  });
  it("labels buckets", () => {
    expect(bucketLabel("2026-01")).toBe("Jan/26");
    expect(bucketLabel("2026-Q1")).toBe("Q1/26");
    expect(bucketLabel("2026-H2")).toBe("H2/26");
    expect(bucketLabel("2026")).toBe("2026");
  });
});

describe("ckCategoryToken / mapCkCategory", () => {
  it("normalizes CK category names to tokens", () => {
    expect(ckCategoryToken("Food & Drink")).toBe("FOOD_AND_DRINK");
    expect(ckCategoryToken("  groceries ")).toBe("GROCERIES");
    expect(ckCategoryToken("")).toBe("");
  });
  it("Transfer/Payment always wins, regardless of the map", () => {
    const map = { CREDIT_CARD_PAYMENT: "Other" };
    expect(mapCkCategory("Credit Card Payment", "expense", map)).toBe(TRANSFER_CATEGORY);
    expect(mapCkCategory("Anything", "TRANSFER", map)).toBe(TRANSFER_CATEGORY);
    expect(mapCkCategory("Anything", "PAYMENT", map)).toBe(TRANSFER_CATEGORY);
  });
  it("income type maps to Other Income; unknown tokens fall back to Other", () => {
    expect(mapCkCategory("Paycheck", "INCOME", {})).toBe("Other Income");
    expect(mapCkCategory("Mystery Thing", "expense", {})).toBe("Other");
    expect(mapCkCategory("Groceries", "expense", { GROCERIES: "Groceries" })).toBe("Groceries");
  });
});

describe("description rules", () => {
  const row = { description: "APPLE.COM/BILL", srcAccount: "Apple Card", account: "Apple" };

  it("matches by field, case-insensitively", () => {
    expect(descriptionRuleMatches(row, { matchField: "description", pattern: "apple.com" })).toBe(true);
    expect(descriptionRuleMatches(row, { matchField: "provider", pattern: "apple card" })).toBe(true);
    expect(descriptionRuleMatches(row, { matchField: "description", pattern: "netflix" })).toBe(false);
    expect(descriptionRuleMatches(row, { matchField: "both", pattern: "apple" })).toBe(true);
    expect(descriptionRuleMatches(row, { pattern: "" })).toBe(false);
  });

  it("providerPattern is an extra AND condition", () => {
    const rule = { matchField: "description", pattern: "deposit", providerPattern: "Apple Card" };
    expect(descriptionRuleMatches({ description: "Deposit", srcAccount: "Apple Card" }, rule)).toBe(true);
    expect(descriptionRuleMatches({ description: "Deposit", srcAccount: "Chase" }, rule)).toBe(false);
  });

  it("first matching rule wins (array order is semantic)", () => {
    const rules = [
      { matchField: "description", pattern: "apple", destinationCategory: "Services" },
      { matchField: "description", pattern: "apple.com", destinationCategory: "Shopping" },
    ];
    expect(findMatchingDescriptionRule(row, rules).destinationCategory).toBe("Services");
    expect(matchDescriptionCategoryRule(row, rules)).toBe("Services");
    expect(matchDescriptionCategoryRule({ description: "nothing" }, rules)).toBe(null);
  });

  it("conflict check counts Transfer and manual rows, capped examples", () => {
    const txns = [
      { description: "Deposit x", category: TRANSFER_CATEGORY, date: "2026-01-01" },
      { description: "Deposit y", category: "Groceries", categoryManual: true, date: "2026-01-02" },
      { description: "unrelated", category: "Groceries", date: "2026-01-03" },
    ];
    const c = computeDescriptionRuleConflicts(txns, { matchField: "description", pattern: "deposit" });
    expect(c.transferCount).toBe(1);
    expect(c.manualCount).toBe(1);
    expect(c.transferExamples).toHaveLength(1);
  });
});

describe("account matching", () => {
  const ACCOUNTS = ["Apple", "Chase Reserve", "T-Mobile"];
  const aliases = [
    ["Chase Reserve", ["chasereserve", "sapphirereserve"]],
    ["Apple", ["applecard"]],
  ];

  it("normalizes account strings", () => {
    expect(normAccount("T-Mobile")).toBe("tmobile");
    expect(normAccount("AT&T Reward")).toBe("attreward");
  });

  it("exact normalized name beats aliases; unknown returns empty", () => {
    expect(matchAccountWithAliases("t mobile", aliases, ACCOUNTS)).toBe("T-Mobile");
    expect(matchAccountWithAliases("Apple Card - 1234", aliases, ACCOUNTS)).toBe("Apple");
    expect(matchAccountWithAliases("Sapphire Reserve Card", aliases, ACCOUNTS)).toBe("Chase Reserve");
    expect(matchAccountWithAliases("Mystery Bank", aliases, ACCOUNTS)).toBe("");
    expect(matchAccountWithAliases("", aliases, ACCOUNTS)).toBe("");
  });
});

describe("descWords", () => {
  // App.jsx's descFragment (Settings > Suggested Rules > Manual category
  // corrections) imports this directly, separately from descOverlap/
  // markDuplicates — regression test for a real bug where descWords was a
  // non-exported helper in this module, so App.jsx's own import silently had
  // nothing to bind to descFragment's call. It only threw at runtime once a
  // transaction with categoryManual===true reached detectManualCategoryCorrections,
  // which synthetic/empty test data never triggers — this test exercises the
  // exported binding directly so a missing `export` fails CI immediately.
  it("extracts significant words, dropping short tokens and stop words", () => {
    expect(descWords("STARBUCKS STORE #4821")).toEqual(["starbucks", "store", "4821"]);
    expect(descWords("the a to of")).toEqual([]);
    expect(descWords("")).toEqual([]);
  });
});

describe("normalizeMerchant", () => {
  it("strips payment-gateway prefixes", () => {
    expect(normalizeMerchant("SQ *STARBUCKS SEATTLE")).toBe("starbucks seattle");
    expect(normalizeMerchant("TST* PIZZA PLACE")).toBe("pizza place");
    expect(normalizeMerchant("PAYPAL *NETFLIX")).toBe("netflix");
    expect(normalizeMerchant("SP THREADHEADS")).toBe("threadheads");
    expect(normalizeMerchant("POS DEBIT WHOLE FOODS MKT")).toBe("whole foods mkt");
    expect(normalizeMerchant("PURCHASE AUTHORIZED ON 07/12 STARBUCKS")).toBe("starbucks");
  });

  it("strips stacked prefixes, digit runs and a trailing 2-letter state code", () => {
    expect(normalizeMerchant("PURCHASE AUTHORIZED ON 07/12 SQ *STARBUCKS #1234 SEATTLE WA"))
      .toBe("starbucks seattle");
    expect(normalizeMerchant("AMZN MKTP US 123456")).toBe("amzn mktp");
  });

  it("is a no-op when no pattern is present", () => {
    expect(normalizeMerchant("Grocery Store")).toBe("grocery store");
    expect(normalizeMerchant("")).toBe("");
  });

  it("strips only ONE trailing 2-letter code per call (single-pass by design)", () => {
    // Not idempotent, deliberately: re-running would keep eating two-letter
    // words off the end until a real merchant name lost part of itself. Every
    // consumer calls this once, on a raw description.
    expect(normalizeMerchant("STARBUCKS SEATTLE WA CA")).toBe("starbucks seattle wa");
    expect(normalizeMerchant("starbucks seattle wa")).toBe("starbucks seattle");
  });
});

describe("scoreDuplicateCandidate", () => {
  const base = { date: "2026-07-01", amount: -25.5, description: "Grocery Store", account: "Chase Reserve" };
  const at = (patch) => ({ ...base, ...patch });

  it("hard-gates on signed cents", () => {
    expect(scoreDuplicateCandidate(at({ amount: -25.51 }), base)).toBe(null);
    expect(scoreDuplicateCandidate(at({ amount: 25.5 }), base)).toBe(null); // sign matters
    // …even when everything else is a perfect match.
    expect(scoreDuplicateCandidate(at({ amount: -30 }), base)).toBe(null);
  });

  it("scores each date tier and discards beyond 5 days", () => {
    expect(scoreDuplicateCandidate(base, base).score).toBe(100);            // 0d
    expect(scoreDuplicateCandidate(at({ date: "2026-07-02" }), base).score).toBe(95);  // 1d
    expect(scoreDuplicateCandidate(at({ date: "2026-07-03" }), base).score).toBe(90);  // 2d
    expect(scoreDuplicateCandidate(at({ date: "2026-07-04" }), base).score).toBe(82);  // 3d
    expect(scoreDuplicateCandidate(at({ date: "2026-07-05" }), base).score).toBe(72);  // 4d
    expect(scoreDuplicateCandidate(at({ date: "2026-06-30" }), base).score).toBe(95);  // 1d back
    expect(scoreDuplicateCandidate(at({ date: "2026-07-06" }), base).score).toBe(72);  // 5d
    expect(scoreDuplicateCandidate(at({ date: "2026-07-07" }), base)).toBe(null);      // 6d
    expect(scoreDuplicateCandidate(base, base).reasons.length).toBeGreaterThan(0);
  });

  it("scores each account tier", () => {
    expect(scoreDuplicateCandidate(base, base).score).toBe(100);                    // same
    expect(scoreDuplicateCandidate(at({ account: "" }), base).score).toBe(90);      // one side unassigned
    expect(scoreDuplicateCandidate(at({ account: "Apple" }), base).score).toBe(60); // different
  });

  it("scores each description tier", () => {
    // Jaccard >= 0.6 (2 shared of 3)
    expect(scoreDuplicateCandidate(at({ description: "Grocery Store Market" }), base).score).toBe(100);
    // Jaccard >= 0.3 (1 shared of 3)
    expect(scoreDuplicateCandidate(at({ description: "Grocery Market" }), base).score).toBe(90);
    // at least 1 shared token, Jaccard < 0.3 (1 shared of 6)
    expect(scoreDuplicateCandidate(
      at({ description: "Grocery Market Fresh Organic Downtown" }), base
    ).score).toBe(80);
    // no shared tokens
    const none = scoreDuplicateCandidate(at({ description: "Gasoline Pump" }), base);
    expect(none.score).toBe(65);
    expect(none.reasons).toContain("descrição sem tokens em comum");
  });

  it("normalizes gateway noise before comparing descriptions", () => {
    const ck = { date: "2026-07-01", amount: -12.34, description: "SQ *STARBUCKS #1234 SEATTLE WA", account: "Apple" };
    const sf = { date: "2026-07-01", amount: -12.34, description: "Starbucks Seattle", account: "Apple" };
    expect(scoreDuplicateCandidate(sf, ck).score).toBe(100);
  });

  it("folds providerDescription into the description-similarity pool (Amazon memo case)", () => {
    // The bug this guards: a Credit-Karma-imported Amazon row only ever has
    // the generic merchant string ("AMAZON.COM*RT4XY1"). Once memo replaces
    // the SimpleFin row's display description with an itemized product list
    // (v1.56.1/v1.60.0), the two descriptions share NO words on their own —
    // descPenalty maxes at 35, and the SAME-DAY/SAME-ACCOUNT case (the best
    // possible) lands at exactly 65, one bad date/account roll away from
    // dropping below the 60 "review" floor entirely. providerDescription
    // (lib/simplefin.js) carries the generic string back in for matching.
    const existing = { date: "2026-07-15", amount: -29.99, description: "AMAZON.COM*RT4XY1ABC", account: "Amazon Card" };
    const withoutFix = { date: "2026-07-15", amount: -29.99, description: "100 Pack Mini Sunscreen for Family", account: "Amazon Card" };
    expect(scoreDuplicateCandidate(withoutFix, existing).score).toBe(65); // pre-fix floor, still reproducible without providerDescription

    const withFix = { ...withoutFix, providerDescription: "AMAZON.COM*RT4XY1ABC" };
    const result = scoreDuplicateCandidate(withFix, existing);
    expect(result.score).toBe(80); // shared "amazon" token now counted: 100 − 0 − 0 − 20
    expect(result.reasons).toContain("poucas palavras em comum na descrição");

    // A realistic 2-day posting-date gap on top no longer falls through to
    // "new" (score < 60) the way it would have pre-fix (65 − 10 = 55).
    const existing2dAway = { ...existing, date: "2026-07-13" };
    expect(scoreDuplicateCandidate(withFix, existing2dAway).score).toBe(70);
  });

  it("providerDescription contributes even when the display descriptions are unrelated", () => {
    const existing = { date: "2026-07-01", amount: -9.99, description: "Whole Foods", account: "Amazon Card", providerDescription: "AMAZON.COM*XY" };
    const incoming = { date: "2026-07-01", amount: -9.99, description: "Batteries AA 100-pack", account: "Amazon Card", providerDescription: "AMAZON.COM*XY" };
    // Only "amazon" is shared (Jaccard 1/5) — still enough to drop out of the
    // "zero tokens in common" tier (35) into "at least 1 shared token" (20).
    expect(scoreDuplicateCandidate(incoming, existing).score).toBe(80); // 100 − 0 − 0 − 20

    // Same row against itself, identity via providerDescription alone
    // (empty display description on both sides): token sets are identical,
    // Jaccard 1.0 → the >=0.6 tier, full score.
    const sameProviderOnly = { date: "2026-07-01", amount: -9.99, description: "", account: "Amazon Card", providerDescription: "AMAZON.COM*XY" };
    expect(scoreDuplicateCandidate(sameProviderOnly, sameProviderOnly).score).toBe(100);
  });
});

describe("markDuplicates", () => {
  const existing = [
    { sourceId: "src-1", date: "2026-07-01", amount: -10, description: "Coffee Shop", account: "Apple" },
    { date: "2026-07-02", amount: -25.5, description: "Grocery Store", account: "Chase Reserve" },
  ];

  it("flags by sourceId when both sides have one", () => {
    const rows = [{ sourceId: "src-1", date: "2026-07-01", amount: -10, description: "Coffee Shop", account: "Apple" }];
    const out = markDuplicates(rows, existing);
    expect(out[0]._dupState).toBe("certain");
    expect(out[0]._dup).toBe(true);
    expect(out[0]._dupReasons.length).toBeGreaterThan(0);
  });

  it("two identical charges from the SAME source are never merged (PR #51)", () => {
    const prev = [{ source: "ck", sourceId: "ck_1", date: "2026-07-01", amount: -5, description: "Coffee Shop", account: "Apple" }];
    const rows = [{ source: "ck", sourceId: "ck_2", date: "2026-07-01", amount: -5, description: "Coffee Shop", account: "Apple" }];
    const out = markDuplicates(rows, prev);
    expect(out[0]._dupState).toBe("new");
    expect(out[0]._dup).toBe(false);
  });

  it("…and legacy rows with no `source` at all count as the same source", () => {
    // Exactly the same scenario without the new field, so the whole pre-`source`
    // history keeps the protection above.
    const prev = [{ sourceId: "ck_1", date: "2026-07-01", amount: -5, description: "Coffee Shop", account: "Apple" }];
    const rows = [{ sourceId: "ck_2", date: "2026-07-01", amount: -5, description: "Coffee Shop", account: "Apple" }];
    expect(markDuplicates(rows, prev)[0]._dupState).toBe("new");
  });

  it("…and an UNTAGGED existing row vs a freshly tagged CK import still doesn't merge", () => {
    // The shape the real ledger has the day this version ships: every persisted
    // row predates `source`, while new Credit Karma imports carry source:"ck".
    // Comparing the two fields directly would read that as a feed change and
    // re-merge genuinely distinct charges — silently dropping a real
    // transaction on the daily import path. "Not proven different" must block.
    const prev = [{ sourceId: "ck_1", date: "2026-07-01", amount: -5, description: "Coffee Shop", account: "Apple" }];
    const rows = [{ source: "ck", sourceId: "ck_2", date: "2026-07-01", amount: -5, description: "Coffee Shop", account: "Apple" }];
    const out = markDuplicates(rows, prev);
    expect(out[0]._dupState).toBe("new");
    expect(out[0]._dup).toBe(false);
  });

  it("…while an UNTAGGED existing row vs SimpleFin still merges (feeds provably differ)", () => {
    // The other half of the same rule: legacy rows are provably not SimpleFin,
    // so the cross-source match keeps working without backfilling `source`.
    const prev = [{
      sourceId: "ck_1", date: "2026-07-01", amount: -12.34,
      description: "SQ *STARBUCKS #1234 SEATTLE WA", account: "Apple",
    }];
    const rows = [{
      source: "sf", sourceId: "9", date: "2026-07-02", amount: -12.34,
      description: "Starbucks Seattle", account: "",
    }];
    const out = markDuplicates(rows, prev);
    expect(out[0]._dupState).toBe("certain");
    expect(out[0]._dupMatch.sourceId).toBe("ck_1");
  });

  it("merges the SAME purchase seen through Credit Karma and then SimpleFin", () => {
    // Regression for the cross-source gap: the old implementation short-circuited
    // the fuzzy check for any row carrying a sourceId, so this pair never matched.
    const prev = [{
      source: "ck", sourceId: "ck_1", date: "2026-07-01", amount: -12.34,
      description: "SQ *STARBUCKS #1234 SEATTLE WA", account: "Apple",
    }];
    const rows = [{
      source: "sf", sourceId: "9", date: "2026-07-02", amount: -12.34,
      description: "Starbucks Seattle", account: "",
    }];
    const out = markDuplicates(rows, prev);
    expect(out[0]._dupState).toBe("certain"); // 100 − 5 (1d) − 10 (unassigned) − 0
    expect(out[0]._dupScore).toBe(85);
    expect(out[0]._dupMatch.sourceId).toBe("ck_1");
    expect(out[0]._dupMatch.existing).toBe(true);
  });

  it("a weaker cross-source match lands in the review band and stays CHECKED", () => {
    const prev = [{
      source: "ck", sourceId: "ck_1", date: "2026-07-01", amount: -40,
      description: "Whole Foods Market", account: "Chase Reserve",
    }];
    const rows = [{
      source: "sf", sourceId: "9", date: "2026-07-03", amount: -40,
      description: "Whole Foods 10432", account: "",
    }];
    const out = markDuplicates(rows, prev);
    expect(out[0]._dupScore).toBe(80); // 100 − 10 (2d) − 10 (unassigned) − 0
    expect(out[0]._dupState).toBe("uncertain");
    expect(out[0]._dup).toBe(false); // never auto-unchecked: losing a row is worse than duplicating it
    expect(out[0]._dupScore).toBeGreaterThanOrEqual(DUP_SCORE_REVIEW);
    expect(out[0]._dupScore).toBeLessThan(DUP_SCORE_CERTAIN);
  });

  it("matches 1:1 — each existing row absorbs exactly one incoming row", () => {
    const prev = [
      { id: "e1", date: "2026-07-01", amount: -8, description: "Bagel", account: "Apple" },
      { id: "e2", date: "2026-07-01", amount: -8, description: "Bagel", account: "Apple" },
    ];
    const rows = [
      { id: "n1", date: "2026-07-01", amount: -8, description: "Bagel", account: "Apple" },
      { id: "n2", date: "2026-07-01", amount: -8, description: "Bagel", account: "Apple" },
      { id: "n3", date: "2026-07-01", amount: -8, description: "Bagel", account: "Apple" },
    ];
    const out = markDuplicates(rows, prev);
    expect(out.map((r) => r._dupMatch.id)).toEqual(["e1", "e2", "n1"]);
    expect(out[0]._dupMatch.existing).toBe(true);
    expect(out[1]._dupMatch.existing).toBe(true);
    // Both existing rows are spoken for, so the third can only match a sibling
    // of its own batch — never a third copy of e1.
    expect(out[2]._dupMatch.existing).toBe(false);
  });

  it("different cents are never candidates, however similar everything else is", () => {
    const rows = [{ date: "2026-07-02", amount: -25.49, description: "Grocery Store", account: "Chase Reserve" }];
    const out = markDuplicates(rows, existing);
    expect(out[0]._dupState).toBe("new");
    expect(out[0]._dupMatch).toBe(null);
  });

  it("more than 5 days apart is discarded outright, not sent to review", () => {
    const rows = [{ date: "2026-07-09", amount: -25.5, description: "Grocery Store", account: "Chase Reserve" }];
    const out = markDuplicates(rows, existing);
    expect(out[0]._dupState).toBe("new");
    expect(out[0]._dupScore).toBe(null);
  });

  it("flags by content fingerprint when no sourceId", () => {
    const rows = [{ date: "2026-07-02", amount: -25.5, description: "  GROCERY   store ", account: "Chase Reserve" }];
    const out = markDuplicates(rows, existing);
    expect(out[0]._dupState).toBe("certain");
  });

  it("dedups within the same batch", () => {
    const rows = [
      { date: "2026-07-10", amount: -5, description: "Snack", account: "Apple" },
      { date: "2026-07-10", amount: -5, description: "Snack", account: "Apple" },
    ];
    const out = markDuplicates(rows, []);
    expect(out[0]._dupState).toBe("new");
    expect(out[1]._dupState).toBe("certain");
  });

  it("legacy data keeps its verdicts: nothing new becomes a certain duplicate", () => {
    // Same fixtures as before the three-state rewrite, no `source` anywhere.
    const rows = [
      { sourceId: "src-1", date: "2026-07-01", amount: -10, description: "Coffee Shop", account: "Apple" }, // was dup
      { sourceId: "src-2", date: "2026-07-01", amount: -10, description: "Coffee Shop", account: "Apple" }, // was NOT dup
      { date: "2026-07-02", amount: -25.5, description: "Grocery Store", account: "Chase Reserve" },        // was dup
      { date: "2026-07-20", amount: -99, description: "Brand New Thing", account: "Apple" },                // was NOT dup
    ];
    const out = markDuplicates(rows, existing);
    expect(out.map((r) => r._dupState)).toEqual(["certain", "new", "certain", "new"]);
    expect(out.map((r) => r._dup)).toEqual([true, false, true, false]);
  });

  it("the old ±2-day fuzzy hit is now a review candidate instead of an auto-uncheck", () => {
    // Deliberate contract change: the fuzzy band (same account, <=2 days, a
    // shared word) scores 80–90, i.e. below certainty, so the row stays checked
    // and the user confirms it in the preview.
    const rows = [{ date: "2026-07-04", amount: -25.5, description: "Grocery Market", account: "Chase Reserve" }];
    const out = markDuplicates(rows, existing);
    expect(out[0]._dupState).toBe("uncertain");
    expect(out[0]._dupScore).toBe(80); // 100 − 10 (2d) − 0 (same account) − 10 (similar description)
  });

  it("an altSourceIds confirmation turns the next sync into an exact id match", () => {
    const prev = [{
      id: "e1", source: "ck", sourceId: "ck_1", altSourceIds: ["9"],
      date: "2026-07-01", amount: -12.34, description: "Starbucks", account: "Apple",
    }];
    // Even a wildly different date/description now matches: the id says so.
    const rows = [{ source: "sf", sourceId: "9", date: "2026-08-15", amount: -99, description: "whatever", account: "" }];
    const out = markDuplicates(rows, prev);
    expect(out[0]._dupState).toBe("certain");
    expect(out[0]._dupMatch.id).toBe("e1");
  });

  it("fingerprint includes signed cents", () => {
    expect(txnFingerprint({ date: "2026-07-01", amount: -10, description: "x", account: "a" }))
      .not.toBe(txnFingerprint({ date: "2026-07-01", amount: 10, description: "x", account: "a" }));
  });
});

describe("resolveImportCategory", () => {
  const CATS = ["Groceries", "Restaurant", "Other", "Shopping", TRANSFER_CATEGORY, "Other Income"];
  const ctx = (rules, map) => ({
    categories: CATS,
    ckCategoryMap: map || { GROCERIES: "Groceries" },
    descriptionRules: rules || [],
  });

  it("matchOption resolves case-insensitively and falls back", () => {
    expect(matchOption("groceries", CATS, "Other")).toBe("Groceries");
    expect(matchOption("nope", CATS, "Other")).toBe("Other");
    expect(matchOption("", CATS, "Other")).toBe("Other");
  });

  it("(a) a raw CK category goes through the editable map", () => {
    const out = resolveImportCategory(
      { description: "SAFEWAY 1234", category: "Other", ckCategory: "Groceries", ckType: "expense" },
      ctx()
    );
    expect(out.category).toBe("Groceries");
  });

  it("(b) a winning rule WITHOUT allowTransferOverride can never de-transfer", () => {
    const rules = [{ matchField: "description", pattern: "zelle", destinationCategory: "Shopping" }];
    const out = resolveImportCategory(
      { description: "ZELLE PAYMENT", category: TRANSFER_CATEGORY, srcAccount: "Chase" },
      ctx(rules)
    );
    expect(out.category).toBe(TRANSFER_CATEGORY);
    expect(out.matchedRule).not.toBe(null);
  });

  it("(c) allowTransferOverride + a matching providerPattern promotes out of Transfer", () => {
    const rules = [{
      matchField: "description", pattern: "daily cash", destinationCategory: "Other Income",
      allowTransferOverride: true, providerPattern: "apple",
    }];
    const out = resolveImportCategory(
      { description: "Apple Daily Cash", category: TRANSFER_CATEGORY, srcAccount: "Apple Card" },
      ctx(rules)
    );
    expect(out.category).toBe("Other Income");
    // …and it stays Transfer when the provider doesn't match.
    expect(resolveImportCategory(
      { description: "Apple Daily Cash", category: TRANSFER_CATEGORY, srcAccount: "Chase Reserve" },
      ctx(rules)
    ).category).toBe(TRANSFER_CATEGORY);
  });

  it("(d) a SimpleFin-shaped row (category 'Other', no ckCategory) is caught by a rule", () => {
    // This is the gap this extraction closes: SimpleFin rows used to be
    // classified with a bare matchOption(t.category) and always landed in "Other".
    const rules = [{ matchField: "description", pattern: "starbucks", destinationCategory: "Restaurant" }];
    const out = resolveImportCategory(
      { description: "SQ *STARBUCKS #1234", category: "Other", ckType: "", srcAccount: "CREDIT CARD", account: "Chase Reserve" },
      ctx(rules)
    );
    expect(out.category).toBe("Restaurant");
  });

  it("falls back to Other when nothing classifies the row", () => {
    expect(resolveImportCategory({ description: "Mystery", category: "" }, ctx()).category).toBe("Other");
  });
});

describe("mergeTransactions", () => {
  const row = (id, patch = {}) => ({
    id,
    date: "2026-07-01",
    description: `txn ${id}`,
    amount: -10,
    category: "Groceries",
    account: "Chase",
    ...patch,
  });

  it("returns server state untouched when local made no changes", () => {
    const base = [row("a"), row("b")];
    const server = [row("c"), row("a"), row("b")];
    expect(mergeTransactions(base, base, server)).toEqual(server);
  });

  it("keeps local additions (prepended) alongside server additions", () => {
    const base = [row("a")];
    const local = [row("imp1"), row("imp2"), row("a")]; // an import on this device
    const server = [row("srv1"), row("a")]; // another device added srv1 meanwhile
    const merged = mergeTransactions(base, local, server);
    expect(merged.map((t) => t.id)).toEqual(["imp1", "imp2", "srv1", "a"]);
  });

  it("preserves a local deletion even though the server still has the row", () => {
    const base = [row("a"), row("b")];
    const local = [row("a")]; // deleted b locally
    const server = [row("a"), row("b")];
    expect(mergeTransactions(base, local, server).map((t) => t.id)).toEqual(["a"]);
  });

  it("respects a server-side deletion of a row untouched locally", () => {
    const base = [row("a"), row("b")];
    const local = [row("a"), row("b")];
    const server = [row("a")]; // other device deleted b
    expect(mergeTransactions(base, local, server).map((t) => t.id)).toEqual(["a"]);
  });

  it("keeps a locally edited row that the server deleted", () => {
    const base = [row("a"), row("b")];
    const local = [row("a"), row("b", { category: "Dog" })]; // edited here
    const server = [row("a")]; // deleted there
    const merged = mergeTransactions(base, local, server);
    expect(merged.find((t) => t.id === "b")?.category).toBe("Dog");
  });

  it("takes the server version of a row edited only on the server", () => {
    const base = [row("a")];
    const local = [row("a")];
    const server = [row("a", { category: "Restaurant" })];
    expect(mergeTransactions(base, local, server)[0].category).toBe("Restaurant");
  });

  it("prefers the local version when both sides edited the same row", () => {
    const base = [row("a")];
    const local = [row("a", { category: "Dog" })];
    const server = [row("a", { category: "Restaurant" })];
    expect(mergeTransactions(base, local, server)[0].category).toBe("Dog");
  });

  it("merges an import against a concurrent edit without losing either", () => {
    const base = [row("a")];
    const local = [row("i1"), row("i2"), row("a")]; // import on this device
    const server = [row("a", { amount: -99 })]; // edit on another device
    const merged = mergeTransactions(base, local, server);
    expect(merged.map((t) => t.id).sort()).toEqual(["a", "i1", "i2"]);
    expect(merged.find((t) => t.id === "a").amount).toBe(-99);
  });

  it("handles an empty base (first sync) as pure union with local first", () => {
    const local = [row("l1")];
    const server = [row("s1")];
    expect(mergeTransactions([], local, server).map((t) => t.id)).toEqual(["l1", "s1"]);
  });

  it("carries `altSourceIds` through a three-way merge untouched", () => {
    // The merge is schema-agnostic on purpose (whole-object identity by id), so
    // the new optional field needs no special casing — this locks that in.
    const base = [row("a")];
    const local = [row("a", { altSourceIds: ["sf_9"], source: "ck" })]; // confirmed a duplicate match here
    const server = [row("a")];
    const merged = mergeTransactions(base, local, server);
    expect(merged[0].altSourceIds).toEqual(["sf_9"]);
    expect(merged[0].source).toBe("ck");
  });
});

describe("repairUnsavableRows", () => {
  const ok = { id: "a", date: "2026-07-01", amount: -10, description: "Coffee" };

  it("leaves a valid ledger untouched (same object identities)", () => {
    const out = repairUnsavableRows([ok], "2026-07-26");
    expect(out.repaired).toBe(0);
    expect(out.transactions[0]).toBe(ok);
  });

  it("fills an empty date — the shape a dateless SimpleFin row used to take", () => {
    // A single one of these 400s the whole PUT server-side (findInvalidRow),
    // so the ledger could never save again until it was repaired.
    const out = repairUnsavableRows([{ ...ok, date: "" }], "2026-07-26");
    expect(out.repaired).toBe(1);
    expect(out.transactions[0].date).toBe("2026-07-26");
    expect(out.transactions[0].amount).toBe(-10); // everything else preserved
    expect(out.transactions[0].description).toBe("Coffee");
  });

  it("repairs a non-ISO date, a missing date, and a non-finite amount", () => {
    const out = repairUnsavableRows(
      [
        { ...ok, id: "b", date: "07/01/2026" },
        { ...ok, id: "c", date: undefined },
        { ...ok, id: "d", amount: NaN },
      ],
      "2026-07-26"
    );
    expect(out.repaired).toBe(3);
    expect(out.transactions.map((t) => t.date)).toEqual(["2026-07-26", "2026-07-26", "2026-07-01"]);
    expect(out.transactions[2].amount).toBe(0);
  });

  it("drops entries that aren't objects at all", () => {
    const out = repairUnsavableRows([ok, null, "nope"], "2026-07-26");
    expect(out.transactions).toEqual([ok]);
    expect(out.repaired).toBe(2);
  });

  it("falls back to today when the supplied fallback is itself invalid", () => {
    const out = repairUnsavableRows([{ ...ok, date: "" }], "not-a-date");
    expect(out.transactions[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("tolerates a non-array input", () => {
    expect(repairUnsavableRows(undefined, "2026-07-26")).toEqual({ transactions: [], repaired: 0 });
  });
});

describe("isIgnoredSimplefinAccount", () => {
  const row = { srcAccount: "Chase Auto Lease (0870)", accountUrn: "acc-9f21" };

  it("ignores nothing when the list is empty or absent", () => {
    expect(isIgnoredSimplefinAccount(row, [])).toBe(false);
    expect(isIgnoredSimplefinAccount(row, undefined)).toBe(false);
  });

  it("matches a case-insensitive substring of the account name", () => {
    expect(isIgnoredSimplefinAccount(row, ["auto lease"])).toBe(true);
    expect(isIgnoredSimplefinAccount(row, ["AUTO LEASE"])).toBe(true);
    expect(isIgnoredSimplefinAccount(row, ["Chase Auto Lease (0870)"])).toBe(true);
  });

  it("matches the last 4 / any fragment of the id, so a rename doesn't break it", () => {
    expect(isIgnoredSimplefinAccount(row, ["0870"])).toBe(true);
    expect(isIgnoredSimplefinAccount(row, ["acc-9f21"])).toBe(true);
  });

  it("does NOT ignore a different Chase account", () => {
    // The whole point: "Chase" alone would take out Chase Reserve too, but a
    // specific pattern must leave sibling accounts alone.
    const reserve = { srcAccount: "Chase Reserve", accountUrn: "acc-1111" };
    expect(isIgnoredSimplefinAccount(reserve, ["auto lease"])).toBe(false);
    expect(isIgnoredSimplefinAccount(reserve, ["0870"])).toBe(false);
    expect(isIgnoredSimplefinAccount(reserve, ["chase"])).toBe(true); // too broad, by design
  });

  it("any pattern in the list can match, and blank entries never match", () => {
    expect(isIgnoredSimplefinAccount(row, ["fidelity", "auto lease"])).toBe(true);
    expect(isIgnoredSimplefinAccount(row, ["", "   "])).toBe(false);
  });

  it("tolerates rows missing the account fields", () => {
    expect(isIgnoredSimplefinAccount({}, ["auto lease"])).toBe(false);
    expect(isIgnoredSimplefinAccount(undefined, ["auto lease"])).toBe(false);
  });
});
