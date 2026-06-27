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
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
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
const ACCOUNT_ALIASES = [
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
    columnMap: { date: 'date', description: 'description', amount: 'amount', category: 'category', account: 'account', ckCategory: 'ck_category', accountUrn: 'account_urn', last4: 'last4', sourceId: 'source_id' },
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

const monthKey = (dateStr) => (dateStr ? dateStr.slice(0, 7) : "");

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
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

  // Budgets: { [category]: number } — loaded from /api/budgets on mount.
  const [budgets, setBudgets] = useState({});
  const [budgetSaving, setBudgetSaving] = useState(false);
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

  // ---- Budgets load / save -------------------------------------------------
  const loadBudgets = useCallback(async () => {
    try {
      const res = await fetch("/api/budgets", {
        method: "GET",
        headers: buildAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.budgets && typeof data.budgets === "object") {
        setBudgets(data.budgets);
      }
    } catch {
      // Silently ignore — budgets are non-critical.
    }
  }, []);

  const saveBudgets = useCallback(async (next) => {
    setBudgetSaving(true);
    try {
      await fetch("/api/budgets", {
        method: "PUT",
        headers: buildAuthHeaders(),
        body: JSON.stringify({ budgets: next }),
      });
    } catch {
      // Silently ignore.
    } finally {
      setBudgetSaving(false);
    }
  }, []);

  const updateBudget = useCallback(
    (category, value) => {
      setBudgets((prev) => {
        const next = { ...prev };
        if (value === 0 || value === "" || value === null) {
          delete next[category];
        } else {
          next[category] = Number(value);
        }
        saveBudgets(next);
        return next;
      });
    },
    [saveBudgets]
  );

  useEffect(() => {
    if (authed) loadBudgets();
  }, [authed, loadBudgets]);

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
  // renaming a category updates its transactions and budget keys.
  const sortNames = (arr) => [...arr].sort((a, b) => a.localeCompare(b));

  const addAccount = useCallback((name) => {
    const n = (name || "").trim();
    if (!n || ACCOUNTS.includes(n)) return;
    saveConfig({ accounts: sortNames([...ACCOUNTS, n]) });
  }, [saveConfig]);

  const renameAccount = useCallback((oldName, newName) => {
    const nn = (newName || "").trim();
    if (!nn || nn === oldName || ACCOUNTS.includes(nn) || !ACCOUNTS.includes(oldName)) return;
    saveConfig({ accounts: sortNames(ACCOUNTS.map((a) => (a === oldName ? nn : a))) });
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
    else saveConfig({ expenseCategories: sortNames([...EXPENSE_CATEGORIES, n]) });
  }, [saveConfig]);

  const renameCategory = useCallback((oldName, newName) => {
    const nn = (newName || "").trim();
    if (!nn || nn === oldName || CATEGORIES.includes(nn)) return;
    if (EXPENSE_CATEGORIES.includes(oldName)) {
      saveConfig({ expenseCategories: sortNames(EXPENSE_CATEGORIES.map((c) => (c === oldName ? nn : c))) });
    } else if (INCOME_CATEGORIES.includes(oldName)) {
      saveConfig({ incomeCategories: INCOME_CATEGORIES.map((c) => (c === oldName ? nn : c)) });
    } else return;
    setTransactions((prev) => {
      let ch = false;
      const next = prev.map((t) => (t.category === oldName ? ((ch = true), { ...t, category: nn }) : t));
      if (ch) scheduleSave(next);
      return ch ? next : prev;
    });
    setBudgets((prev) => {
      if (!(oldName in prev)) return prev;
      const nb = {};
      for (const [k, v] of Object.entries(prev)) nb[k === oldName ? nn : k] = v;
      saveBudgets(nb);
      return nb;
    });
  }, [saveConfig, scheduleSave, saveBudgets]);

  const deleteCategory = useCallback((name) => {
    if (EXPENSE_CATEGORIES.includes(name)) saveConfig({ expenseCategories: EXPENSE_CATEGORIES.filter((c) => c !== name) });
    else if (INCOME_CATEGORIES.includes(name)) saveConfig({ incomeCategories: INCOME_CATEGORIES.filter((c) => c !== name) });
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
          <Dashboard transactions={transactions} money={money} />
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
        ) : (
          <div style={S.col}>
            <Charts transactions={transactions} hideValues={hideValues} />
            <Analyze
              transactions={transactions}
              money={money}
              hideValues={hideValues}
              budgets={budgets}
              onUpdateBudget={updateBudget}
              budgetSaving={budgetSaving}
              config={config}
            />
          </div>
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
          <span style={{ fontSize: 9, color: "#3f4651", fontWeight: 600 }}>v25</span>
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
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 16px" }}>
              {active && (
                <div style={{
                  position: "absolute", inset: 0, background: "rgba(10,132,255,0.14)",
                  borderRadius: 10, pointerEvents: "none",
                }} />
              )}
              <Icon size={22} />
            </div>
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
  return { income, expenses, net: income - expenses };
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

function Dashboard({ transactions, money }) {
  const all = useMemo(() => computeTotals(transactions), [transactions]);
  const years = useMemo(() => availableYears(transactions), [transactions]);

  // Default the period to the current month.
  const [year, setYear] = useState(() => todayISO().slice(0, 4));
  const [month, setMonth] = useState(() => todayISO().slice(5, 7));

  const periodTxns = useMemo(
    () => transactions.filter((t) => matchPeriod(t.date, year, month)),
    [transactions, year, month]
  );
  const period = useMemo(() => computeTotals(periodTxns), [periodTxns]);

  const recent = useMemo(
    () =>
      [...periodTxns]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, 8),
    [periodTxns]
  );

  const netColor = all.net >= 0 ? "#34d399" : "#f87171";

  return (
    <div style={S.col}>
      {/* Hero balance card */}
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
          background: all.net >= 0 ? "rgba(52,211,153,0.13)" : "rgba(248,113,113,0.13)",
          borderRadius: "50%", filter: "blur(28px)", pointerEvents: "none",
        }} />
        <div style={{ fontSize: 10, color: "#8b94a3", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>
          Net Balance
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.5, color: netColor, lineHeight: 1.1, marginBottom: 20 }}>
          {money(all.net)}
        </div>
        <div style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "#8b94a3", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Total Income</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#34d399", marginTop: 3 }}>{money(all.income)}</div>
          </div>
          <div style={{ width: 1, background: "rgba(255,255,255,0.06)", margin: "0 16px" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "#8b94a3", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Total Expenses</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#f87171", marginTop: 3 }}>{money(all.expenses)}</div>
          </div>
        </div>
      </div>

      {/* Period selector row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        <h3 style={S.sectionTitle}>{periodLabel(year, month)}</h3>
        <PeriodFilter year={year} month={month} setYear={setYear} setMonth={setMonth} years={years} />
      </div>

      <div style={S.cardRow}>
        <StatCard label="Income" value={money(period.income)} accent="#34d399" small />
        <StatCard label="Expenses" value={money(period.expenses)} accent="#f87171" small />
        <StatCard label="Net" value={money(period.net)} accent={period.net >= 0 ? "#34d399" : "#f87171"} small />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={S.sectionTitle}>Recent</h3>
        {recent.length > 0 && <span style={{ fontSize: 11, color: "#636366" }}>{recent.length} transactions</span>}
      </div>
      {recent.length === 0 ? (
        <Empty>No transactions in this period.</Empty>
      ) : (
        <div style={S.list}>
          {recent.map((t) => (
            <TxnRow key={t.id} t={t} money={money} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent, small }) {
  return (
    <div style={{ ...S.card, flex: 1, borderLeft: `3px solid ${accent || "#0A84FF"}`, paddingLeft: 14 }}>
      <div style={{ color: "#8b94a3", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ color: accent || "#e5e7eb", fontWeight: 700, fontSize: small ? 18 : 26, marginTop: 3, letterSpacing: -0.5 }}>
        {value}
      </div>
    </div>
  );
}

// ===========================================================================
// Charts
// ===========================================================================

function Charts({ transactions, hideValues }) {
  const years = useMemo(() => availableYears(transactions), [transactions]);
  // Charts are trend-oriented, so default to all data.
  const [year, setYear] = useState("All");
  const [month, setMonth] = useState("All");

  const scoped = useMemo(
    () => transactions.filter((t) => matchPeriod(t.date, year, month)),
    [transactions, year, month]
  );

  const byCategory = useMemo(() => {
    const map = new Map();
    for (const t of scoped) {
      if (isTransfer(t.category) || isIncome(t.category)) continue;
      const amt = Number(t.amount) || 0; // signed: refunds reduce the category
      map.set(t.category, (map.get(t.category) || 0) + amt);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .filter((e) => e.value > 0) // a net-refunded category isn't a pie slice
      .sort((a, b) => b.value - a.value);
  }, [scoped]);

  const byMonth = useMemo(() => {
    const map = new Map();
    for (const t of scoped) {
      if (isTransfer(t.category)) continue;
      const mk = monthKey(t.date);
      if (!mk) continue;
      const entry = map.get(mk) || { month: mk, income: 0, expenses: 0 };
      const amt = Number(t.amount) || 0; // signed: refunds/clawbacks net out
      if (isIncome(t.category)) entry.income += amt;
      else entry.expenses += amt;
      map.set(mk, entry);
    }
    return [...map.values()].sort((a, b) => (a.month < b.month ? -1 : 1)).slice(-12);
  }, [scoped]);

  if (transactions.length === 0) {
    return <Empty>No data to chart yet.</Empty>;
  }

  const fmtAxis = (v) => (hideValues ? "" : `$${Math.round(v)}`);
  const isSingleMonth = month !== "All";
  const label = periodLabel(year, month);

  return (
    <div style={S.col}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: "4px 0 0", fontSize: 17, color: "#e5e7eb", fontWeight: 700, letterSpacing: -0.3 }}>{label}</h2>
        <PeriodFilter year={year} month={month} setYear={setYear} setMonth={setMonth} years={years} />
      </div>
      {scoped.length === 0 ? <Empty>No data for {label}.</Empty> : null}
      <h3 style={S.sectionTitle}>Spending by Category</h3>
      <div style={{ ...S.card, height: 280 }}>
        {byCategory.length === 0 ? (
          <Empty>No expenses recorded.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={byCategory}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={hideValues ? false : (d) => d.name}
              >
                {byCategory.map((entry, i) => (
                  <Cell key={entry.name} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                ))}
              </Pie>
              {!hideValues && <Tooltip formatter={(v) => usd.format(v)} />}
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {isSingleMonth ? (
        <p style={{ color: "#8b94a3", fontSize: 12, margin: "4px 0 0", textAlign: "center" }}>
          Monthly comparison not available for single-month view.
        </p>
      ) : (
        <>
          <h3 style={S.sectionTitle}>Income vs Expenses (Monthly)</h3>
          <div style={{ ...S.card, height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMonth} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="month" tick={{ fill: "#8b94a3", fontSize: 11 }} />
                <YAxis tick={{ fill: "#8b94a3", fontSize: 11 }} tickFormatter={fmtAxis} width={48} />
                {!hideValues && <Tooltip formatter={(v) => usd.format(v)} />}
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Income" fill="#34d399" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#f87171" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

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

  // Group mobile transactions by date for section headers.
  const groupedByDate = useMemo(() => {
    const groups = [];
    let lastDate = null;
    for (const t of filtered) {
      if (t.date !== lastDate) {
        groups.push({ date: t.date, txns: [t] });
        lastDate = t.date;
      } else {
        groups[groups.length - 1].txns.push(t);
      }
    }
    return groups;
  }, [filtered]);

  const net = summary.income - summary.expenses;

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
        <span style={{ fontSize: 11, color: "#f87171", background: "rgba(248,113,113,0.1)", borderRadius: 6, padding: "2px 8px" }}>↓ {money(summary.expenses)}</span>
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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => handleExportCSV(filtered)}
            disabled={hideValues}
            title={hideValues ? "Show values to export" : "Export CSV"}
            style={S.exportBtn(hideValues)}
          >
            CSV
          </button>
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
          rows={filtered}
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
function CollapsibleCard({ title, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 10, border: "1px solid #2a313c", borderRadius: 12, overflow: "hidden", background: "#12161c" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 12px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        {open ? <ChevronDown size={16} color="#8b94a3" /> : <ChevronRight size={16} color="#8b94a3" />}
        <span style={{ ...S.sectionTitle, margin: 0 }}>{title}</span>
        {badge != null ? <span style={{ marginLeft: "auto", fontSize: 11, color: "#8b94a3" }}>{badge}</span> : null}
      </button>
      {open ? <div style={{ padding: "0 12px 12px" }}>{children}</div> : null}
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
                  <div style={{ fontSize: 13, color: "#e5e7eb", overflowWrap: "anywhere", lineHeight: 1.35 }}>
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

// Manage the user-editable lists (accounts + categories), persisted in Redis
// via /api/config. Renames cascade into existing data (handled in App), and
// items currently used by transactions can't be deleted (only renamed).
function ManagedList({ title, items, usage, onAdd, onRename, onDelete }) {
  const [adding, setAdding] = useState("");
  const [editName, setEditName] = useState(null);
  const [editVal, setEditVal] = useState("");

  const startEdit = (name) => { setEditName(name); setEditVal(name); };
  const commitEdit = () => {
    const v = editVal.trim();
    if (v && v !== editName) onRename(editName, v);
    setEditName(null);
    setEditVal("");
  };
  const commitAdd = () => {
    const v = adding.trim();
    if (v) onAdd(v);
    setAdding("");
  };

  const inputStyle = { flex: 1, minWidth: 0, background: "#0f1216", color: "#e5e7eb", border: "1px solid #2a313c", borderRadius: 8, padding: "7px 9px", fontSize: 13 };

  return (
    <CollapsibleCard title={title} badge={items.length}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((name) => {
          const used = usage[name] || 0;
          const editingThis = editName === name;
          return (
            <div key={name} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {editingThis ? (
                <>
                  <input
                    autoFocus
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditName(null); }}
                    style={inputStyle}
                  />
                  <button onClick={commitEdit} style={S.primaryBtn}>Save</button>
                  <button onClick={() => setEditName(null)} style={S.secondaryBtn}>Cancel</button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#e5e7eb", overflowWrap: "anywhere" }}>
                    {name}
                    {used ? <span style={{ color: "#8b94a3", fontSize: 11 }}> · {used} txn{used === 1 ? "" : "s"}</span> : null}
                  </div>
                  <button onClick={() => startEdit(name)} title="Rename" style={S.iconMiniBtn}>
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => { if (!used) onDelete(name); }}
                    disabled={!!used}
                    title={used ? `In use by ${used} transaction(s) — rename instead` : "Delete"}
                    style={{ ...S.iconMiniBtn, opacity: used ? 0.35 : 1, cursor: used ? "not-allowed" : "pointer" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitAdd(); }}
          placeholder={`Add ${title.toLowerCase()}…`}
          style={inputStyle}
        />
        <button onClick={commitAdd} disabled={!adding.trim()} style={{ ...S.primaryBtn, opacity: adding.trim() ? 1 : 0.4 }}>
          <Plus size={14} style={{ verticalAlign: "-2px" }} /> Add
        </button>
      </div>
    </CollapsibleCard>
  );
}

function SettingsModal({ config, transactions, accountMap, onSaveAccountMap, onClose, onAddAccount, onRenameAccount, onDeleteAccount, onAddCategory, onRenameCategory, onDeleteCategory }) {
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
        style={{ ...S.modalCard, maxWidth: 560, width: "92vw", display: "flex", flexDirection: "column" }}
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
          />
          <ManagedList
            title="Expense categories"
            items={config.expenseCategories}
            usage={usage.cat}
            onAdd={(n) => onAddCategory("expense", n)}
            onRename={onRenameCategory}
            onDelete={onDeleteCategory}
          />
          <ManagedList
            title="Income categories"
            items={config.incomeCategories}
            usage={usage.cat}
            onAdd={(n) => onAddCategory("income", n)}
            onRename={onRenameCategory}
            onDelete={onDeleteCategory}
          />
        </div>
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
  const amount = profile && profile.normalizeAmount
    ? profile.normalizeAmount(rawAmount)
    : (parseFloat(String(rawAmount).replace(/[$,]/g, "")) || 0);
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

  const row = {
    id: uid(),
    date,
    description: val("description"),
    amount,
    category: matchOption(val("category"), CATEGORIES, "Other"),
    account,
  };
  // Keep the raw source category (e.g. from Credit Karma) for auditing the
  // category-mapping decisions. Optional — only present when the column maps.
  const ckCategory = mapping.ckCategory ? val("ckCategory") : "";
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

// Flag duplicates in a batch of built rows against existing transactions and
// against earlier rows in the same batch. Hybrid key: when both sides carry a
// source id, compare by id (so two genuinely distinct but identical-looking
// purchases are never merged); otherwise compare by content fingerprint.
function markDuplicates(rows, existing) {
  const idSet = new Set();
  const fpNoId = new Set();
  const fpAll = new Set();
  const remember = (t) => {
    const fp = txnFingerprint(t);
    fpAll.add(fp);
    if (t.sourceId) idSet.add(t.sourceId);
    else fpNoId.add(fp);
  };
  for (const t of existing) remember(t);
  return rows.map((r) => {
    const dup = r.sourceId
      ? idSet.has(r.sourceId) || fpNoId.has(txnFingerprint(r))
      : fpAll.has(txnFingerprint(r));
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

  const csvRows = useMemo(() => {
    if (rawRows.length === 0) return [];
    return rawRows.map((r) => buildRow(r, mapping, profile, accountMap)).filter(Boolean);
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
    { id: "ck", title: "Credit Karma", desc: "Arquivo do export (bookmarklet / Scriptable). Mapeamento e sinal automáticos, pendentes já excluídos." },
    { id: "csv", title: "CSV", desc: "Planilha genérica com mapeamento manual de colunas. Para importar o histórico antigo." },
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
          {fileName || "Escolher arquivo ou arrastar aqui"}
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
              {csvRows.length} rows · <span style={{ color: "#cbd5e1" }}>{selectedCount} selected</span>
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

// Classify a source account/card value into a canonical account name.
// Tries an exact (normalized) match first, then the alias keyword table.
// Returns "" when nothing matches — we deliberately do NOT guess an account,
// so unrecognized rows surface as unmapped instead of hiding under ATT Reward.
function matchAccount(rawValue) {
  const n = normAccount(rawValue);
  if (!n) return "";
  const exact = ACCOUNTS.find((a) => normAccount(a) === n);
  if (exact) return exact;
  for (const [account, aliases] of ACCOUNT_ALIASES) {
    if (aliases.some((al) => n.includes(al))) return account;
  }
  return "";
}

// Resolve a transaction's account. The user-maintained map keyed on the source
// account's stable URN wins (it can tell apart cards the source labels the same,
// e.g. five Chase "CREDIT CARD"s); otherwise fall back to the alias matcher.
function classifyAccount(rawAccount, accountUrn, accountMap) {
  if (accountUrn && accountMap && accountMap[accountUrn]) return accountMap[accountUrn];
  return matchAccount(rawAccount);
}

// ===========================================================================
// Analyze tab — 4 sections
// ===========================================================================

// Expense categories only (no income, no transfer)
// ---- Section 2: Trends — line chart top-5 + stacked bars + comparison table

function Trends({ transactions, hideValues, money }) {
  const fmtAxis = (v) => (hideValues ? "" : `$${Math.round(v)}`);

  // Build byMonth data for all expense categories (last 12 months)
  const { months, top5, stackedData, comparisonData } = useMemo(() => {
    // Gather all expense amounts by month+category
    const monthCatMap = new Map(); // "YYYY-MM" -> { [cat]: amount }
    const catTotals = new Map(); // cat -> total across all months

    for (const t of transactions) {
      if (isTransfer(t.category) || isIncome(t.category)) continue;
      const mk = monthKey(t.date);
      if (!mk) continue;
      const amt = Number(t.amount) || 0; // signed: refunds reduce the category
      const entry = monthCatMap.get(mk) || {};
      entry[t.category] = (entry[t.category] || 0) + amt;
      monthCatMap.set(mk, entry);
      catTotals.set(t.category, (catTotals.get(t.category) || 0) + amt);
    }

    // Sort months, keep last 12
    const allMonths = [...monthCatMap.keys()].sort().slice(-12);

    // Top-5 expense categories by total volume
    const sorted = [...catTotals.entries()].sort((a, b) => b[1] - a[1]);
    const top5cats = sorted.slice(0, 5).map(([c]) => c);

    // Data for the line chart (top 5)
    const lineData = allMonths.map((mk) => {
      const entry = monthCatMap.get(mk) || {};
      const point = { month: mk };
      for (const c of top5cats) point[c] = entry[c] || 0;
      return point;
    });

    // Data for stacked bar (all categories)
    const allCats = [...catTotals.keys()];
    const stackData = allMonths.map((mk) => {
      const entry = monthCatMap.get(mk) || {};
      const point = { month: mk };
      for (const c of allCats) point[c] = entry[c] || 0;
      return point;
    });

    // Comparison: current vs previous month
    const now = todayISO().slice(0, 7);
    const prevMonthDate = new Date(now + "-01");
    prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
    const prev = prevMonthDate.toISOString().slice(0, 7);

    const currData = monthCatMap.get(now) || {};
    const prevData = monthCatMap.get(prev) || {};
    const compCats = new Set([...Object.keys(currData), ...Object.keys(prevData)]);
    const compRows = [...compCats]
      .map((c) => {
        const curr = currData[c] || 0;
        const p = prevData[c] || 0;
        const delta = curr - p;
        const pct = p > 0 ? (delta / p) * 100 : curr > 0 ? 100 : 0;
        return { cat: c, curr, prev: p, delta, pct };
      })
      .sort((a, b) => b.curr - a.curr);

    return {
      months: allMonths,
      top5: { cats: top5cats, data: lineData },
      stackedData: { cats: allCats, data: stackData },
      comparisonData: { now, prev, rows: compRows },
    };
  }, [transactions]);

  if (months.length === 0) return <Empty>Not enough data for trend analysis.</Empty>;

  const lineColors = ["#60a5fa", "#f87171", "#34d399", "#fbbf24", "#a78bfa"];

  return (
    <>
      {/* Line chart: top 5 expense categories */}
      {top5.cats.length > 0 && (
        <>
          <div style={S.sectionSubtitle}>Top 5 Categories — Monthly Trend</div>
          <div style={{ ...S.card, height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={top5.data} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#8b94a3", fontSize: 10 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis
                  tick={{ fill: "#8b94a3", fontSize: 10 }}
                  tickFormatter={fmtAxis}
                  width={44}
                />
                {!hideValues && <Tooltip formatter={(v) => usd.format(v)} />}
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {top5.cats.map((c, i) => (
                  <Line
                    key={c}
                    type="monotone"
                    dataKey={c}
                    stroke={lineColors[i % lineColors.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Stacked bar: category composition by month */}
      {stackedData.cats.length > 0 && (
        <>
          <div style={S.sectionSubtitle}>Monthly Expense Mix</div>
          <div style={{ ...S.card, height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stackedData.data}
                margin={{ top: 8, right: 8, left: 4, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#8b94a3", fontSize: 10 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis
                  tick={{ fill: "#8b94a3", fontSize: 10 }}
                  tickFormatter={fmtAxis}
                  width={44}
                />
                {!hideValues && <Tooltip formatter={(v) => usd.format(v)} />}
                {stackedData.cats.map((c, i) => (
                  <Bar
                    key={c}
                    dataKey={c}
                    stackId="a"
                    fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Comparison table */}
      <div style={S.sectionSubtitle}>
        {comparisonData.now} vs {comparisonData.prev}
      </div>
      {comparisonData.rows.length === 0 ? (
        <Empty>No expenses in either month.</Empty>
      ) : (
        <div style={{ ...S.card, overflowX: "auto", padding: 0 }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Category</th>
                <th style={{ ...S.th, textAlign: "right" }}>This month</th>
                <th style={{ ...S.th, textAlign: "right" }}>Prev month</th>
                <th style={{ ...S.th, textAlign: "right" }}>Delta $</th>
                <th style={{ ...S.th, textAlign: "right" }}>Delta %</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.rows.map((r) => (
                <tr key={r.cat}>
                  <td style={S.td}>{r.cat}</td>
                  <td style={{ ...S.td, textAlign: "right", color: "#e5e7eb" }}>{money(r.curr)}</td>
                  <td style={{ ...S.td, textAlign: "right", color: "#8b94a3" }}>{money(r.prev)}</td>
                  <td
                    style={{
                      ...S.td,
                      textAlign: "right",
                      color: r.delta > 0 ? "#f87171" : r.delta < 0 ? "#34d399" : "#8b94a3",
                    }}
                  >
                    {r.delta > 0 ? "+" : ""}
                    {money(r.delta)}
                  </td>
                  <td
                    style={{
                      ...S.td,
                      textAlign: "right",
                      color: r.delta > 0 ? "#f87171" : r.delta < 0 ? "#34d399" : "#8b94a3",
                    }}
                  >
                    {r.pct === 0 ? "—" : `${r.delta > 0 ? "+" : ""}${r.pct.toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---- Section 3: Budgets ----------------------------------------------------

function Budgets({ transactions, budgets, onUpdateBudget, budgetSaving, money, config }) {
  // Current month expenses by expense category
  const currentMK = todayISO().slice(0, 7);

  const spendMap = useMemo(() => {
    const map = {};
    for (const t of transactions) {
      if (isTransfer(t.category) || isIncome(t.category)) continue;
      const mk = monthKey(t.date);
      if (mk !== currentMK) continue;
      const amt = Number(t.amount) || 0; // signed: refunds reduce spend vs budget
      map[t.category] = (map[t.category] || 0) + amt;
    }
    return map;
  }, [transactions, currentMK]);

  // Categories that either have a budget or have spending
  const activeCats = useMemo(() => {
    const cats = new Set([
      ...EXPENSE_CATEGORIES.filter((c) => budgets[c] > 0),
      ...Object.keys(spendMap),
    ]);
    return EXPENSE_CATEGORIES.filter((c) => cats.has(c));
  }, [budgets, spendMap, config]);

  // Over-budget categories
  const overBudget = useMemo(
    () =>
      activeCats.filter((c) => {
        const limit = budgets[c] || 0;
        return limit > 0 && (spendMap[c] || 0) >= limit;
      }),
    [activeCats, budgets, spendMap]
  );

  const [editCat, setEditCat] = useState(null);
  const [editVal, setEditVal] = useState("");

  const startEdit = (cat) => {
    setEditCat(cat);
    setEditVal(budgets[cat] ? String(budgets[cat]) : "");
  };

  const commitEdit = () => {
    if (editCat === null) return;
    const v = parseFloat(editVal);
    onUpdateBudget(editCat, Number.isFinite(v) && v > 0 ? v : 0);
    setEditCat(null);
    setEditVal("");
  };

  return (
    <>
      {overBudget.length > 0 && (
        <div style={S.alertBanner}>
          <span style={{ fontWeight: 600 }}>Budget exceeded:</span>{" "}
          {overBudget.join(", ")}
        </div>
      )}

      {budgetSaving && (
        <div style={{ fontSize: 11, color: "#8b94a3", textAlign: "right" }}>
          Saving budgets…
        </div>
      )}

      {/* All expense categories — show budget editor */}
      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        {EXPENSE_CATEGORIES.map((cat, idx) => {
          const limit = budgets[cat] || 0;
          const spent = spendMap[cat] || 0;
          // Clamp to 0–100: a category net-refunded below zero shows an empty bar.
          const pct = limit > 0 ? Math.max(0, Math.min((spent / limit) * 100, 100)) : 0;
          const barColor =
            pct >= 100 ? "#f87171" : pct >= 80 ? "#fbbf24" : "#34d399";
          const isEditing = editCat === cat;

          const dotColor = catDotColor(cat);
          return (
            <div
              key={cat}
              style={{
                ...S.budgetRow,
                borderTop: idx > 0 ? "1px solid #1a1f28" : "none",
                gap: 12,
              }}
            >
              {/* Category color dot */}
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: `${dotColor}1a`,
                border: `1px solid ${dotColor}30`,
                display: "grid", placeItems: "center",
                color: dotColor, fontSize: 11, fontWeight: 700,
              }}>
                {cat[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: limit > 0 ? 6 : 2,
                  }}
                >
                  <span style={{ fontSize: 13, color: "#e5e7eb", fontWeight: 500 }}>
                    {cat}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {limit > 0 && pct >= 80 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: barColor, textTransform: "uppercase", letterSpacing: 0.4 }}>
                        {pct >= 100 ? "Over" : `${Math.round(pct)}%`}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: "#8b94a3", whiteSpace: "nowrap" }}>
                      {money(spent)}
                      {limit > 0 ? ` / ${money(limit)}` : ""}
                    </span>
                  </div>
                </div>

                {/* Progress bar (only shown when limit is set) */}
                {limit > 0 && (
                  <div style={S.progressTrack}>
                    <div
                      style={{
                        ...S.progressBar,
                        width: `${pct}%`,
                        background: barColor,
                        boxShadow: pct >= 80 ? `0 0 6px ${barColor}60` : undefined,
                      }}
                    />
                  </div>
                )}

                {/* Inline budget editor */}
                {isEditing ? (
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <input
                      autoFocus
                      type="number"
                      inputMode="decimal"
                      step="1"
                      min="0"
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      placeholder="Monthly limit"
                      style={{ ...S.input, padding: "8px 10px", fontSize: 13 }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") setEditCat(null);
                      }}
                    />
                    <button
                      onClick={commitEdit}
                      style={{ ...S.primaryBtn, width: "auto", padding: "8px 14px", fontSize: 13 }}
                    >
                      Set
                    </button>
                    <button
                      onClick={() => setEditCat(null)}
                      style={{ ...S.secondaryBtn, width: "auto", padding: "8px 10px", fontSize: 13 }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(cat)}
                    style={{
                      ...S.linkBtn,
                      fontSize: 11,
                      marginTop: 4,
                      display: "inline-block",
                    }}
                  >
                    {limit > 0 ? "Edit limit" : "Set limit"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---- Section 4: Recurring / subscriptions ----------------------------------

function Recurrents({ transactions, money }) {
  const recurrents = useMemo(() => {
    // Group expense (non-income, non-transfer) by normalized description
    const groups = new Map(); // normalizedDesc -> [txn, ...]

    for (const t of transactions) {
      if (isTransfer(t.category) || isIncome(t.category)) continue;
      const key = (t.description || "").trim().toLowerCase();
      if (!key) continue;
      const arr = groups.get(key) || [];
      arr.push(t);
      groups.set(key, arr);
    }

    const results = [];

    for (const [, txns] of groups) {
      // Must appear in 2+ distinct months
      const months = new Set(txns.map((t) => monthKey(t.date)));
      if (months.size < 2) continue;

      // Signed amounts so a refund (negative) doesn't cluster with the charge.
      const amounts = txns.map((t) => Number(t.amount) || 0).sort((a, b) => a - b);
      const mid = Math.floor(amounts.length / 2);
      const median =
        amounts.length % 2 === 0
          ? (amounts[mid - 1] + amounts[mid]) / 2
          : amounts[mid];

      if (median === 0) continue;

      // Filter to amounts within ±10% of median
      const inRange = txns.filter((t) => {
        const a = Number(t.amount) || 0;
        return Math.abs(a - median) / Math.abs(median) <= 0.1;
      });

      // Still need 2+ distinct months after filtering
      const filteredMonths = new Set(inRange.map((t) => monthKey(t.date)));
      if (filteredMonths.size < 2) continue;

      const lastMonth = [...filteredMonths].sort().at(-1);
      const lastTxn = inRange
        .filter((t) => monthKey(t.date) === lastMonth)
        .sort((a, b) => (a.date < b.date ? 1 : -1))[0];

      results.push({
        description: (txns[0].description || "").trim(),
        amount: median,
        account: lastTxn?.account || txns[0].account || "",
        months: filteredMonths.size,
        lastMonth,
      });
    }

    // Sort by amount descending
    return results.sort((a, b) => b.amount - a.amount);
  }, [transactions]);

  if (recurrents.length === 0)
    return (
      <Empty>
        No recurring transactions detected yet. They appear when the same
        description occurs in 2+ months with a consistent amount.
      </Empty>
    );

  return (
    <div style={S.list}>
      {recurrents.map((r) => (
        <div key={r.description} style={S.txnRow}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                color: "#e5e7eb",
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {r.description}
            </div>
            <div style={{ fontSize: 11, color: "#8b94a3", marginTop: 2 }}>
              {r.account} · {r.months} months · last {r.lastMonth}
            </div>
          </div>
          <span style={{ fontWeight: 600, fontSize: 14, color: "#f87171", whiteSpace: "nowrap" }}>
            {money(r.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---- Analyze (container) ---------------------------------------------------

function Analyze({ transactions, money, hideValues, budgets, onUpdateBudget, budgetSaving, config }) {
  return (
    <div style={S.col}>
      <h2 style={{ margin: "4px 0 0", fontSize: 16, color: "#e5e7eb", fontWeight: 600 }}>
        Analyze
      </h2>

      {/* ---- Section 1: Trends ---- */}
      <h3 style={{ ...S.sectionTitle, marginTop: 8 }}>Trends</h3>
      <Trends
        transactions={transactions}
        money={money}
        hideValues={hideValues}
      />

      {/* ---- Section 3: Budgets ---- */}
      <h3 style={{ ...S.sectionTitle, marginTop: 8 }}>
        Budgets — {todayISO().slice(0, 7)}
      </h3>
      <Budgets
        transactions={transactions}
        budgets={budgets}
        onUpdateBudget={onUpdateBudget}
        budgetSaving={budgetSaving}
        money={money}
        config={config}
      />

      {/* ---- Section 4: Recurrents ---- */}
      <h3 style={{ ...S.sectionTitle, marginTop: 8 }}>Recurring / Subscriptions</h3>
      <Recurrents transactions={transactions} money={money} />
    </div>
  );
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
    // On-device measurement: 100dvh/svh = 812pt (the safe layout viewport),
    // but 100vh/100lvh = 874pt = the FULL physical screen. Use 100lvh so the
    // shell spans the whole screen; the tab bar (last flex child) then sits on
    // the physical bottom and its env(safe-area-inset-bottom) padding keeps the
    // icons above the home indicator.
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    height: "100lvh",
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
  // The Transactions tab fills the scroller and splits into a fixed controls
  // block (capped at half) and a list that scrolls in the remaining space.
  txnTab: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
  },
  txnControls: {
    flex: "0 1 auto",
    maxHeight: "50%",
    overflowY: "auto",
    background: "#0b0d10",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingBottom: 8,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  txnListScroll: {
    flex: "1 1 0",
    minHeight: 0,
    overflowY: "auto",
    paddingTop: 10,
  },
  cardRow: { display: "flex", gap: 12 },
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
  // Analyze tab
  sectionSubtitle: {
    fontSize: 13,
    color: "#8b94a3",
    fontWeight: 600,
    margin: "4px 0 0",
  },
  alertBanner: {
    background: "#3b0d0d",
    color: "#fca5a5",
    border: "1px solid #7f1d1d",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13,
  },
  budgetRow: {
    padding: "12px 14px",
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  },
  progressTrack: {
    height: 8,
    background: "#1f242c",
    borderRadius: 6,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 6,
    transition: "width 0.4s ease",
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
};
