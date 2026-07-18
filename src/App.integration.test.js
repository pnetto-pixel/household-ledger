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
import { descFragment, detectManualCategoryCorrections } from "./App.jsx";

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
