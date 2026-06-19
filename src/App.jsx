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
    setSaving(true);
    setError("");
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
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, []);

  // ---- Mutations -----------------------------------------------------------
  const addTransactions = useCallback(
    (rows) => {
      setTransactions((prev) => {
        const next = [...rows, ...prev];
        save(next);
        return next;
      });
    },
    [save]
  );

  const deleteTransaction = useCallback(
    (id) => {
      setTransactions((prev) => {
        const next = prev.filter((t) => t.id !== id);
        save(next);
        return next;
      });
    },
    [save]
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

function Header({ hideValues, onToggleHide, onRefresh, onLogout, saving, savedAt }) {
  return (
    <header style={S.header}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 17 }}>Household Ledger</span>
        {saving ? (
          <span style={{ fontSize: 11, color: "#8b94a3" }}>saving…</span>
        ) : savedAt ? (
          <span style={{ fontSize: 11, color: "#475569" }}>saved</span>
        ) : null}
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
// Dashboard
// ===========================================================================

function Dashboard({ transactions, money }) {
  const all = useMemo(() => computeTotals(transactions), [transactions]);

  const thisMonth = useMemo(() => {
    const mk = monthKey(todayISO());
    return computeTotals(transactions.filter((t) => monthKey(t.date) === mk));
  }, [transactions]);

  const recent = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, 8),
    [transactions]
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

      <h3 style={S.sectionTitle}>This Month</h3>
      <div style={S.cardRow}>
        <StatCard label="Income" value={money(thisMonth.income)} accent="#34d399" small />
        <StatCard label="Expenses" value={money(thisMonth.expenses)} accent="#f87171" small />
        <StatCard
          label="Net"
          value={money(thisMonth.net)}
          accent={thisMonth.net >= 0 ? "#34d399" : "#f87171"}
          small
        />
      </div>

      <h3 style={S.sectionTitle}>Recent</h3>
      {recent.length === 0 ? (
        <Empty>No transactions yet. Add or import to get started.</Empty>
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
  const byCategory = useMemo(() => {
    const map = new Map();
    for (const t of transactions) {
      if (isTransfer(t.category) || isIncome(t.category)) continue;
      const amt = Math.abs(Number(t.amount) || 0);
      map.set(t.category, (map.get(t.category) || 0) + amt);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  const byMonth = useMemo(() => {
    const map = new Map();
    for (const t of transactions) {
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
  }, [transactions]);

  if (transactions.length === 0) {
    return <Empty>No data to chart yet.</Empty>;
  }

  const fmtAxis = (v) => (hideValues ? "" : `$${Math.round(v)}`);

  return (
    <div style={S.col}>
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
    </div>
  );
}

// ===========================================================================
// Transactions list
// ===========================================================================

function Transactions({ transactions, money, onDelete }) {
  const [catFilter, setCatFilter] = useState("All");
  const [acctFilter, setAcctFilter] = useState("All");

  const filtered = useMemo(() => {
    return [...transactions]
      .filter((t) => (catFilter === "All" ? true : t.category === catFilter))
      .filter((t) => (acctFilter === "All" ? true : t.account === acctFilter))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [transactions, catFilter, acctFilter]);

  return (
    <div style={S.col}>
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

      <div style={{ color: "#8b94a3", fontSize: 12 }}>{filtered.length} transactions</div>

      {filtered.length === 0 ? (
        <Empty>Nothing here.</Empty>
      ) : (
        <div style={S.list}>
          {filtered.map((t) => (
            <TxnRow key={t.id} t={t} money={money} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function TxnRow({ t, money, onDelete }) {
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

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, color: "#8b94a3", marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

// ===========================================================================
// Import (CSV)
// ===========================================================================

function ImportTransactions({ onImport }) {
  const [rows, setRows] = useState([]);
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
        try {
          const parsed = result.data.map((r) => normalizeRow(r));
          setRows(parsed.filter(Boolean));
        } catch (err) {
          setError(err.message);
        }
      },
      error: (err) => setError(err.message),
    });
  };

  const confirm = () => {
    if (rows.length === 0) return;
    onImport(rows);
    setDone(`Imported ${rows.length} transactions.`);
    setRows([]);
  };

  return (
    <div style={S.col}>
      <h3 style={S.sectionTitle}>Import CSV</h3>
      <p style={{ color: "#8b94a3", fontSize: 13, margin: 0 }}>
        Expected columns: <code>date, description, amount, category, account</code>. Headers are
        matched case-insensitively.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ color: "#cbd5e1" }} />

      {error ? <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div> : null}
      {done ? <div style={{ color: "#34d399", fontSize: 13 }}>{done}</div> : null}

      {rows.length > 0 ? (
        <>
          <div style={{ color: "#8b94a3", fontSize: 12 }}>{rows.length} rows ready</div>
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
          <button onClick={confirm} style={S.primaryBtn}>
            Import {rows.length} transactions
          </button>
        </>
      ) : null}
    </div>
  );
}

// Map a loose CSV record to the canonical transaction shape.
function normalizeRow(r) {
  const get = (...keys) => {
    for (const k of Object.keys(r)) {
      if (keys.includes(k.trim().toLowerCase())) return r[k];
    }
    return "";
  };
  const rawAmount = String(get("amount", "value", "amt")).replace(/[$,]/g, "").trim();
  const amount = Math.abs(parseFloat(rawAmount));
  if (!Number.isFinite(amount)) return null;

  let date = String(get("date", "transaction date", "posted date")).trim();
  // Coerce common US format MM/DD/YYYY -> YYYY-MM-DD
  const m = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    date = `${yyyy}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  if (!date) date = todayISO();

  const category = matchOption(String(get("category", "type")).trim(), CATEGORIES, "Other");
  const account = matchOption(String(get("account", "card")).trim(), ACCOUNTS, ACCOUNTS[0]);

  return {
    id: uid(),
    date,
    description: String(get("description", "memo", "name", "merchant")).trim(),
    amount,
    category,
    account,
  };
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
  loginCard: {
    background: "#14171c",
    border: "1px solid #1f242c",
    borderRadius: 16,
    padding: 24,
    margin: 16,
  },
};
