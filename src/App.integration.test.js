// Regression test for a real bug: descFragment (used by Settings > Suggested
// Rules > "Manual category corrections") called descWords, a helper that got
// extracted into src/ledger.js during the v1.39.0 refactor as a NON-exported
// (private) function — App.jsx's own reference to it was left dangling.
// It only threw at runtime for a transaction with categoryManual === true,
// a condition the ledger.js unit tests (which don't touch App.jsx at all)
// can't cover and that empty/synthetic test data happened to never trigger —
// so it shipped and only broke for real users with manually-corrected
// categories in their history. This test exercises the exact App.jsx-level
// code path (not just the ledger.js helper in isolation) so a future
// extraction that drops an export App.jsx still relies on fails here instead
// of only in production.
import { describe, it, expect } from "vitest";
import {
  buildYearCategoryBars,
  buildMerchantExpenseBars,
  defaultImportDupFilter,
  descFragment,
  detectManualCategoryCorrections,
  detectOtherDescriptionFragments,
  DUP_FILTERS,
  IMPORT_METHODS,
  matchesImportDupFilter,
} from "./App.jsx";

describe("Import preview defaults", () => {
  it("opens SimpleFin sync and pending previews on New", () => {
    expect(defaultImportDupFilter("sf")).toBe("new");
    expect(DUP_FILTERS.map(({ v }) => v)).toEqual(["all", "new", "dup"]);
  });

  it("keeps Credit Karma and generic CSV previews on All", () => {
    expect(defaultImportDupFilter("ck")).toBe("all");
    expect(defaultImportDupFilter("csv")).toBe("all");
  });

  it("groups uncertain matches under New while Dup stays certain-only", () => {
    expect(matchesImportDupFilter({ _dupState: "uncertain" }, "new")).toBe(true);
    expect(matchesImportDupFilter({ _dupState: "new" }, "new")).toBe(true);
    expect(matchesImportDupFilter({ _dupState: "certain" }, "new")).toBe(false);
    expect(matchesImportDupFilter({ _dupState: "certain" }, "dup")).toBe(true);
  });

  it("keeps the import choices concise and identifiable", () => {
    expect(IMPORT_METHODS.map(({ title }) => title)).toEqual(["SimpleFin", "Credit Karma", "CSV"]);
    expect(IMPORT_METHODS.find(({ id }) => id === "ck")?.desc).toBe("Auto-mapped CSV.");
    expect(IMPORT_METHODS.find(({ id }) => id === "csv")?.desc).toBe("Manual mapping.");
  });
});

describe("buildYearCategoryBars", () => {
  const isExpense = (category) => !["Salary", "Transfer"].includes(category);

  it("adds a Y/Y percentage to each ranked expense category", () => {
    const current = [
      { category: "Groceries", amount: -150 },
      { category: "Restaurant", amount: -50 },
    ];
    const previousYtd = [
      { category: "Groceries", amount: -100 },
      { category: "Restaurant", amount: -100 },
    ];

    expect(buildYearCategoryBars(current, previousYtd, isExpense)).toEqual([
      expect.objectContaining({ name: "Groceries", value: 150, yoy: 50 }),
      expect.objectContaining({ name: "Restaurant", value: 50, yoy: -50 }),
    ]);
  });

  it("uses an unavailable comparison when the category has no prior-year spend", () => {
    const bars = buildYearCategoryBars(
      [{ category: "Travel", amount: -200 }],
      [{ category: "Groceries", amount: -100 }],
      isExpense
    );

    expect(bars[0]).toEqual(expect.objectContaining({ name: "Travel", yoy: null }));
  });
});

