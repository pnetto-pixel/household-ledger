import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  LayoutDashboard,
  List,
  Upload,
  Eye,
  EyeOff,
  Trash2,
  Pencil,
  Search,
  X,
  LogOut,
  TrendingUp,
  Settings,
  Plus,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Check,
  ShieldCheck,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  ReferenceLine,
  LabelList,
} from "recharts";
import Papa from "papaparse";

// ---------------------------------------------------------------------------
// Domain constants
// ---------------------------------------------------------------------------

const TRANSFER_CATEGORY = "Transfer";

const DEFAULT_EXPENSE_CATEGORIES = [
  "Car",
  "Dog",
  "Entertainment",
  "Fuel",
  "Groceries",
  "Home",
  "Medical",
  "Mobile Phone",
  "Mortgage",
  "Other",
  "Restaurant",
  "Services",
  "Shopping",
  "Transport",
  "Travel",
  "Utilities",
];
const DEFAULT_INCOME_CATEGORIES = ["Salary", "Bonus", "Bela Income", "Other Income"];
const DEFAULT_ACCOUNTS = [
  "ATT Reward",
  "Advancial",
  "Alaska",
  "Amazon Card",
  "Apple",
  "Bank of America",
  "Capital One",
  "Chase Bela",
  "Chase Preferred",
  "Chase Reserve",
  "Chime",
  "Discover",
  "Ink Biz Cash",
  "Ink Unlimited",
  "Jasper Card",
  "Lowes Card",
  "SoFi",
  "Southwest",
  "T-Mobile",
  "United Explorer",
  "Venmo",
  "Venture X",
];

// Runtime config — seeded with the defaults above, then replaced by
// applyConfig() from /api/config so accounts and categories can be managed
// from the UI without code changes. These are mutable (let) so the pure
// helpers below read current values at call time; React components re-render
// via the `config` state in App (which also calls applyConfig).
let ACCOUNTS = [...DEFAULT_ACCOUNTS];
let EXPENSE_CATEGORIES = [...DEFAULT_EXPENSE_CATEGORIES];
let INCOME_CATEGORIES = [...DEFAULT_INCOME_CATEGORIES];
let CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, TRANSFER_CATEGORY];

function applyConfig(cfg) {
  if (Array.isArray(cfg?.accounts) && cfg.accounts.length) ACCOUNTS = [...cfg.accounts];
  if (Array.isArray(cfg?.expenseCategories) && cfg.expenseCategories.length) EXPENSE_CATEGORIES = [...cfg.expenseCategories];
  if (Array.isArray(cfg?.incomeCategories) && cfg.incomeCategories.length) INCOME_CATEGORIES = [...cfg.incomeCategories];
  // "Other Income" is the income bucket the Credit Karma importer maps rows
  // into (see BANK_PROFILES and the CK exporter). Guarantee it is always a
  // recognized income category so imported income (e.g. Apple Daily Cash)
  // is never silently downgraded to the expense "Other" — which would invert
  // its displayed sign in the cash-flow view.
  if (!INCOME_CATEGORIES.includes("Other Income")) INCOME_CATEGORIES = [...INCOME_CATEGORIES, "Other Income"];
  CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, TRANSFER_CATEGORY];
}

// The current runtime config as a plain object (for seeding React state).
function currentConfig() {
  return {
    accounts: [...ACCOUNTS],
    expenseCategories: [...EXPENSE_CATEGORIES],
    incomeCategories: [...INCOME_CATEGORIES],
  };
}

// Account classification (Option B): map each canonical account to the
// keyword/alias fragments that identify it in a source's own account/card
// field. Matched against the account-identifying value only (never the
// merchant description — the card you paid with is not the store you paid).
// Order matters: the first account with a matching alias wins, so keep the
// more specific names ahead of weaker, collision-prone fragments.
//
// This used to be a fixed constant; it is now a seed (`DEFAULT_ACCOUNT_ALIASES`)
// overridden at runtime by `applyAliasConfig()` from `/api/account-aliases`,
// the same pattern used for ACCOUNTS/EXPENSE_CATEGORIES/INCOME_CATEGORIES via
// `applyConfig()`. Editable from Settings → "Account aliases".
const DEFAULT_ACCOUNT_ALIASES = [
  ["Advancial", ["advancial"]],
  ["Amazon Card", ["amazon", "amzn"]],
  ["Apple", ["applecard", "applecash", "apple", "goldman"]],
  ["Bank of America", ["bankofamerica", "bofa"]],
  // Venture X before Capital One: the co-branded card is the more specific
  // account, even though Capital One issues it.
  ["Venture X", ["venturex", "venture"]],
  ["Capital One", ["capitalone", "capone"]],
  ["Chase Bela", ["chasebela", "bela"]],
  ["Chase Preferred", ["sapphirepreferred", "chasepreferred", "preferred"]],
  ["Chase Reserve", ["sapphirereserve", "chasereserve", "reserve"]],
  ["Ink Biz Cash", ["inkbusinesscash", "inkbizcash", "inkcash"]],
  ["Ink Unlimited", ["inkbusinessunlimited", "inkunlimited"]],
  ["Jasper Card", ["jasper"]],
  ["Lowes Card", ["lowes"]],
  ["United Explorer", ["unitedexplorer", "mileageplus", "united"]],
  ["Southwest", ["southwest", "rapidrewards"]],
  ["T-Mobile", ["tmobile"]],
  ["Alaska", ["alaska"]],
  ["Discover", ["discover"]],
  ["Chime", ["chime"]],
  ["SoFi", ["sofi"]],
  ["Venmo", ["venmo"]],
  ["ATT Reward", ["attreward", "att"]],
];

// Runtime alias table (mutable) — seeded with the defaults above, replaced by
// `applyAliasConfig()` (see below) once `/api/account-aliases` loads. Kept as
// module state (not React state) so the pure `matchAccount` helper always
// reads the current value; components re-render via the `accountAliases`
// state in App.
let ACCOUNT_ALIASES = DEFAULT_ACCOUNT_ALIASES.map(([a, frags]) => [a, [...frags]]);

// Build the alias array from a persisted `{ account: [fragment, ...] }` object,
// falling back to the default fragments for any account not present in it.
// Pure — does not mutate `ACCOUNT_ALIASES` (used by both `applyAliasConfig`
// and the impact-preview UI, which needs to try a draft without committing).
function buildAliasArray(aliasesObj) {
  const merged = new Map(DEFAULT_ACCOUNT_ALIASES.map(([a, frags]) => [a, frags]));
  if (aliasesObj && typeof aliasesObj === "object") {
    for (const [acc, frags] of Object.entries(aliasesObj)) {
      if (Array.isArray(frags)) merged.set(acc, [...frags]);
    }
  }
  // Keep default priority order; append any accounts only known via the
  // persisted object (e.g. an account added after aliases were last saved).
  const order = DEFAULT_ACCOUNT_ALIASES.map(([a]) => a);
  for (const a of merged.keys()) if (!order.includes(a)) order.push(a);
  return order.map((a) => [a, merged.get(a) || []]);
}

function applyAliasConfig(aliasesObj) {
  ACCOUNT_ALIASES = buildAliasArray(aliasesObj);
}

// The current runtime alias table as a plain `{ account: [fragment, ...] }`
// object (for seeding/persisting React state).
function currentAliasConfig() {
  const out = {};
  for (const [a, frags] of ACCOUNT_ALIASES) out[a] = [...frags];
  return out;
}

