// lib/simplefin.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { accountMatchesKeyword, mapTransaction, fetchSimplefinTransactions } from "./simplefin.js";

describe("accountMatchesKeyword", () => {
  it("matches on account name, org name, or org domain, case-insensitively", () => {
    expect(accountMatchesKeyword({ name: "Fidelity Individual - TOD" }, "fidelity")).toBe(true);
    expect(accountMatchesKeyword({ org: { name: "Fidelity Investments" } }, "fidelity")).toBe(true);
    expect(accountMatchesKeyword({ org: { domain: "fidelity.com" } }, "fidelity")).toBe(true);
    expect(accountMatchesKeyword({ name: "AMAZON STORE CARD" }, "amazon")).toBe(true);
    expect(accountMatchesKeyword({ name: "Chase Reserve" }, "fidelity")).toBe(false);
  });

  it("tolerates a missing account or missing fields", () => {
    expect(accountMatchesKeyword(undefined, "fidelity")).toBe(false);
    expect(accountMatchesKeyword({}, "fidelity")).toBe(false);
  });
});

describe("mapTransaction — Amazon description prefers memo", () => {
  it("uses memo first for an Amazon account, over description/payee", () => {
    const row = mapTransaction(
      { id: "1", posted: 1700000000, description: "Amazon.com", payee: "Amazon", memo: "Order #123: USB-C cable" },
      { name: "Amazon Card" }
    );
    expect(row.description).toBe("Order #123: USB-C cable");
  });

  it("falls back through payee/description when memo is absent, even for Amazon", () => {
    const row = mapTransaction(
      { id: "1", posted: 1700000000, description: "Amazon.com", payee: "Amazon" },
      { name: "Amazon Card" }
    );
    expect(row.description).toBe("Amazon.com");
  });

  it("keeps the normal description-first precedence for every other institution", () => {
    const row = mapTransaction(
      { id: "1", posted: 1700000000, description: "Whole Foods", payee: "WFM", memo: "internal ref 88" },
      { name: "Chase Reserve" }
    );
    expect(row.description).toBe("Whole Foods");
  });
});

describe("fetchSimplefinTransactions — Fidelity is always excluded", () => {
  const ORIGINAL_ENV = process.env.SIMPLEFIN_ACCESS_URL;

  beforeEach(() => {
    process.env.SIMPLEFIN_ACCESS_URL = "https://user:pass@bridge.simplefin.org/simplefin";
  });

  afterEach(() => {
    process.env.SIMPLEFIN_ACCESS_URL = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it("drops Fidelity's transactions and holdings from the sync result", async () => {
    const payload = {
      accounts: [
        {
          id: "acc-fidelity", name: "Individual - TOD", org: { name: "Fidelity Investments" },
          transactions: [{ id: "t1", posted: 1700000000, description: "Dividend", amount: "12.34" }],
          holdings: [{ id: "h1", description: "VTI" }],
        },
        {
          id: "acc-chase", name: "Chase Reserve", org: { name: "Chase" },
          transactions: [{ id: "t2", posted: 1700000000, description: "Coffee", amount: "-5.00" }],
        },
      ],
      errors: [],
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });

    const result = await fetchSimplefinTransactions();

    expect(result.ok).toBe(true);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].srcAccount).toBe("Chase Reserve");
    expect(result.holdings).toHaveLength(0);
    expect(result.accountCount).toBe(1); // Fidelity doesn't count as a synced account
  });
});

describe("mapTransaction — date is never empty", () => {
  const TODAY = new Date().toISOString().slice(0, 10);

  it("uses transacted_at when present, else posted", () => {
    expect(mapTransaction({ id: "1", posted: 1700000000, transacted_at: 1699900000 }, {}).date)
      .toBe(new Date(1699900000 * 1000).toISOString().slice(0, 10));
    expect(mapTransaction({ id: "1", posted: 1700000000 }, {}).date)
      .toBe(new Date(1700000000 * 1000).toISOString().slice(0, 10));
  });

  it("falls back to today when the row carries no usable timestamp", () => {
    // A row with date "" makes findInvalidRow (api/transactions.js) reject the
    // ENTIRE ledger with a 400, so one dateless synced row used to wedge every
    // future save. Mirrors buildRow's `if (!date) date = todayISO()`.
    for (const txn of [
      { id: "1" },
      { id: "2", posted: 0 },
      { id: "3", posted: null },
      { id: "4", posted: "not-a-number" },
    ]) {
      expect(mapTransaction(txn, {}).date).toBe(TODAY);
    }
  });

  it("every mapped row satisfies the server's date validation", () => {
    const rows = [{ id: "1" }, { id: "2", posted: 1700000000 }, { id: "3", posted: 0 }]
      .map((t) => mapTransaction(t, {}));
    for (const r of rows) expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
