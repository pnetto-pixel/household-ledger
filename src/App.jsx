import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard,
  PieChart as PieIcon,
  List,
  Upload,
  Eye,
  EyeOff,
  Trash2,
  Pencil,
  Search,
  X,
  LogOut,
  RefreshCw,
  TrendingUp,
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

const INCOME_CATEGORIES = ["Salary", "Bonus", "Bela Income", "Other Income"];
const TRANSFER_CATEGORY = "Transfer";

const CATEGORIES = [
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
  "Salary",
  "Bonus",
  "Bela Income",
  "Other Income",
  "Transfer",
];

const ACCOUNTS = [
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

// ---------------------------------------------------------------------------
// Bank import profiles
// ---------------------------------------------------------------------------

const BANK_PROFILES = [
  {
    id: 'generic',
    label: 'Generic (manual mapping)',
    group: null,
    format: 'csv',
    columnMap: null,
    defaultAccount: '',
    normalizeAmount: null,
  },
  {
    id: 'chase-bela',
    label: 'Chase Bela',
    group: 'Chase',
    format: 'csv',
    columnMap: { date: 'Transaction Date', description: 'Description', amount: 'Amount', category: 'Category', account: null },
    defaultAccount: 'Chase Bela',
    normalizeAmount: (raw) => Math.abs(parseFloat(String(raw).replace(/[$,]/g, '')) || 0),
  },
  {
    id: 'chase-preferred',
    label: 'Chase Preferred',
    group: 'Chase',
    format: 'csv',
    columnMap: { date: 'Transaction Date', description: 'Description', amount: 'Amount', category: 'Category', account: null },
    defaultAccount: 'Chase Preferred',
    normalizeAmount: (raw) => Math.abs(parseFloat(String(raw).replace(/[$,]/g, '')) || 0),
  },
  {
    id: 'chase-reserve',
    label: 'Chase Reserve',
    group: 'Chase',
    format: 'csv',
    columnMap: { date: 'Transaction Date', description: 'Description', amount: 'Amount', category: 'Category', account: null },
    defaultAccount: 'Chase Reserve',
    normalizeAmount: (raw) => Math.abs(parseFloat(String(raw).replace(/[$,]/g, '')) || 0),
  },
  {
    id: 'ink-biz-cash',
    label: 'Ink Biz Cash',
    group: 'Chase',
    format: 'csv',
    columnMap: { date: 'Transaction Date', description: 'Description', amount: 'Amount', category: 'Category', account: null },
    defaultAccount: 'Ink Biz Cash',
    normalizeAmount: (raw) => Math.abs(parseFloat(String(raw).replace(/[$,]/g, '')) || 0),
  },
  {
    id: 'ink-unlimited',
    label: 'Ink Unlimited',
    group: 'Chase',
    format: 'csv',
    columnMap: { date: 'Transaction Date', description: 'Description', amount: 'Amount', category: 'Category', account: null },
    defaultAccount: 'Ink Unlimited',
    normalizeAmount: (raw) => Math.abs(parseFloat(String(raw).replace(/[$,]/g, '')) || 0),
  },
  {
    id: 'chase-ofx',
    label: 'Chase (OFX/QFX)',
    group: 'Chase',
    format: 'ofx',
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

  if (!authed) {
    return <Login onAuthed={() => setAuthed(true)} />;
  }

  return (
    <div style={S.app}>
      <Header
        hideValues={hideValues}
        onToggleHide={toggleHide}
        onRefresh={load}
        onLogout={logout}
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
        ) : tab === "charts" ? (
          <Charts transactions={transactions} hideValues={hideValues} />
        ) : tab === "transactions" ? (
          <Transactions
            transactions={transactions}
            money={money}
            hideValues={hideValues}
            onDelete={deleteTransaction}
            onUpdate={updateTransaction}
          />
        ) : tab === "import" ? (
          <ImportTransactions onImport={addTransactions} />
        ) : (
          <Analyze
            transactions={transactions}
            money={money}
            hideValues={hideValues}
            budgets={budgets}
            onUpdateBudget={updateBudget}
            budgetSaving={budgetSaving}
          />
        )}
      </main>

      <TabBar tab={tab} setTab={setTab} />
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
      <span style={{ fontSize: 11, color: "#fbbf24", display: "flex", alignItems: "center", gap: 3 }}>
        <span>↻</span>
        <span>Offline</span>
      </span>
    );
  }
  if (saveError) {
    return (
      <span style={{ fontSize: 11, color: "#f87171", display: "flex", alignItems: "center", gap: 3 }}>
        <span>✕</span>
        <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Save failed
        </span>
      </span>
    );
  }
  if (saving) {
    return (
      <span style={{ fontSize: 11, color: "#8b94a3", display: "flex", alignItems: "center", gap: 3 }}>
        <span style={{ display: "inline-block", animation: "hl-spin 1s linear infinite" }}>·</span>
        <span>saving…</span>
      </span>
    );
  }
  if (dirty && !saving) {
    return (
      <span style={{ fontSize: 11, color: "#fbbf24", display: "flex", alignItems: "center", gap: 3 }}>
        <span>●</span>
        <span>unsaved…</span>
      </span>
    );
  }
  if (savedAt && !dirty && !saving && !saveError) {
    const timeStr = new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return (
      <span style={{ fontSize: 11, color: "#34d399", display: "flex", alignItems: "center", gap: 3 }}>
        <span>✓</span>
        <span>saved {timeStr}</span>
      </span>
    );
  }
  return null;
}