describe("buildMerchantExpenseBars", () => {
  const rows = [
    { date: "2025-03-01", description: "TST* CAFE #123", category: "Restaurant", amount: -120 },
    { date: "2025-04-01", description: "CAFE #456", category: "Restaurant", amount: -80 },
    { date: "2025-05-01", description: "CAFE #789", category: "Restaurant", amount: 50 },
    { date: "2025-01-01", description: "MARKET", category: "Groceries", amount: -200 },
    { date: "2025-02-01", description: "MARKET", category: "Shopping", amount: -25 },
    { date: "2024-01-01", description: "OLD SHOP", category: "Shopping", amount: -999 },
    { date: "2025-01-01", description: "BANK", category: "Transfer", amount: -1000 },
    { date: "2025-01-01", description: "EMPLOYER", category: "Salary", amount: -500 },
  ];

  it("groups normalized merchants across categories, nets refunds and ranks spending", () => {
    expect(buildMerchantExpenseBars(rows, "2025")).toEqual([
      { name: "MARKET", value: 225, yoy: null },
      { name: "CAFE", value: 150, yoy: null },
    ]);
  });

  it("intersects the selected category and year before aggregating", () => {
    expect(buildMerchantExpenseBars(rows, "2025", "Shopping")).toEqual([{ name: "MARKET", value: 25, yoy: null }]);
    expect(buildMerchantExpenseBars(rows, "2024", "Shopping")).toEqual([{ name: "OLD SHOP", value: 999, yoy: null }]);
    expect(buildMerchantExpenseBars(rows, "2024", "Restaurant")).toEqual([]);
  });

  it("does not turn net credits or fully refunded purchases into spending", () => {
    expect(buildMerchantExpenseBars([
      { date: "2025-01-01", description: "SHOP", category: "Shopping", amount: -100 },
      { date: "2025-01-02", description: "SHOP", category: "Shopping", amount: 100 },
      { date: "2025-01-03", description: "CREDIT", category: "Shopping", amount: 200 },
    ], "2025")).toEqual([]);
  });

  it("handles missing descriptions and invalid amounts without losing valid spend", () => {
    expect(buildMerchantExpenseBars([
      { date: "2025-01-01", category: "Other", amount: "-12.50" },
      { date: "2025-01-02", description: "BAD", category: "Other", amount: Infinity },
      { date: "2025-01-03", description: "BAD", category: "Other", amount: "oops" },
      { description: "NO DATE", category: "Other", amount: -50 },
    ], "2025")).toEqual([{ name: "Unknown merchant", value: 12.5, yoy: null }]);
  });

  it("compares grouped merchants through the same day in both years for YTD", () => {
    const rows = [
      { date: "2026-03-01", description: "LoanDepot.com PAYMENT 123456", category: "Mortgage", amount: -1200 },
      { date: "2026-07-10", description: "LOANDEPOT", category: "Mortgage", amount: -400 },
      { date: "2026-07-10", description: "LOANDEPOT", category: "Mortgage", amount: 100 },
      { date: "2025-03-01", description: "LOAN DEPOT AUTOPAY 999999", category: "Mortgage", amount: -1000 },
      { date: "2026-07-11", description: "LOANDEPOT", category: "Mortgage", amount: -5000 },
      { date: "2025-07-11", description: "LOANDEPOT", category: "Mortgage", amount: -5000 },
    ];
    expect(buildMerchantExpenseBars(rows, "2026", "All", "2026-07-10")).toEqual([
      { name: "LOANDEPOT", value: 1500, yoy: 50 },
    ]);
  });

  it("compares complete past years with the same category on each side", () => {
    const rows = [
      { date: "2025-12-31", description: "MARKET", category: "Groceries", amount: -150 },
      { date: "2024-12-31", description: "MARKET", category: "Groceries", amount: -200 },
      { date: "2024-01-01", description: "MARKET", category: "Shopping", amount: -1000 },
    ];
    expect(buildMerchantExpenseBars(rows, "2025", "Groceries", "2026-07-10")).toEqual([
      { name: "MARKET", value: 150, yoy: -25 },
    ]);
  });

  it("uses an unavailable comparison for zero or net-credit prior-year spend", () => {
    const rows = [
      { date: "2025-01-01", description: "MARKET", category: "Groceries", amount: -100 },
      { date: "2024-01-01", description: "MARKET", category: "Groceries", amount: -100 },
      { date: "2024-02-01", description: "MARKET", category: "Groceries", amount: 100 },
      { date: "2025-01-01", description: "SHOP", category: "Shopping", amount: -50 },
      { date: "2024-01-01", description: "SHOP", category: "Shopping", amount: 200 },
    ];
    expect(buildMerchantExpenseBars(rows, "2025", "All", "2026-07-10")).toEqual([
      { name: "MARKET", value: 100, yoy: null },
      { name: "SHOP", value: 50, yoy: null },
    ]);
  });
});

describe("descFragment", () => {
  it("collapses a merchant description to its significant words", () => {
    expect(descFragment("STARBUCKS STORE #4821")).toBe("starbucks store");
    expect(descFragment("")).toBe("");
  });
});

describe("detectManualCategoryCorrections", () => {
  it("groups manually-corrected transactions without throwing", () => {
    const transactions = [
      { id: "1", description: "Starbucks Coffee 4821", category: "Restaurant", categoryManual: true },
      { id: "2", description: "Starbucks Coffee 9012", category: "Restaurant", categoryManual: true },
      { id: "3", description: "Starbucks Coffee 1234", category: "Groceries", categoryManual: false },
      { id: "4", description: "Transfer to savings", category: "Transfer", categoryManual: true },
    ];
    const groups = detectManualCategoryCorrections(transactions, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("starbucks coffee");
    expect(groups[0].count).toBe(2);
  });

  it("returns no groups below the threshold of 2, without throwing", () => {
    const transactions = [
      { id: "1", description: "One-off correction", category: "Other", categoryManual: true },
    ];
    expect(detectManualCategoryCorrections(transactions, [])).toEqual([]);
  });
});

describe("detectOtherDescriptionFragments (Suggested rules, group D)", () => {
  const rows = [
    { id: "1", description: "SQ *SWEETGREEN 8821", category: "Other" },
    { id: "2", description: "SQ *SWEETGREEN 4410", category: "Other" },
    { id: "3", description: "Random one-off", category: "Other" },
    { id: "4", description: "SWEETGREEN downtown", category: "Restaurant" }, // already classified
    { id: "5", description: "Chose Other on purpose", category: "Other", categoryManual: true },
    { id: "6", description: "Chose Other on purpose", category: "Other", categoryManual: true },
  ];

  it("groups repeated merchants stuck in Other, ignoring deliberate choices", () => {
    const groups = detectOtherDescriptionFragments(rows, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("sweetgreen"); // "sq" is dropped as a <3-char token
    expect(groups[0].count).toBe(2);
    expect(groups[0].pattern).toBe("sweetgreen");
  });

  it("skips rows an existing description rule already matches", () => {
    // Without this the panel would flood with the whole pre-fix SimpleFin
    // history the moment the user creates the very rule it suggested.
    const rules = [{ matchField: "description", pattern: "sweetgreen", destinationCategory: "Restaurant" }];
    expect(detectOtherDescriptionFragments(rows, rules)).toEqual([]);
  });
});
