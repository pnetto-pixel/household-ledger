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
