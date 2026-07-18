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

describe("markDuplicates", () => {
  const existing = [
    { sourceId: "src-1", date: "2026-07-01", amount: -10, description: "Coffee Shop", account: "Apple" },
    { date: "2026-07-02", amount: -25.5, description: "Grocery Store", account: "Chase Reserve" },
  ];

  it("flags by sourceId when both sides have one", () => {
    const rows = [{ sourceId: "src-1", date: "2026-07-01", amount: -10, description: "Coffee Shop", account: "Apple" }];
    expect(markDuplicates(rows, existing)[0]._dup).toBe(true);
  });

  it("distinct sourceIds are never merged even with identical content", () => {
    const rows = [{ sourceId: "src-2", date: "2026-07-01", amount: -10, description: "Coffee Shop", account: "Apple" }];
    expect(markDuplicates(rows, existing)[0]._dup).toBe(false);
  });

  it("flags by content fingerprint when no sourceId", () => {
    const rows = [{ date: "2026-07-02", amount: -25.5, description: "  GROCERY   store ", account: "Chase Reserve" }];
    expect(markDuplicates(rows, existing)[0]._dup).toBe(true);
  });

  it("fuzzy: same account+cents, ±2 days, shared word", () => {
    const rows = [
      { date: "2026-07-04", amount: -25.5, description: "Grocery Market", account: "Chase Reserve" }, // +2d, shares "grocery"
      { date: "2026-07-06", amount: -25.5, description: "Grocery Market", account: "Chase Reserve" }, // +4d → not dup of existing…
    ];
    const out = markDuplicates(rows, existing);
    expect(out[0]._dup).toBe(true);
    // …but row 2 IS within ±2 days of row 1 (same batch), so it's flagged too.
    expect(out[1]._dup).toBe(true);
  });

  it("dedups within the same batch", () => {
    const rows = [
      { date: "2026-07-10", amount: -5, description: "Snack", account: "Apple" },
      { date: "2026-07-10", amount: -5, description: "Snack", account: "Apple" },
    ];
    const out = markDuplicates(rows, []);
    expect(out[0]._dup).toBe(false);
    expect(out[1]._dup).toBe(true);
  });

  it("fingerprint includes signed cents", () => {
    expect(txnFingerprint({ date: "2026-07-01", amount: -10, description: "x", account: "a" }))
      .not.toBe(txnFingerprint({ date: "2026-07-01", amount: 10, description: "x", account: "a" }));
  });
});
