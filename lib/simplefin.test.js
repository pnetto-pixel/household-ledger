// lib/simplefin.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { accountIsIgnored, mapTransaction, fetchSimplefinTransactions } from "./simplefin.js";

describe("mapTransaction — memo wins over description/payee whenever present", () => {
  it("uses memo when it has content, regardless of institution", () => {
    // Was Amazon-only ("Amazon.com" is boilerplate, the real order detail is
    // in memo) — generalized because nothing about the rule is Amazon-specific.
    const amazon = mapTransaction(
      { id: "1", posted: 1700000000, description: "Amazon.com", payee: "Amazon", memo: "Order #123: USB-C cable" },
      { name: "Amazon Card" }
    );
    expect(amazon.description).toBe("Order #123: USB-C cable");

    const chase = mapTransaction(
      { id: "2", posted: 1700000000, description: "Whole Foods", payee: "WFM", memo: "internal ref 88" },
      { name: "Chase Reserve" }
    );
    expect(chase.description).toBe("internal ref 88");
  });

  it("falls back to description, then payee, when memo is absent", () => {
    expect(
      mapTransaction({ id: "1", posted: 1700000000, description: "Amazon.com", payee: "Amazon" }, { name: "Amazon Card" }).description
    ).toBe("Amazon.com");
    expect(
      mapTransaction({ id: "2", posted: 1700000000, payee: "WFM" }, { name: "Chase Reserve" }).description
    ).toBe("WFM");
    expect(
      mapTransaction({ id: "3", posted: 1700000000 }, { name: "Chase Reserve" }).description
    ).toBe("(no description)");
  });

  it("treats a whitespace-only memo as absent, not as real content", () => {
    const row = mapTransaction(
      { id: "1", posted: 1700000000, description: "Whole Foods", memo: "   " },
      { name: "Chase Reserve" }
    );
    expect(row.description).toBe("Whole Foods");
  });
});

describe("accountIsIgnored", () => {
  it("matches case-insensitively against name or id, not org", () => {
    expect(accountIsIgnored({ name: "Auto Lease", id: "acc-1" }, ["auto lease"])).toBe(true);
    expect(accountIsIgnored({ name: "Checking", id: "acc-0870" }, ["0870"])).toBe(true);
    expect(accountIsIgnored({ name: "Fidelity Individual - TOD" }, ["FIDELITY"])).toBe(true);
    expect(accountIsIgnored({ org: { name: "Fidelity Investments" } }, ["fidelity"])).toBe(false);
    expect(accountIsIgnored({ name: "Chase Reserve" }, ["fidelity"])).toBe(false);
  });

  it("tolerates missing accounts, missing fields, and an empty/absent pattern list", () => {
    expect(accountIsIgnored(undefined, ["x"])).toBe(false);
    expect(accountIsIgnored({}, ["x"])).toBe(false);
    expect(accountIsIgnored({ name: "Chase" }, [])).toBe(false);
    expect(accountIsIgnored({ name: "Chase" }, undefined)).toBe(false);
  });
});

describe("fetchSimplefinTransactions — ignored accounts and account balances", () => {
  const ORIGINAL_ENV = process.env.SIMPLEFIN_ACCESS_URL;

  const buildPayload = () => ({
    accounts: [
      {
        id: "acc-fidelity", name: "Individual - TOD", org: { name: "Fidelity Investments" },
        balance: "1000.50", currency: "USD", "balance-date": 1700000000,
        transactions: [{ id: "t1", posted: 1700000000, description: "Dividend", amount: "12.34" }],
        holdings: [{ id: "h1", description: "VTI" }],
      },
      {
        id: "acc-chase", name: "Chase Reserve", org: { name: "Chase" },
        balance: "-250.75", "available-balance": "-200.00",
        transactions: [{ id: "t2", posted: 1700000000, description: "Coffee", amount: "-5.00" }],
      },
      {
        id: "acc-nobalance", name: "No Balance Account", org: { name: "Some Bank" },
        transactions: [],
      },
    ],
    errors: [],
  });

  beforeEach(() => {
    process.env.SIMPLEFIN_ACCESS_URL = "https://user:pass@bridge.simplefin.org/simplefin";
  });

  afterEach(() => {
    process.env.SIMPLEFIN_ACCESS_URL = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it("without ignoredPatterns, every account (including Fidelity) is included", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => buildPayload() });

    const result = await fetchSimplefinTransactions();

    expect(result.ok).toBe(true);
    expect(result.transactions).toHaveLength(2);
    expect(result.holdings).toHaveLength(1);
    expect(result.accountCount).toBe(3);
    expect(result.accountBalances).toHaveLength(3);
  });

  it("with ignoredPatterns: ['fidelity'], Fidelity is excluded from transactions and holdings, but still appears in accountBalances flagged ignored", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => buildPayload() });

    const result = await fetchSimplefinTransactions(["fidelity"]);

    expect(result.ok).toBe(true);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].srcAccount).toBe("Chase Reserve");
    expect(result.holdings).toHaveLength(0);
    expect(result.accountCount).toBe(2);
    // accountBalances is additive/aditional — it still lists the ignored
    // Fidelity account (Settings' consolidated table needs it to show/
    // unignore an already-ignored account), just flagged `ignored: true`;
    // the non-ignored accounts get `ignored: false`.
    expect(result.accountBalances.map((b) => b.accountUrn)).toEqual(["acc-fidelity", "acc-chase", "acc-nobalance"]);
    expect(result.accountBalances.find((b) => b.accountUrn === "acc-fidelity").ignored).toBe(true);
    expect(result.accountBalances.find((b) => b.accountUrn === "acc-chase").ignored).toBe(false);
    expect(result.accountBalances.find((b) => b.accountUrn === "acc-nobalance").ignored).toBe(false);
  });

  it("without ignoredPatterns, every accountBalances entry is ignored: false", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => buildPayload() });

    const result = await fetchSimplefinTransactions();

    expect(result.accountBalances.every((b) => b.ignored === false)).toBe(true);
  });

  it("parses balance/available-balance as numbers, defaults missing values to null", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => buildPayload() });

    const result = await fetchSimplefinTransactions();
    const chase = result.accountBalances.find((b) => b.accountUrn === "acc-chase");
    const noBalance = result.accountBalances.find((b) => b.accountUrn === "acc-nobalance");

    expect(chase.balance).toBe(-250.75);
    expect(chase.availableBalance).toBe(-200);
    expect(chase.orgName).toBe("Chase");
    expect(noBalance.balance).toBeNull();
    expect(noBalance.availableBalance).toBeNull();
    expect(noBalance.balanceDate).toBeNull();
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