// Raw Credit Karma category -> ledger category. Mirrors CAT/CATEGORY_MAP in
// tools/credit-karma/bookmarklet.src.js and creditkarma-export.scriptable.js
// (kept 1:1 in sync by hand — those exporters remain untouched). Only the
// EXPENSE-side lookup table lives here; Transfer/Payment and Income are
// resolved by branches ahead of the table lookup in `mapCkCategory`, exactly
// like `mapCat`/`mapCategory` in the exporters.
//
// This used to be baked into the exporters only. It is now also a seed here
// (`DEFAULT_CK_CATEGORY_MAP`) so the ledger can compute/audit the same
// category mapping at IMPORT time (see `buildRow`), overridden at runtime by
// `applyCkCategoryMapConfig()` from `/api/ck-category-map` — same pattern as
// `applyAliasConfig()`/`ACCOUNT_ALIASES` above. Editable from Audit →
// "Category mapping". Changing an entry here only affects future imports —
// no retroactive cascade onto already-imported transactions.
const DEFAULT_CK_CATEGORY_MAP = {
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

// Runtime CK category map (mutable) — seeded with the defaults above,
// replaced by `applyCkCategoryMapConfig()` once `/api/ck-category-map` loads.
// Module state (not React state) so the pure `mapCkCategory` calls from
// `buildRow` always read the current value; components re-render via the
// `ckCategoryMap` state in App.
let CK_CATEGORY_MAP = { ...DEFAULT_CK_CATEGORY_MAP };

function applyCkCategoryMapConfig(mapObj) {
  CK_CATEGORY_MAP = { ...DEFAULT_CK_CATEGORY_MAP, ...(mapObj && typeof mapObj === "object" ? mapObj : {}) };
}

// The current runtime CK category map as a plain object (for seeding/
// persisting React state).
function currentCkCategoryMapConfig() {
  return { ...CK_CATEGORY_MAP };
}

// Normalize a raw Credit Karma category name into the UPPER_SNAKE_CASE token
// used as the lookup key — identical regex to `mapCat`/`mapCategory` in the
// exporters, so tokens computed here line up with the seed's keys.
function ckCategoryToken(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/&/g, "AND")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Pure re-implementation of the exporters' `mapCat`/`mapCategory`: Transfer/
// Payment checked first (excluded from all ledger totals), then Income, then
// the table lookup with an "Other" fallback. `mapObj` is a parameter (not the
// live `CK_CATEGORY_MAP`) so the audit UI can preview a draft mapping before
// saving, mirroring `matchAccountWithAliases`/`buildAliasArray`.
function mapCkCategory(ckCategoryRaw, ckType, mapObj) {
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
// Bank import profiles
// ---------------------------------------------------------------------------

// Two import methods only. Credit Karma is the day-to-day path (auto-mapped
// from the bookmarklet/Scriptable export); generic CSV is the one-time path
// for backfilling history with manual column mapping.
const BANK_PROFILES = [
  {
    id: 'credit-karma',
    label: 'Credit Karma',
    format: 'csv',
    // CK export columns (see tools/credit-karma): date, description, amount,
    // category, account, ck_account, provider, ck_category, type, account_urn,
    // last4. The account column is run through matchAccount, and ck_category is
    // kept for auditing.
    columnMap: { date: 'date', description: 'description', amount: 'amount', category: 'category', account: 'account', ckCategory: 'ck_category', ckType: 'type', accountUrn: 'account_urn', last4: 'last4', sourceId: 'source_id' },
    defaultAccount: '',
    // Preserve the sign: the CK export writes income always positive and
    // expense in the natural direction — a refund (expense minority sign)
    // arrives negative and nets out. Income clawbacks are corrected manually.
    normalizeAmount: (raw) => parseFloat(String(raw).replace(/[$,]/g, '')) || 0,
  },
  {
    id: 'generic',
    label: 'CSV (manual mapping)',
    format: 'csv',
    columnMap: null,
    defaultAccount: '',
    normalizeAmount: null,
  },
];

const CATEGORY_COLORS = [
  "#60a5fa",
  "#f87171",
  "#34d399",
  "#fbbf24",
  "#a78bfa",
  "#fb923c",
  "#22d3ee",
  "#f472b6",
  "#4ade80",
  "#facc15",
  "#818cf8",
  "#2dd4bf",
  "#e879f9",
  "#fca5a5",
  "#93c5fd",
  "#fdba74",
  "#86efac",
  "#c084fc",
  "#67e8f9",
  "#fde047",
  "#a3e635",
];

const CATEGORY_COLOR_MAP = {
  // Casa
  "Home":        "#f87171",
  "Mortgage":    "#ef4444",
  "Utilities":   "#fca5a5",
  "Services":    "#fb923c",
  // Carro
  "Car":         "#60a5fa",
  "Fuel":        "#3b82f6",
  "Transport":   "#93c5fd",
  // Alimentação
  "Groceries":   "#34d399",
  "Restaurant":  "#4ade80",
  "Dog":         "#86efac",
  // Lazer
  "Entertainment": "#a78bfa",
  "Shopping":    "#c084fc",
  "Travel":      "#e879f9",
  // Finanças/Saúde
  "Mobile Phone": "#fbbf24",
  "Medical":     "#facc15",
  "Other":       "#6b7280",
  // Income (tons verdes)
  "Salary":      "#10b981",
  "Bonus":       "#34d399",
  "Bela Income": "#6ee7b7",
  "Other Income": "#a7f3d0",
};

// Fixed thematic order for CategoryStackedBarCard bars
const CATEGORY_ORDER = [
  // Casa
  "Mortgage", "Home", "Utilities", "Services",
  // Carro
  "Car", "Fuel", "Transport",
  // Alimentação
  "Groceries", "Restaurant", "Dog",
  // Lazer
  "Entertainment", "Shopping", "Travel",
  // Finanças
  "Mobile Phone", "Medical", "Other",
];

const isIncome = (cat) => INCOME_CATEGORIES.includes(cat);
const isTransfer = (cat) => cat === TRANSFER_CATEGORY;

// Derived "type" of a transaction, used by the audit table.
const txnType = (cat) =>
  isTransfer(cat) ? "Transfer" : isIncome(cat) ? "Income" : "Expense";

const TYPE_COLOR = { Income: "#34d399", Expense: "#f87171", Transfer: "#8b94a3" };

// Presentation of a transaction's amount. The rule is simple and category
// independent: the sign comes straight from Credit Karma's `amount` and is
// never altered. Negative → red with a "−"; positive → green, no sign. The
// ONLY category that overrides this is Transfer: gray, no sign.
// Returns { sign, color, value } where value is the (positive) magnitude.
function amountDisplay(t) {
  const raw = Number(t.amount) || 0;
  if (isTransfer(t.category)) return { sign: "", color: TYPE_COLOR.Transfer, value: Math.abs(raw) };
  const negative = raw < 0;
  return {
    sign: negative ? "−" : "",
    color: negative ? TYPE_COLOR.Expense : TYPE_COLOR.Income,
    value: Math.abs(raw),
  };
}

// Tracks whether the viewport is wide enough for the desktop audit layout.
function useMediaWide(px = 900) {
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= px
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(min-width:${px}px)`);
    const handler = (e) => setWide(e.matches);
    setWide(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [px]);
  return wide;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const todayISO = () => new Date().toISOString().slice(0, 10);

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Whole-dollar format (no cents) — used where space is tight, e.g. the
// Dashboard period stat cards that otherwise overflow the row.
const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function getMeta(name) {
  const el = document.querySelector(`meta[name="${name}"]`);
  const v = el?.getAttribute("content") || "";
  return v && !v.startsWith("%") ? v : "";
}

// ---------------------------------------------------------------------------
// Auth headers (Google token or app password)
// ---------------------------------------------------------------------------

function buildAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  const token = window.__householdGoogleToken;
  const pwd = localStorage.getItem("household_pwd");
  if (token) headers["x-google-token"] = token;
  else if (pwd) headers["x-app-password"] = pwd;
  return headers;
}

// ===========================================================================
// App
// ===========================================================================

export default function App() {
  const [authed, setAuthed] = useState(
    () => !!localStorage.getItem("household_pwd") || !!window.__householdGoogleToken
  );
  const [transactions, setTransactions] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [hideValues, setHideValues] = useState(
    () => localStorage.getItem("household_hide") === "1"
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(null);

  const loadedRef = useRef(false);
  const debounceRef = useRef(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Online / offline status
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // Account map: { [accountURN]: "Friendly Account" } — loaded from /api/account-map.
  const [accountMap, setAccountMap] = useState({});
  // User-managed lists (accounts + categories) — loaded from /api/config.
  // Seeded from the module defaults so the UI has values before the fetch.
  const [config, setConfig] = useState(() => currentConfig());
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Format a money value, respecting the global eye toggle.
  const money = useCallback(
    (n) => (hideValues ? "•••••" : usd.format(n || 0)),
    [hideValues]
  );

  // ---- Load ----------------------------------------------------------------
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/transactions", {
        method: "GET",
        headers: buildAuthHeaders(),
      });
      if (res.status === 401 || res.status === 403) {
        setAuthed(false);
        localStorage.removeItem("household_pwd");
        setError("Authentication required.");
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Load failed (${res.status})`);
      }
      const data = await res.json();
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      setSavedAt(data.savedAt || null);
      loadedRef.current = true;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  // ---- Save (debounced after mutations) ------------------------------------
  const save = useCallback(async (next) => {
    if (!navigator.onLine) {
      setSaveError("offline");
      return;
    }
    setDirty(false);
    setSaving(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "PUT",
        headers: buildAuthHeaders(),
        body: JSON.stringify({ transactions: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Save failed (${res.status})`);
      }
      const data = await res.json();
      setSavedAt(data.savedAt || new Date().toISOString());
      setSaveError(null);
    } catch (err) {
      setSaveError(err.message || "Save failed");
      setTimeout(() => setSaveError(null), 5000);
    } finally {
      setSaving(false);
    }
  }, []);

  const scheduleSave = useCallback(
    (next) => {
      setDirty(true);
      setSaveError(null);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(next), 800);
    },
    [save]
  );

  // Flush pending save before page unload.
  useEffect(() => {
    const flush = () => {
      if (!navigator.onLine) return;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        if (dirty) save(transactions);
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [dirty, transactions, save]);

  // ---- Account map load / save ---------------------------------------------
  const loadAccountMap = useCallback(async () => {
    try {
      const res = await fetch("/api/account-map", {
        method: "GET",
        headers: buildAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.map && typeof data.map === "object") setAccountMap(data.map);
    } catch {
      // Silently ignore — the map is non-critical.
    }
  }, []);

  const saveAccountMap = useCallback(async (next) => {
    setAccountMap(next);
    try {
      await fetch("/api/account-map", {
        method: "PUT",
        headers: buildAuthHeaders(),
        body: JSON.stringify({ map: next }),
      });
    } catch {
      // Silently ignore.
    }
  }, []);

  useEffect(() => {
    if (authed) loadAccountMap();
  }, [authed, loadAccountMap]);

  // ---- Account aliases load / save ------------------------------------------
  const [accountAliases, setAccountAliases] = useState(() => currentAliasConfig());

  const loadAccountAliases = useCallback(async () => {
    try {
      const res = await fetch("/api/account-aliases", {
        method: "GET",
        headers: buildAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.aliases && typeof data.aliases === "object") {
        applyAliasConfig(data.aliases);
        setAccountAliases(currentAliasConfig());
      }
    } catch {
      // Silently ignore — defaults already seeded.
    }
  }, []);

  useEffect(() => {
    if (authed) loadAccountAliases();
  }, [authed, loadAccountAliases]);

  // Persist the alias table and reclassify existing transactions that now
  // match a changed/added fragment (mirrors saveAndApplyAccountMap's cascade).
  // URN-mapped rows are left untouched — the card map always wins over aliases.
  const saveAccountAliasesAndApply = useCallback(
    (nextAliasesObj) => {
      applyAliasConfig(nextAliasesObj);
      setAccountAliases(currentAliasConfig());
      fetch("/api/account-aliases", {
        method: "PUT",
        headers: buildAuthHeaders(),
        body: JSON.stringify({ aliases: nextAliasesObj }),
      }).catch(() => {});
      setTransactions((prev) => {
        let changed = false;
        const next = prev.map((t) => {
          if (t.accountUrn && accountMap && accountMap[t.accountUrn]) return t;
          const raw = t.srcAccount || "";
          if (!raw) return t;
          const newAccount = matchAccount(raw); // reads the alias table just applied above
          if (newAccount && newAccount !== t.account) {
            changed = true;
            return { ...t, account: newAccount };
          }
          return t;
        });
        if (changed) scheduleSave(next);
        return changed ? next : prev;
      });
    },
    [accountMap, scheduleSave]
  );

  // ---- CK category map load / save ------------------------------------------
  const [ckCategoryMap, setCkCategoryMap] = useState(() => currentCkCategoryMapConfig());

  const loadCkCategoryMap = useCallback(async () => {
    try {
      const res = await fetch("/api/ck-category-map", {
        method: "GET",
        headers: buildAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.map && typeof data.map === "object") {
        applyCkCategoryMapConfig(data.map);
        setCkCategoryMap(currentCkCategoryMapConfig());
      }
    } catch {
      // Silently ignore — defaults already seeded.
    }
  }, []);

  useEffect(() => {
    if (authed) loadCkCategoryMap();
  }, [authed, loadCkCategoryMap]);

  // Persist the CK->ledger category map. Deliberately no cascade: only new
  // imports (buildRow) are affected — existing transactions keep whatever
  // category they were imported with.
  const saveCkCategoryMap = useCallback((nextMapObj) => {
    applyCkCategoryMapConfig(nextMapObj);
    setCkCategoryMap(currentCkCategoryMapConfig());
    return fetch("/api/ck-category-map", {
      method: "PUT",
      headers: buildAuthHeaders(),
      body: JSON.stringify({ map: nextMapObj }),
    }).catch(() => {});
  }, []);

  // ---- Config (accounts + categories) load / save --------------------------
  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config", {
        method: "GET",
        headers: buildAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.config && typeof data.config === "object") {
        applyConfig(data.config); // update module lists for the pure helpers
        setConfig(currentConfig()); // re-render components with the merged result
      }
    } catch {
      // Silently ignore — defaults already seeded.
    }
  }, []);

  // Persist a partial config patch (one or more lists), merged over current.
  const saveConfig = useCallback((patch) => {
    const next = { ...currentConfig(), ...patch };
    applyConfig(next);
    setConfig(currentConfig());
    fetch("/api/config", {
      method: "PUT",
      headers: buildAuthHeaders(),
      body: JSON.stringify({ config: next }),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (authed) loadConfig();
  }, [authed, loadConfig]);

  // ---- Mutations -----------------------------------------------------------
  const addTransactions = useCallback(
    (rows) => {
      setTransactions((prev) => {
        const next = [...rows, ...prev];
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const deleteTransaction = useCallback(
    (id) => {
      setTransactions((prev) => {
        const next = prev.filter((t) => t.id !== id);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const deleteSelected = useCallback(
    (ids) => {
      setTransactions((prev) => {
        const idSet = new Set(ids);
        const next = prev.filter((t) => !idSet.has(t.id));
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const updateTransaction = useCallback(
    (updated) => {
      setTransactions((prev) => {
        const next = prev.map((t) => (t.id === updated.id ? updated : t));
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  // Bulk-apply a partial patch (e.g. { category } or { account }) to many rows.
  const updateMany = useCallback(
    (ids, patch) => {
      setTransactions((prev) => {
        const idSet = new Set(ids);
        const next = prev.map((t) => (idSet.has(t.id) ? { ...t, ...patch } : t));
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  // Persist the account map and apply it to existing transactions by URN.
  const saveAndApplyAccountMap = useCallback(
    (nextMap) => {
      saveAccountMap(nextMap);
      setTransactions((prev) => {
        let changed = false;
        const next = prev.map((t) => {
          const mapped = t.accountUrn && nextMap[t.accountUrn];
          if (mapped && mapped !== t.account) {
            changed = true;
            return { ...t, account: mapped };
          }
          return t;
        });
        if (changed) scheduleSave(next);
        return changed ? next : prev;
      });
    },
    [saveAccountMap, scheduleSave]
  );

  // ---- Manage accounts / categories ----------------------------------------
  // Adds/renames/deletes cascade into existing data so nothing is orphaned:
  // renaming an account updates its transactions and account-map values;
  // renaming a category updates its transactions.
  const sortNames = (arr) => [...arr].sort((a, b) => a.localeCompare(b));

  const addAccount = useCallback((name) => {
    const n = (name || "").trim();
    if (!n || ACCOUNTS.includes(n)) return;
    saveConfig({ accounts: [...ACCOUNTS, n] }); // append; order is user-managed
  }, [saveConfig]);

  const renameAccount = useCallback((oldName, newName) => {
    const nn = (newName || "").trim();
    if (!nn || nn === oldName || ACCOUNTS.includes(nn) || !ACCOUNTS.includes(oldName)) return;
    saveConfig({ accounts: ACCOUNTS.map((a) => (a === oldName ? nn : a)) }); // keep position
    setTransactions((prev) => {
      let ch = false;
      const next = prev.map((t) => (t.account === oldName ? ((ch = true), { ...t, account: nn }) : t));
      if (ch) scheduleSave(next);
      return ch ? next : prev;
    });
    setAccountMap((prevMap) => {
      let ch = false;
      const am = {};
      for (const [k, v] of Object.entries(prevMap)) {
        if (v === oldName) { am[k] = nn; ch = true; } else am[k] = v;
      }
      if (ch) {
        fetch("/api/account-map", { method: "PUT", headers: buildAuthHeaders(), body: JSON.stringify({ map: am }) }).catch(() => {});
        return am;
      }
      return prevMap;
    });
  }, [saveConfig, scheduleSave]);

  const deleteAccount = useCallback((name) => {
    if (!ACCOUNTS.includes(name)) return;
    saveConfig({ accounts: ACCOUNTS.filter((a) => a !== name) });
  }, [saveConfig]);

  const addCategory = useCallback((kind, name) => {
    const n = (name || "").trim();
    if (!n || CATEGORIES.includes(n)) return;
    if (kind === "income") saveConfig({ incomeCategories: [...INCOME_CATEGORIES, n] });
    else saveConfig({ expenseCategories: [...EXPENSE_CATEGORIES, n] }); // append; order user-managed
  }, [saveConfig]);

  const renameCategory = useCallback((oldName, newName) => {
    const nn = (newName || "").trim();
    if (!nn || nn === oldName || CATEGORIES.includes(nn)) return;
    if (EXPENSE_CATEGORIES.includes(oldName)) {
      saveConfig({ expenseCategories: EXPENSE_CATEGORIES.map((c) => (c === oldName ? nn : c)) }); // keep position
    } else if (INCOME_CATEGORIES.includes(oldName)) {
      saveConfig({ incomeCategories: INCOME_CATEGORIES.map((c) => (c === oldName ? nn : c)) });
    } else return;
    setTransactions((prev) => {
      let ch = false;
      const next = prev.map((t) => (t.category === oldName ? ((ch = true), { ...t, category: nn }) : t));
      if (ch) scheduleSave(next);
      return ch ? next : prev;
    });
  }, [saveConfig, scheduleSave]);

  const deleteCategory = useCallback((name) => {
    if (EXPENSE_CATEGORIES.includes(name)) saveConfig({ expenseCategories: EXPENSE_CATEGORIES.filter((c) => c !== name) });
    else if (INCOME_CATEGORIES.includes(name)) saveConfig({ incomeCategories: INCOME_CATEGORIES.filter((c) => c !== name) });
  }, [saveConfig]);

  const reorderAccounts = useCallback((names) => saveConfig({ accounts: names }), [saveConfig]);
  const reorderCategories = useCallback((kind, names) => {
    saveConfig(kind === "income" ? { incomeCategories: names } : { expenseCategories: names });
  }, [saveConfig]);

  // ---- Eye toggle ----------------------------------------------------------
  const toggleHide = useCallback(() => {
    setHideValues((v) => {
      const next = !v;
      localStorage.setItem("household_hide", next ? "1" : "0");
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("household_pwd");
    window.__householdGoogleToken = null;
    setAuthed(false);
    setTransactions([]);
  }, []);

  // Desktop gets a wider shell so the audit table has horizontal room.
  const isWide = useMediaWide(900);
  const shellWidth = isWide ? 1180 : 560;

  if (!authed) {
    return <Login onAuthed={() => setAuthed(true)} />;
  }

  return (
    <div style={{ ...S.app, maxWidth: shellWidth }}>
      <Header
        hideValues={hideValues}
        onToggleHide={toggleHide}
        onLogout={logout}
        onOpenSettings={() => setSettingsOpen(true)}
        saving={saving}
        savedAt={savedAt}
        dirty={dirty}
        saveError={saveError}
      />

      {!isOnline && (
        <div style={S.offlineBanner}>
          Offline — changes will sync when reconnected
        </div>
      )}

      {error ? <div style={S.errorBar}>{error}</div> : null}

      <main style={S.main}>
        {loading ? (
          <div style={S.center}>Loading…</div>
        ) : tab === "dashboard" ? (
          <Dashboard transactions={transactions} money={money} hideValues={hideValues} />
        ) : tab === "transactions" ? (
          <Transactions
            transactions={transactions}
            money={money}
            hideValues={hideValues}
            isWide={isWide}
            onDelete={deleteTransaction}
            onUpdate={updateTransaction}
            onDeleteSelected={deleteSelected}
            onUpdateMany={updateMany}
          />
        ) : tab === "import" ? (
          <ImportTransactions onImport={addTransactions} accountMap={accountMap} config={config} transactions={transactions} />
        ) : tab === "audit" ? (
          <AuditTab
            transactions={transactions}
            accountMap={accountMap}
            accountAliases={accountAliases}
            onSaveAccountAliases={saveAccountAliasesAndApply}
            ckCategoryMap={ckCategoryMap}
            onSaveCkCategoryMap={saveCkCategoryMap}
            config={config}
          />
        ) : (
          <Charts transactions={transactions} hideValues={hideValues} config={config} />
        )}
      </main>

      <TabBar tab={tab} setTab={setTab} wide={isWide} />

      {settingsOpen ? (
        <SettingsModal
          config={config}
          transactions={transactions}
          accountMap={accountMap}
          onSaveAccountMap={saveAndApplyAccountMap}
          onClose={() => setSettingsOpen(false)}
          onAddAccount={addAccount}
          onRenameAccount={renameAccount}
          onDeleteAccount={deleteAccount}
          onAddCategory={addCategory}
          onRenameCategory={renameCategory}
          onDeleteCategory={deleteCategory}
          onReorderAccounts={reorderAccounts}
          onReorderCategories={reorderCategories}
        />
      ) : null}
    </div>
  );
}

// ===========================================================================
// Login
// ===========================================================================

function Login({ onAuthed }) {
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const clientId = getMeta("google-client-id");
  const gBtn = useRef(null);

  // Google Identity Services (optional — only if a client id is configured).
  useEffect(() => {
    if (!clientId) return;
    const handle = (resp) => {
      window.__householdGoogleToken = resp.credential;
      onAuthed();
    };
    const init = () => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handle,
      });
      if (gBtn.current) {
        window.google.accounts.id.renderButton(gBtn.current, {
          theme: "filled_black",
          size: "large",
          width: 260,
        });
      }
    };
    const existing = document.getElementById("gsi-script");
    if (existing) {
      init();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.id = "gsi-script";
    s.onload = init;
    document.body.appendChild(s);
  }, [clientId, onAuthed]);

  const submit = async (e) => {
    e.preventDefault();
    if (!pwd.trim()) return;
    setBusy(true);
    setErr("");
    try {
      // Validate the password by attempting a load.
      const res = await fetch("/api/transactions", {
        method: "GET",
        headers: { "Content-Type": "application/json", "x-app-password": pwd.trim() },
      });
      if (res.ok) {
        localStorage.setItem("household_pwd", pwd.trim());
        onAuthed();
      } else if (res.status === 401 || res.status === 403) {
        setErr("Invalid password.");
      } else {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || `Error ${res.status}`);
      }
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...S.app, justifyContent: "center" }}>
      <div style={S.loginCard}>
        <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Household Ledger</h1>
        <p style={{ margin: "0 0 20px", color: "#8b94a3", fontSize: 14 }}>
          Sign in to continue
        </p>

        {clientId ? <div ref={gBtn} style={{ marginBottom: 16 }} /> : null}

        <form onSubmit={submit}>
          <input
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="App password"
            style={S.input}
            autoComplete="current-password"
          />
          {err ? <div style={{ color: "#f87171", fontSize: 13, marginTop: 8 }}>{err}</div> : null}
          <button type="submit" disabled={busy} style={{ ...S.primaryBtn, marginTop: 14 }}>
            {busy ? "Checking…" : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ===========================================================================
// Header + TabBar
// ===========================================================================

function SaveIndicator({ saving, dirty, savedAt, saveError }) {
  if (saveError === "offline") {
    return (
      <span style={{ fontSize: 10, color: "#fbbf24", display: "flex", alignItems: "center", gap: 3 }}>
        <span>↻</span>
        <span>Offline</span>
      </span>
    );
  }
  if (saveError) {
    return (
      <span style={{ fontSize: 10, color: "#f87171", display: "flex", alignItems: "center", gap: 3 }}>
        <span>✕</span>
        <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Save failed
        </span>
      </span>
    );
  }
  if (saving) {
    return (
      <span style={{ fontSize: 10, color: "#8b94a3", display: "flex", alignItems: "center", gap: 3 }}>
        <span style={{ display: "inline-block", animation: "hl-spin 1s linear infinite" }}>·</span>
        <span>saving…</span>
      </span>
    );
  }
  if (dirty && !saving) {
    return (
      <span style={{ fontSize: 10, color: "#fbbf24", display: "flex", alignItems: "center", gap: 3 }}>
        <span>●</span>
        <span>unsaved…</span>
      </span>
    );
  }
  if (savedAt && !dirty && !saving && !saveError) {
    const timeStr = new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return (
      <span style={{ fontSize: 10, color: "#34d399", display: "flex", alignItems: "center", gap: 3 }}>
        <span>✓</span>
        <span>saved {timeStr}</span>
      </span>
    );
  }
  return null;
}

function Header({ hideValues, onToggleHide, onLogout, onOpenSettings, saving, savedAt, dirty, saveError }) {
  return (
    <header style={S.header}>
      <style>{`@keyframes hl-spin { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "linear-gradient(135deg, #0A84FF 0%, #0055cc 100%)",
            display: "grid", placeItems: "center", flexShrink: 0,
            boxShadow: "0 2px 8px rgba(10,132,255,0.35)",
          }}>
            <LayoutDashboard size={14} color="#fff" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.5, color: "#e5e7eb" }}>Household</span>
          <span style={{ fontSize: 10, color: "#6b7280", marginLeft: 4, letterSpacing: 0 }}>v1.11.0</span>
        </div>
        <SaveIndicator saving={saving} dirty={dirty} savedAt={savedAt} saveError={saveError} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <IconButton onClick={onToggleHide} title={hideValues ? "Show values" : "Hide values"}>
          {hideValues ? <EyeOff size={16} /> : <Eye size={16} />}
        </IconButton>
        <IconButton onClick={onOpenSettings} title="Manage accounts & categories">
          <Settings size={16} />
        </IconButton>
        <IconButton onClick={onLogout} title="Log out">
          <LogOut size={16} />
        </IconButton>
      </div>
    </header>
  );
}

function IconButton({ children, ...props }) {
  return (
    <button
      {...props}
      style={{
        background: "transparent",
        border: "none",
        color: "#cbd5e1",
        padding: 6,
        borderRadius: 8,
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </button>
  );
}

const TABS = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "analyze", label: "Analyze", Icon: TrendingUp },
  { id: "transactions", label: "Txns", Icon: List },
  { id: "import", label: "Import", Icon: Upload },
  { id: "audit", label: "Audit", Icon: ShieldCheck },
];

function TabBar({ tab, setTab, wide }) {
  return (
    <nav style={{ ...S.tabBar, maxWidth: wide ? 1180 : 560 }}>
      {TABS.map(({ id, label, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-label={label}
            title={label}
            style={{ ...S.tabBtn, color: active ? "#0A84FF" : "#8b94a3", position: "relative" }}
          >
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "3px 14px" }}>
              {active && (
                <div style={{
                  position: "absolute", inset: 0, background: "rgba(10,132,255,0.14)",
                  borderRadius: 9, pointerEvents: "none",
                }} />
              )}
              <Icon size={20} />
            </div>
            <span style={{ fontSize: 10, marginTop: 2, fontWeight: active ? 600 : 500 }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ===========================================================================
// Totals helper
// ===========================================================================

function computeTotals(rows) {
  let income = 0;
  let expenses = 0;
  for (const t of rows) {
    if (isTransfer(t.category)) continue; // Transfer excluded from all totals
    const amt = Number(t.amount) || 0; // signed: negatives are refunds/clawbacks
    if (isIncome(t.category)) income += amt;
    else expenses += amt;
  }
  return { income, expenses, net: income + expenses };
}

// ===========================================================================
// Period filter (month / year)
// ===========================================================================

const MONTHS = [
  { v: "01", l: "Jan" },
  { v: "02", l: "Feb" },
  { v: "03", l: "Mar" },
  { v: "04", l: "Apr" },
  { v: "05", l: "May" },
  { v: "06", l: "Jun" },
  { v: "07", l: "Jul" },
  { v: "08", l: "Aug" },
  { v: "09", l: "Sep" },
  { v: "10", l: "Oct" },
  { v: "11", l: "Nov" },
  { v: "12", l: "Dec" },
];

// Distinct years present in the data, newest first.
function availableYears(rows) {
  const years = new Set();
  for (const t of rows) {
    const y = (t.date || "").slice(0, 4);
    if (y) years.add(y);
  }
  return [...years].sort((a, b) => (a < b ? 1 : -1));
}

// year/month are "All" or "YYYY"/"MM".
function matchPeriod(dateStr, year, month) {
  if (year === "All" && month === "All") return true;
  const y = (dateStr || "").slice(0, 4);
  const m = (dateStr || "").slice(5, 7);
  if (year !== "All" && y !== year) return false;
  if (month !== "All" && m !== month) return false;
  return true;
}

function periodLabel(year, month) {
  const m = MONTHS.find((x) => x.v === month);
  if (year === "All" && month === "All") return "All Time";
  if (year === "All") return m ? m.l : "All Time";
  if (month === "All") return year;
  return m ? `${m.l} ${year}` : year;
}

function PeriodFilter({ year, month, setYear, setMonth, years }) {
  // Always include the currently-selected year so the control stays valid even
  // if the only matching transaction was just filtered/edited away.
  const yearOpts =
    year !== "All" && !years.includes(year) ? [year, ...years] : years;
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select value={year} onChange={(e) => setYear(e.target.value)} style={S.select}>
        <option value="All">All years</option>
        {yearOpts.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select value={month} onChange={(e) => setMonth(e.target.value)} style={S.select}>
        <option value="All">All months</option>
        {MONTHS.map((m) => (
          <option key={m.v} value={m.v}>
            {m.l}
          </option>
        ))}
      </select>
    </div>
  );
}

// ===========================================================================
// Dashboard
// ===========================================================================

function Dashboard({ transactions, money, hideValues }) {
  // Default the period to the current month.
  const [year, setYear] = useState(() => todayISO().slice(0, 4));
  const [month, setMonth] = useState(() => todayISO().slice(5, 7));
  const [catFilter, setCatFilter] = useState("All");

  const all = useMemo(() => computeTotals(
    catFilter === "All" ? transactions : transactions.filter((t) => t.category === catFilter)
  ), [transactions, catFilter]);
  const years = useMemo(() => availableYears(transactions), [transactions]);
  // No-cents money for the tight 3-up stat card row.
  const moneyShort = (n) => (hideValues ? "•••••" : usd0.format(n || 0));

  const availableCats = useMemo(() => {
    const cats = new Set();
    for (const t of transactions) {
      if (!isTransfer(t.category) && !isIncome(t.category)) cats.add(t.category);
    }
    return [...cats].sort();
  }, [transactions]);

  const periodTxns = useMemo(
    () => transactions.filter((t) =>
      matchPeriod(t.date, year, month) &&
      (catFilter === "All" || t.category === catFilter)
    ),
    [transactions, year, month, catFilter]
  );
  const period = useMemo(() => computeTotals(periodTxns), [periodTxns]);

  const periodNetColor = period.net >= 0 ? "#34d399" : "#f87171";
  const label = periodLabel(year, month);

  // ---- Category breakdown for the selected period -------------------------
  // Determine same-day cutoff: if selected month == current month, use today;
  // otherwise use the last day of the selected month (full month).
  const cutoffDay = useMemo(() => {
    const today = todayISO();
    const currentYear = today.slice(0, 4);
    const currentMonth = today.slice(5, 7);
    const isCurrentMonth = year !== "All" && month !== "All" && year === currentYear && month === currentMonth;
    if (isCurrentMonth) {
      return today.slice(8, 10); // DD of today
    }
    if (year !== "All" && month !== "All") {
      // last day of selected month
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      return String(lastDay).padStart(2, "0");
    }
    return null; // "All" period — no cutoff
  }, [year, month]);

  // M/M and Y/Y totals for the hero card (full months, no cutoff).
  const heroComparisons = useMemo(() => {
    if (year === "All" || month === "All") return null;
    const prevMonthYear = month === "01" ? String(Number(year) - 1) : year;
    const prevMonthVal = month === "01" ? "12" : String(Number(month) - 1).padStart(2, "0");
    const prevYear = String(Number(year) - 1);
    const mmTxns = transactions.filter((t) => matchPeriod(t.date, prevMonthYear, prevMonthVal) && (catFilter === "All" || t.category === catFilter));
    const yyTxns = transactions.filter((t) => matchPeriod(t.date, prevYear, month) && (catFilter === "All" || t.category === catFilter));
    const mm = computeTotals(mmTxns);
    const yy = computeTotals(yyTxns);
    const pct = (cur, base) => base === 0 ? null : ((cur - base) / Math.abs(base)) * 100;
    // Expenses are negative — compare magnitudes so +% means more spending.
    const pctExp = (cur, base) => base === 0 ? null : ((-cur - (-base)) / Math.abs(base)) * 100;
    return {
      mm, yy,
      mmPctExp: pctExp(period.expenses, mm.expenses),
      yyPctExp: pctExp(period.expenses, yy.expenses),
      mmPctInc: pct(period.income, mm.income),
      yyPctInc: pct(period.income, yy.income),
    };
  }, [transactions, year, month, period, catFilter]);

  // Expenses by category for the selected period (up to cutoff day).
  const catExpenses = useMemo(() => {
    const map = new Map();
    for (const t of periodTxns) {
      if (isTransfer(t.category) || isIncome(t.category)) continue;
      // Apply same-day cutoff when relevant.
      if (cutoffDay !== null) {
        const day = (t.date || "").slice(8, 10);
        if (day > cutoffDay) continue;
      }
      const amt = Number(t.amount) || 0;
      map.set(t.category, (map.get(t.category) || 0) + amt);
    }
    // Net signed sum; skip zero; sort ascending (most negative first).
    return [...map.entries()]
      .filter(([, v]) => v !== 0)
      .sort((a, b) => a[1] - b[1]);
  }, [periodTxns, cutoffDay]);

  // Compute M/M and Y/Y pct change for each expense category.
  // base: month prior (M/M) or same month last year (Y/Y), limited to same day.
  const catChanges = useMemo(() => {
    if (year === "All" || month === "All" || cutoffDay === null) return {};

    const prevMonthYear = month === "01" ? String(Number(year) - 1) : year;
    const prevMonthVal = month === "01" ? "12" : String(Number(month) - 1).padStart(2, "0");
    const prevYear = String(Number(year) - 1);

    // Build lookup: category → sum for a given YYYY-MM window up to cutoffDay.
    const sumCat = (targetYear, targetMonth) => {
      const map = new Map();
      for (const t of transactions) {
        if (isTransfer(t.category) || isIncome(t.category)) continue;
        if (catFilter !== "All" && t.category !== catFilter) continue;
        const d = t.date || "";
        if (d.slice(0, 4) !== targetYear || d.slice(5, 7) !== targetMonth) continue;
        const day = d.slice(8, 10);
        if (day > cutoffDay) continue;
        const amt = Number(t.amount) || 0;
        map.set(t.category, (map.get(t.category) || 0) + amt);
      }
      return map;
    };

    // Average of last 12 full months (excluding current month) per category.
    const avg12mMap = (() => {
      // Build list of the 12 YYYY-MM keys prior to the current month.
      const months12 = [];
      let y = Number(year), m = Number(month);
      for (let i = 0; i < 12; i++) {
        m -= 1;
        if (m === 0) { m = 12; y -= 1; }
        months12.push(`${y}-${String(m).padStart(2, "0")}`);
      }
      const sums = new Map();
      const counts = new Map();
      for (const t of transactions) {
        if (isTransfer(t.category) || isIncome(t.category)) continue;
        if (catFilter !== "All" && t.category !== catFilter) continue;
        const d = (t.date || "").slice(0, 7);
        if (!months12.includes(d)) continue;
        const amt = Number(t.amount) || 0;
        sums.set(t.category, (sums.get(t.category) || 0) + amt);
        counts.set(t.category, (counts.get(t.category) || new Set()).add(d));
      }
      const avg = new Map();
      for (const [cat, total] of sums) {
        avg.set(cat, total / counts.get(cat).size);
      }
      return avg;
    })();

    const mmMap = sumCat(prevMonthYear, prevMonthVal);
    const yyMap = sumCat(prevYear, month);

    const result = {};
    for (const [cat, current] of catExpenses) {
      const mmBase = mmMap.get(cat) || 0;
      const yyBase = yyMap.get(cat) || 0;
      result[cat] = {
        mm: mmBase >= 0 ? null : ((-current - (-mmBase)) / (-mmBase)) * 100,
        yy: yyBase >= 0 ? null : ((-current - (-yyBase)) / (-yyBase)) * 100,
        avg12m: avg12mMap.get(cat) ?? null,
      };
    }
    return result;
  }, [catExpenses, transactions, year, month, cutoffDay, catFilter]);

  // Daily pace for Dashboard: driven by the selected month vs the one before.
  const dashboardPaceData = useMemo(() => {
    if (year === "All" || month === "All") return null;
    const curMonthKey = `${year}-${month}`;
    const today = todayISO();
    const todayMonth = today.slice(0, 7);
    const todayDay = parseInt(today.slice(8, 10), 10);
    const cy = Number(year);
    const cm = Number(month);
    const prevDate = new Date(cy, cm - 2, 1);
    const prevMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const buildByDay = (monthKey) => {
      const byDay = new Map();
      for (const t of transactions) {
        if (isTransfer(t.category) || isIncome(t.category)) continue;
        if (catFilter !== "All" && t.category !== catFilter) continue;
        if (!t.date || !t.date.startsWith(monthKey)) continue;
        const day = parseInt(t.date.slice(8, 10), 10);
        const signed = Number(t.amount) || 0;
        byDay.set(day, (byDay.get(day) || 0) + (-signed));
      }
      return byDay;
    };
    const curByDay = buildByDay(curMonthKey);
    const prevByDay = buildByDay(prevMonthKey);
    const daysInPrev = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate();
    const daysInCur = new Date(cy, cm, 0).getDate();
    const curMaxDay = curMonthKey === todayMonth ? todayDay : daysInCur;
    const maxDay = Math.max(daysInPrev, daysInCur);
    const data = [];
    let curRunning = 0;
    let prevRunning = 0;
    for (let d = 1; d <= maxDay; d++) {
      if (d <= curMaxDay) curRunning += curByDay.get(d) || 0;
      if (d <= daysInPrev) prevRunning += prevByDay.get(d) || 0;
      data.push({
        day: d,
        current: d <= curMaxDay ? curRunning : null,
        previous: d <= daysInPrev ? prevRunning : null,
      });
    }
    const monthLabel = (key) => {
      const [y, m] = key.split("-").map(Number);
      return new Date(y, m - 1, 1).toLocaleString("default", { month: "short" }) + "/" + String(y).slice(2);
    };
    return {
      data,
      curLabel: monthLabel(curMonthKey),
      prevLabel: monthLabel(prevMonthKey),
      todayDay: curMonthKey === todayMonth ? todayDay : null,
    };
  }, [transactions, year, month, catFilter]);

  const fmtK = (v) => {
    if (hideValues) return "";
    return `$${(Math.abs(Number(v) || 0) / 1000).toFixed(1)}K`;
  };

  return (
    <div style={S.col}>
      {/* Hero balance card — shows the SELECTED period */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <PeriodFilter year={year} month={month} setYear={setYear} setMonth={setMonth} years={years} />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={S.select}>
          <option value="All">All categories</option>
          {availableCats.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div style={{
        background: "linear-gradient(145deg, #161a20 0%, #1b2236 100%)",
        border: "1px solid #1e2530",
        borderRadius: 20,
        padding: "22px 20px 20px",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      }}>
        <div style={{
          position: "absolute", top: -40, right: -40, width: 120, height: 120,
          background: period.net >= 0 ? "rgba(52,211,153,0.13)" : "rgba(248,113,113,0.13)",
          borderRadius: "50%", filter: "blur(28px)", pointerEvents: "none",
        }} />
        <div style={{ fontSize: 10, color: "#8b94a3", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>
          {label}
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.5, color: periodNetColor, lineHeight: 1.1, marginBottom: 20 }}>
          {money(period.net)}
        </div>
        <div style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
          {[
            { lbl: "Income", val: period.income, color: "#34d399", mmVal: heroComparisons?.mm.income, yyVal: heroComparisons?.yy.income, mmPct: heroComparisons?.mmPctInc, yyPct: heroComparisons?.yyPctInc, incomeField: true },
            { lbl: "Expenses", val: period.expenses, color: "#f87171", mmVal: heroComparisons?.mm.expenses, yyVal: heroComparisons?.yy.expenses, mmPct: heroComparisons?.mmPctExp, yyPct: heroComparisons?.yyPctExp, incomeField: false },
          ].map(({ lbl, val, color, mmVal, yyVal, mmPct, yyPct, incomeField }, i) => {
            const fmtPct = (p) => p == null ? null : `${p > 0 ? "+" : ""}${p.toFixed(0)}%`;
            // For expenses: higher = worse (red); for income: higher = better (green)
            const pctColor = (p) => p == null ? "#6b7280" : (p > 0) === incomeField ? "#34d399" : "#f87171";
            return (
              <React.Fragment key={lbl}>
                {i === 1 && <div style={{ width: 1, background: "rgba(255,255,255,0.06)", margin: "0 16px" }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: "#8b94a3", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{lbl}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color, marginTop: 3 }}>{money(val)}</div>
                  {heroComparisons && (
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                      {[["LM", mmVal, mmPct], ["LY", yyVal, yyPct]].map(([tag, refVal, p]) => (
                        <div key={tag} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 9, color: "#6b7280", fontWeight: 600, minWidth: 14 }}>{tag}</span>
                          <span style={{ fontSize: 10, color: "#6b7280" }}>{hideValues ? "•••••" : usd0.format(refVal || 0)}</span>
                          {fmtPct(p) && <span style={{ fontSize: 10, fontWeight: 700, color: pctColor(p) }}>{hideValues ? "•••" : fmtPct(p)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <DailyPaceCard paceData={dashboardPaceData} hideValues={hideValues} fmtK={fmtK} />

      {/* Category breakdown for the selected period */}
      {year !== "All" && month !== "All" && (
        <>
          <h3 style={S.sectionTitle}>{label} — by Category</h3>
          {catExpenses.length === 0 ? (
            <Empty>No expenses in this period.</Empty>
          ) : (
            <div style={{ ...S.card, padding: "8px 0" }}>
              {catExpenses.map(([cat, total], idx) => {
                const dotColor = catDotColor(cat);
                const changes = catChanges[cat] || { mm: null, yy: null };
                return (
                  <div key={cat} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 16px",
                    borderBottom: idx < catExpenses.length - 1 ? "1px solid #1a1f26" : "none",
                  }}>
                    {/* Category avatar */}
                    <div style={{
                      width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                      background: `${dotColor}1a`,
                      border: `1px solid ${dotColor}35`,
                      display: "grid", placeItems: "center",
                      fontSize: 18, lineHeight: 1,
                    }}>
                      {catEmoji(cat)}
                    </div>
                    {/* Name + badges */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: "#e5e7eb", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cat}
                      </div>
                      <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
                        <ChangeBadge label="M/M" pct={changes.mm} hideValues={hideValues} />
                        <ChangeBadge label="Y/Y" pct={changes.yy} hideValues={hideValues} />
                      </div>
                    </div>
                    {/* Amount + reference totals */}
                    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: total < 0 ? "#f87171" : "#34d399" }}>
                        {moneyShort(total)}
                      </div>
                      {changes.avg12m != null && (
                        <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2, textAlign: "right" }}>
                          avg 12m {moneyShort(changes.avg12m)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* All Time chips — moved to end of page */}
      <h3 style={S.sectionTitle}>All Time</h3>
      <div style={S.cardRow}>
        <StatCard label="Income" value={moneyShort(all.income)} accent="#34d399" small />
        <StatCard label="Expenses" value={moneyShort(all.expenses)} accent="#f87171" small />
        <StatCard label="Net" value={moneyShort(all.net)} accent={all.net >= 0 ? "#34d399" : "#f87171"} small />
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, small }) {
  return (
    <div style={{ ...S.card, flex: 1, minWidth: 0, padding: 12, borderLeft: `3px solid ${accent || "#0A84FF"}`, paddingLeft: 12 }}>
      <div style={{ color: "#8b94a3", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ color: accent || "#e5e7eb", fontWeight: 700, fontSize: small ? 16 : 26, marginTop: 3, letterSpacing: -0.5, whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}

// Inline badge showing M/M or Y/Y percentage change for an expense category.
// For expenses: a rise in spending is bad (red), a drop is good (green).
// pct = null means no comparison data; pct = 0 is a real 0 % change.
function ChangeBadge({ label, pct, hideValues }) {
  if (hideValues) return null;
  const noData = pct === null || pct === undefined;
  const color = noData
    ? "#8b94a3"
    : pct > 0
    ? "#f87171"   // more spending → red (worse)
    : pct < 0
    ? "#34d399"   // less spending → green (better)
    : "#8b94a3";  // unchanged → muted
  const bg = noData
    ? "rgba(139,148,163,0.1)"
    : pct > 0
    ? "rgba(248,113,113,0.1)"
    : pct < 0
    ? "rgba(52,211,153,0.1)"
    : "rgba(139,148,163,0.1)";
  const text = noData ? `${label} —` : `${label} ${pct > 0 ? "+" : ""}${Math.round(pct)}%`;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      background: bg,
      color,
      borderRadius: 6,
      padding: "2px 6px",
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: 0.2,
      whiteSpace: "nowrap",
    }}>
      {text}
    </span>
  );
}

// ===========================================================================
// MonthlyBarCard — Income or Expense bars per bucket, with toggle
// ===========================================================================

function MonthlyBarCard({ byBucket, hideValues, fmtK, fmtKTooltip, fmtBucketLabel }) {
  const [view, setView] = useState("expense");

  const isInc = view === "income";
  const dataKey = isInc ? "income" : "expenses";
  const barColor = isInc ? "#06B6D4" : "#F97316";
  const cardTitle = isInc ? "Income" : "Expense";

  return (
    <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 0" }}>
        <h3 style={{ ...S.sectionTitle, margin: 0 }}>{cardTitle}</h3>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setView("expense")}
            style={S.togglePill(view === "expense")}
          >
            Expense
          </button>
          <button
            onClick={() => setView("income")}
            style={S.togglePill(view === "income")}
          >
            Income
          </button>
        </div>
      </div>
      <div style={{ height: 260 }}>
        {byBucket.length === 0 ? (
          <Empty>No data to chart yet.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byBucket} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="bucket" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtBucketLabel} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtK} width={56} />
              {!hideValues && (
                <Tooltip
                  cursor={false}
                  formatter={(v) => (fmtKTooltip || fmtK)(v)}
                  labelFormatter={(v) => fmtBucketLabel(v)}
                  contentStyle={{ background: "#161a20", border: "1px solid #1e2530", borderRadius: 10, fontSize: 12 }}
                  itemStyle={{ color: "#e5e7eb" }}
                  labelStyle={{ color: "#8b94a3" }}
                />
              )}
              <Bar dataKey={dataKey} name={isInc ? "Income" : "Expenses"} fill={barColor} radius={[4, 4, 0, 0]} activeBar={{ fill: barColor, opacity: 0.75 }}>
                <LabelList
                  dataKey={dataKey}
                  position="top"
                  content={({ x, y, width, value }) =>
                    hideValues || !value ? null : (
                      <text x={x + width / 2} y={y - 4} textAnchor="middle" fill="#6b7280" fontSize={10}>
                        {fmtK(value)}
                      </text>
                    )
                  }
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bucket helpers for Charts granularity
// ---------------------------------------------------------------------------

// Returns the bucket key for a date string given a granularity mode.
// M   → "YYYY-MM"
// Q   → "YYYY-Q1" .. "YYYY-Q4"
// H   → "YYYY-H1" / "YYYY-H2"
// Y   → "YYYY"
function bucketKey(dateStr, granularity) {
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
// "2026-01"   → "Jan/26"
// "2026-Q1"   → "Q1/26"
// "2026-H2"   → "H2/26"
// "2026"      → "2026"
function bucketLabel(key) {
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

// ===========================================================================
// DailyPaceCard — cumulative daily spending: this month vs previous month
// ===========================================================================

function DailyPaceCard({ paceData, hideValues, fmtK }) {
  if (!paceData || paceData.data.length === 0) return null;
  const { data, curLabel, prevLabel, todayDay } = paceData;

  return (
    <>
      <h3 style={S.sectionTitle}>Daily Spending Pace</h3>
      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        {/* Minimal inline legend — colored line swatches, no heavy recharts Legend */}
        <div style={{ display: "flex", gap: 14, padding: "12px 16px 0", justifyContent: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#8b94a3" }}>
            <span style={{ display: "inline-block", width: 14, height: 2, background: "#F97316", borderRadius: 1 }} />
            {curLabel}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#6b7280" }}>
            <span style={{ display: "inline-block", width: 14, borderTop: "1.5px dashed #6b7280" }} />
            {prevLabel}
          </span>
        </div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="curGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F97316" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#F97316" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="prevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6b7280" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="#6b7280" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="day"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                ticks={[1, data[data.length - 1]?.day ?? 1]}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={fmtK}
                width={46}
              />
              {!hideValues && (
                <Tooltip
                  cursor={false}
                  formatter={(v, name) => [fmtK(v), name]}
                  labelFormatter={(d) => `Day ${d}`}
                  contentStyle={{ background: "#161a20", border: "1px solid #1e2530", borderRadius: 10, fontSize: 12 }}
                  itemStyle={{ color: "#e5e7eb" }}
                  labelStyle={{ color: "#8b94a3" }}
                />
              )}
              {todayDay != null && (
                <ReferenceLine
                  x={todayDay}
                  stroke="rgba(255,255,255,0.18)"
                  strokeDasharray="3 3"
                  label={{ value: "Today", fill: "#6b7280", fontSize: 9, position: "insideTopRight" }}
                />
              )}
              <Area
                type="monotone"
                dataKey="previous"
                name={prevLabel}
                stroke="#6b7280"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                fill="url(#prevGrad)"
                dot={false}
                connectNulls={false}
              />
              <Area
                type="monotone"
                dataKey="current"
                name={curLabel}
                stroke="#F97316"
                strokeWidth={2}
                fill="url(#curGrad)"
                dot={false}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

// ===========================================================================
// CategoryStackedBarCard — stacked bar chart of expenses by category
// ===========================================================================

function CategoryStackedBarCard({ scoped, granularity, hideValues, fmtK, fmtKFull }) {
  const [mode, setMode] = useState("expense");

  const { rows, cats } = useMemo(() => {
    const map = new Map();
    const catTotals = {};

    for (const t of scoped) {
      if (mode === "expense") {
        if (isTransfer(t.category) || isIncome(t.category)) continue;
      } else {
        if (isTransfer(t.category) || !isIncome(t.category)) continue;
      }
      const bk = bucketKey(t.date, granularity);
      if (!bk) continue;
      if (!map.has(bk)) map.set(bk, { bucket: bk });
      const entry = map.get(bk);
      const val = Number(t.amount) || 0; // signed: refunds/clawbacks net out
      entry[t.category] = (entry[t.category] || 0) + val;
      catTotals[t.category] = (catTotals[t.category] || 0) + val;
    }

    // Apply Math.abs per category after netting, then recalculate _total from those abs values.
    const rows = [...map.values()]
      .map(({ bucket, ...cats }) => {
        const newRow = { bucket };
        let total = 0;
        for (const [cat, v] of Object.entries(cats)) {
          const absV = Math.abs(v);
          newRow[cat] = absV;
          total += absV;
        }
        newRow._total = total;
        return newRow;
      })
      .sort((a, b) => a.bucket.localeCompare(b.bucket));

    // Sort by thematic group order; unlisted categories go to the end alphabetically
    const cats = Object.keys(catTotals).sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return { rows, cats };
  }, [scoped, granularity, mode]);

  if (rows.length === 0) return null;

  return (
    <div style={{ ...S.card, padding: 0, overflow: "visible" }}>
      {/* Header — title + mode toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 0" }}>
        <h3 style={{ ...S.sectionTitle, margin: 0 }}>By Category</h3>
        <div style={{ display: "flex", gap: 4 }}>
          {["expense", "income"].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={S.togglePill(mode === m)}
            >
              {m === "income" ? "Income" : "Expense"}
            </button>
          ))}
        </div>
      </div>
      {/* Chart */}
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="bucket"
              tickFormatter={bk => bucketLabel(bk)}
              tick={{ fill: "#6b7280", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={hideValues ? () => "" : fmtK}
              tick={{ fill: "#6b7280", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            {!hideValues && (
              <Tooltip
                formatter={(val, name) => [fmtKFull(val), name]}
                labelFormatter={(bk) => bucketLabel(bk)}
                contentStyle={{ background: "#1e2329", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12 }}
                itemStyle={{ color: "#e5e7eb" }}
                labelStyle={{ color: "#8b94a3" }}
                cursor={false}
              />
            )}
            {cats.map((cat, i) => (
              <Bar
                key={cat}
                dataKey={cat}
                name={cat}
                stackId="cat"
                fill={CATEGORY_COLOR_MAP[cat] || catDotColor(cat)}
                radius={i === cats.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                activeBar={{ opacity: 0.8 }}
              >
                {i === cats.length - 1 && (
                  <LabelList
                    dataKey="_total"
                    position="top"
                    content={({ x, y, width, value }) =>
                      hideValues || !value ? null : (
                        <text
                          x={x + width / 2}
                          y={y - 4}
                          textAnchor="middle"
                          fill="#6b7280"
                          fontSize={10}
                        >
                          {fmtK(value)}
                        </text>
                      )
                    }
                  />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Legend — below chart, only categories present in the current period */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", padding: "8px 16px 14px", justifyContent: "center" }}>
        {cats.map(cat => (
          <span key={cat} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#6b7280" }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: CATEGORY_COLOR_MAP[cat] || catDotColor(cat) }} />
            {cat}
          </span>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// Charts
// ===========================================================================

// Granularity options for the segmented control
const GRANULARITIES = [
  { v: "M", l: "M" },
  { v: "Q", l: "Q" },
  { v: "H", l: "H" },
  { v: "Y", l: "Y" },
];

function Charts({ transactions, hideValues, config }) {
  const years = useMemo(() => availableYears(transactions), [transactions]);

  // Year-range filter: default to the most recent year of data on open.
  const minYear = useMemo(() => (years.length ? years[years.length - 1] : ""), [years]);
  const maxYear = useMemo(() => (years.length ? years[0] : ""), [years]);

  const [fromYear, setFromYear] = useState(() => "");
  const [toYear, setToYear] = useState(() => "");

  // Once data arrives (years change), seed the defaults if not yet set.
  // Both From and To default to the most recent year so the app opens on it.
  const fromYearEff = fromYear || maxYear;
  const toYearEff = toYear || maxYear;

  const [granularity, setGranularity] = useState("M");

  // Category filter: multi-select across expense + income categories (Transfer
  // is never a selectable option — it's always excluded from charts). Empty
  // array = no filter applied (all categories), matching prior behavior.
  const [categoryFilter, setCategoryFilter] = useState([]);
  const categoryOptions = useMemo(() => [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES], [config]);

  // Clamp: ensure from <= to. When the user changes one, adjust the other.
  const handleFromYear = (v) => {
    setFromYear(v);
    if (toYearEff && v > toYearEff) setToYear(v);
  };
  const handleToYear = (v) => {
    setToYear(v);
    if (fromYearEff && v < fromYearEff) setFromYear(v);
  };

  // Filter transactions to the selected year range.
  const scopedByYear = useMemo(() => {
    if (!fromYearEff && !toYearEff) return transactions;
    return transactions.filter((t) => {
      const y = (t.date || "").slice(0, 4);
      if (fromYearEff && y < fromYearEff) return false;
      if (toYearEff && y > toYearEff) return false;
      return true;
    });
  }, [transactions, fromYearEff, toYearEff]);

  // Apply the category filter on top of the year-range scope. Transfer is
  // never in `categoryOptions`, so this can't accidentally re-include it;
  // `isTransfer` exclusion downstream (byBucket, CategoryStackedBarCard)
  // remains independent and intact.
  const scoped = useMemo(() => {
    if (categoryFilter.length === 0) return scopedByYear;
    return scopedByYear.filter((t) => categoryFilter.includes(t.category));
  }, [scopedByYear, categoryFilter]);

  // Aggregate into buckets based on granularity.
  const byBucket = useMemo(() => {
    const map = new Map();
    for (const t of scoped) {
      if (isTransfer(t.category)) continue;
      const bk = bucketKey(t.date, granularity);
      if (!bk) continue;
      const entry = map.get(bk) || { bucket: bk, income: 0, expenses: 0 };
      const amt = Number(t.amount) || 0; // signed: refunds/clawbacks net out
      if (isIncome(t.category)) entry.income += amt;
      else entry.expenses += amt;
      map.set(bk, entry);
    }
    // Apply Math.abs to expenses so bars always show magnitude.
    // (Refunds/clawbacks already netted before abs.)
    const rows = [...map.values()].map((r) => ({ ...r, expenses: Math.abs(r.expenses) }));
    return rows.sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
  }, [scoped, granularity]);

  if (transactions.length === 0) {
    return <Empty>No data to chart yet.</Empty>;
  }

  // fmtK: format value as $X.XXK, respects hideValues.
  const fmtK = (v) => {
    if (hideValues) return "";
    const abs = Math.abs(Number(v) || 0);
    return `$${(abs / 1000).toFixed(1)}K`;
  };

  // Tooltip formatter that also handles the value sign (negative income is ok).
  const fmtKFull = (v) => {
    if (hideValues) return "•••••";
    const n = Number(v) || 0;
    const sign = n < 0 ? "-" : "";
    return `${sign}$${(Math.abs(n) / 1000).toFixed(1)}K`;
  };

  const rangeLabel =
    fromYearEff && toYearEff && fromYearEff !== toYearEff
      ? `${fromYearEff}–${toYearEff}`
      : fromYearEff || toYearEff || "All Time";

  // Year options for the range selectors (oldest first for the from/to order).
  const yearOptsAsc = [...years].sort((a, b) => (a < b ? -1 : 1));

  return (
    <div style={S.col}>
      {/* Header: range label + controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: "4px 0 0", fontSize: 17, color: "#e5e7eb", fontWeight: 700, letterSpacing: -0.3 }}>
          {rangeLabel}
        </h2>
        {/* Granularity segmented control */}
        <div style={{ display: "flex", gap: 2, background: "#0f1216", border: "1px solid #232a33", borderRadius: 10, padding: 3 }}>
          {GRANULARITIES.map(({ v, l }) => (
            <button
              key={v}
              onClick={() => setGranularity(v)}
              style={{
                background: granularity === v ? "#0A84FF" : "transparent",
                border: "none",
                color: granularity === v ? "#fff" : "#8b94a3",
                borderRadius: 7,
                padding: "3px 10px",
                fontSize: 12,
                fontWeight: granularity === v ? 700 : 400,
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Year range selectors */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          value={fromYearEff}
          onChange={(e) => handleFromYear(e.target.value)}
          style={{ ...S.select, flex: 1 }}
        >
          {yearOptsAsc.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <span style={{ color: "#8b94a3", fontSize: 13, flexShrink: 0 }}>to</span>
        <select
          value={toYearEff}
          onChange={(e) => handleToYear(e.target.value)}
          style={{ ...S.select, flex: 1 }}
        >
          {yearOptsAsc.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Category filter: multi-select chip, applies to all 3 charts below.
          Empty selection = all categories (no filter). Transfer is excluded
          from `categoryOptions`, so it can never be selected here. */}
      <div style={{ display: "flex" }}>
        <HeaderFilter
          label="Category"
          value={categoryFilter}
          options={categoryOptions}
          onChange={setCategoryFilter}
          chip
        />
      </div>

      {scoped.length === 0 ? <Empty>No data for {rangeLabel}.</Empty> : null}

      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 0" }}>
          <h3 style={{ ...S.sectionTitle, margin: 0 }}>Income vs Expenses</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#6b7280" }}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#06B6D4" }} />
              Income
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#6b7280" }}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#F97316" }} />
              Expenses
            </span>
          </div>
        </div>
        <div style={{ height: 280 }}>
          {byBucket.length === 0 ? (
            <Empty>No data to chart yet.</Empty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byBucket} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="bucket" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={bucketLabel} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtK} width={56} />
                {!hideValues && (
                  <Tooltip
                    cursor={false}
                    formatter={(v) => fmtKFull(v)}
                    labelFormatter={(v) => bucketLabel(v)}
                    contentStyle={{ background: "#161a20", border: "1px solid #1e2530", borderRadius: 10, fontSize: 12 }}
                    itemStyle={{ color: "#e5e7eb" }}
                    labelStyle={{ color: "#8b94a3" }}
                  />
                )}
                <Bar dataKey="income" name="Income" fill="#06B6D4" radius={[4, 4, 0, 0]} activeBar={{ fill: "#06B6D4", opacity: 0.75 }} />
                <Bar dataKey="expenses" name="Expenses" fill="#F97316" radius={[4, 4, 0, 0]} activeBar={{ fill: "#F97316", opacity: 0.75 }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <MonthlyBarCard
        byBucket={byBucket}
        hideValues={hideValues}
        fmtK={fmtK}
        fmtKTooltip={fmtKFull}
        fmtBucketLabel={bucketLabel}
      />

      <CategoryStackedBarCard
        scoped={scoped}
        granularity={granularity}
        hideValues={hideValues}
        fmtK={fmtK}
        fmtKFull={fmtKFull}
      />
    </div>
  );
}

const CAT_EMOJI = {
  "Car": "🚗", "Dog": "🐕", "Entertainment": "🎬", "Fuel": "⛽",
  "Groceries": "🛒", "Home": "🏠", "Medical": "💊", "Mobile Phone": "📱",
  "Mortgage": "🏡", "Other": "📦", "Restaurant": "🍽️", "Services": "🔧",
  "Shopping": "🛍️", "Transport": "🚌", "Travel": "✈️", "Utilities": "💡",
  "Salary": "💰", "Bonus": "🎁", "Bela Income": "💵", "Other Income": "💵",
};
function catEmoji(cat) { return CAT_EMOJI[cat] ?? cat?.[0] ?? "?"; }

// Maps category name → a stable color from CATEGORY_COLORS palette
function catDotColor(cat) {
  if (!cat) return "#8b94a3";
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) & 0xffff;
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length];
}

// ===========================================================================
// Transactions list
// ===========================================================================

function Transactions({ transactions, money, hideValues, isWide, onDelete, onUpdate, onDeleteSelected, onUpdateMany }) {
  const [catFilter, setCatFilter] = useState([]);
  const [acctFilter, setAcctFilter] = useState([]);
  const [typeFilter, setTypeFilter] = useState([]);
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("All");
  const [month, setMonth] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState(null);

  // Bulk-select state. Rows are always selectable via their checkbox on both
  // platforms; the bulk-edit bar appears once anything is selected.
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bulkCat, setBulkCat] = useState("");
  const [bulkAcct, setBulkAcct] = useState("");
  // Date column-header / chip filter: multi-select years and/or months.
  // From/To (day-level) stay above the table for both platforms.
  const [dateYears, setDateYears] = useState([]);
  const [dateMonths, setDateMonths] = useState([]);

  // Lazy-loading state: how many filtered rows are currently rendered.
  const [visibleCount, setVisibleCount] = useState(75);
  const sentinelRef = useRef(null);

  const years = useMemo(() => availableYears(transactions), [transactions]);

  // Distinct values present in the data — drive the column-header filters.
  const acctOptions = useMemo(
    () => [...new Set(transactions.map((t) => t.account || "Unassigned"))].sort(),
    [transactions]
  );
  const catOptions = useMemo(
    () => [...new Set(transactions.map((t) => t.category).filter(Boolean))].sort(),
    [transactions]
  );

  const exportRows = (filteredArr) =>
    filteredArr.map((t) => ({
      date: t.date,
      description: t.description,
      amount: t.amount,
      category: t.category,
      account: t.account,
    }));

  const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = (filteredArr) => {
    const rows = exportRows(filteredArr);
    const csv = Papa.unparse(rows);
    triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), "household-transactions.csv");
  };

  const toggleRowSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (filteredArr, checked) => {
    if (checked) {
      setSelectedIds(new Set(filteredArr.map((t) => t.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleConfirmDelete = () => {
    onDeleteSelected([...selectedIds]);
    setSelectedIds(new Set());
    setConfirmDelete(false);
  };

  // Bulk-apply category/account/transfer to the current selection, then clear
  // the selection so the bulk bar collapses and the action reads as "done".
  const applyBulk = (patch) => {
    if (selectedIds.size === 0) return;
    onUpdateMany([...selectedIds], patch);
    setSelectedIds(new Set());
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...transactions]
      .filter((t) => (catFilter.length === 0 ? true : catFilter.includes(t.category)))
      .filter((t) => (acctFilter.length === 0 ? true : acctFilter.includes(t.account || "Unassigned")))
      .filter((t) => (typeFilter.length === 0 ? true : typeFilter.includes(txnType(t.category))))
      .filter((t) => matchPeriod(t.date, year, month))
      .filter((t) => {
        // From/To filter by day on both platforms.
        if (from && (t.date || "") < from) return false;
        if (to && (t.date || "") > to) return false;
        // Date-header / chip filter: year(s) and/or month(s) — both platforms.
        const y = (t.date || "").slice(0, 4);
        const m = (t.date || "").slice(5, 7);
        if (dateYears.length && !dateYears.includes(y)) return false;
        if (dateMonths.length && !dateMonths.includes(m)) return false;
        return true;
      })
      .filter((t) =>
        q
          ? `${t.description || ""} ${t.category || ""} ${t.account || ""}`
              .toLowerCase()
              .includes(q)
          : true
      )
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [transactions, catFilter, acctFilter, typeFilter, query, year, month, from, to, dateYears, dateMonths, isWide]);

  // Reset visible window whenever filters change.
  useEffect(() => {
    setVisibleCount(75);
  }, [filtered]);

  // IntersectionObserver: load 50 more rows when the sentinel enters the viewport.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => prev + 50);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filtered]); // re-bind whenever filtered changes (sentinel may remount)

  // Audit summary for the filtered set.
  const summary = useMemo(() => {
    let income = 0, expenses = 0, transfer = 0;
    for (const t of filtered) {
      const raw = Number(t.amount) || 0;
      if (isTransfer(t.category)) transfer += Math.abs(raw);
      else if (isIncome(t.category)) income += raw; // signed: refunds/clawbacks net out
      else expenses += raw;
    }
    return { income, expenses, transfer };
  }, [filtered]);

  const hasFilters =
    catFilter.length > 0 ||
    acctFilter.length > 0 ||
    typeFilter.length > 0 ||
    query ||
    year !== "All" ||
    month !== "All" ||
    from ||
    to ||
    dateYears.length > 0 ||
    dateMonths.length > 0;

  const clearFilters = () => {
    setCatFilter([]);
    setAcctFilter([]);
    setTypeFilter([]);
    setQuery("");
    setYear("All");
    setMonth("All");
    setFrom("");
    setTo("");
    setDateYears([]);
    setDateMonths([]);
  };

  const allSelected = filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id));

  // Slice to the currently-visible window (lazy load). All totals/selection
  // logic above continues to operate on the full `filtered` array.
  const visible = filtered.slice(0, visibleCount);

  // Group mobile transactions by date for section headers — only visible rows.
  const groupedByDate = useMemo(() => {
    const groups = [];
    let lastDate = null;
    for (const t of visible) {
      if (t.date !== lastDate) {
        groups.push({ date: t.date, txns: [t] });
        lastDate = t.date;
      } else {
        groups[groups.length - 1].txns.push(t);
      }
    }
    return groups;
  }, [visible]);

  const net = summary.income + summary.expenses;

  return (
    <div style={S.txnTab}>
      {/* Fixed controls (capped at half the height, scroll internally if
          taller) over a list that owns the rest of the space and scrolls. */}
      <div style={S.txnControls}>
      {/* Search box */}
      <div style={S.searchWrap}>
        <Search size={16} color="#8b94a3" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search description, category, account…"
          style={S.searchInput}
        />
        {query ? (
          <button onClick={() => setQuery("")} style={S.deleteBtn} title="Clear search">
            <X size={15} />
          </button>
        ) : null}
      </div>

      {/* Filter chips — mobile only (desktop uses column-header filters in the table) */}
      {!isWide && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <HeaderFilter chip label="Type" value={typeFilter} options={["Income", "Expense", "Transfer"]} onChange={setTypeFilter} />
          <HeaderFilter chip label="Account" value={acctFilter} options={acctOptions} onChange={setAcctFilter} />
          <HeaderFilter chip label="Category" value={catFilter} options={catOptions} onChange={setCatFilter} />
          <DateHeaderFilter chip years={years} dateYears={dateYears} setDateYears={setDateYears} dateMonths={dateMonths} setDateMonths={setDateMonths} from={from} setFrom={setFrom} to={to} setTo={setTo} />
        </div>
      )}

      {/* Audit summary — colored pills */}
      <div style={S.summaryBar}>
        <span style={{ fontSize: 11, color: "#636366" }}>{filtered.length} txns</span>
        <span style={{ fontSize: 11, color: "#34d399", background: "rgba(52,211,153,0.1)", borderRadius: 6, padding: "2px 8px" }}>↑ {money(summary.income)}</span>
        <span style={{ fontSize: 11, color: summary.expenses < 0 ? "#f87171" : "#34d399", background: summary.expenses < 0 ? "rgba(248,113,113,0.1)" : "rgba(52,211,153,0.1)", borderRadius: 6, padding: "2px 8px" }}>{summary.expenses < 0 ? `↓ ${money(Math.abs(summary.expenses))}` : `↑ ${money(Math.abs(summary.expenses))}`}</span>
        <span style={{ fontSize: 11, color: net >= 0 ? "#34d399" : "#f87171", background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: "2px 8px" }}>= {money(net)}</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {hasFilters ? (
            <button onClick={clearFilters} style={S.linkBtn}>
              Clear filters
            </button>
          ) : null}
          {selectedIds.size > 0 ? (
            <button onClick={() => setSelectedIds(new Set())} style={S.linkBtn}>
              Clear selection ({selectedIds.size})
            </button>
          ) : null}
        </div>
      </div>

      {/* Bulk-edit bar: shown whenever there's a selection */}
      {selectedIds.size > 0 && (
        <div style={S.bulkBar}>
          <span style={{ fontSize: 13, color: "#e5e7eb", fontWeight: 600 }}>
            {selectedIds.size} selected
          </span>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select value={bulkCat} onChange={(e) => setBulkCat(e.target.value)} style={{ ...S.select, flex: "0 1 150px" }}>
              <option value="">Set category…</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <button
              disabled={!bulkCat}
              onClick={() => { applyBulk({ category: bulkCat }); setBulkCat(""); }}
              style={S.exportBtn(!bulkCat)}
            >
              Apply
            </button>
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select value={bulkAcct} onChange={(e) => setBulkAcct(e.target.value)} style={{ ...S.select, flex: "0 1 150px" }}>
              <option value="">Set account…</option>
              {ACCOUNTS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            <button
              disabled={!bulkAcct}
              onClick={() => { applyBulk({ account: bulkAcct }); setBulkAcct(""); }}
              style={S.exportBtn(!bulkAcct)}
            >
              Apply
            </button>
          </div>

          <button onClick={() => applyBulk({ category: TRANSFER_CATEGORY })} style={S.exportBtn(false)} title="Mark as account transfer / card payment (excluded from totals)">
            Mark as Transfer
          </button>

          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={S.deleteSelectedBtn}>
              <Trash2 size={15} />
              Delete ({selectedIds.size})
            </button>
          ) : (
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#fca5a5" }}>Delete {selectedIds.size}?</span>
              <button onClick={handleConfirmDelete} style={{ background: "#7f1d1d", border: "1px solid #ef4444", color: "#fff", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                Yes
              </button>
              <button onClick={() => setConfirmDelete(false)} style={{ background: "transparent", border: "1px solid #4b5563", color: "#cbd5e1", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12 }}>
                No
              </button>
            </span>
          )}
        </div>
      )}

      {/* Mobile select-all helper (desktop uses the table header checkbox) */}
      {!isWide && filtered.length > 0 && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "#cbd5e1" }}>
          <input type="checkbox" checked={allSelected} onChange={(e) => handleSelectAll(filtered, e.target.checked)} style={S.checkbox} />
          Select all ({filtered.length})
        </label>
      )}
      </div>

      <div style={S.txnListScroll}>
      {filtered.length === 0 ? (
        <Empty>{hasFilters ? "No transactions match your filters." : "Nothing here."}</Empty>
      ) : isWide ? (
        <TxnTable
          rows={visible}
          money={money}
          selectedIds={selectedIds}
          allSelected={allSelected}
          onToggleSelect={toggleRowSelect}
          onSelectAll={(checked) => handleSelectAll(filtered, checked)}
          onInlineChange={(t, patch) => onUpdate({ ...t, ...patch })}
          onEdit={setEditing}
          onDelete={onDelete}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          acctFilter={acctFilter}
          setAcctFilter={setAcctFilter}
          catFilter={catFilter}
          setCatFilter={setCatFilter}
          acctOptions={acctOptions}
          catOptions={catOptions}
          years={years}
          dateYears={dateYears}
          setDateYears={setDateYears}
          dateMonths={dateMonths}
          setDateMonths={setDateMonths}
          from={from}
          setFrom={setFrom}
          to={to}
          setTo={setTo}
        />
      ) : (
        <div style={S.list}>
          {groupedByDate.map(({ date, txns }) => (
            <React.Fragment key={date || "nodate"}>
              <div style={S.dateGroupHeader}>
                <span>{formatDateHeader(date)}</span>
                <span style={{ color: "#4b5563", fontSize: 10 }}>
                  {txns.length} txn{txns.length !== 1 ? "s" : ""}
                </span>
              </div>
              {txns.map((t) => (
                <TxnAuditCard
                  key={t.id}
                  t={t}
                  money={money}
                  selected={selectedIds.has(t.id)}
                  onToggleSelect={toggleRowSelect}
                  onInlineChange={(txn, patch) => onUpdate({ ...txn, ...patch })}
                  onEdit={setEditing}
                  onDelete={onDelete}
                />
              ))}
            </React.Fragment>
          ))}
        </div>
      )}
      {/* Sentinel for IntersectionObserver — triggers loading more rows */}
      {filtered.length > 0 && (
        <div ref={sentinelRef} style={{ height: 1, marginTop: 4 }} aria-hidden="true" />
      )}
      {filtered.length > 0 && visible.length < filtered.length && (
        <div style={S.loadMoreHint}>
          Showing {visible.length} of {filtered.length} — scroll for more
        </div>
      )}
      </div>

      {editing ? (
        <EditModal
          txn={editing}
          onClose={() => setEditing(null)}
          onSave={(updated) => {
            onUpdate(updated);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function formatDateHeader(dateStr) {
  if (!dateStr) return "Unknown";
  const today = todayISO();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Portal-based popover anchored under `anchorRef`. Rendered into document.body
// with position:fixed so it escapes any ancestor with overflow clipping
// (e.g. the txnControls / txnListScroll scroll containers). Closes on an
// outside press; presses inside the anchor or the panel are ignored.
function Popover({ open, setOpen, anchorRef, children, style }) {
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, window.innerWidth - 8 - (style?.minWidth || 180)));
      setPos({ top: r.bottom + 6, left, maxWidth: window.innerWidth - left - 8 });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef, style]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (anchorRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open, anchorRef, setOpen]);

  if (!open || !pos) return null;
  return createPortal(
    <div
      ref={popRef}
      style={{ ...S.headerPop, position: "fixed", top: pos.top, left: pos.left, marginTop: 0, maxWidth: pos.maxWidth, ...style }}
    >
      {children}
    </div>,
    document.body
  );
}

// Clickable column-header filter with MULTI-select (checkbox list). `value` is
// an array of selected options; empty = no filter (all). Highlights when active.
function HeaderFilter({ label, value, options, onChange, chip }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const active = value.length > 0;
  const toggle = (o) =>
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  const labelText = !active
    ? label
    : value.length === 1
    ? `${label}: ${value[0]}`
    : `${label} (${value.length})`;
  return (
    <div ref={anchorRef} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={chip ? S.chipBtn(active) : S.thBtn(active)} title="Filter">
        <span>{labelText}</span>
        <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
      </button>
      <Popover open={open} setOpen={setOpen} anchorRef={anchorRef}>
        <button onClick={() => onChange([])} style={S.popItem(!active)}>
          <span style={{ display: "inline-block", width: 14 }}>{!active ? "✓" : ""}</span>
          All
        </button>
        {options.map((o) => {
          const sel = value.includes(o);
          return (
            <button key={o} onClick={() => toggle(o)} style={S.popItem(sel)}>
              <span style={{ display: "inline-block", width: 14 }}>{sel ? "✓" : ""}</span>
              {o}
            </button>
          );
        })}
      </Popover>
    </div>
  );
}

// Date column-header filter: multi-select years and/or months, plus optional
// From/To day-level range (passed as props when available).
function DateHeaderFilter({ years, dateYears, setDateYears, dateMonths, setDateMonths, chip, from, to, setFrom, setTo }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const hasRange = !!(from || to);
  const active = dateYears.length > 0 || dateMonths.length > 0 || hasRange;
  const toggle = (arr, set, v) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const labelText = !active
    ? "Date"
    : hasRange && dateYears.length === 0 && dateMonths.length === 0
    ? `Date: ${from || "…"} → ${to || "…"}`
    : `Date (${[...dateYears, ...dateMonths.map((m) => (MONTHS.find((x) => x.v === m) || {}).l)].join(", ")})`;
  return (
    <div ref={anchorRef} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={chip ? S.chipBtn(active) : S.thBtn(active)} title="Filter by date">
        <span>{labelText}</span>
        <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
      </button>
      <Popover open={open} setOpen={setOpen} anchorRef={anchorRef} style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 240 }}>
          {/* From/To range — only when setFrom/setTo are provided */}
          {setFrom && setTo && (
            <div>
              <div style={S.popHead}>Date range</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 8px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#8b94a3" }}>
                  <span style={{ width: 28 }}>From</span>
                  <input type="date" value={from || ""} onChange={(e) => setFrom(e.target.value)} style={{ ...S.input, flex: 1, padding: "6px 8px", fontSize: 12 }} />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#8b94a3" }}>
                  <span style={{ width: 28 }}>To</span>
                  <input type="date" value={to || ""} onChange={(e) => setTo(e.target.value)} style={{ ...S.input, flex: 1, padding: "6px 8px", fontSize: 12 }} />
                </label>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={S.popHead}>Year</div>
              {years.length === 0 ? <div style={{ ...S.popItem(false), color: "#6b7280" }}>—</div> : null}
              {years.map((y) => {
                const sel = dateYears.includes(y);
                return (
                  <button key={y} onClick={() => toggle(dateYears, setDateYears, y)} style={S.popItem(sel)}>
                    <span style={{ display: "inline-block", width: 14 }}>{sel ? "✓" : ""}</span>
                    {y}
                  </button>
                );
              })}
            </div>
            <div style={{ flex: 1 }}>
              <div style={S.popHead}>Month</div>
              {MONTHS.map((m) => {
                const sel = dateMonths.includes(m.v);
                return (
                  <button key={m.v} onClick={() => toggle(dateMonths, setDateMonths, m.v)} style={S.popItem(sel)}>
                    <span style={{ display: "inline-block", width: 14 }}>{sel ? "✓" : ""}</span>
                    {m.l}
                  </button>
                );
              })}
            </div>
          </div>
      </Popover>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit table (desktop) — inline-editable category/account, type badge,
// row selection for bulk actions.
// ---------------------------------------------------------------------------

function TxnTable({ rows, money, selectedIds, allSelected, onToggleSelect, onSelectAll, onInlineChange, onEdit, onDelete, typeFilter, setTypeFilter, acctFilter, setAcctFilter, catFilter, setCatFilter, acctOptions, catOptions, years, dateYears, setDateYears, dateMonths, setDateMonths, from, setFrom, to, setTo }) {
  return (
    <div style={{ ...S.card, padding: 0, overflow: "visible" }}>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={{ ...S.th, width: 36, textAlign: "center" }}>
              <input type="checkbox" checked={allSelected} onChange={(e) => onSelectAll(e.target.checked)} style={S.checkbox} />
            </th>
            <th style={S.th}>
              <DateHeaderFilter years={years} dateYears={dateYears} setDateYears={setDateYears} dateMonths={dateMonths} setDateMonths={setDateMonths} from={from} setFrom={setFrom} to={to} setTo={setTo} />
            </th>
            <th style={S.th}>Description</th>
            <th style={S.th}>
              <HeaderFilter label="Account (source)" value={acctFilter} options={acctOptions} onChange={setAcctFilter} />
            </th>
            <th style={S.th}>
              <HeaderFilter label="Type" value={typeFilter} options={["Income", "Expense", "Transfer"]} onChange={setTypeFilter} />
            </th>
            <th style={S.th}>
              <HeaderFilter label="Category" value={catFilter} options={catOptions} onChange={setCatFilter} />
            </th>
            <th style={{ ...S.th, textAlign: "right" }}>Amount</th>
            <th style={{ ...S.th, width: 70, textAlign: "right" }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const type = txnType(t.category);
            const selected = selectedIds.has(t.id);
            const amt = amountDisplay(t);
            return (
              <tr key={t.id} style={{ background: selected ? "#1a1f2e" : "transparent" }}>
                <td style={{ ...S.td, textAlign: "center" }}>
                  <input type="checkbox" checked={selected} onChange={() => onToggleSelect(t.id)} style={S.checkbox} />
                </td>
                <td style={{ ...S.td, color: "#cbd5e1", whiteSpace: "nowrap" }}>{t.date}</td>
                <td style={{ ...S.td, color: "#e5e7eb", whiteSpace: "normal", overflowWrap: "anywhere", minWidth: 280 }}>
                  {t.description || <span style={{ color: "#6b7280" }}>—</span>}
                </td>
                <td style={S.td} title={t.srcAccount ? `Classified from: ${t.srcAccount}` : undefined}>
                  <select
                    value={ACCOUNTS.includes(t.account) ? t.account : ""}
                    onChange={(e) => onInlineChange(t, { account: e.target.value })}
                    style={S.cellSelect}
                  >
                    {!ACCOUNTS.includes(t.account) && (
                      <option value="">{t.account ? `${t.account} (unmapped)` : "—"}</option>
                    )}
                    {ACCOUNTS.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </td>
                <td style={S.td}>
                  <span style={{ ...S.badge, color: TYPE_COLOR[type], borderColor: TYPE_COLOR[type] }}>{type}</span>
                </td>
                <td style={S.td}>
                  <select
                    value={CATEGORIES.includes(t.category) ? t.category : "Other"}
                    onChange={(e) => onInlineChange(t, { category: e.target.value })}
                    style={S.cellSelect}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td style={{ ...S.td, textAlign: "right", color: amt.color, fontWeight: 600, whiteSpace: "nowrap" }}>
                  {amt.sign}{money(amt.value)}
                </td>
                <td style={{ ...S.td, textAlign: "right", whiteSpace: "nowrap" }}>
                  <button onClick={() => onEdit(t)} style={S.deleteBtn} title="Edit">
                    <Pencil size={14} />
                  </button>
                  {onDelete ? (
                    <button onClick={() => onDelete(t.id)} style={S.deleteBtn} title="Delete">
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TxnRow({ t, money, onDelete, onEdit, selectMode = false, selected = false, onToggleSelect }) {
  const amt = amountDisplay(t);
  const dotColor = catDotColor(t.category);

  const handleRowClick = selectMode
    ? (e) => {
        // Avoid double-toggle when clicking checkbox itself
        if (e.target.type === "checkbox") return;
        onToggleSelect && onToggleSelect(t.id);
      }
    : undefined;

  return (
    <div
      style={{
        ...S.txnRow,
        cursor: selectMode ? "pointer" : "default",
        outline: selected ? "1px solid #3b82f6" : undefined,
        background: selected ? "#1a1f2e" : "#161a20",
      }}
      onClick={handleRowClick}
    >
      {selectMode ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect && onToggleSelect(t.id)}
          onClick={(e) => e.stopPropagation()}
          style={S.checkbox}
        />
      ) : (
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: `${dotColor}1a`,
          border: `1px solid ${dotColor}35`,
          display: "grid", placeItems: "center",
          color: dotColor, fontSize: 13, fontWeight: 700,
        }}>
          {(t.category || "?")[0]}
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
          {t.description || t.category}
        </div>
        <div style={{ fontSize: 11, color: "#636366", marginTop: 2 }}>
          {t.date} · {t.category}
          {t.account ? ` · ${t.account}` : ""}
        </div>
      </div>
      <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: amt.color, fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>
          {amt.sign}
          {money(amt.value)}
        </span>
        {onEdit ? (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(t); }}
            style={S.deleteBtn}
            title="Edit"
          >
            <Pencil size={15} />
          </button>
        ) : null}
        {!selectMode && onDelete ? (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
            style={S.deleteBtn}
            title="Delete"
          >
            <Trash2 size={15} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

// Mobile audit card — the desktop table row's info, stacked for narrow
// screens, with inline-editable Account/Category, a Type badge, CK orig and a
// selection checkbox.
// Width of the action rail revealed by swiping the card left (two chips).
const SWIPE_ACTION_WIDTH = 132;

function TxnAuditCard({ t, money, selected, onToggleSelect, onInlineChange, onEdit, onDelete }) {
  const type = txnType(t.category);
  const amt = amountDisplay(t);

  // Swipe-to-reveal: drag the card left to expose Edit/Delete chips. Tracks a
  // horizontal-only gesture so taps on the inner selects/checkbox still work.
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const start = useRef(null);

  const onTouchStart = (e) => {
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, base: open ? -SWIPE_ACTION_WIDTH : 0, horiz: null };
  };
  const onTouchMove = (e) => {
    if (!start.current) return;
    const cx = e.touches[0].clientX;
    const cy = e.touches[0].clientY;
    const ddx = cx - start.current.x;
    const ddy = cy - start.current.y;
    // Decide gesture axis once, then only act on horizontal swipes.
    if (start.current.horiz === null && (Math.abs(ddx) > 6 || Math.abs(ddy) > 6)) {
      start.current.horiz = Math.abs(ddx) > Math.abs(ddy);
    }
    if (!start.current.horiz) return;
    let next = start.current.base + ddx;
    next = Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, next)); // clamp to [-width, 0]
    setDx(next);
  };
  const onTouchEnd = () => {
    if (!start.current) return;
    const shouldOpen = dx < -SWIPE_ACTION_WIDTH / 2;
    setOpen(shouldOpen);
    setDx(shouldOpen ? -SWIPE_ACTION_WIDTH : 0);
    start.current = null;
  };

  const translate = start.current ? dx : open ? -SWIPE_ACTION_WIDTH : 0;
  const closeRail = () => { setOpen(false); setDx(0); };

  return (
    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden" }}>
      {/* Action rail behind the card */}
      <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => { closeRail(); onEdit(t); }}
          style={{ ...S.swipeAction, width: SWIPE_ACTION_WIDTH / 2, background: "#1e3a5f", color: "#93c5fd" }}
          title="Edit"
        >
          <Pencil size={17} />
          <span style={{ fontSize: 10, marginTop: 3 }}>Edit</span>
        </button>
        {onDelete ? (
          <button
            onClick={() => { closeRail(); onDelete(t.id); }}
            style={{ ...S.swipeAction, width: SWIPE_ACTION_WIDTH / 2, background: "#7f1d1d", color: "#fca5a5" }}
            title="Delete"
          >
            <Trash2 size={17} />
            <span style={{ fontSize: 10, marginTop: 3 }}>Delete</span>
          </button>
        ) : null}
      </div>

      {/* Foreground card (slides over the rail) */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          ...S.txnRow,
          flexDirection: "column",
          alignItems: "stretch",
          gap: 10,
          background: selected ? "#1a1f2e" : "#161a20",
          outline: selected ? "1px solid #3b82f6" : undefined,
          transform: `translateX(${translate}px)`,
          transition: start.current ? "none" : "transform 0.2s ease",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect(t.id)} style={S.checkbox} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, color: "#e5e7eb", overflowWrap: "anywhere", lineHeight: 1.35 }}>
              {t.description || t.category}
            </div>
            {t.srcAccount && !ACCOUNTS.includes(t.account) ? (
              <div style={{ fontSize: 11, color: "#8b94a3", marginTop: 2 }}>
                src: {t.srcAccount}
              </div>
            ) : null}
          </div>
          <span style={{ color: amt.color, fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>
            {amt.sign}{money(amt.value)}
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ ...S.badge, color: TYPE_COLOR[type], borderColor: TYPE_COLOR[type] }}>{type}</span>
          <select
            value={ACCOUNTS.includes(t.account) ? t.account : ""}
            onChange={(e) => onInlineChange(t, { account: e.target.value })}
            style={{ ...S.cellSelect, flex: "1 1 140px", maxWidth: "none" }}
          >
            {!ACCOUNTS.includes(t.account) && (
              <option value="">{t.account ? `${t.account} (unmapped)` : "—"}</option>
            )}
            {ACCOUNTS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select
            value={CATEGORIES.includes(t.category) ? t.category : "Other"}
            onChange={(e) => onInlineChange(t, { category: e.target.value })}
            style={{ ...S.cellSelect, flex: "1 1 120px", maxWidth: "none" }}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <label style={{ display: "block", ...style }}>
      <div style={{ fontSize: 12, color: "#8b94a3", marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

// ===========================================================================
// Edit transaction (modal)
// ===========================================================================

function EditModal({ txn, onClose, onSave }) {
  const [date, setDate] = useState(txn.date || todayISO());
  const [description, setDescription] = useState(txn.description || "");
  const [amount, setAmount] = useState(String(Number(txn.amount) || 0));
  const [category, setCategory] = useState(
    CATEGORIES.includes(txn.category) ? txn.category : "Other"
  );
  const [account, setAccount] = useState(
    ACCOUNTS.includes(txn.account) ? txn.account : ""
  );
  const [err, setErr] = useState("");

  const submit = (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt === 0) {
      setErr("Enter a valid amount.");
      return;
    }
    onSave({
      ...txn,
      date,
      description: description.trim(),
      amount: amt,
      category,
      account,
    });
  };

  return (
    <div style={S.modalOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div style={S.modalCard} onClick={(e) => e.stopPropagation()} aria-label="Edit transaction">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h3 style={{ ...S.sectionTitle, margin: 0 }}>Edit Transaction</h3>
          <button onClick={onClose} style={S.deleteBtn} title="Close">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} style={S.col}>
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={S.input} />
          </Field>
          <Field label="Description">
            <input
              autoFocus
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Costco run"
              style={S.input}
            />
          </Field>
          <Field label="Amount (USD)">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              style={S.input}
            />
            <div style={{ fontSize: 12, color: "#8b94a3", marginTop: 6 }}>
              Use a negative value for a reversal — a refund on an expense or a
              cashback/tax clawback on income — to net it out of that category.
            </div>
          </Field>
          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={S.input}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          {txn.ckCategory ? (
            <div style={{ fontSize: 12, color: "#8b94a3", marginTop: -6 }}>
              Source category (audit): <span style={{ color: "#cbd5e1" }}>{txn.ckCategory}</span>
            </div>
          ) : null}
          <Field label="Account">
            <select value={account} onChange={(e) => setAccount(e.target.value)} style={S.input}>
              <option value="">— Unassigned —</option>
              {ACCOUNTS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Field>
          {txn.srcAccount ? (
            <div style={{ fontSize: 12, color: "#8b94a3", marginTop: -6 }}>
              Source account (audit): <span style={{ color: "#cbd5e1" }}>{txn.srcAccount}</span>
            </div>
          ) : null}
          {err ? <div style={{ color: "#f87171", fontSize: 13 }}>{err}</div> : null}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} style={S.secondaryBtn}>
              Cancel
            </button>
            <button type="submit" style={S.primaryBtn}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// A titled card with a chevron header that collapses its body.
function CollapsibleCard({ title, badge, defaultOpen = false, icon: Icon, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 10, border: "1px solid #2a313c", borderRadius: 12, overflow: "hidden", background: "#12161c" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 12px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        {open ? <ChevronDown size={16} color="#8b94a3" /> : <ChevronRight size={16} color="#8b94a3" />}
        {Icon ? <Icon size={14} style={{ marginRight: 6 }} /> : null}
        <span style={{ ...S.sectionTitle, margin: 0, fontWeight: 600 }}>{title}</span>
        {badge != null ? <span style={{ marginLeft: "auto", fontSize: 11, color: "#8b94a3" }}>{badge}</span> : null}
      </button>
      {open ? <div style={{ padding: "0 14px 16px" }}>{children}</div> : null}
    </div>
  );
}

// Map each source card to an account (lives inside Settings). Cards are keyed
// on the source's stable account URN (so five Chase "CREDIT CARD"s are told
// apart by their last-4), labeled by issuer + last-4. Saving persists the map
// and re-applies it to existing transactions; future imports classify by it.
function AccountMapSection({ transactions, accountMap, onSave }) {
  const cards = useMemo(() => {
    const m = new Map();
    for (const t of transactions) {
      const urn = t.accountUrn;
      if (!urn) continue;
      const e = m.get(urn) || { urn, label: "", last4: t.last4 || "", count: 0 };
      e.count++;
      if (!e.label && t.srcAccount) e.label = t.srcAccount;
      if (!e.last4 && t.last4) e.last4 = t.last4;
      m.set(urn, e);
    }
    return [...m.values()]
      .map((c) => ({ ...c, suggested: matchAccount(c.label) }))
      .sort((a, b) => b.count - a.count);
  }, [transactions]);

  const [draft, setDraft] = useState(accountMap || {});
  // Keep the draft in sync if the saved map loads/changes while open.
  useEffect(() => { setDraft(accountMap || {}); }, [accountMap]);
  const setOne = (urn, account) =>
    setDraft((prev) => {
      const next = { ...prev };
      if (account) next[urn] = account;
      else delete next[urn];
      return next;
    });

  const unmapped = cards.filter((c) => !draft[c.urn]).length;
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(accountMap || {}), [draft, accountMap]);

  return (
    <CollapsibleCard title="Card mapping (Credit Karma)" badge={cards.length ? `${unmapped} unmapped` : 0}>
      {cards.length === 0 ? (
        <p style={{ color: "#8b94a3", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          No card identities found. Re-export with the updated Credit Karma
          bookmarklet and re-import, then map each card here.
        </p>
      ) : (
        <>
          <div style={{ fontSize: 12, color: "#8b94a3", margin: "0 0 10px" }}>
            Assign each source card to an account; saving applies it to existing
            rows and all future imports.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {cards.map((c) => (
              <div
                key={c.urn}
                style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderRadius: 10, background: "#161a20" }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#e5e7eb", overflowWrap: "anywhere", lineHeight: 1.35, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", display: "inline-block", marginRight: 6, background: draft[c.urn] ? "#34d399" : "#fbbf24", flexShrink: 0 }} />
                    {c.label || "—"} {c.last4 ? <span style={{ color: "#8b94a3" }}>· ••{c.last4}</span> : null}
                  </div>
                  <div style={{ fontSize: 11, color: "#8b94a3", marginTop: 2 }}>
                    {c.count} txn{c.count === 1 ? "" : "s"}
                    {c.suggested ? ` · alias: ${c.suggested}` : ""}
                  </div>
                </div>
                <select
                  value={draft[c.urn] || ""}
                  onChange={(e) => setOne(c.urn, e.target.value)}
                  style={{ ...S.cellSelect, minWidth: 150 }}
                >
                  <option value="">— Unassigned —</option>
                  {ACCOUNTS.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={!dirty}
            style={{ ...S.primaryBtn, marginTop: 12, opacity: dirty ? 1 : 0.5, cursor: dirty ? "pointer" : "not-allowed" }}
          >
            Save &amp; apply
          </button>
        </>
      )}
    </CollapsibleCard>
  );
}

// One account's editable alias fragments: chips with a remove (x) button,
// plus an add box. Lowercased on add to match how they're compared.
function AccountAliasRow({ account, fragments, onChange }) {
  const [adding, setAdding] = useState("");
  const addFrag = () => {
    const v = adding.trim().toLowerCase();
    if (!v) return;
    if (!fragments.includes(v)) onChange([...fragments, v]);
    setAdding("");
  };
  const removeFrag = (f) => onChange(fragments.filter((x) => x !== f));

  return (
    <div style={{ background: "#161a20", border: "1px solid #1e2530", borderRadius: 10, padding: "8px 10px", marginBottom: 6 }}>
      <div style={{ fontSize: 13, color: "#e5e7eb", fontWeight: 600, marginBottom: 6 }}>{account}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        {fragments.length === 0 ? (
          <span style={{ fontSize: 11, color: "#8b94a3" }}>No aliases</span>
        ) : (
          fragments.map((f) => (
            <span
              key={f}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#0f1216", border: "1px solid #2a313c", borderRadius: 999, padding: "3px 8px", fontSize: 11, color: "#cbd5e1" }}
            >
              {f}
              <button
                onClick={() => removeFrag(f)}
                title="Remove"
                style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", padding: 0, display: "inline-flex" }}
              >
                <X size={11} />
              </button>
            </span>
          ))
        )}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addFrag(); }}
          placeholder="Add fragment (e.g. reserve)"
          style={{ flex: 1, minWidth: 0, background: "#0f1216", color: "#e5e7eb", border: "1px solid #2a313c", borderRadius: 8, padding: "6px 9px", fontSize: 12 }}
        />
        <button
          onClick={addFrag}
          disabled={!adding.trim()}
          title="Add fragment"
          style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 32, background: "#0A84FF", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", opacity: adding.trim() ? 1 : 0.4 }}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

// Editable account aliases (fragments matched against a source's raw
// account/card field when there's no URN card-map entry — see
// `classifyAccount`). Persisted via /api/account-aliases. Before saving, shows
// a client-side preview of which existing transactions would be reclassified
// (computed against the in-memory `transactions`, mirroring the "rename cascades"
// pattern used elsewhere in Settings) — the user must click "Preview impact"
// then confirm with "Confirm & apply" before anything is saved or reclassified.
function AccountAliasesSection({ transactions, accountMap, aliases, onSave }) {
  const [draft, setDraft] = useState(aliases || {});
  useEffect(() => { setDraft(aliases || {}); }, [aliases]);
  const [showPreview, setShowPreview] = useState(false);

  const setFrags = (account, frags) => {
    setDraft((prev) => ({ ...prev, [account]: frags }));
    setShowPreview(false); // any further edit invalidates a shown preview
  };

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(aliases || {}), [draft, aliases]);

  const impact = useMemo(() => {
    if (!dirty) return [];
    return computeAliasImpact(transactions, accountMap, buildAliasArray(draft));
  }, [dirty, draft, transactions, accountMap]);

  const handlePrimaryClick = () => {
    if (!showPreview) {
      setShowPreview(true);
      return;
    }
    onSave(draft);
    setShowPreview(false);
  };

  return (
    <CollapsibleCard title="Account aliases" badge={ACCOUNTS.length}>
      <div style={{ fontSize: 12, color: "#8b94a3", margin: "0 0 10px", lineHeight: 1.5 }}>
        Fragments matched (case/punctuation-insensitive) against the source
        account/card field when a transaction has no card mapping for its URN.
        Add or remove fragments per account, then preview the impact on
        existing transactions before saving.
      </div>
      <div>
        {ACCOUNTS.map((a) => (
          <AccountAliasRow
            key={a}
            account={a}
            fragments={draft[a] || []}
            onChange={(frags) => setFrags(a, frags)}
          />
        ))}
      </div>
      {dirty && showPreview ? (
        <div style={{ background: "#1a1500", border: "1px solid #4b3a00", borderRadius: 10, padding: 10, margin: "6px 0 10px", fontSize: 12, color: "#fbbf24" }}>
          {impact.length === 0 ? (
            <div>No existing transactions would change account.</div>
          ) : (
            <>
              <div style={{ marginBottom: 6, fontWeight: 600 }}>
                {impact.length} transaction{impact.length === 1 ? "" : "s"} will be reclassified:
              </div>
              <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {impact.slice(0, 50).map((it) => (
                  <div key={it.id} style={{ color: "#e5e7eb" }}>
                    {it.date} · {it.description || it.srcAccount} —{" "}
                    <span style={{ color: "#8b94a3" }}>{it.from || "Unassigned"}</span> →{" "}
                    <span style={{ color: "#34d399" }}>{it.to}</span>
                  </div>
                ))}
                {impact.length > 50 ? <div style={{ color: "#8b94a3" }}>…and {impact.length - 50} more</div> : null}
              </div>
            </>
          )}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={handlePrimaryClick}
          disabled={!dirty}
          style={{ ...S.primaryBtn, marginTop: 4, opacity: dirty ? 1 : 0.5, cursor: dirty ? "pointer" : "not-allowed" }}
        >
          {showPreview ? "Confirm & apply" : "Preview impact"}
        </button>
        {showPreview ? (
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            style={{ marginTop: 4, background: "transparent", border: "1px solid #2a313c", color: "#cbd5e1", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </CollapsibleCard>
  );
}

// Manage the user-editable lists (accounts + categories), persisted in Redis
// via /api/config. Renames cascade into existing data (handled in App), and
// items currently used by transactions can't be deleted (only renamed).
// One managed item: swipe left to reveal Edit/Delete, reorder via the up/down
// chevrons, or (when editing) an inline name field with Save/Cancel below.
function ManagedRow({ name, used, isFirst, isLast, editing, editVal, setEditVal, onStartEdit, onCommitEdit, onCancelEdit, onDelete, onMoveUp, onMoveDown }) {
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const start = useRef(null);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 2500);
    return () => clearTimeout(t);
  }, [confirming]);

  const onTouchStart = (e) => {
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, base: open ? -SWIPE_ACTION_WIDTH : 0, horiz: null };
  };
  const onTouchMove = (e) => {
    if (!start.current) return;
    const ddx = e.touches[0].clientX - start.current.x;
    const ddy = e.touches[0].clientY - start.current.y;
    if (start.current.horiz === null && (Math.abs(ddx) > 6 || Math.abs(ddy) > 6)) start.current.horiz = Math.abs(ddx) > Math.abs(ddy);
    if (!start.current.horiz) return;
    setDx(Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, start.current.base + ddx)));
  };
  const onTouchEnd = () => {
    if (!start.current) return;
    const shouldOpen = dx < -SWIPE_ACTION_WIDTH / 2;
    setOpen(shouldOpen);
    setDx(shouldOpen ? -SWIPE_ACTION_WIDTH : 0);
    start.current = null;
  };
  const translate = start.current ? dx : open ? -SWIPE_ACTION_WIDTH : 0;
  const close = () => { setOpen(false); setDx(0); };

  if (editing) {
    return (
      <div style={{ background: "#161a20", border: "1px solid #1e2530", borderRadius: 10, padding: 10 }}>
        <input
          autoFocus
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onCommitEdit(); if (e.key === "Escape") onCancelEdit(); }}
          style={{ width: "100%", boxSizing: "border-box", background: "#0f1216", color: "#e5e7eb", border: "1px solid #2a313c", borderRadius: 8, padding: "9px 11px", fontSize: 14 }}
        />
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 6 }}>
          <button onClick={onCommitEdit} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#0A84FF", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            <Check size={13} /> Save
          </button>
          <button onClick={onCancelEdit} style={{ background: "transparent", border: "1px solid #2a313c", color: "#cbd5e1", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", borderRadius: 10, overflow: "hidden" }}>
      {/* Swipe action rail */}
      <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => { close(); onStartEdit(); }}
          style={{ ...S.swipeAction, width: SWIPE_ACTION_WIDTH / 2, background: "#1e3a5f", color: "#93c5fd" }}
        >
          <Pencil size={16} /><span style={{ fontSize: 10, marginTop: 3 }}>Edit</span>
        </button>
        <button
          onClick={() => {
            if (used) return;
            if (!confirming) { setConfirming(true); }
            else { close(); setConfirming(false); onDelete(); }
          }}
          disabled={!!used}
          title={used ? `In use by ${used} transaction(s) — rename instead` : confirming ? "Click again to confirm" : "Delete"}
          style={{ ...S.swipeAction, width: SWIPE_ACTION_WIDTH / 2, background: "#7f1d1d", color: "#fca5a5", opacity: used ? 0.4 : 1 }}
        >
          <Trash2 size={16} /><span style={{ fontSize: 10, marginTop: 3 }}>{confirming ? "Confirm?" : "Delete"}</span>
        </button>
      </div>

      {/* Foreground row */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "#161a20", border: "1px solid #1e2530", borderRadius: 10,
          padding: "8px 10px", position: "relative",
          transform: `translateX(${translate}px)`,
          transition: start.current ? "none" : "transform 0.2s ease",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <button onClick={onMoveUp} disabled={isFirst} title="Move up" style={{ ...S.reorderBtn, opacity: isFirst ? 0.25 : 1 }}>
            <ChevronUp size={15} />
          </button>
          <button onClick={onMoveDown} disabled={isLast} title="Move down" style={{ ...S.reorderBtn, opacity: isLast ? 0.25 : 1 }}>
            <ChevronDown size={15} />
          </button>
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#e5e7eb", overflowWrap: "anywhere" }}>
          {name}
          {used ? <span style={{ color: "#8b94a3", fontSize: 11 }}> · {used} txn{used === 1 ? "" : "s"}</span> : null}
        </div>
      </div>
    </div>
  );
}

function ManagedList({ title, items, usage, onAdd, onRename, onDelete, onReorder }) {
  const [adding, setAdding] = useState("");
  const [editName, setEditName] = useState(null);
  const [editVal, setEditVal] = useState("");

  const startEdit = (name) => { setEditName(name); setEditVal(name); };
  const cancelEdit = () => { setEditName(null); setEditVal(""); };
  const commitEdit = () => {
    const v = editVal.trim();
    if (v && v !== editName) onRename(editName, v);
    cancelEdit();
  };
  const commitAdd = () => {
    const v = adding.trim();
    if (v) onAdd(v);
    setAdding("");
  };
  const move = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    onReorder(next);
  };

  return (
    <CollapsibleCard title={title} badge={items.length}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((name, idx) => (
          <ManagedRow
            key={name}
            name={name}
            used={usage[name] || 0}
            isFirst={idx === 0}
            isLast={idx === items.length - 1}
            editing={editName === name}
            editVal={editVal}
            setEditVal={setEditVal}
            onStartEdit={() => startEdit(name)}
            onCommitEdit={commitEdit}
            onCancelEdit={cancelEdit}
            onDelete={() => onDelete(name)}
            onMoveUp={() => move(idx, -1)}
            onMoveDown={() => move(idx, 1)}
          />
        ))}
      </div>
      {/* Add box: the text field takes most of the width; compact + button. */}
      <div style={{ display: "flex", gap: 8, alignItems: "stretch", marginTop: 8 }}>
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitAdd(); }}
          placeholder={`Add ${title.toLowerCase()}…`}
          style={{ flex: 1, minWidth: 0, background: "#0f1216", color: "#e5e7eb", border: "1px solid #2a313c", borderRadius: 8, padding: "9px 11px", fontSize: 14 }}
        />
        <button
          onClick={commitAdd}
          disabled={!adding.trim()}
          title="Add"
          style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 42, background: "#0A84FF", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", opacity: adding.trim() ? 1 : 0.4 }}
        >
          <Plus size={18} />
        </button>
      </div>
    </CollapsibleCard>
  );
}

// ===========================================================================
// Audit tab
// ===========================================================================

function AuditTab({ transactions, accountMap, accountAliases, onSaveAccountAliases, ckCategoryMap, onSaveCkCategoryMap, config }) {
  return (
    <div style={S.col}>
      <h3 style={S.sectionTitle}>Audit</h3>
      <AccountAliasesSection
        transactions={transactions}
        accountMap={accountMap}
        aliases={accountAliases}
        onSave={onSaveAccountAliases}
      />
      <CkCategoryMapSection
        transactions={transactions}
        map={ckCategoryMap}
        onSave={onSaveCkCategoryMap}
        config={config}
      />
      <ClassificationHistorySection transactions={transactions} accountMap={accountMap} accountAliases={accountAliases} />
    </div>
  );
}

// Editable Credit Karma -> ledger category mapping. Lists every token known
// from the seed plus any raw `ckCategory` token seen in already-loaded
// transactions that isn't in the seed (so a category the exporters never
// tokenized before still shows up here for review). Each row's destination is
// a dropdown of current expense/income categories plus "Transfer" and "Other
// Income" (both valid targets per `mapCkCategory`'s Transfer/Income branches).
// Saving is a plain PUT — no impact preview, no retroactive cascade: this
// only changes how NEW imports map `ckCategory` -> `category` from now on.
function CkCategoryMapSection({ transactions, map, onSave, config }) {
  const [draft, setDraft] = useState(map || {});
  useEffect(() => { setDraft(map || {}); }, [map]);

  const destinationOptions = useMemo(() => {
    const expense = config?.expenseCategories || EXPENSE_CATEGORIES;
    const income = config?.incomeCategories || INCOME_CATEGORIES;
    return [...expense, ...income, TRANSFER_CATEGORY];
  }, [config]);

  // Tokens: seed keys ∪ any ckCategory token observed in loaded transactions
  // that isn't already a seed key (surfaces categories the seed doesn't cover
  // yet, e.g. a new Credit Karma category added after the seed was written).
  const tokens = useMemo(() => {
    const seen = new Set(Object.keys(DEFAULT_CK_CATEGORY_MAP));
    const extra = [];
    for (const t of transactions || []) {
      if (!t.ckCategory) continue;
      const tok = ckCategoryToken(t.ckCategory);
      if (tok && !seen.has(tok)) {
        seen.add(tok);
        extra.push(tok);
      }
    }
    extra.sort();
    return [...Object.keys(DEFAULT_CK_CATEGORY_MAP).sort(), ...extra];
  }, [transactions]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(map || {}), [draft, map]);

  const setDestination = (token, dest) => {
    setDraft((prev) => ({ ...prev, [token]: dest }));
  };

  return (
    <CollapsibleCard title="Category mapping" badge={tokens.length}>
      <div style={{ fontSize: 12, color: "#8b94a3", margin: "0 0 10px", lineHeight: 1.5 }}>
        Where each Credit Karma category token lands in the ledger. Transfer
        and Income (both handled by dedicated rules before this table) are
        also selectable as destinations for special cases. Saving only
        affects future imports — existing transactions keep their current
        category.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tokens.map((token) => (
          <div
            key={token}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "#161a20", border: "1px solid #1e2530", borderRadius: 10, padding: "8px 10px" }}
          >
            <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#e5e7eb", overflowWrap: "anywhere", fontFamily: "monospace" }}>
              {token}
            </div>
            <select
              value={draft[token] || DEFAULT_CK_CATEGORY_MAP[token] || "Other"}
              onChange={(e) => setDestination(token, e.target.value)}
              style={{ ...S.select, flex: "0 0 auto", maxWidth: 160 }}
            >
              {destinationOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onSave(draft)}
        disabled={!dirty}
        style={{ ...S.primaryBtn, marginTop: 10, opacity: dirty ? 1 : 0.5, cursor: dirty ? "pointer" : "not-allowed" }}
      >
        Save mapping
      </button>
    </CollapsibleCard>
  );
}

// Read-only audit trail: for every transaction, explain in plain text why it
// landed on its current account and category (see `explainClassification`).
// Purely a viewer over already-loaded `transactions` — no writes, no new
// endpoint. A text filter + "show more" keeps the DOM small on large ledgers
// instead of rendering thousands of rows at once.
const CLASSIFICATION_PAGE_SIZE = 25;

function ClassificationHistorySection({ transactions, accountMap, accountAliases }) {
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(CLASSIFICATION_PAGE_SIZE);
  const aliasesArray = useMemo(() => buildAliasArray(accountAliases || {}), [accountAliases]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...(transactions || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (!q) return list;
    return list.filter((t) =>
      [t.description, t.account, t.category, t.srcAccount, t.ckCategory]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [transactions, query]);

  useEffect(() => { setVisible(CLASSIFICATION_PAGE_SIZE); }, [query]);

  const shown = filtered.slice(0, visible);

  return (
    <CollapsibleCard title="Classification history" badge={transactions?.length || 0}>
      <div style={{ fontSize: 12, color: "#8b94a3", margin: "0 0 10px", lineHeight: 1.5 }}>
        Read-only explanation of how each transaction's account and category
        were determined (URN card map, alias fragment, Credit Karma category,
        or manual entry). Nothing here can be edited — fix rules in "Account
        aliases" or the account map in Settings instead.
      </div>
      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={14} color="#8b94a3" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by description, account, or category…"
          style={{ ...S.input, padding: "9px 11px 9px 32px", fontSize: 13 }}
        />
      </div>
      {shown.length === 0 ? (
        <Empty>No matching transactions.</Empty>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {shown.map((t) => {
            const { accountReason, categoryReason } = explainClassification(t, accountMap, aliasesArray);
            return (
              <div key={t.id} style={{ background: "#161a20", border: "1px solid #1e2530", borderRadius: 10, padding: "9px 11px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, color: "#e5e7eb" }}>
                  <span style={{ overflowWrap: "anywhere" }}>{t.description || "(no description)"}</span>
                  <span style={{ color: "#8b94a3", flexShrink: 0, fontSize: 12 }}>{t.date}</span>
                </div>
                <div style={{ fontSize: 12, color: "#8b94a3", marginTop: 4 }}>
                  Account: <span style={{ color: "#cbd5e1" }}>{t.account || "Unassigned"}</span> — {accountReason}
                </div>
                <div style={{ fontSize: 12, color: "#8b94a3", marginTop: 2 }}>
                  Category: <span style={{ color: "#cbd5e1" }}>{t.category || "—"}</span> — {categoryReason}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {filtered.length > shown.length ? (
        <button
          type="button"
          onClick={() => setVisible((v) => v + CLASSIFICATION_PAGE_SIZE)}
          style={{ marginTop: 10, width: "100%", background: "transparent", border: "1px solid #2a313c", color: "#cbd5e1", borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
        >
          Show more ({filtered.length - shown.length} remaining)
        </button>
      ) : null}
    </CollapsibleCard>
  );
}

function SettingsModal({ config, transactions, accountMap, onSaveAccountMap, onClose, onAddAccount, onRenameAccount, onDeleteAccount, onAddCategory, onRenameCategory, onDeleteCategory, onReorderAccounts, onReorderCategories }) {
  const usage = useMemo(() => {
    const acc = {}, cat = {};
    for (const t of transactions) {
      if (t.account) acc[t.account] = (acc[t.account] || 0) + 1;
      if (t.category) cat[t.category] = (cat[t.category] || 0) + 1;
    }
    return { acc, cat };
  }, [transactions]);

  return (
    <div style={S.modalOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div
        style={{ ...S.modalCard, maxWidth: 560, width: "92vw", display: "flex", flexDirection: "column", overflowY: "hidden" }}
        onClick={(e) => e.stopPropagation()}
        aria-label="Settings"
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexShrink: 0 }}>
          <h3 style={{ ...S.sectionTitle, margin: 0 }}>Settings</h3>
          <button onClick={onClose} style={S.deleteBtn} title="Close">
            <X size={18} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: "#8b94a3", marginBottom: 12, lineHeight: 1.5, flexShrink: 0 }}>
          Map your Credit Karma cards to accounts, and manage the account and
          category lists. Renaming cascades to every transaction; items in use
          can't be deleted — rename them instead.
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
          <AccountMapSection
            transactions={transactions}
            accountMap={accountMap}
            onSave={onSaveAccountMap}
          />
          <ManagedList
            title="Accounts"
            items={config.accounts}
            usage={usage.acc}
            onAdd={onAddAccount}
            onRename={onRenameAccount}
            onDelete={onDeleteAccount}
            onReorder={onReorderAccounts}
          />
          <ManagedList
            title="Expense categories"
            items={config.expenseCategories}
            usage={usage.cat}
            onAdd={(n) => onAddCategory("expense", n)}
            onRename={onRenameCategory}
            onDelete={onDeleteCategory}
            onReorder={(names) => onReorderCategories("expense", names)}
          />
          <ManagedList
            title="Income categories"
            items={config.incomeCategories}
            usage={usage.cat}
            onAdd={(n) => onAddCategory("income", n)}
            onRename={onRenameCategory}
            onDelete={onDeleteCategory}
            onReorder={(names) => onReorderCategories("income", names)}
          />
        </div>
        <footer style={{ padding: "12px 16px", borderTop: "1px solid #2c2c2e", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ background: "#3a3a3c", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontSize: 14 }}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

// ===========================================================================
// Import (CSV)
// ===========================================================================

// Canonical fields the importer maps CSV columns onto. `aliases` drive the
// initial auto-detection; the user can override any of them in the UI.
const IMPORT_FIELDS = [
  { key: "date", label: "Date", aliases: ["date", "transaction date", "posted date"], required: true },
  { key: "description", label: "Description", aliases: ["description", "memo", "name", "merchant"] },
  { key: "amount", label: "Amount", aliases: ["amount", "value", "amt"], required: true },
  { key: "category", label: "Category", aliases: ["category", "type"] },
  { key: "account", label: "Account", aliases: ["account", "card"] },
  { key: "ckCategory", label: "Source category (audit)", aliases: ["ck_category", "ck category", "source category", "original category"] },
  { key: "ckType", label: "Source type (audit)", aliases: ["type", "ck_type", "ck type"] },
  { key: "accountUrn", label: "Account ID (URN)", aliases: ["account_urn", "account urn", "urn", "account id"] },
  { key: "last4", label: "Card last 4", aliases: ["last4", "last 4", "last_four", "card last 4"] },
  { key: "sourceId", label: "Source ID (dedup)", aliases: ["source_id", "source id", "transaction id", "txn id", "id"] },
];

// Best-guess header for a field from its aliases (case-insensitive).
function guessColumn(headers, aliases) {
  const lower = headers.map((h) => (h || "").trim().toLowerCase());
  for (const a of aliases) {
    const i = lower.indexOf(a);
    if (i !== -1) return headers[i];
  }
  return "";
}

function guessMapping(headers) {
  const map = {};
  for (const f of IMPORT_FIELDS) map[f.key] = guessColumn(headers, f.aliases);
  return map;
}

// Build a canonical transaction from a raw CSV record using the column mapping.
// profile is optional; when provided, its normalizeAmount and defaultAccount are used.
function buildRow(raw, mapping, profile, accountMap) {
  const val = (key) => {
    const col = mapping[key];
    return col ? String(raw[col] ?? "").trim() : "";
  };

  const rawAmount = val("amount");
  // Preserve the source sign on EVERY import path — no profile and no fallback
  // ever changes it. The CK profile parses the value as-is; the generic CSV
  // path used to apply Math.abs (a sign transformation) and no longer does.
  // Direction in the cash-flow view still comes from the category (income vs
  // expense); a reversal keeps the source's own negative sign.
  let amount;
  if (profile && profile.normalizeAmount) {
    amount = profile.normalizeAmount(rawAmount);
  } else {
    const rawStr = String(rawAmount).trim();
    // Detect accounting-style parentheses notation: (47.50) means -47.50.
    // Some bank exports use this format for debits/negative amounts.
    const parenMatch = rawStr.match(/^\(\$?([0-9.,]+)\)$/);
    if (parenMatch) {
      amount = -(parseFloat(parenMatch[1].replace(/[$,]/g, "")) || 0);
    } else {
      // Skip rows where the amount column contains a non-numeric string that
      // isn't in parentheses notation — this catches repeated CSV header rows
      // that some bank exports insert mid-file to separate account sections.
      // These are silently ignored (counted as skipped, not as errors).
      const cleaned = rawStr.replace(/[$,]/g, "");
      if (rawStr !== "" && isNaN(Number(cleaned)) && !rawStr.startsWith("-") && !rawStr.startsWith("+")) {
        return { _skipped: true };
      }
      amount = parseFloat(cleaned) || 0;
    }
  }
  if (!Number.isFinite(amount) || amount === 0) return null;

  let date = val("date");
  // Coerce common US format MM/DD/YYYY -> YYYY-MM-DD
  const m = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    date = `${yyyy}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  if (!date) date = todayISO();

  const rawAccount = (mapping.account && val("account")) || "";
  const accountUrn = mapping.accountUrn ? val("accountUrn") : "";
  const last4 = mapping.last4 ? val("last4") : "";
  const sourceId = mapping.sourceId ? val("sourceId") : "";
  // Classify by URN map first (separates same-named cards), then by alias;
  // otherwise the profile's account. Never default to ACCOUNTS[0] — leave it
  // unmapped so it can be filtered and fixed instead of labeled "ATT Reward".
  const account = (rawAccount || accountUrn)
    ? (classifyAccount(rawAccount, accountUrn, accountMap) || profile?.defaultAccount || "")
    : (profile?.defaultAccount || "");

  // Keep the raw source category (e.g. from Credit Karma) for auditing the
  // category-mapping decisions. Optional — only present when the column maps.
  const ckCategory = mapping.ckCategory ? val("ckCategory") : "";
  const ckType = mapping.ckType ? val("ckType") : "";
  // When the raw CK category traveled with the row, compute the ledger
  // category ourselves via the editable `CK_CATEGORY_MAP` (Audit → "Category
  // mapping") instead of trusting the already-mapped `category` column — this
  // is what lets a user-edited mapping affect NEW imports without touching
  // the external exporters. Falls back to the CSV's own `category` column
  // when there's no raw CK category (generic CSV path, or older exports).
  // Safety net: the CSV's own `category` column was computed by the exporter
  // with access to the raw CK `categoryType` (which is NOT exported as-is —
  // `ckType` here only ever carries 'income'/'expense'). That means the
  // editable-map recompute below can never see a raw 'transfer'/'payment'
  // type and could wrongly demote an already-correct Transfer row (e.g. a
  // Zelle/ACH whose raw category name has no "TRANSFER"/"PAYMENT" token) to
  // "Other". If either the recompute or the CSV already says Transfer, the
  // result must stay Transfer — the editable map is only allowed to affect
  // non-Transfer categorization, never to "de-transfer" a row.
  const csvCategory = matchOption(val("category"), CATEGORIES, "Other");
  const recomputedCategory = ckCategory
    ? mapCkCategory(ckCategory, ckType, CK_CATEGORY_MAP)
    : csvCategory;
  const category = (recomputedCategory === TRANSFER_CATEGORY || csvCategory === TRANSFER_CATEGORY)
    ? TRANSFER_CATEGORY
    : matchOption(recomputedCategory, CATEGORIES, "Other");

  const row = {
    id: uid(),
    date,
    description: val("description"),
    amount,
    category,
    account,
  };
  if (ckCategory) row.ckCategory = ckCategory;
  // Keep the raw source account string for auditing the classification: lets
  // you see what each row was classified from (or why it stayed unmapped).
  if (rawAccount) row.srcAccount = rawAccount;
  // Stable per-card identity from the source, used by the account map UI.
  if (accountUrn) row.accountUrn = accountUrn;
  if (last4) row.last4 = last4;
  // Stable per-transaction id from the source, used for de-duplication.
  if (sourceId) row.sourceId = sourceId;
  return row;
}

// Content fingerprint for de-duplication: day + signed cents + normalized
// description + account. Used when a source transaction id isn't available.
function txnFingerprint(t) {
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
function descOverlap(descA, descB) {
  const wordsA = new Set(descWords(descA));
  if (wordsA.size === 0) return false;
  return descWords(descB).some((w) => wordsA.has(w));
}

// Parse YYYY-MM-DD into a UTC day integer for date-diff calculations.
function dateToDayInt(dateStr) {
  const d = new Date(String(dateStr || "") + "T00:00:00Z");
  return isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 86400000);
}

// Flag duplicates in a batch of built rows against existing transactions and
// against earlier rows in the same batch. Hybrid key: when both sides carry a
// source id, compare by id (so two genuinely distinct but identical-looking
// purchases are never merged); otherwise compare by content fingerprint first,
// then fall back to fuzzy matching (same account + same cents + ±1 day +
// at least 1 word in common).
function markDuplicates(rows, existing) {
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

function ImportTransactions({ onImport, accountMap, config, transactions }) {
  // Two methods: Credit Karma (auto-mapped, day-to-day) and CSV (manual
  // mapping, one-time history backfill).
  const [method, setMethod] = useState("ck");
  const profile = BANK_PROFILES.find((p) => p.id === (method === "ck" ? "credit-karma" : "generic"));

  const [rawRows, setRawRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const resetAll = () => {
    setRawRows([]);
    setHeaders([]);
    setMapping({});
    setFileName("");
    setError("");
    setDone("");
  };

  const selectMethod = (m) => {
    if (m === method) return;
    setMethod(m);
    resetAll();
  };

  // Auto-apply column mapping whenever rows/headers/method change.
  useEffect(() => {
    if (!rawRows.length || !headers.length) return;
    if (profile.columnMap) {
      const auto = {};
      for (const [field, col] of Object.entries(profile.columnMap)) {
        if (col && headers.includes(col)) auto[field] = col;
      }
      setMapping(auto);
    } else {
      setMapping(guessMapping(headers));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, headers, method]);

  const parseFile = (file) => {
    setError("");
    setDone("");
    setRawRows([]);
    setHeaders([]);
    setMapping({});
    setFileName(file.name || "");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const cols = (result.meta?.fields || []).filter(Boolean);
        if (cols.length === 0) {
          setError("No columns detected in this CSV.");
          return;
        }
        if (method === "ck" && !cols.includes("date")) {
          setError("This doesn't look like a Credit Karma export. Use the bookmarklet/Scriptable export, or switch to CSV (manual mapping).");
          return;
        }
        setHeaders(cols);
        setRawRows(result.data);
      },
      error: (err) => setError(err.message),
    });
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  const { csvRows, skippedCount } = useMemo(() => {
    if (rawRows.length === 0) return { csvRows: [], skippedCount: 0 };
    const built = rawRows.map((r) => buildRow(r, mapping, profile, accountMap));
    let skipped = 0;
    const valid = [];
    for (const row of built) {
      if (!row) continue; // null = amount 0 or invalid
      if (row._skipped) { skipped++; continue; } // repeated header row / non-numeric amount
      valid.push(row);
    }
    return { csvRows: valid, skippedCount: skipped };
  }, [rawRows, mapping, profile, accountMap, config]);

  // Flag duplicates against existing data + within the batch.
  const dedupedRows = useMemo(() => markDuplicates(csvRows, transactions || []), [csvRows, transactions]);
  const dupCount = useMemo(() => dedupedRows.filter((r) => r._dup).length, [dedupedRows]);

  // Per-row selection. Default: keep non-duplicates checked, duplicates
  // unchecked. Resets whenever the parsed/mapped batch changes.
  const [selected, setSelected] = useState(() => new Set());
  const [onlyDups, setOnlyDups] = useState(false);
  useEffect(() => {
    setSelected(new Set(dedupedRows.filter((r) => !r._dup).map((r) => r.id)));
    setOnlyDups(false);
  }, [dedupedRows]);

  const toggleRow = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const selectAll = () => setSelected(new Set(dedupedRows.map((r) => r.id)));
  const selectNone = () => setSelected(new Set());

  const missingRequired = method === "csv"
    ? IMPORT_FIELDS.filter((f) => f.required && !mapping[f.key])
    : [];

  const setColumn = (key, col) => setMapping((prev) => ({ ...prev, [key]: col }));

  const selectedCount = selected.size;
  const confirm = () => {
    if (selectedCount === 0 || missingRequired.length > 0) return;
    const toImport = dedupedRows.filter((r) => selected.has(r.id)).map(({ _dup, ...t }) => t);
    onImport(toImport);
    setDone(`Imported ${toImport.length} transactions${dupCount ? ` · ${dupCount} duplicate(s) detected` : ""}.`);
    resetAll();
  };

  const methodCard = (active) => ({
    flex: 1,
    textAlign: "left",
    cursor: "pointer",
    background: active ? "#13233b" : "#161a20",
    border: `1px solid ${active ? "#0A84FF" : "#2a313c"}`,
    borderRadius: 14,
    padding: "12px 14px",
  });

  const methods = [
    { id: "ck", title: "Credit Karma", desc: "Export file (bookmarklet / Scriptable). Automatic mapping and sign, pending transactions already excluded." },
    { id: "csv", title: "CSV", desc: "Generic spreadsheet with manual column mapping. For importing old history." },
  ];

  return (
    <div style={S.col}>
      <h3 style={S.sectionTitle}>Import</h3>

      {/* Method picker */}
      <div style={{ display: "flex", gap: 10 }}>
        {methods.map((m) => (
          <button key={m.id} onClick={() => selectMethod(m.id)} style={methodCard(method === m.id)}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "#e5e7eb" }}>{m.title}</div>
            <div style={{ fontSize: 11, color: "#8b94a3", marginTop: 4, lineHeight: 1.35 }}>{m.desc}</div>
          </button>
        ))}
      </div>

      {/* File dropzone */}
      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          padding: "26px 16px", borderRadius: 16, cursor: "pointer", textAlign: "center",
          border: `1.5px dashed ${dragOver ? "#0A84FF" : "#2a313c"}`,
          background: dragOver ? "#10243d" : "#12161c",
        }}
      >
        <input type="file" accept=".csv,.tsv,.txt" onChange={onFile} style={{ display: "none" }} />
        <Upload size={22} color="#8b94a3" />
        <span style={{ fontSize: 14, color: "#cbd5e1", overflowWrap: "anywhere" }}>
          {fileName || "Choose a file or drag it here"}
        </span>
        <span style={{ fontSize: 11, color: "#6b7280" }}>CSV</span>
      </label>

      {error ? <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div> : null}
      {done ? <div style={{ color: "#34d399", fontSize: 13 }}>{done}</div> : null}

      {headers.length > 0 ? (
        <>
          {/* Manual column mapping — CSV method only */}
          {method === "csv" && (
            <>
              <h3 style={S.sectionTitle}>Column mapping</h3>
              <div style={S.col}>
                {IMPORT_FIELDS.map((f) => {
                  const fallbackHint =
                    f.key === "category" ? "— use default: Other —"
                    : f.key === "account" ? "— use default: Unassigned —"
                    : "— skip —";
                  return (
                    <Field key={f.key} label={f.required ? `${f.label} *` : f.label}>
                      <select value={mapping[f.key] || ""} onChange={(e) => setColumn(f.key, e.target.value)} style={S.input}>
                        <option value="">{f.required ? "— none —" : fallbackHint}</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </Field>
                  );
                })}
              </div>
              {missingRequired.length > 0 ? (
                <div style={{ color: "#fbbf24", fontSize: 13 }}>
                  Map a column for: {missingRequired.map((f) => f.label).join(", ")}.
                </div>
              ) : null}
            </>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12, color: "#8b94a3" }}>
            <span>
              {rawRows.length} parsed · {csvRows.length} valid{skippedCount > 0 ? <span style={{ color: "#fbbf24" }}> · {skippedCount} skipped (non-numeric rows)</span> : null} · <span style={{ color: "#cbd5e1" }}>{selectedCount} selected</span>
              {dupCount ? <span style={{ color: "#fbbf24" }}> · {dupCount} duplicate{dupCount === 1 ? "" : "s"} auto-unchecked</span> : null}
            </span>
            <button onClick={selectAll} style={S.linkBtn}>Select all</button>
            <button onClick={selectNone} style={S.linkBtn}>Deselect all</button>
            {dupCount ? (
              <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", color: "#cbd5e1" }}>
                <input type="checkbox" checked={onlyDups} onChange={(e) => setOnlyDups(e.target.checked)} style={S.checkbox} />
                Only duplicates
              </label>
            ) : null}
          </div>
          <div style={{ ...S.list, maxHeight: 360, overflowY: "auto" }}>
            {dedupedRows.filter((t) => (onlyDups ? t._dup : true)).slice(0, 400).map((t) => {
              const checked = selected.has(t.id);
              return (
                <div
                  key={t.id}
                  onClick={() => toggleRow(t.id)}
                  style={{ ...S.txnRow, cursor: "pointer", gap: 10, opacity: checked ? 1 : 0.5, outline: t._dup ? "1px solid #5b4a16" : undefined }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleRow(t.id)} onClick={(e) => e.stopPropagation()} style={S.checkbox} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, color: "#e5e7eb", overflowWrap: "anywhere" }}>
                      {t.description || t.category}
                      {t._dup ? <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#fbbf24", border: "1px solid #5b4a16", borderRadius: 6, padding: "1px 5px", verticalAlign: "1px" }}>DUP</span> : null}
                    </div>
                    <div style={{ fontSize: 11, color: "#8b94a3" }}>
                      {t.date} · {t.category}{t.account ? ` · ${t.account}` : ""}
                    </div>
                  </div>
                  <span style={{ fontSize: 14, color: "#cbd5e1", whiteSpace: "nowrap" }}>{usd.format(t.amount)}</span>
                </div>
              );
            })}
          </div>
          <button
            onClick={confirm}
            disabled={selectedCount === 0 || missingRequired.length > 0}
            style={{
              ...S.primaryBtn,
              opacity: selectedCount === 0 || missingRequired.length > 0 ? 0.5 : 1,
              cursor: selectedCount === 0 || missingRequired.length > 0 ? "not-allowed" : "pointer",
            }}
          >
            Import {selectedCount} transaction{selectedCount === 1 ? "" : "s"}
          </button>
        </>
      ) : null}
    </div>
  );
}

function matchOption(value, options, fallback) {
  if (!value) return fallback;
  const v = value.toLowerCase();
  const hit = options.find((o) => o.toLowerCase() === v);
  return hit || fallback;
}

// Normalize an account-ish string for matching: lowercase, strip everything
// that isn't a letter or digit ("T-Mobile" / "t mobile" / "AT&T" all collapse).
function normAccount(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Classify a source account/card value into a canonical account name, given
// an explicit alias table. Tries an exact (normalized) match first, then the
// alias keyword table. Returns "" when nothing matches — we deliberately do
// NOT guess an account, so unrecognized rows surface as unmapped instead of
// hiding under ATT Reward. Pure (takes the alias array as a parameter) so the
// impact-preview UI can try a draft alias table without mutating the module's
// live `ACCOUNT_ALIASES`.
// Core matcher shared by `matchAccountWithAliases` and `explainClassification`
// so the two can never drift out of sync: returns both the resolved account
// and a plain-text reason for which branch fired.
function matchAccountWithAliasesReason(rawValue, aliasesArray) {
  const n = normAccount(rawValue);
  if (!n) return { account: "", reason: "" };
  const exact = ACCOUNTS.find((a) => normAccount(a) === n);
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

function matchAccountWithAliases(rawValue, aliasesArray) {
  return matchAccountWithAliasesReason(rawValue, aliasesArray).account;
}

// Same as above, using the current live alias table.
function matchAccount(rawValue) {
  return matchAccountWithAliases(rawValue, ACCOUNT_ALIASES);
}

// Resolve a transaction's account. The user-maintained map keyed on the source
// account's stable URN wins (it can tell apart cards the source labels the same,
// e.g. five Chase "CREDIT CARD"s); otherwise fall back to the alias matcher.
function classifyAccount(rawAccount, accountUrn, accountMap) {
  if (accountUrn && accountMap && accountMap[accountUrn]) return accountMap[accountUrn];
  return matchAccount(rawAccount);
}

// Given a candidate alias table, list existing transactions whose account
// would change if that table were applied. URN-mapped rows are skipped (the
// card map always wins over aliases, so those never change from an alias
// edit). Used both for the pre-save impact preview and could be reused for a
// future cascade audit. Reads `t.srcAccount` (the source's raw account/card
// label kept for audit) — rows without it can't be reclassified by alias.
function computeAliasImpact(transactions, accountMap, aliasesArray) {
  const impacted = [];
  for (const t of transactions || []) {
    if (t.accountUrn && accountMap && accountMap[t.accountUrn]) continue;
    const raw = t.srcAccount || "";
    if (!raw) continue;
    const to = matchAccountWithAliases(raw, aliasesArray);
    if (to && to !== t.account) {
      impacted.push({ id: t.id, from: t.account || "", to, description: t.description, date: t.date, srcAccount: raw });
    }
  }
  return impacted;
}

// Read-only, client-side explanation of how a transaction ended up with its
// current account and category — for the "Classification history" audit
// panel. Never mutates or re-derives the transaction; it only re-runs the
// same rules (`classifyAccount`/`matchAccountWithAliases`) to describe which
// one fired, plus surfaces the raw Credit Karma category and the Apple Daily
// Cash heuristic (both applied at import time in `buildRow`, not here) as
// plain text. Pure function — no side effects, safe to call per-row in a list.
function explainClassification(txn, accountMap, aliasesArray) {
  const t = txn || {};
  let accountReason;
  if (t.accountUrn && accountMap && accountMap[t.accountUrn]) {
    accountReason = `Mapped by card ID (URN) → ${accountMap[t.accountUrn]}`;
  } else {
    const raw = t.srcAccount || "";
    const { reason } = matchAccountWithAliasesReason(raw, aliasesArray || []);
    if (reason) {
      accountReason = reason;
    } else {
      accountReason = t.account
        ? "Set manually (no source data)"
        : "No rule matched (Unassigned)";
    }
  }

  let categoryReason;
  const appleDailyCash =
    /apple card/i.test(`${t.srcAccount || ""} ${t.description || ""}`) &&
    /(deposit|adjustment)/i.test(t.description || "") &&
    t.category === "Other Income";
  if (t.ckCategory && t.ckCategory !== t.category) {
    categoryReason = `Mapped from Credit Karma category: ${t.ckCategory}`;
  } else if (appleDailyCash) {
    categoryReason = "Apple Daily Cash heuristic (Deposit/Adjustment)";
  } else if (!t.ckCategory) {
    categoryReason = "Manually set";
  } else {
    categoryReason = "As imported";
  }

  return { accountReason, categoryReason };
}

// ===========================================================================
// Small shared bits
// ===========================================================================

function Empty({ children }) {
  return (
    <div style={{ ...S.card, textAlign: "center", color: "#8b94a3", fontSize: 14, padding: 24 }}>
      {children}
    </div>
  );
}

// ===========================================================================
// Styles
// ===========================================================================

// ===========================================================================
// DESIGN SPEC — Household Ledger Mobile (developer-ready)
// Last updated: 2026-06-24 (mobile density redesign)
//
// ── PALETTE (do not alter) ──────────────────────────────────────────────────
//   bg        #0b0d10       app background
//   surface   #161a20       cards, modal backgrounds
//   border    #1e2530       card/modal borders
//   border2   #232a33       input/select borders
//   text      #e5e7eb       primary text
//   text2     #8b94a3       muted / secondary text
//   text3     #636366       disabled / delete icon
//   blue      #0A84FF       primary action, active tab
//   green     #34d399       income, saved indicator
//   red       #f87171       expenses, error indicator
//   gray      #8b94a3       saving indicator
//   amber     #fbbf24       unsaved / offline indicator
//
// ── HEADER ──────────────────────────────────────────────────────────────────
//   Target total height (safe-area = 0): 44–46 px
//   iPhone 16 Pro (safe-area-inset-top ≈ 59px): ~75–77 px  (<25% of 852px ✓)
//
//   padding-top:    calc(env(safe-area-inset-top) + 8px)
//   padding-right:  16px
//   padding-bottom: 8px
//   padding-left:   16px
//   background:     rgba(11,13,16,0.85)
//   backdrop-filter: blur(20px) saturate(180%)
//   border-bottom:  1px solid rgba(255,255,255,0.08)
//   z-index:        10
//
//   Title "Household Ledger"
//     font-size:      15px
//     font-weight:    600
//     letter-spacing: -0.3px
//     color:          #e5e7eb
//
//   Icon buttons (Eye/EyeOff, Settings, LogOut)
//     icon size:  16px
//     padding:    6px  (all sides)
//     border-radius: 8px
//     color default: #cbd5e1
//     color hover:   #e5e7eb  +  background rgba(255,255,255,0.06)
//     NOTE: hover is defined in the spec but not implemented via
//           onMouseEnter/onMouseLeave (app is mobile-first; no regression risk
//           from omitting it; can be added via onMouseEnter/Leave if needed)
//
//   SaveIndicator  font-size: 10px
//     saved:   color #34d399  prefix "✓"
//     saving:  color #8b94a3  animated dot
//     unsaved: color #fbbf24  prefix "●"
//     error:   color #f87171  prefix "✕"
//     offline: color #fbbf24  prefix "↻"
//
// ── TAB BAR ─────────────────────────────────────────────────────────────────
//   Target total height (safe-area = 0): 40–42 px
//   (18px icon + 9px label + 1px gap + 4px top + 4px bottom ≈ ~36–40 px)
//
//   padding-top:    4px
//   padding-bottom: max(4px, env(safe-area-inset-bottom))
//   background:     rgba(11,13,16,0.88)
//   backdrop-filter: blur(20px) saturate(180%)
//   border-top:     1px solid rgba(255,255,255,0.08)
//   z-index:        10
//
//   Tab button
//     padding:       2px  (all sides)
//     flex: 1  (equal width, space-around)
//     layout:        column, centered
//
//   Icon
//     size:  18px
//     color active:   #0A84FF
//     color inactive: #8b94a3
//
//   Label
//     font-size:   9px
//     font-weight: 500
//     margin-top:  1px
//     color active:         #0A84FF
//     color inactive:       #8b94a3
//     color inactive hover: #a1aab8  (desktop; no bg change)
//     NOTE: font-size 9px is below iOS Safari auto-zoom threshold (10px), but
//           index.html already has  maximum-scale=1  in the viewport meta tag
//           so zoom is prevented. No change to index.html needed.
//
// ── TRANSACTIONS — txnControls ──────────────────────────────────────────────
//   max-height:    50%  of <main>  (unchanged — no value change needed)
//   overflow-y:    auto  (internal scroll when filter panel is tall)
//   gap:           8px
//   background:    #0b0d10
//   border-bottom: 1px solid rgba(255,255,255,0.08)
//   With the smaller header+tabbar the txnListScroll gains ~20–28 px of
//   visible space on every device.
//
// ── RESPONSIVE ──────────────────────────────────────────────────────────────
//   Mobile  (<900px)
//     Header: single row, title left / icons right; ≤25% of screen height
//     TabBar: icon+label stacked, safe-area respected; ~40–42 px sans inset
//     txnControls: internal scroll, max 50% of <main>
//   Desktop (≥900px, app maxWidth 1180px via TabBar prop)
//     Same layout; safe-area-inset-top ≈ 0 → padding-top = 8px
//     Labels remain visible; hover states apply (spec only, not implemented)
//
// ── SPACING & RADII ─────────────────────────────────────────────────────────
//   Cards:     border-radius 16px  padding 16px
//   Modals:    border-radius 20px  padding 16px
//   Inputs:    border-radius 12px  padding 12px 14px
//   TxnRow:    border-radius 14px  padding 10px 12px
//   IconBtn:   border-radius 8px   padding 6px
//
// ===========================================================================

const S = {
  app: {
    // Fills #root, which is sized to 100lvh (the full physical screen) in
    // index.html. The tab bar (last flex child) lands on the real bottom edge;
    // its env(safe-area-inset-bottom) padding keeps the icons above the home
    // indicator. (dvh/% gave only the 812pt safe viewport → bottom strip.)
    height: "100%",
    overflow: "hidden",
    background: "#0b0d10",
    color: "#e5e7eb",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    WebkitFontSmoothing: "antialiased",
    fontFeatureSettings: '"kern" 1',
    display: "flex",
    flexDirection: "column",
    maxWidth: 560,
    margin: "0 auto",
  },
  header: {
    flexShrink: 0,
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "calc(env(safe-area-inset-top) + 8px) 16px 8px",
    background: "rgba(11,13,16,0.85)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  main: {
    flex: 1,
    minHeight: 0,
    padding: "16px 16px 20px",
    overflowY: "auto",
  },
  errorBar: {
    background: "#3b0d0d",
    color: "#fca5a5",
    padding: "8px 16px",
    fontSize: 13,
  },
  center: { textAlign: "center", color: "#8b94a3", padding: 40 },
  col: { display: "flex", flexDirection: "column", gap: 16 },
  // The Transactions tab flows naturally and scrolls as one block inside
  // <main> (no fixed-height/50% locks — those fought the full-screen layout).
  txnTab: {
    display: "flex",
    flexDirection: "column",
  },
  txnControls: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingBottom: 8,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  txnListScroll: {
    paddingTop: 10,
  },
  cardRow: { display: "flex", gap: 8 },
  card: {
    background: "#161a20",
    border: "1px solid #1e2530",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 2px 12px rgba(0,0,0,0.28)",
  },
  sectionTitle: { margin: "4px 0 0", fontSize: 10, color: "#8b94a3", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  txnRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    background: "#161a20",
    border: "1px solid #1e2530",
    borderRadius: 14,
    padding: "10px 12px",
    lineHeight: 1.4,
  },
  deleteBtn: {
    background: "transparent",
    border: "none",
    color: "#636366",
    cursor: "pointer",
    padding: 4,
    display: "grid",
    placeItems: "center",
  },
  iconMiniBtn: {
    background: "#161a20",
    border: "1px solid #2a313c",
    color: "#cbd5e1",
    cursor: "pointer",
    borderRadius: 8,
    padding: "6px 8px",
    display: "grid",
    placeItems: "center",
  },
  tabBar: {
    // Normal flex child at the bottom of the 100dvh shell, so it sits at the
    // real screen edge. Bottom padding = the home-indicator clearance, trimmed
    // a little so the icons sit low without being under the indicator.
    flexShrink: 0,
    width: "100%",
    boxSizing: "border-box",
    display: "flex",
    justifyContent: "space-evenly",
    background: "#0b0d10",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    padding: "8px 8px max(10px, env(safe-area-inset-bottom))",
    zIndex: 10,
    gap: 4,
  },
  tabBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    flex: 1,
    padding: 0,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "#0f1216",
    border: "1px solid #232a33",
    borderRadius: 12,
    padding: "12px 14px",
    color: "#e5e7eb",
    fontSize: 15,
    outline: "none",
  },
  select: {
    flex: 1,
    background: "#0f1216",
    border: "1px solid #232a33",
    borderRadius: 12,
    padding: "10px 12px",
    color: "#e5e7eb",
    fontSize: 14,
  },
  primaryBtn: {
    width: "100%",
    background: "#0A84FF",
    border: "none",
    borderRadius: 12,
    padding: "13px 16px",
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryBtn: {
    width: "100%",
    background: "transparent",
    border: "1px solid #232a33",
    borderRadius: 12,
    padding: "13px 16px",
    color: "#cbd5e1",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  linkBtn: {
    background: "transparent",
    border: "none",
    color: "#0A84FF",
    fontSize: 12,
    cursor: "pointer",
    padding: 0,
  },
  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#0f1216",
    border: "1px solid #232a33",
    borderRadius: 10,
    padding: "0 10px",
  },
  searchInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#e5e7eb",
    fontSize: 15,
    padding: "12px 0",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    // Always keep clear of the Dynamic Island / status bar at the top and the
    // home indicator at the bottom, so a tall sheet never slides under them.
    padding: "calc(env(safe-area-inset-top) + 12px) 12px max(12px, env(safe-area-inset-bottom))",
  },
  modalCard: {
    width: "100%",
    maxWidth: 536,
    // Explicit cap (not 100% — WebKit resolves a flex item's % max-height
    // inconsistently): viewport minus both safe-area insets and a margin, so a
    // bottom-aligned sheet can never overflow upward under the Dynamic Island,
    // however far its sections expand.
    maxHeight: "calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 28px)",
    overflowY: "auto",
    background: "#161a20",
    border: "1px solid #1e2530",
    borderRadius: 20,
    padding: 16,
  },
  loginCard: {
    background: "#161a20",
    border: "1px solid #1e2530",
    borderRadius: 20,
    padding: 24,
    margin: 16,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12,
  },
  th: {
    padding: "10px 12px",
    color: "#8b94a3",
    fontWeight: 600,
    textAlign: "left",
    borderBottom: "1px solid #1f242c",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "9px 12px",
    color: "#8b94a3",
    borderBottom: "1px solid #1a1d23",
    whiteSpace: "nowrap",
  },
  offlineBanner: {
    background: "#7c3a00",
    color: "#ffd580",
    padding: "8px 16px",
    textAlign: "center",
    fontSize: 13,
    fontWeight: 500,
  },
  // Bulk-select feature
  exportBtn: (disabled, active) => ({
    background: active ? "#1e3a5f" : "#1e2328",
    border: active ? "1px solid #3b82f6" : "1px solid #3a3f4a",
    color: active ? "#93c5fd" : "#e0e6f0",
    borderRadius: 6,
    padding: "6px 14px",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13,
    opacity: disabled ? 0.4 : 1,
    fontWeight: active ? 600 : 400,
  }),
  deleteSelectedBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#3b0d0d",
    border: "1px solid #7f1d1d",
    color: "#fca5a5",
    borderRadius: 8,
    padding: "8px 14px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    alignSelf: "flex-start",
  },
  checkbox: {
    width: 16,
    height: 16,
    accentColor: "#3b82f6",
    cursor: "pointer",
    flexShrink: 0,
  },
  // Audit / table view
  filterBar: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  summaryBar: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    fontSize: 12,
    padding: "6px 10px",
    background: "#161a20",
    border: "1px solid #1e2530",
    borderRadius: 10,
  },
  swipeAction: {
    border: "none",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
  },
  reorderBtn: {
    background: "transparent",
    border: "none",
    color: "#8b94a3",
    cursor: "pointer",
    padding: 0,
    display: "grid",
    placeItems: "center",
    height: 16,
  },
  dateGroupHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    paddingBottom: 2,
    fontSize: 11,
    fontWeight: 600,
    color: "#8b94a3",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bulkBar: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    padding: "8px 10px",
    background: "#101826",
    border: "1px solid #1e3a5f",
    borderRadius: 10,
  },
  cellSelect: {
    background: "#0f1216",
    border: "1px solid #232a33",
    borderRadius: 8,
    padding: "5px 8px",
    color: "#e5e7eb",
    fontSize: 12,
    maxWidth: 170,
  },
  badge: {
    display: "inline-block",
    border: "1px solid",
    borderRadius: 999,
    padding: "1px 8px",
    fontSize: 11,
    fontWeight: 600,
  },
  thBtn: (active) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    font: "inherit",
    fontWeight: 600,
    color: active ? "#93c5fd" : "#8b94a3",
  }),
  headerPop: {
    position: "absolute",
    top: "100%",
    left: 0,
    marginTop: 6,
    minWidth: 160,
    maxHeight: 280,
    overflowY: "auto",
    background: "#161a20",
    border: "1px solid #2a3340",
    borderRadius: 10,
    padding: 4,
    zIndex: 40,
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
  },
  popItem: (active) => ({
    display: "block",
    width: "100%",
    textAlign: "left",
    background: active ? "#1e3a5f" : "transparent",
    border: "none",
    borderRadius: 7,
    padding: "7px 10px",
    color: active ? "#93c5fd" : "#cbd5e1",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    whiteSpace: "nowrap",
  }),
  popHead: {
    fontSize: 11,
    fontWeight: 600,
    color: "#8b94a3",
    padding: "2px 10px 4px",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  loadMoreHint: {
    textAlign: "center",
    fontSize: 11,
    color: "#4b5563",
    padding: "8px 0 4px",
  },
  chipBtn: (active) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: active ? "#1e3a5f" : "#1e2328",
    border: active ? "1px solid #3b82f6" : "1px solid #3a3f4a",
    color: active ? "#93c5fd" : "#cbd5e1",
    borderRadius: 999,
    padding: "7px 14px",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
  }),
  // Toggle pill used in MonthlyBarCard (Income / Expense selector)
  togglePill: (active) => ({
    background: active ? "#0A84FF" : "transparent",
    border: active ? "1px solid #0A84FF" : "1px solid #3a3f4a",
    color: active ? "#fff" : "#8b94a3",
    borderRadius: 999,
    padding: "4px 12px",
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
  }),
};
