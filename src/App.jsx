import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard,
  PieChart as PieIcon,
  List,
  PlusCircle,
  Upload,
  Eye,
  EyeOff,
  Trash2,
  Pencil,
  Search,
  X,
  LogOut,
  RefreshCw,
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
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        if (dirty) save(transactions);
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [dirty, transactions, save]);

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
            onDelete={deleteTransaction}
            onUpdate={updateTransaction}
          />
        ) : tab === "add" ? (
          <AddTransaction onAdd={(row) => addTransactions([row])} />
        ) : (
          <ImportTransactions onImport={addTransactions} />
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
  if (saveError) {
    return (
      <span style={{ fontSize: 11, color: "#f87171", display: "flex", alignItems: "center", gap: 3 }}>
        <span>✕</span>
        <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {saveError}
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
  { id: "transactions", label: "Transactions", Icon: List },
  { id: "add", label: "Add", Icon: PlusCircle },
  { id: "import", label: "Import", Icon: Upload },
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

function Transactions({ transactions, money, onDelete, onUpdate }) {
  const [catFilter, setCatFilter] = useState("All");
  const [acctFilter, setAcctFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...transactions]
      .filter((t) => (catFilter === "All" ? true : t.category === catFilter))
      .filter((t) => (acctFilter === "All" ? true : t.account === acctFilter))
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
  }, [transactions, catFilter, acctFilter, query, from, to]);

  const hasFilters =
    catFilter !== "All" || acctFilter !== "All" || query || from || to;

  const clearFilters = () => {
    setCatFilter("All");
    setAcctFilter("All");
    setQuery("");
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

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Field label="From" style={{ flex: 1 }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={S.input} />
        </Field>
        <Field label="To" style={{ flex: 1 }}>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={S.input} />
        </Field>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ color: "#8b94a3", fontSize: 12 }}>{filtered.length} transactions</div>
        {hasFilters ? (
          <button onClick={clearFilters} style={S.linkBtn}>
            Clear filters
          </button>
        ) : null}
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

// ===========================================================================
// Add transaction
// ===========================================================================

function AddTransaction({ onAdd }) {
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Groceries");
  const [account, setAccount] = useState(ACCOUNTS[0]);
  const [flash, setFlash] = useState("");

  const submit = (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt === 0) {
      setFlash("Enter a valid amount.");
      return;
    }
    onAdd({
      id: uid(),
      date,
      description: description.trim(),
      amount: Math.abs(amt),
      category,
      account,
    });
    setDescription("");
    setAmount("");
    setFlash("Added ✓");
    setTimeout(() => setFlash(""), 1500);
  };

  return (
    <div style={S.col}>
      <h3 style={S.sectionTitle}>Add Transaction</h3>
      <form onSubmit={submit} style={S.col}>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={S.input} />
        </Field>
        <Field label="Description">
          <input
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
        {flash ? <div style={{ color: "#34d399", fontSize: 13 }}>{flash}</div> : null}
        <button type="submit" style={S.primaryBtn}>
          Add
        </button>
      </form>
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
function buildRow(raw, mapping) {
  const val = (key) => {
    const col = mapping[key];
    return col ? String(raw[col] ?? "").trim() : "";
  };

  const amount = Math.abs(parseFloat(val("amount").replace(/[$,]/g, "")));
  if (!Number.isFinite(amount)) return null;

  let date = val("date");
  // Coerce common US format MM/DD/YYYY -> YYYY-MM-DD
  const m = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    date = `${yyyy}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  if (!date) date = todayISO();

  return {
    id: uid(),
    date,
    description: val("description"),
    amount,
    category: matchOption(val("category"), CATEGORIES, "Other"),
    account: matchOption(val("account"), ACCOUNTS, ACCOUNTS[0]),
  };
}

function ImportTransactions({ onImport }) {
  const [rawRows, setRawRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setDone("");
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
        setMapping(guessMapping(cols));
        setRawRows(result.data);
      },
      error: (err) => setError(err.message),
    });
  };

  // Live preview reflects the current column mapping.
  const rows = useMemo(() => {
    if (rawRows.length === 0) return [];
    return rawRows.map((r) => buildRow(r, mapping)).filter(Boolean);
  }, [rawRows, mapping]);

  const missingRequired = IMPORT_FIELDS.filter((f) => f.required && !mapping[f.key]);

  const setColumn = (key, col) => setMapping((prev) => ({ ...prev, [key]: col }));

  const confirm = () => {
    if (rows.length === 0 || missingRequired.length > 0) return;
    onImport(rows);
    setDone(`Imported ${rows.length} transactions.`);
    setRawRows([]);
    setHeaders([]);
    setMapping({});
  };

  return (
    <div style={S.col}>
      <h3 style={S.sectionTitle}>Import CSV</h3>
      <p style={{ color: "#8b94a3", fontSize: 13, margin: 0 }}>
        Pick a CSV, then map its columns to each field. Columns are auto-detected
        from common headers — adjust any of them below.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ color: "#cbd5e1" }} />

      {error ? <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div> : null}
      {done ? <div style={{ color: "#34d399", fontSize: 13 }}>{done}</div> : null}

      {headers.length > 0 ? (
        <>
          <h3 style={S.sectionTitle}>Column Mapping</h3>
          <div style={S.col}>
            {IMPORT_FIELDS.map((f) => {
              const fallbackHint =
                f.key === "category"
                  ? "— use default: Other —"
                  : f.key === "account"
                  ? `— use default: ${ACCOUNTS[0]} —`
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

          <div style={{ color: "#8b94a3", fontSize: 12 }}>
            {rows.length} of {rawRows.length} rows ready
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
};