function Header({ hideValues, onToggleHide, onRefresh, onLogout, saving, savedAt, dirty, saveError }) {
  return (
    <header style={S.header}>
      <style>{`@keyframes hl-spin { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 17 }}>Household Ledger</span>
        <SaveIndicator saving={saving} dirty={dirty} savedAt={savedAt} saveError={saveError} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <IconButton onClick={onRefresh} title="Refresh">
          <RefreshCw size={18} />
        </IconButton>
        <IconButton onClick={onToggleHide} title={hideValues ? "Show values" : "Hide values"}>
          {hideValues ? <EyeOff size={18} /> : <Eye size={18} />}
        </IconButton>
        <IconButton onClick={onLogout} title="Log out">
          <LogOut size={18} />
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
        padding: 8,
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
  { id: "charts", label: "Charts", Icon: PieIcon },
  { id: "transactions", label: "Txns", Icon: List },
  { id: "import", label: "Import", Icon: Upload },
  { id: "analyze", label: "Analyze", Icon: TrendingUp },
];

function TabBar({ tab, setTab }) {
  return (
    <nav style={S.tabBar}>
      {TABS.map(({ id, label, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              ...S.tabBtn,
              color: active ? "#60a5fa" : "#8b94a3",
            }}
          >
            <Icon size={22} />
            <span style={{ fontSize: 10, marginTop: 2 }}>{label}</span>
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
    const amt = Math.abs(Number(t.amount) || 0);
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

  return (
    <div style={S.col}>
      <div style={S.cardRow}>
        <StatCard label="Net Balance" value={money(all.net)} accent={all.net >= 0 ? "#34d399" : "#f87171"} />
      </div>
      <div style={S.cardRow}>
        <StatCard label="Total Income" value={money(all.income)} accent="#34d399" />
        <StatCard label="Total Expenses" value={money(all.expenses)} accent="#f87171" />
      </div>

      <h3 style={S.sectionTitle}>{periodLabel(year, month)}</h3>
      <PeriodFilter year={year} month={month} setYear={setYear} setMonth={setMonth} years={years} />
      <div style={S.cardRow}>
        <StatCard label="Income" value={money(period.income)} accent="#34d399" small />
        <StatCard label="Expenses" value={money(period.expenses)} accent="#f87171" small />
        <StatCard
          label="Net"
          value={money(period.net)}
          accent={period.net >= 0 ? "#34d399" : "#f87171"}
          small
        />
      </div>

      <h3 style={S.sectionTitle}>Recent</h3>
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
    <div style={{ ...S.card, flex: 1 }}>
      <div style={{ color: "#8b94a3", fontSize: small ? 11 : 13 }}>{label}</div>
      <div style={{ color: accent || "#e5e7eb", fontWeight: 700, fontSize: small ? 16 : 22, marginTop: 4 }}>
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
      const amt = Math.abs(Number(t.amount) || 0);
      map.set(t.category, (map.get(t.category) || 0) + amt);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [scoped]);

  const byMonth = useMemo(() => {
    const map = new Map();
    for (const t of scoped) {
      if (isTransfer(t.category)) continue;
      const mk = monthKey(t.date);
      if (!mk) continue;
      const entry = map.get(mk) || { month: mk, income: 0, expenses: 0 };
      const amt = Math.abs(Number(t.amount) || 0);
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
      <h2 style={{ margin: "4px 0 0", fontSize: 16, color: "#e5e7eb", fontWeight: 600 }}>{label}</h2>
      <PeriodFilter year={year} month={month} setYear={setYear} setMonth={setMonth} years={years} />
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

// ===========================================================================
// Transactions list
// ===========================================================================

function Transactions({ transactions, money, hideValues, onDelete, onUpdate }) {
  const [catFilter, setCatFilter] = useState("All");
  const [acctFilter, setAcctFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("All");
  const [month, setMonth] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState(null);

  const years = useMemo(() => availableYears(transactions), [transactions]);

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

  const handleExportJSON = (filteredArr) => {
    const rows = exportRows(filteredArr);
    const json = JSON.stringify(rows, null, 2);
    triggerDownload(new Blob([json], { type: "application/json" }), "household-transactions.json");
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...transactions]
      .filter((t) => (catFilter === "All" ? true : t.category === catFilter))
      .filter((t) => (acctFilter === "All" ? true : t.account === acctFilter))
      .filter((t) => matchPeriod(t.date, year, month))
      .filter((t) => (from ? (t.date || "") >= from : true))
      .filter((t) => (to ? (t.date || "") <= to : true))
      .filter((t) =>
        q
          ? `${t.description || ""} ${t.category || ""} ${t.account || ""}`
              .toLowerCase()
              .includes(q)
          : true
      )
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [transactions, catFilter, acctFilter, query, year, month, from, to]);

  const hasFilters =
    catFilter !== "All" ||
    acctFilter !== "All" ||
    query ||
    year !== "All" ||
    month !== "All" ||
    from ||
    to;

  const clearFilters = () => {
    setCatFilter("All");
    setAcctFilter("All");
    setQuery("");
    setYear("All");
    setMonth("All");
    setFrom("");
    setTo("");
  };

  return (
    <div style={S.col}>
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

      <div style={{ display: "flex", gap: 8 }}>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={S.select}>
          <option>All</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={acctFilter} onChange={(e) => setAcctFilter(e.target.value)} style={S.select}>
          <option>All</option>
          {ACCOUNTS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>

      <PeriodFilter year={year} month={month} setYear={setYear} setMonth={setMonth} years={years} />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Field label="From" style={{ flex: 1 }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={S.input} />
        </Field>
        <Field label="To" style={{ flex: 1 }}>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={S.input} />
        </Field>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ color: "#8b94a3", fontSize: 12 }}>{filtered.length} transaction(s)</div>
          {hasFilters ? (
            <button onClick={clearFilters} style={S.linkBtn}>
              Clear filters
            </button>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => handleExportCSV(filtered)}
            disabled={hideValues}
            title={hideValues ? "Show values to export" : "Export CSV"}
            style={{
              background: "#1e2328",
              border: "1px solid #3a3f4a",
              color: "#e0e6f0",
              borderRadius: 6,
              padding: "6px 14px",
              cursor: hideValues ? "not-allowed" : "pointer",
              fontSize: 13,
              opacity: hideValues ? 0.4 : 1,
            }}
          >
            CSV
          </button>
          <button
            onClick={() => handleExportJSON(filtered)}
            disabled={hideValues}
            title={hideValues ? "Show values to export" : "Export JSON"}
            style={{
              background: "#1e2328",
              border: "1px solid #3a3f4a",
              color: "#e0e6f0",
              borderRadius: 6,
              padding: "6px 14px",
              cursor: hideValues ? "not-allowed" : "pointer",
              fontSize: 13,
              opacity: hideValues ? 0.4 : 1,
            }}
          >
            JSON
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty>{hasFilters ? "No transactions match your filters." : "Nothing here."}</Empty>
      ) : (
        <div style={S.list}>
          {filtered.map((t) => (
            <TxnRow key={t.id} t={t} money={money} onDelete={onDelete} onEdit={setEditing} />
          ))}
        </div>
      )}

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

function TxnRow({ t, money, onDelete, onEdit }) {
  const income = isIncome(t.category);
  const transfer = isTransfer(t.category);
  const color = transfer ? "#8b94a3" : income ? "#34d399" : "#f87171";
  const sign = transfer ? "" : income ? "+" : "−";
  const amt = Math.abs(Number(t.amount) || 0);
  return (
    <div style={S.txnRow}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t.description || t.category}
        </div>
        <div style={{ fontSize: 11, color: "#8b94a3", marginTop: 2 }}>
          {t.date} · {t.category}
          {t.account ? ` · ${t.account}` : ""}
        </div>
      </div>
      <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color, fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>
          {sign}
          {money(amt)}
        </span>
        {onEdit ? (
          <button onClick={() => onEdit(t)} style={S.deleteBtn} title="Edit">
            <Pencil size={15} />
          </button>
        ) : null}
        {onDelete ? (
          <button onClick={() => onDelete(t.id)} style={S.deleteBtn} title="Delete">
            <Trash2 size={15} />
          </button>
        ) : null}
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
  const [amount, setAmount] = useState(String(Math.abs(Number(txn.amount) || 0)));
  const [category, setCategory] = useState(
    CATEGORIES.includes(txn.category) ? txn.category : "Other"
  );
  const [account, setAccount] = useState(
    ACCOUNTS.includes(txn.account) ? txn.account : ACCOUNTS[0]
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
      amount: Math.abs(amt),
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
          </Field>
          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={S.input}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Account">
            <select value={account} onChange={(e) => setAccount(e.target.value)} style={S.input}>
              {ACCOUNTS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Field>
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
function buildRow(raw, mapping, profile) {
  const val = (key) => {
    const col = mapping[key];
    return col ? String(raw[col] ?? "").trim() : "";
  };

  const rawAmount = val("amount");
  const amount = profile && profile.normalizeAmount
    ? profile.normalizeAmount(rawAmount)
    : Math.abs(parseFloat(String(rawAmount).replace(/[$,]/g, "")) || 0);
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
  const account = rawAccount
    ? matchOption(rawAccount, ACCOUNTS, profile?.defaultAccount || ACCOUNTS[0])
    : (profile?.defaultAccount || ACCOUNTS[0]);

  return {
    id: uid(),
    date,
    description: val("description"),
    amount,
    category: matchOption(val("category"), CATEGORIES, "Other"),
    account,
  };
}

// Parse OFX/QFX text format into canonical transaction objects.
function parseOFX(text) {
  const transactions = [];
  const txnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;
  while ((match = txnRegex.exec(text)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = new RegExp(`<${tag}>([^<\r\n]+)`, 'i').exec(block);
      return m ? m[1].trim() : '';
    };
    const rawDate = get('DTPOSTED') || get('DTUSER');
    // OFX date: YYYYMMDD[HHmmss[...]] -> YYYY-MM-DD
    const date = rawDate.length >= 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : '';
    const rawAmount = get('TRNAMT');
    const amount = Math.abs(parseFloat(rawAmount) || 0);
    const description = get('NAME') || get('MEMO') || '';
    if (date && amount > 0) {
      transactions.push({ date, description, amount, category: 'Other', account: '' });
    }
  }
  return transactions;
}

function ImportTransactions({ onImport }) {
  const [profileId, setProfileId] = useState('generic');
  const profile = BANK_PROFILES.find((p) => p.id === profileId) || BANK_PROFILES[0];

  // CSV state
  const [rawRows, setRawRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});

  // OFX state — parsed rows already in canonical form
  const [ofxRows, setOfxRows] = useState([]);

  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  // When profile changes, reset everything.
  const resetAll = () => {
    setRawRows([]);
    setHeaders([]);
    setMapping({});
    setOfxRows([]);
    setError("");
    setDone("");
  };

  // Auto-apply column mapping whenever rows/headers/profile change.
  useEffect(() => {
    if (!rawRows.length || !headers.length) return;
    if (profile.columnMap) {
      // Profile with fixed mapping: apply directly, only for headers that exist.
      const auto = {};
      for (const [field, col] of Object.entries(profile.columnMap)) {
        if (col && headers.includes(col)) auto[field] = col;
      }
      setMapping((prev) => ({ ...auto, ...prev }));
    } else {
      setMapping(guessMapping(headers));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, headers, profileId]);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setDone("");
    setRawRows([]);
    setHeaders([]);
    setMapping({});
    setOfxRows([]);

    if (profile.format === 'ofx') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = parseOFX(ev.target.result);
          if (parsed.length === 0) {
            setError("No transactions found in this OFX/QFX file.");
            return;
          }
          // Apply defaultAccount if the profile has one.
          const withAccount = parsed.map((t) => ({
            ...t,
            id: uid(),
            account: profile.defaultAccount || t.account,
          }));
          setOfxRows(withAccount);
        } catch (err) {
          setError("Failed to parse OFX/QFX file: " + err.message);
        }
      };
      reader.onerror = () => setError("Could not read file.");
      reader.readAsText(file);
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const cols = (result.meta?.fields || []).filter(Boolean);
          if (cols.length === 0) {
            setError("No columns detected in this CSV.");
            return;
          }
          setHeaders(cols);
          setRawRows(result.data);
        },
        error: (err) => setError(err.message),
      });
    }
  };

  // Live preview for CSV: reflect current column mapping.
  const csvRows = useMemo(() => {
    if (rawRows.length === 0) return [];
    return rawRows.map((r) => buildRow(r, mapping, profile)).filter(Boolean);
  }, [rawRows, mapping, profile]);

  // All ready rows: OFX or CSV depending on format.
  const rows = profile.format === 'ofx' ? ofxRows : csvRows;

  const missingRequired = profile.format === 'ofx'
    ? []
    : IMPORT_FIELDS.filter((f) => f.required && !mapping[f.key]);

  const setColumn = (key, col) => setMapping((prev) => ({ ...prev, [key]: col }));

  const confirm = () => {
    if (rows.length === 0 || missingRequired.length > 0) return;
    onImport(rows);
    setDone(`Imported ${rows.length} transactions.`);
    resetAll();
  };

  const hasData = profile.format === 'ofx' ? ofxRows.length > 0 : headers.length > 0;

  return (
    <div style={S.col}>
      <h3 style={S.sectionTitle}>Import</h3>
      <p style={{ color: "#8b94a3", fontSize: 13, margin: 0 }}>
        Select your bank to auto-configure column mapping, then upload a file.
      </p>

      {/* Bank / Source selector */}
      <div style={{ marginBottom: 4 }}>
        <label style={{ fontSize: 13, color: "#8892a4", display: "block", marginBottom: 4 }}>
          Bank / Source
        </label>
        <select
          value={profileId}
          onChange={(e) => {
            setProfileId(e.target.value);
            resetAll();
          }}
          style={{ background: "#1e2328", border: "1px solid #3a3f4a", color: "#e0e6f0", borderRadius: 6, padding: "7px 10px", fontSize: 14, width: "100%" }}
        >
          <option value="generic">Generic (manual mapping)</option>
          <optgroup label="Chase">
            {BANK_PROFILES.filter((p) => p.group === 'Chase' && p.format === 'csv').map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </optgroup>
          <optgroup label="Chase (OFX/QFX)">
            {BANK_PROFILES.filter((p) => p.group === 'Chase' && p.format === 'ofx').map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </optgroup>
        </select>
      </div>

      <input
        type="file"
        accept={profile.format === 'ofx' ? '.ofx,.qfx' : '.csv,.tsv,.txt'}
        onChange={onFile}
        style={{ color: "#cbd5e1" }}
      />

      {error ? <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div> : null}
      {done ? <div style={{ color: "#34d399", fontSize: 13 }}>{done}</div> : null}

      {hasData ? (
        <>
          {/* Column mapping — only shown for CSV, not for OFX (fields already parsed) */}
          {profile.format !== 'ofx' && (
            <>
              <h3 style={S.sectionTitle}>Column Mapping</h3>
              <div style={S.col}>
                {IMPORT_FIELDS.map((f) => {
                  const fallbackHint =
                    f.key === "category"
                      ? "— use default: Other —"
                      : f.key === "account"
                      ? `— use default: ${profile.defaultAccount || ACCOUNTS[0]} —`
                      : "— skip —";
                  return (
                    <Field key={f.key} label={f.required ? `${f.label} *` : f.label}>
                      <select
                        value={mapping[f.key] || ""}
                        onChange={(e) => setColumn(f.key, e.target.value)}
                        style={S.input}
                      >
                        <option value="">{f.required ? "— none —" : fallbackHint}</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
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

          <div style={{ color: "#8b94a3", fontSize: 12 }}>
            {rows.length} {profile.format === 'ofx' ? '' : `of ${rawRows.length} `}rows ready
            {rows.length > 50 ? ` · Showing 50 of ${rows.length} rows` : null}
          </div>
          <div style={{ ...S.list, maxHeight: 320, overflowY: "auto" }}>
            {rows.slice(0, 50).map((t) => (
              <div key={t.id} style={S.txnRow}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, color: "#e5e7eb" }}>{t.description || t.category}</div>
                  <div style={{ fontSize: 11, color: "#8b94a3" }}>
                    {t.date} · {t.category} · {t.account}
                  </div>
                </div>
                <span style={{ fontSize: 14, color: "#cbd5e1" }}>{usd.format(t.amount)}</span>
              </div>
            ))}
          </div>
          <button
            onClick={confirm}
            disabled={rows.length === 0 || missingRequired.length > 0}
            style={{
              ...S.primaryBtn,
              opacity: rows.length === 0 || missingRequired.length > 0 ? 0.5 : 1,
              cursor: rows.length === 0 || missingRequired.length > 0 ? "not-allowed" : "pointer",
            }}
          >
            Import {rows.length} transactions
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

// ===========================================================================
// Analyze tab — 4 sections
// ===========================================================================

// Expense categories only (no income, no transfer)
const EXPENSE_CATEGORIES = CATEGORIES.filter(
  (c) => !isIncome(c) && !isTransfer(c)
);

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
      const amt = Math.abs(Number(t.amount) || 0);
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

function Budgets({ transactions, budgets, onUpdateBudget, budgetSaving, money }) {
  // Current month expenses by expense category
  const currentMK = todayISO().slice(0, 7);

  const spendMap = useMemo(() => {
    const map = {};
    for (const t of transactions) {
      if (isTransfer(t.category) || isIncome(t.category)) continue;
      const mk = monthKey(t.date);
      if (mk !== currentMK) continue;
      const amt = Math.abs(Number(t.amount) || 0);
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
  }, [budgets, spendMap]);

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
          const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
          const barColor =
            pct >= 100 ? "#f87171" : pct >= 80 ? "#fbbf24" : "#34d399";
          const isEditing = editCat === cat;

          return (
            <div
              key={cat}
              style={{
                ...S.budgetRow,
                borderTop: idx > 0 ? "1px solid #1f242c" : "none",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 13, color: "#e5e7eb", fontWeight: 500 }}>
                    {cat}
                  </span>
                  <span style={{ fontSize: 12, color: "#8b94a3", whiteSpace: "nowrap", marginLeft: 8 }}>
                    {money(spent)}
                    {limit > 0 ? ` / ${money(limit)}` : ""}
                  </span>
                </div>

                {/* Progress bar (only shown when limit is set) */}
                {limit > 0 && (
                  <div style={S.progressTrack}>
                    <div
                      style={{
                        ...S.progressBar,
                        width: `${pct}%`,
                        background: barColor,
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

      const amounts = txns.map((t) => Math.abs(Number(t.amount) || 0)).sort((a, b) => a - b);
      const mid = Math.floor(amounts.length / 2);
      const median =
        amounts.length % 2 === 0
          ? (amounts[mid - 1] + amounts[mid]) / 2
          : amounts[mid];

      if (median === 0) continue;

      // Filter to amounts within ±10% of median
      const inRange = txns.filter((t) => {
        const a = Math.abs(Number(t.amount) || 0);
        return Math.abs(a - median) / median <= 0.1;
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

function Analyze({ transactions, money, hideValues, budgets, onUpdateBudget, budgetSaving }) {
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

const S = {
  app: {
    minHeight: "100vh",
    background: "#0b0d10",
    color: "#e5e7eb",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    display: "flex",
    flexDirection: "column",
    maxWidth: 560,
    margin: "0 auto",
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    background: "rgba(11,13,16,0.92)",
    backdropFilter: "blur(8px)",
    borderBottom: "1px solid #1a1d23",
  },
  main: {
    flex: 1,
    padding: "16px 16px 92px",
    overflowY: "auto",
  },
  errorBar: {
    background: "#3b0d0d",
    color: "#fca5a5",
    padding: "8px 16px",
    fontSize: 13,
  },
  center: { textAlign: "center", color: "#8b94a3", padding: 40 },
  col: { display: "flex", flexDirection: "column", gap: 14 },
  cardRow: { display: "flex", gap: 12 },
  card: {
    background: "#14171c",
    border: "1px solid #1f242c",
    borderRadius: 14,
    padding: 16,
  },
  sectionTitle: { margin: "8px 0 0", fontSize: 14, color: "#cbd5e1", fontWeight: 600 },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  txnRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    background: "#14171c",
    border: "1px solid #1f242c",
    borderRadius: 12,
    padding: "10px 12px",
  },
  deleteBtn: {
    background: "transparent",
    border: "none",
    color: "#6b7280",
    cursor: "pointer",
    padding: 4,
    display: "grid",
    placeItems: "center",
  },
  tabBar: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    maxWidth: 560,
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-around",
    background: "rgba(11,13,16,0.96)",
    backdropFilter: "blur(8px)",
    borderTop: "1px solid #1a1d23",
    padding: "8px 0 max(8px, env(safe-area-inset-bottom))",
    zIndex: 10,
  },
  tabBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    flex: 1,
    padding: 4,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "#0f1216",
    border: "1px solid #232a33",
    borderRadius: 10,
    padding: "12px 14px",
    color: "#e5e7eb",
    fontSize: 15,
    outline: "none",
  },
  select: {
    flex: 1,
    background: "#0f1216",
    border: "1px solid #232a33",
    borderRadius: 10,
    padding: "10px 12px",
    color: "#e5e7eb",
    fontSize: 14,
  },
  primaryBtn: {
    width: "100%",
    background: "#2563eb",
    border: "none",
    borderRadius: 10,
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
    borderRadius: 10,
    padding: "13px 16px",
    color: "#cbd5e1",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  linkBtn: {
    background: "transparent",
    border: "none",
    color: "#60a5fa",
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
    padding: 12,
  },
  modalCard: {
    width: "100%",
    maxWidth: 536,
    maxHeight: "90vh",
    overflowY: "auto",
    background: "#14171c",
    border: "1px solid #1f242c",
    borderRadius: 16,
    padding: 16,
    marginBottom: "max(12px, env(safe-area-inset-bottom))",
  },
  loginCard: {
    background: "#14171c",
    border: "1px solid #1f242c",
    borderRadius: 16,
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
    height: 6,
    background: "#1f242c",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
    transition: "width 0.3s ease",
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
};
