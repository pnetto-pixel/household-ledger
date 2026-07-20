import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Wallet,
  Home,
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
  GripVertical,
  Car,
  Dog,
  Clapperboard,
  Fuel,
  ShoppingCart,
  Pill,
  Smartphone,
  Landmark,
  Package,
  UtensilsCrossed,
  Wrench,
  ShoppingBag,
  Bus,
  Plane,
  Lightbulb,
  Banknote,
  Gift,
  Coins,
  Tag,
  RefreshCw,
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
  Cell,
  ComposedChart,
  Line,
  Treemap,
} from "recharts";
import Papa from "papaparse";
import {
  TRANSFER_CATEGORY,
  computeTotalsCore,
  matchPeriod,
  availableYears,
  bucketKey,
  bucketLabel,
  ckCategoryToken,
  mapCkCategory,
  descriptionRuleMatches,
  computeDescriptionRuleConflicts,
  findMatchingDescriptionRule,
  matchDescriptionCategoryRule,
  normAccount,
  matchAccountWithAliases,
  txnFingerprint,
  markDuplicates,
  descWords,
  mergeTransactions,
} from "./ledger.js";

// ---------------------------------------------------------------------------
// Domain constants
// ---------------------------------------------------------------------------

// TRANSFER_CATEGORY now lives in src/ledger.js (imported above).

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

// ckCategoryToken / mapCkCategory now live in src/ledger.js (imported above).

// ---------------------------------------------------------------------------
// Category-by-description rules (PR: Description rules, Audit tab)
// ---------------------------------------------------------------------------
// Ordered list of override rules that force a destination category when the
// row's description and/or provider (srcAccount/account) contains a substring
// pattern. First matching rule wins (array order is semantic). These OVERRIDE
// the CK category map / CSV category for NON-Transfer rows. `destinationCategory`
// is never "Transfer" (guaranteed both server-side in
// api/category-description-rules.js and client-side in the save path).
//
// By default a rule can never de-transfer a row: the Transfer safety net in
// buildRow keeps a CK-sourced Transfer as Transfer even when a rule matches.
// A rule MAY opt into `allowTransferOverride: true` (requires a non-empty
// `providerPattern` AND condition) to skip that safety net and promote a
// Transfer row into its destination category on future imports — this is the
// generalization of the former hard-coded Apple Daily Cash heuristic.
// Seed is empty (no pre-populated rule). Same runtime-override pattern as
// CK_CATEGORY_MAP: module state, replaced by
// applyCategoryDescriptionRulesConfig() once /api/category-description-rules
// loads.
const DEFAULT_CATEGORY_DESCRIPTION_RULES = [];

let CATEGORY_DESCRIPTION_RULES = [...DEFAULT_CATEGORY_DESCRIPTION_RULES];

function applyCategoryDescriptionRulesConfig(rules) {
  CATEGORY_DESCRIPTION_RULES = Array.isArray(rules) ? rules.filter(Boolean) : [];
}

// The current runtime rules as a plain array (for seeding/persisting React state).
function currentCategoryDescriptionRulesConfig() {
  return CATEGORY_DESCRIPTION_RULES.map((r) => ({ ...r }));
}

// True when the row matches the rule's substring pattern on the configured
// field(s). Case-insensitive substring match — no regex.
//
// A rule MAY carry an optional `providerPattern` (an extra AND condition
// against srcAccount||account) — used by rules that were granted the
// `allowTransferOverride` power (formerly the hard-coded Apple Daily Cash
// heuristic, now folded into Description rules). Rules WITHOUT `providerPattern`
// behave bit-for-bit identically to before this change.
// descriptionRuleMatches now lives in src/ledger.js (imported above).

// Pre-save conflict check for the Description rules editor (purely
// informational — never blocks, never reprocesses, never mutates anything).
// Runs the same pure `descriptionRuleMatches(row, rule)` used by the save
// pipeline against the CURRENT transactions and flags two situations where
// the rule's pattern is broader than the user may realize: (1) it also
// matches rows already classified as `Transfer` (which the rule can never
// touch — the Transfer safety net in `buildRow` still applies on future
// imports, so this is just a heads-up, not a warning of a real bug), and
// (2) it also matches rows with `categoryManual === true` (a manual
// correction the user made on purpose, which this rule would NOT retroactively
// change, but might contradict on the next import if the user isn't aware).
// computeDescriptionRuleConflicts / findMatchingDescriptionRule /
// matchDescriptionCategoryRule now live in src/ledger.js (imported above).

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

// Local-date ISO helpers. Deliberately NOT toISOString(): that returns the
// UTC date, which in US timezones flips to "tomorrow" during the evening and
// skewed everything derived from "today" (default Home period, M/M cutoffs,
// the Daily Pace "Today" line, Today/Yesterday list headers).
const localISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const todayISO = () => localISO(new Date());

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

// ---------------------------------------------------------------------------
// Auth headers (shared app password)
// ---------------------------------------------------------------------------

function buildAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  const pwd = localStorage.getItem("household_pwd");
  if (pwd) headers["x-app-password"] = pwd;
  return headers;
}

// ---------------------------------------------------------------------------
// Idle auto-lock (inactivity timeout)
// ---------------------------------------------------------------------------
// The stored app password used to live in localStorage forever, so anyone
// picking up an unlocked device had the ledger wide open. After
// IDLE_LOGOUT_MS without user interaction the password is dropped and the
// login screen returns (banking-app style auto-lock). This is a client-side
// lock only — the server keeps validating the same shared password per
// request — but it covers the real risk of a device left open/lost.
// The timestamp is shared via localStorage so activity in any tab of the
// same browser counts, and the check runs at boot too (device untouched for
// days → asks for the password on open, not after).

const IDLE_LOGOUT_MS = 30 * 60 * 1000;
const LAST_ACTIVE_KEY = "household_last_active";

function touchLastActive() {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  } catch {
    // Private mode / quota — the in-memory session still works.
  }
}

function idleExpired() {
  try {
    const t = Number(localStorage.getItem(LAST_ACTIVE_KEY) || 0);
    // No timestamp (first run after this feature shipped) → not expired;
    // the boot path records one immediately so the clock starts now.
    return t > 0 && Date.now() - t > IDLE_LOGOUT_MS;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Offline pending-save queue
// ---------------------------------------------------------------------------
// A dirty ledger only lived in memory: closing the PWA while offline (or
// after a failed save) lost the edits. Every scheduled save now mirrors the
// pending array to localStorage together with the savedAt it was based on;
// a successful save clears it. On the next boot, the pending copy is
// restored and re-saved — but only when the server's savedAt still equals
// the recorded base (otherwise another device saved in between, and applying
// the stale pending copy would overwrite its changes — same rule as the 409
// path, so the pending copy is discarded with a notice instead).

// Single source for the version shown in the header and in diagnostics.
const APP_VERSION = "v1.50.1";

const PENDING_SAVE_KEY = "household_pending_save";

// Per-page-load id sent with every PUT so the server can tell "this same
// page instance wrote last" from "another device wrote". Deliberately NOT
// persisted (localStorage/sessionStorage): after a reload the app re-loads
// fresh server state anyway, and two tabs of the same browser MUST still
// conflict with each other — only the exact page instance whose in-memory
// state produced the stored blob may overwrite it without a 409.
const CLIENT_ID =
  (typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID()) ||
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function writePendingSave(transactions, baseSavedAt) {
  try {
    localStorage.setItem(
      PENDING_SAVE_KEY,
      JSON.stringify({ transactions, baseSavedAt: baseSavedAt || null, at: Date.now() })
    );
  } catch {
    // Quota exceeded or private mode — the in-memory flow still works.
  }
}

function clearPendingSave() {
  try {
    localStorage.removeItem(PENDING_SAVE_KEY);
  } catch {
    // ignore
  }
}

function readPendingSave() {
  try {
    const raw = localStorage.getItem(PENDING_SAVE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && Array.isArray(p.transactions)) return p;
  } catch {
    // fall through
  }
  clearPendingSave();
  return null;
}

// A render/lifecycle error anywhere in the tab content used to unmount the
// whole React tree with no feedback — the header and tab bar disappeared
// too, reading as a blank/black screen with no way to recover short of a
// hard reload. This boundary catches it, shows the actual error message
// (so it can be reported/screenshotted) plus a reload button, and — keyed
// by `tab` at the call site — resets automatically when the user switches
// tabs. Must be a class component; React has no hook equivalent.
class TabErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Tab render error:", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ ...S.card, margin: 16, borderColor: "rgba(248,113,113,0.35)" }}>
          <div style={{ color: "#f87171", fontWeight: 600, marginBottom: 8 }}>
            Something went wrong rendering this tab.
          </div>
          <div style={{ color: "#8b94a3", fontSize: 12, marginBottom: 12, wordBreak: "break-word" }}>
            {this.state.error.message || String(this.state.error)}
          </div>
          <button style={S.secondaryBtn} onClick={() => window.location.reload()}>
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ===========================================================================
// App
// ===========================================================================

export default function App() {
  // Session idled out while the app was closed → require the password again
  // before showing anything. Both initializers read the same pre-purge
  // localStorage state; the actual password removal happens in the mount
  // effect below (initializers stay side-effect free).
  const [authed, setAuthed] = useState(
    () => !!localStorage.getItem("household_pwd") && !idleExpired()
  );
  // True when the last de-auth was the idle lock (vs. explicit logout /
  // rotated password) — drives the notice on the login screen.
  const [idleLocked, setIdleLocked] = useState(
    () => !!localStorage.getItem("household_pwd") && idleExpired()
  );
  useEffect(() => {
    if (idleLocked && !authed) localStorage.removeItem("household_pwd");
  }, []); // mount only — boot-time purge of an expired session's password
  const [transactions, setTransactions] = useState([]);
  const [tab, setTab] = useState("home");
  const [hideValues, setHideValues] = useState(
    () => localStorage.getItem("household_hide") === "1"
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(null);

  const loadedRef = useRef(false);
  const debounceRef = useRef(null);
  // Pending transactions restored from localStorage by load(), waiting to be
  // scheduled for save once scheduleSave exists (see effect below).
  const pendingRestoreRef = useRef(null);
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

  // Format a money value, respecting the global eye toggle.
  const money = useCallback(
    (n) => (hideValues ? "•••••" : usd.format(n || 0)),
    [hideValues]
  );

  // ---- Load ----------------------------------------------------------------
  // `silent` skips the full-screen loading state — used by the
  // resync-on-return effect below, where flashing the spinner over a page
  // the user is already looking at would be jarring.
  const lastLoadAtRef = useRef(0);
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const res = await fetch("/api/transactions", {
        method: "GET",
        headers: buildAuthHeaders(),
        signal: AbortSignal.timeout?.(25000),
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
      const serverTxns = Array.isArray(data.transactions) ? data.transactions : [];
      const serverSavedAt = data.savedAt || null;
      baseTransactionsRef.current = serverTxns;

      // Restore a pending save from a previous session (offline close /
      // failed save), but only if the server hasn't moved since it was based.
      const pending = readPendingSave();
      if (pending && (pending.baseSavedAt || null) === serverSavedAt) {
        setTransactions(pending.transactions);
        pendingRestoreRef.current = pending.transactions;
        setError("Unsaved changes from your previous session were restored and will be saved.");
      } else {
        if (pending) {
          clearPendingSave();
          // A pending copy identical to the server's data means its save DID
          // land and only the response was lost (iOS suspends the page right
          // after the keepalive flush) — nothing was discarded, stay quiet.
          if (JSON.stringify(pending.transactions) !== JSON.stringify(serverTxns)) {
            setError(
              "Unsaved changes from a previous session were discarded because the ledger was updated elsewhere."
            );
          }
        }
        setTransactions(serverTxns);
      }
      setSavedAt(serverSavedAt);
      loadedRef.current = true;
      lastLoadAtRef.current = Date.now();
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  // ---- Save (debounced after mutations) ------------------------------------
  // savedAtRef mirrors the savedAt state so the stable `save` callback always
  // sends the latest value as `expectedSavedAt` (optimistic concurrency): the
  // server rejects the PUT with 409 when another device saved in between,
  // instead of letting this whole-array write silently overwrite it.
  const savedAtRef = useRef(null);
  useEffect(() => {
    savedAtRef.current = savedAt;
  }, [savedAt]);

  // Last transactions state this device knew the SERVER had (set on load and
  // after each successful save) — the `base` of the three-way merge below.
  const baseTransactionsRef = useRef([]);

  // 409 recovery: instead of discarding the local change ("server wins,
  // please redo" — which makes the slower device lose an entire import every
  // time two instances are open), fetch the server state, three-way merge it
  // with what we tried to save, and PUT the result on top of the server's
  // fresh savedAt. Up to 3 attempts (a writer would have to land inside the
  // GET→PUT window every time). Returns { ok: true } when the merge landed,
  // or { ok: false, reason } for the fallback path — `reason` is surfaced in
  // the conflict message so a recurring failure diagnoses itself in the field.
  const tryMergeSave = useCallback(async (localNext) => {
    let reason = "unknown";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch("/api/transactions", {
          method: "GET",
          headers: buildAuthHeaders(),
          signal: AbortSignal.timeout?.(25000),
        });
        if (!res.ok) {
          reason = `get ${res.status}`;
          continue;
        }
        const data = await res.json();
        const serverTxns = Array.isArray(data.transactions) ? data.transactions : [];
        const serverSavedAt = data.savedAt || null;
        const merged = mergeTransactions(
          baseTransactionsRef.current || [],
          localNext,
          serverTxns
        );
        const putRes = await fetch("/api/transactions", {
          method: "PUT",
          headers: buildAuthHeaders(),
          body: JSON.stringify({
            transactions: merged,
            expectedSavedAt: serverSavedAt,
            clientId: CLIENT_ID,
          }),
          signal: AbortSignal.timeout?.(25000),
        });
        if (!putRes.ok) {
          reason = `put ${putRes.status}`;
          continue;
        }
        const j = await putRes.json();
        const at = j.savedAt || new Date().toISOString();
        baseTransactionsRef.current = merged;
        savedAtRef.current = at;
        setSavedAt(at);
        setTransactions(merged);
        clearPendingSave();
        setSaveError(null);
        setError("Changes from another device were merged with yours.");
        return { ok: true };
      } catch (err) {
        reason = err?.name === "TimeoutError" ? "timeout" : err?.message || "error";
      }
    }
    return { ok: false, reason };
  }, []);

  // Saves are serialized: one PUT in flight at a time, with a queue of one
  // (only the latest `next` matters — the payload is the whole array). A
  // second save racing a still-in-flight first one used to send the
  // pre-first `expectedSavedAt` and 409 against our own write.
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef(null); // { next, keepalive } | null

  const save = useCallback(async function saveSerialized(next, { keepalive = false } = {}) {
    if (!navigator.onLine) {
      setSaveError("offline");
      return;
    }
    if (saveInFlightRef.current) {
      queuedSaveRef.current = { next, keepalive };
      return;
    }
    saveInFlightRef.current = true;
    setDirty(false);
    setSaving(true);
    try {
      const body = JSON.stringify({
        transactions: next,
        expectedSavedAt: savedAtRef.current,
        clientId: CLIENT_ID,
      });
      const res = await fetch("/api/transactions", {
        method: "PUT",
        headers: buildAuthHeaders(),
        body,
        // keepalive lets the request outlive the page (flush on close), but
        // browsers cap keepalive bodies at ~64 KB — fall back to a normal
        // fetch above that and hope the page survives long enough.
        keepalive: keepalive && body.length < 60000,
        // A fetch left hanging by an iOS page suspension would hold
        // saveInFlightRef forever and wedge every future save. If the PUT
        // actually landed and only the response was lost, the retry's stale
        // expectedSavedAt is forgiven server-side (same clientId).
        signal: AbortSignal.timeout?.(25000),
      });
      if (res.status === 401 || res.status === 403) {
        // Wrong/rotated password — re-authenticating is the only fix. A
        // queued save would just hit the same wall; drop it.
        queuedSaveRef.current = null;
        localStorage.removeItem("household_pwd");
        setAuthed(false);
        return;
      }
      if (res.status === 409) {
        // Another device saved first. Try to MERGE our change with theirs
        // (tryMergeSave above) — a queued save holds newer local state than
        // `next`, so merge that instead when present. Only when the merge
        // also fails (another writer racing us, network) fall back to the
        // old server-wins reload, telling the user to redo the change. The
        // pending mirror and queue are stale either way — the merge/load
        // path rebuilds state from the server.
        const localNext = queuedSaveRef.current ? queuedSaveRef.current.next : next;
        queuedSaveRef.current = null;
        clearPendingSave();
        const mergeResult = await tryMergeSave(localNext);
        if (mergeResult.ok) return;
        // Fallback with field diagnostics: the 409 body carries the stored
        // savedAt + clientId of whoever wrote last — showing them (plus this
        // device's id and why the merge failed) turns a recurring conflict
        // report into an actionable bug report.
        const conflictInfo = await res.json().catch(() => ({}));
        const otherAt = conflictInfo.savedAt
          ? new Date(conflictInfo.savedAt).toLocaleTimeString()
          : "?";
        const otherClient = (conflictInfo.clientId || "old-version-client").slice(0, 8);
        setSaveError("conflict");
        await load();
        setError(
          `This ledger was updated on another device. The latest data was reloaded — please redo your last change. ` +
            `[${APP_VERSION} · this device ${CLIENT_ID.slice(0, 8)} · other write ${otherAt} by ${otherClient} · merge failed: ${mergeResult.reason}]`
        );
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Save failed (${res.status})`);
      }
      const data = await res.json();
      const at = data.savedAt || new Date().toISOString();
      baseTransactionsRef.current = next;
      savedAtRef.current = at;
      setSavedAt(at);
      clearPendingSave();
      setSaveError(null);
      setError("");
    } catch (err) {
      // The write did NOT land — mark the ledger dirty again so the
      // online-retry and pagehide/visibilitychange flush paths pick it up.
      // Without this, a failed save (500, network drop with navigator.onLine
      // still true) left dirty=false and the change was silently lost.
      setDirty(true);
      setSaveError(err.message || "Save failed");
      setTimeout(() => setSaveError(null), 5000);
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
      const queued = queuedSaveRef.current;
      if (queued) {
        queuedSaveRef.current = null;
        saveSerialized(queued.next, { keepalive: queued.keepalive });
      }
    }
  }, [load, tryMergeSave]);

  const scheduleSave = useCallback(
    (next) => {
      setDirty(true);
      setSaveError(null);
      // Mirror the pending array to localStorage so it survives closing the
      // app before the save lands (offline, crash, failed PUT).
      writePendingSave(next, savedAtRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(next), 800);
    },
    [save]
  );

  // Re-schedule the save of transactions restored from the pending mirror —
  // load() can't call scheduleSave directly (it's defined before it).
  useEffect(() => {
    if (pendingRestoreRef.current) {
      const txns = pendingRestoreRef.current;
      pendingRestoreRef.current = null;
      scheduleSave(txns);
    }
  });

  // Flush a pending (debounced) save when the page is being hidden or
  // closed. `visibilitychange`/`pagehide` are the events that actually fire
  // on iOS PWAs — `beforeunload` often doesn't there, but is kept for
  // desktop browsers. Refs (not deps) keep the listeners stable so no
  // events are missed while React re-subscribes.
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const transactionsRef = useRef(transactions);
  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  useEffect(() => {
    const flush = () => {
      if (!navigator.onLine) return;
      if (dirtyRef.current) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        save(transactionsRef.current, { keepalive: true });
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, [save]);

  // ---- Resync on return ----------------------------------------------------
  // The common iPhone flow is: leave the ledger, run the CK bookmarklet in
  // Safari, come back, import. The returning page still holds the savedAt
  // from when it was last here — any write that landed meanwhile (another
  // device, another tab, a spouse's phone) turns the import's save into a
  // 409. Re-fetching on return keeps expectedSavedAt current, so the
  // conflict mostly can't happen in the first place. Only when nothing is
  // unsaved locally (dirty/in-flight saves own the state) and throttled to
  // once per 10s.
  useEffect(() => {
    if (!authed) return;
    const onVisibleResync = () => {
      if (document.visibilityState !== "visible") return;
      if (!loadedRef.current) return;
      if (dirtyRef.current || saveInFlightRef.current) return;
      if (Date.now() - lastLoadAtRef.current < 10000) return;
      load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisibleResync);
    window.addEventListener("focus", onVisibleResync);
    return () => {
      document.removeEventListener("visibilitychange", onVisibleResync);
      window.removeEventListener("focus", onVisibleResync);
    };
  }, [authed, load]);

  // ---- Idle auto-lock ------------------------------------------------------
  // Drop the stored password after IDLE_LOGOUT_MS without interaction. The
  // pending-save mirror is deliberately NOT cleared: unsaved work survives
  // the lock and is restored/saved after the next login (same path as an
  // offline close).
  const lockForIdle = useCallback(() => {
    localStorage.removeItem("household_pwd");
    setIdleLocked(true);
    setAuthed(false);
    setTransactions([]);
  }, []);

  useEffect(() => {
    if (!authed) return;
    touchLastActive(); // login / boot counts as activity — start the clock
    // Throttle the localStorage write: interaction bursts (scrolling,
    // typing) refresh the timestamp at most every 30s.
    let lastTouch = Date.now();
    const touch = () => {
      const now = Date.now();
      if (now - lastTouch > 30000) {
        lastTouch = now;
        touchLastActive();
      }
    };
    const check = () => {
      if (idleExpired()) lockForIdle();
    };
    // Check BEFORE the browser replays any interaction events: returning to
    // a tab that idled out must land on the login screen, not count the
    // return tap as fresh activity.
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("pointerdown", touch, { passive: true });
    window.addEventListener("keydown", touch);
    document.addEventListener("visibilitychange", onVisible);
    // Also lock a tab left open and untouched (not just on return/boot).
    const interval = setInterval(check, 60 * 1000);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [authed, lockForIdle]);

  // Retry the save when connectivity comes back — the offline banner promises
  // "changes will sync when reconnected", this is what actually does it.
  useEffect(() => {
    if (isOnline && dirtyRef.current) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      save(transactionsRef.current);
    }
  }, [isOnline, save]);

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

  // ---- Dismissed suggestions load / save -------------------------------------
  // Which "Suggested rules" cards (Settings tab) the user has dismissed.
  // Household-scoped, persisted via /api/dismissed-suggestions so dismissals
  // survive tab switches / reloads / other devices (not just this session).
  const [dismissedSuggestions, setDismissedSuggestions] = useState([]);

  const loadDismissedSuggestions = useCallback(async () => {
    try {
      const res = await fetch("/api/dismissed-suggestions", {
        method: "GET",
        headers: buildAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.dismissed)) setDismissedSuggestions(data.dismissed);
    } catch {
      // Silently ignore — dismissals are non-critical.
    }
  }, []);

  useEffect(() => {
    if (authed) loadDismissedSuggestions();
  }, [authed, loadDismissedSuggestions]);

  // Optimistic local update + persist the full list.
  const dismissSuggestion = useCallback((key) => {
    setDismissedSuggestions((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      fetch("/api/dismissed-suggestions", {
        method: "PUT",
        headers: buildAuthHeaders(),
        body: JSON.stringify({ dismissed: next }),
      }).catch(() => {});
      return next;
    });
  }, []);

  // ---- Budgets load / save ---------------------------------------------------
  // Monthly limits per expense category: { [category]: number }. The
  // /api/budgets endpoint predates this UI (the old Budgets section left the
  // app in PR #8); reintroduced as bullet bars on Home + editor in Settings.
  const [budgets, setBudgets] = useState({});

  const loadBudgets = useCallback(async () => {
    try {
      const res = await fetch("/api/budgets", {
        method: "GET",
        headers: buildAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.budgets && typeof data.budgets === "object") setBudgets(data.budgets);
    } catch {
      // Silently ignore — budgets are non-critical.
    }
  }, []);

  useEffect(() => {
    if (authed) loadBudgets();
  }, [authed, loadBudgets]);

  // Optimistic local update + persist the full map.
  const saveBudgets = useCallback((next) => {
    setBudgets(next);
    fetch("/api/budgets", {
      method: "PUT",
      headers: buildAuthHeaders(),
      body: JSON.stringify({ budgets: next }),
    }).catch(() => {});
  }, []);

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

  // ---- Category description rules load / save --------------------------------
  const [categoryDescriptionRules, setCategoryDescriptionRules] = useState(
    () => currentCategoryDescriptionRulesConfig()
  );

  // One-shot, idempotent migration of the legacy Apple Daily Cash rule into the
  // generalized Description rules system. The former hard-coded heuristic
  // (provider pattern + description keywords, allowed to de-transfer) is now
  // just a Description rule with `allowTransferOverride: true`. We fetch the
  // legacy rule; if it still has a providerPattern + keywords + destination, we
  // create one override rule per keyword (skipping any that already exist for
  // idempotency), PREPEND them to the current rules array (so they win first —
  // "first match wins"), persist the merged rules, and blank out the legacy
  // rule (empty keywords = the "already migrated" marker). Returns the possibly
  // migrated rules array so the caller can apply it.
  const migrateAppleDailyCashRule = useCallback(async (currentRules) => {
    try {
      const res = await fetch("/api/apple-daily-cash-rule", {
        method: "GET",
        headers: buildAuthHeaders(),
      });
      if (!res.ok) return currentRules;
      const data = await res.json();
      const legacy = data && data.rule;
      // `savedAt` is only ever set once something has been PUT to this
      // endpoint — either by the user editing the old dedicated section, or
      // by this very migration blanking it out afterwards (the "already
      // migrated" marker). If it's null, the row was NEVER persisted, which
      // means the household was silently relying on the old hardcoded
      // default (Apple Card / Deposit,Adjustment / Other Income) — that
      // default lived only in code and was deleted along with the dedicated
      // section, so we must fall back to it here or the behavior vanishes
      // for anyone who never opened Settings to customize it.
      const neverSaved = !data || !data.savedAt;
      const providerPattern = neverSaved
        ? "Apple Card"
        : String(legacy?.providerPattern || "").trim();
      const keywords = neverSaved
        ? ["Deposit", "Adjustment"]
        : Array.isArray(legacy?.keywords)
          ? legacy.keywords.map((k) => String(k || "").trim()).filter(Boolean)
          : [];
      const destinationCategory = neverSaved
        ? "Other Income"
        : String(legacy?.destinationCategory || "").trim();
      // Not active / already migrated (blanked-out marker, savedAt set) → nothing to do.
      if (!providerPattern || !keywords.length || !destinationCategory) return currentRules;

      const created = [];
      for (const keyword of keywords) {
        const already = (currentRules || []).some(
          (r) =>
            r &&
            r.allowTransferOverride === true &&
            String(r.providerPattern || "").trim() === providerPattern &&
            String(r.pattern || "") === keyword
        );
        if (already) continue;
        created.push({
          id: uid(),
          matchField: "description",
          pattern: keyword,
          providerPattern,
          allowTransferOverride: true,
          destinationCategory,
        });
      }

      if (!created.length) {
        // Nothing new to create, but the legacy rule is still populated — blank
        // it out so we never re-check on future loads.
        fetch("/api/apple-daily-cash-rule", {
          method: "PUT",
          headers: buildAuthHeaders(),
          body: JSON.stringify({ rule: { providerPattern: "", keywords: [], destinationCategory: "" } }),
        }).catch(() => {});
        return currentRules;
      }

      const merged = [...created, ...(currentRules || [])];
      // Persist the merged rules and the "migrated" marker.
      fetch("/api/category-description-rules", {
        method: "PUT",
        headers: buildAuthHeaders(),
        body: JSON.stringify({ rules: merged }),
      }).catch(() => {});
      fetch("/api/apple-daily-cash-rule", {
        method: "PUT",
        headers: buildAuthHeaders(),
        body: JSON.stringify({ rule: { providerPattern: "", keywords: [], destinationCategory: "" } }),
      }).catch(() => {});
      return merged;
    } catch {
      return currentRules;
    }
  }, []);

  const loadCategoryDescriptionRules = useCallback(async () => {
    try {
      const res = await fetch("/api/category-description-rules", {
        method: "GET",
        headers: buildAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      let rules = Array.isArray(data.rules) ? data.rules : null;
      if (rules) {
        rules = await migrateAppleDailyCashRule(rules);
        applyCategoryDescriptionRulesConfig(rules);
        setCategoryDescriptionRules(currentCategoryDescriptionRulesConfig());
      }
    } catch {
      // Silently ignore — defaults already seeded.
    }
  }, [migrateAppleDailyCashRule]);

  useEffect(() => {
    if (authed) loadCategoryDescriptionRules();
  }, [authed, loadCategoryDescriptionRules]);

  // Persist the description rules. Deliberately no cascade: only new imports
  // (buildRow) are affected — existing transactions keep their category.
  // Client-side guard: never persist a Transfer destination (the endpoint also
  // enforces this) so a rule can never de-transfer a row.
  const saveCategoryDescriptionRules = useCallback((nextRules) => {
    const clean = (Array.isArray(nextRules) ? nextRules : []).filter(
      (r) => r && r.pattern && r.destinationCategory && r.destinationCategory !== TRANSFER_CATEGORY
    );
    applyCategoryDescriptionRulesConfig(clean);
    setCategoryDescriptionRules(currentCategoryDescriptionRulesConfig());
    return fetch("/api/category-description-rules", {
      method: "PUT",
      headers: buildAuthHeaders(),
      body: JSON.stringify({ rules: clean }),
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
  // Restores the entire ledger from a local backup file, replacing whatever
  // is currently loaded. Saves immediately (not debounced) since this is an
  // explicit, already-confirmed destructive action.
  const restoreTransactions = useCallback(
    (next) => {
      setTransactions(next);
      save(next);
    },
    [save]
  );

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
  // renaming an account updates its transactions, account-map values and
  // alias-table entry; renaming a category updates its transactions plus any
  // Description rule / CK-map entry targeting it; deletes re-bucket the rows
  // still using the deleted name (an income category left dangling would be
  // silently counted as an expense by computeTotals).

  // Rewrite every Description rule / CK-map destination that targets
  // `fromName` to `toName` — shared by rename (new name) and delete (fallback
  // bucket). Without this, a rule pointing at a gone category makes future
  // imports fall through to "Other" (or, worse, a ghost category via
  // allowTransferOverride).
  const retargetCategoryRules = useCallback((fromName, toName) => {
    const rules = currentCategoryDescriptionRulesConfig();
    if (rules.some((r) => r.destinationCategory === fromName)) {
      saveCategoryDescriptionRules(
        rules.map((r) => (r.destinationCategory === fromName ? { ...r, destinationCategory: toName } : r))
      );
    }
    const ckMap = currentCkCategoryMapConfig();
    if (Object.values(ckMap).includes(fromName)) {
      const next = {};
      for (const [tok, dest] of Object.entries(ckMap)) next[tok] = dest === fromName ? toName : dest;
      saveCkCategoryMap(next);
    }
  }, [saveCategoryDescriptionRules, saveCkCategoryMap]);

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
    // Move the alias fragments to the new name. The old key is kept with an
    // empty list (not deleted): buildAliasArray re-merges the default seed by
    // account name, so a deleted key would resurrect the default fragments
    // under the old (now nonexistent) account.
    const aliasesObj = currentAliasConfig();
    const frags = aliasesObj[oldName] || [];
    if (frags.length) {
      saveAccountAliasesAndApply({ ...aliasesObj, [oldName]: [], [nn]: frags });
    }
  }, [saveConfig, scheduleSave, saveAccountAliasesAndApply]);

  const deleteAccount = useCallback((name) => {
    if (!ACCOUNTS.includes(name)) return;
    saveConfig({ accounts: ACCOUNTS.filter((a) => a !== name) });
    // Cascade: rows fall back to Unassigned (srcAccount is kept, so they can
    // be re-classified later), URN mappings to the account are dropped, and
    // its alias fragments are disabled (empty list overrides the default
    // seed) so future imports don't classify into a ghost account.
    setTransactions((prev) => {
      let ch = false;
      const next = prev.map((t) => (t.account === name ? ((ch = true), { ...t, account: "" }) : t));
      if (ch) scheduleSave(next);
      return ch ? next : prev;
    });
    setAccountMap((prevMap) => {
      let ch = false;
      const am = {};
      for (const [k, v] of Object.entries(prevMap)) {
        if (v === name) { ch = true; continue; }
        am[k] = v;
      }
      if (!ch) return prevMap;
      fetch("/api/account-map", { method: "PUT", headers: buildAuthHeaders(), body: JSON.stringify({ map: am }) }).catch(() => {});
      return am;
    });
    const aliasesObj = currentAliasConfig();
    if ((aliasesObj[name] || []).length) {
      saveAccountAliasesAndApply({ ...aliasesObj, [name]: [] });
    }
  }, [saveConfig, scheduleSave, saveAccountAliasesAndApply]);

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
    retargetCategoryRules(oldName, nn);
  }, [saveConfig, scheduleSave, retargetCategoryRules]);

  const deleteCategory = useCallback((name) => {
    let fallback;
    if (EXPENSE_CATEGORIES.includes(name)) {
      saveConfig({ expenseCategories: EXPENSE_CATEGORIES.filter((c) => c !== name) });
      fallback = "Other";
    } else if (INCOME_CATEGORIES.includes(name)) {
      saveConfig({ incomeCategories: INCOME_CATEGORIES.filter((c) => c !== name) });
      fallback = "Other Income"; // always present — applyConfig guarantees it
    } else return;
    if (name === fallback) return; // deleting the fallback itself: nothing to re-bucket into
    setTransactions((prev) => {
      let ch = false;
      const next = prev.map((t) => (t.category === name ? ((ch = true), { ...t, category: fallback }) : t));
      if (ch) scheduleSave(next);
      return ch ? next : prev;
    });
    retargetCategoryRules(name, fallback);
  }, [saveConfig, scheduleSave, retargetCategoryRules]);

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
    setAuthed(false);
    setTransactions([]);
  }, []);

  // Desktop gets a wider shell so the audit table has horizontal room.
  const isWide = useMediaWide(900);
  const shellWidth = isWide ? 1180 : 560;

  if (!authed) {
    return (
      <Login
        notice={idleLocked ? "Signed out after 30 minutes of inactivity." : ""}
        onAuthed={() => {
          touchLastActive();
          setIdleLocked(false);
          setAuthed(true);
        }}
      />
    );
  }

  return (
    <div style={{ ...S.app, maxWidth: shellWidth }}>
      <Header
        hideValues={hideValues}
        onToggleHide={toggleHide}
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
        <TabErrorBoundary key={tab}>
        {loading ? (
          <div style={S.center}>Loading…</div>
        ) : tab === "home" ? (
          <Dashboard transactions={transactions} money={money} hideValues={hideValues} isWide={isWide} budgets={budgets} />
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
          <ImportTransactions
            onImport={addTransactions}
            accountMap={accountMap}
            config={config}
            transactions={transactions}
            ckCategoryMap={ckCategoryMap}
            categoryDescriptionRules={categoryDescriptionRules}
          />
        ) : tab === "preview" ? (
          <SimpleFinPreview accountMap={accountMap} money={money} />
        ) : tab === "settings" ? (
          <SettingsTab
            transactions={transactions}
            accountMap={accountMap}
            accountAliases={accountAliases}
            onSaveAccountAliases={saveAccountAliasesAndApply}
            dismissedSuggestions={dismissedSuggestions}
            onDismissSuggestion={dismissSuggestion}
            ckCategoryMap={ckCategoryMap}
            onSaveCkCategoryMap={saveCkCategoryMap}
            categoryDescriptionRules={categoryDescriptionRules}
            onSaveCategoryDescriptionRules={saveCategoryDescriptionRules}
            config={config}
            onSaveAccountMap={saveAndApplyAccountMap}
            onAddAccount={addAccount}
            onRenameAccount={renameAccount}
            onDeleteAccount={deleteAccount}
            onAddCategory={addCategory}
            onRenameCategory={renameCategory}
            onDeleteCategory={deleteCategory}
            onReorderAccounts={reorderAccounts}
            onReorderCategories={reorderCategories}
            onRestoreTransactions={restoreTransactions}
            budgets={budgets}
            onSaveBudgets={saveBudgets}
          />
        ) : (
          <Charts transactions={transactions} hideValues={hideValues} config={config} isWide={isWide} />
        )}
        </TabErrorBoundary>
      </main>

      <TabBar tab={tab} setTab={setTab} wide={isWide} />
    </div>
  );
}

// ===========================================================================
// Login
// ===========================================================================

function Login({ onAuthed, notice = "" }) {
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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

        {notice ? (
          <div style={{ color: "#fbbf24", fontSize: 13, margin: "0 0 12px" }}>{notice}</div>
        ) : null}

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
  if (saveError === "conflict") {
    return (
      <span style={{ fontSize: 10, color: "#fbbf24", display: "flex", alignItems: "center", gap: 3 }}>
        <span>⇅</span>
        <span>updated elsewhere</span>
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

function Header({ hideValues, onToggleHide, onLogout, saving, savedAt, dirty, saveError }) {
  return (
    <header style={S.header}>
      <style>{`@keyframes hl-spin { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 9,
            background: "linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0) 60%), linear-gradient(135deg, #0A84FF 0%, #0055cc 100%)",
            display: "grid", placeItems: "center", flexShrink: 0,
            boxShadow: "0 2px 8px rgba(10,132,255,0.35), inset 0 1px 1px rgba(255,255,255,0.3)",
          }}>
            <Wallet size={14} color="#fff" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.5, color: "#e5e7eb" }}>Household</span>
          <span style={{ fontSize: 10, color: "#6b7280", marginLeft: 4, letterSpacing: 0 }}>{APP_VERSION}</span>
        </div>
        <SaveIndicator saving={saving} dirty={dirty} savedAt={savedAt} saveError={saveError} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <IconButton onClick={onToggleHide} title={hideValues ? "Show values" : "Hide values"}>
          {hideValues ? <EyeOff size={16} /> : <Eye size={16} />}
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
  { id: "home", label: "Home", Icon: Home },
  { id: "analyze", label: "Trends", Icon: TrendingUp },
  { id: "transactions", label: "Txns", Icon: List },
  { id: "import", label: "Import", Icon: Upload },
  { id: "preview", label: "Preview", Icon: Eye },
  { id: "settings", label: "Settings", Icon: Settings },
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

// Thin wrapper binding the pure core (src/ledger.js) to the live runtime
// income-categories list.
function computeTotals(rows) {
  return computeTotalsCore(rows, INCOME_CATEGORIES);
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

// availableYears / matchPeriod now live in src/ledger.js (imported above).

function periodLabel(year, month) {
  const m = MONTHS.find((x) => x.v === month);
  if (year === "All" && month === "All") return "All Time";
  if (year === "All") return m ? m.l : "All Time";
  if (month === "All") return year;
  return m ? `${m.l} ${year}` : year;
}

// Single-select chip that IS the trigger for a native <input type="month">,
// stacked transparently on top of the chip. Clicking the chip opens the
// platform's own month/year picker directly — no custom popover/dropdown
// layer in between. `years` is accepted for API compatibility but unused
// (the native picker has no notion of a bounded year list). A small "reset"
// button next to the chip snaps the filter back to the current month/year.
// iOS (incl. iPadOS, which reports as "Mac" with touch support) doesn't
// support <input type="month"> natively — it falls back to a plain text
// field with no picker UI, and showPicker() doesn't help there either. We
// detect iOS once and render two native <select> (Month/Year) instead.
const isIOSDevice = (() => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ identifies as "MacIntel" but has touch support.
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
})();

// iOS-style wheel picker column: a vertically scrolling list with
// scroll-snap where the centered item is the "selected" value. Options is
// [{v, l}, ...]. Padding rows above/below let the first/last real option
// reach the centered slot. Mobile/iOS only (see SinglePeriodFilter) —
// desktop keeps the native <input type="month"> untouched, since a prior
// attempt at using this same pattern for both (v1.24.1) was reverted
// (v1.25.0) for not working well with mouse/scroll on desktop.
const WHEEL_ITEM_H = 34;
const WHEEL_VISIBLE = 5; // odd, so there's a single centered row
const WHEEL_PAD = Math.floor(WHEEL_VISIBLE / 2);

function WheelColumn({ options, value, onChange }) {
  const ref = useRef(null);
  const settleTimer = useRef(null);
  const idx = Math.max(0, options.findIndex((o) => o.v === value));

  // Keep the scroll position in sync when the selected value changes from
  // outside this column (e.g. popover just opened, or "reset to today").
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = idx * WHEEL_ITEM_H;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options.length]);

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const i = Math.round(el.scrollTop / WHEEL_ITEM_H);
      const clamped = Math.min(Math.max(i, 0), options.length - 1);
      el.scrollTo({ top: clamped * WHEEL_ITEM_H, behavior: "smooth" });
      const opt = options[clamped];
      if (opt && opt.v !== value) onChange(opt.v);
    }, 120);
  };

  const handleClick = (i) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: i * WHEEL_ITEM_H, behavior: "smooth" });
  };

  return (
    <div ref={ref} onScroll={handleScroll} style={S.wheelCol}>
      <div style={{ height: WHEEL_PAD * WHEEL_ITEM_H }} />
      {options.map((o, i) => {
        const dist = Math.abs(i - idx);
        return (
          <div key={o.v} onClick={() => handleClick(i)} style={S.wheelItem(dist)}>
            {o.l}
          </div>
        );
      })}
      <div style={{ height: WHEEL_PAD * WHEEL_ITEM_H }} />
    </div>
  );
}

function SinglePeriodFilter({ year, month, setYear, setMonth, years, minMonth, maxMonth }) {
  const inputRef = useRef(null);
  const anchorRef = useRef(null);
  const [wheelOpen, setWheelOpen] = useState(false);
  const inputValue = `${year}-${month}`;
  const todayMonth = todayISO().slice(0, 7);
  const isCurrent = inputValue === todayMonth;

  const handleInputChange = (e) => {
    const v = e.target.value; // "YYYY-MM"
    if (!v) return;
    const [y, m] = v.split("-");
    setYear(y);
    setMonth(m);
  };

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        // fall through to focus() below
      }
    }
    el.focus();
  };

  const resetToToday = () => {
    setYear(todayMonth.slice(0, 4));
    setMonth(todayMonth.slice(5, 7));
  };

  const yearOptions = useMemo(() => {
    const minY = parseInt((minMonth || inputValue).slice(0, 4), 10);
    const maxY = parseInt((maxMonth || inputValue).slice(0, 4), 10);
    const out = [];
    for (let y = maxY; y >= minY; y--) out.push(String(y));
    return out;
  }, [minMonth, maxMonth, inputValue]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {isIOSDevice ? (
        <div ref={anchorRef} style={{ position: "relative" }}>
          <button onClick={() => setWheelOpen((o) => !o)} style={S.chipBtn(true)} title="Filter by period">
            <span>{periodLabel(year, month)}</span>
            <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
          </button>
          <Popover
            open={wheelOpen}
            setOpen={setWheelOpen}
            anchorRef={anchorRef}
            style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}
          >
            <div style={{ position: "relative" }}>
              {/* Center-row highlight band, purely decorative (non-interactive). */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: WHEEL_PAD * WHEEL_ITEM_H,
                  height: WHEEL_ITEM_H,
                  borderTop: "1px solid rgba(255,255,255,0.15)",
                  borderBottom: "1px solid rgba(255,255,255,0.15)",
                  pointerEvents: "none",
                }}
              />
              <div style={{ display: "flex", gap: 4 }}>
                <WheelColumn options={MONTHS} value={month} onChange={setMonth} />
                <WheelColumn
                  options={yearOptions.map((y) => ({ v: y, l: y }))}
                  value={year}
                  onChange={setYear}
                />
              </div>
            </div>
          </Popover>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <button onClick={openPicker} style={S.chipBtn(true)} title="Filter by period">
            <span>{periodLabel(year, month)}</span>
            <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
          </button>
          <input
            ref={inputRef}
            type="month"
            value={inputValue}
            onChange={handleInputChange}
            min={minMonth}
            max={maxMonth}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: 0,
              border: 0,
              padding: 0,
              cursor: "pointer",
              pointerEvents: "none",
              colorScheme: "dark",
            }}
          />
        </div>
      )}
      {!isCurrent && (
        <button onClick={resetToToday} style={{ ...S.deleteBtn, width: 26, height: 26, padding: 0 }} title="Reset to current month">
          ⟲
        </button>
      )}
    </div>
  );
}

// Single-select category chip + Popover for the Dashboard (radio semantics —
// picking an option selects it and closes the popover). Mirrors
// SinglePeriodFilter's pattern; `value` is "All" or a single category string.
function SingleCategoryFilter({ value, options, setValue, isWide }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const active = value !== "All";
  const pick = (v) => {
    setValue(v);
    setOpen(false);
  };

  if (isWide) {
    // Desktop: native <select> styled to match the chip look (S.chipBtn),
    // with a custom arrow overlay (pointerEvents: none so it doesn't block clicks).
    return (
      <div style={{ position: "relative", display: "inline-flex" }}>
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          title="Filter by category"
          style={S.chipSelect(active)}
        >
          <option value="All">All categories</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <span style={S.chipSelectArrow}>▼</span>
      </div>
    );
  }

  return (
    <div ref={anchorRef} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={S.chipBtn(active)} title="Filter by category">
        <span>{active ? value : "All categories"}</span>
        <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
      </button>
      <Popover open={open} setOpen={setOpen} anchorRef={anchorRef}>
        <button onClick={() => pick("All")} style={S.popItem(!active)}>
          <span style={{ display: "inline-block", width: 14 }}>{!active ? "✓" : ""}</span>
          All categories
        </button>
        {options.map((o) => (
          <button key={o} onClick={() => pick(o)} style={S.popItem(value === o)}>
            <span style={{ display: "inline-block", width: 14 }}>{value === o ? "✓" : ""}</span>
            {o}
          </button>
        ))}
      </Popover>
    </div>
  );
}

// ===========================================================================
// Dashboard
// ===========================================================================

function Dashboard({ transactions, money, hideValues, isWide, budgets }) {
  // Default the period to the current month.
  const [year, setYear] = useState(() => todayISO().slice(0, 4));
  const [month, setMonth] = useState(() => todayISO().slice(5, 7));
  const [catFilter, setCatFilter] = useState("All");

  const all = useMemo(() => computeTotals(
    catFilter === "All" ? transactions : transactions.filter((t) => t.category === catFilter)
  ), [transactions, catFilter]);
  const years = useMemo(() => availableYears(transactions), [transactions]);
  // Bound the native month picker to the range of months with actual data.
  const monthRange = useMemo(() => {
    let min = null;
    let max = null;
    for (const t of transactions) {
      const ym = (t.date || "").slice(0, 7);
      if (!ym) continue;
      if (!min || ym < min) min = ym;
      if (!max || ym > max) max = ym;
    }
    return { min, max };
  }, [transactions]);
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

  // M/M and Y/Y totals for the hero card, limited to the same day-of-month
  // cutoff (MTD) as the selected period — same pattern as catChanges/sumCat.
  const heroComparisons = useMemo(() => {
    if (year === "All" || month === "All") return null;
    const prevMonthYear = month === "01" ? String(Number(year) - 1) : year;
    const prevMonthVal = month === "01" ? "12" : String(Number(month) - 1).padStart(2, "0");
    const prevYear = String(Number(year) - 1);
    const mmTxns = transactions.filter((t) => matchPeriod(t.date, prevMonthYear, prevMonthVal) && (catFilter === "All" || t.category === catFilter) && (cutoffDay === null || (t.date || "").slice(8, 10) <= cutoffDay));
    const yyTxns = transactions.filter((t) => matchPeriod(t.date, prevYear, month) && (catFilter === "All" || t.category === catFilter) && (cutoffDay === null || (t.date || "").slice(8, 10) <= cutoffDay));
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
      mmPctNet: pct(period.net, mm.net),
      yyPctNet: pct(period.net, yy.net),
    };
  }, [transactions, year, month, period, catFilter, cutoffDay]);

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
  const [paceView, setPaceView] = useState("expense");
  // "by Category" presentation: ranked list (default) or treemap.
  const [catView, setCatView] = useState("list");
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
        if (isTransfer(t.category)) continue;
        if (paceView === "income") {
          if (!isIncome(t.category)) continue;
        } else {
          if (isIncome(t.category)) continue;
        }
        if (catFilter !== "All" && t.category !== catFilter) continue;
        if (!t.date || !t.date.startsWith(monthKey)) continue;
        const day = parseInt(t.date.slice(8, 10), 10);
        const signed = Number(t.amount) || 0;
        byDay.set(day, (byDay.get(day) || 0) + (paceView === "income" ? signed : -signed));
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
    // End-of-month projection: extrapolate the current cumulative total by
    // average daily pace so far. Only meaningful when viewing the current
    // (partial) month — a past month is already complete.
    const isCurrentMonth = curMonthKey === todayMonth;
    const projectedTotal =
      isCurrentMonth && todayDay > 0 ? (curRunning / todayDay) * daysInCur : null;
    return {
      data,
      curLabel: monthLabel(curMonthKey),
      prevLabel: monthLabel(prevMonthKey),
      todayDay: isCurrentMonth ? todayDay : null,
      projectedTotal,
      prevTotal: prevRunning,
    };
  }, [transactions, year, month, catFilter, paceView]);

  const fmtK = (v) => {
    if (hideValues) return "";
    const abs = Math.abs(Number(v) || 0);
    if (abs < 1000) return `$${Math.round(abs)}`;
    return `$${(abs / 1000).toFixed(1)}K`;
  };

  return (
    <div style={S.col}>
      {/* Hero balance card — shows the SELECTED period */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <SinglePeriodFilter year={year} month={month} setYear={setYear} setMonth={setMonth} years={years} minMonth={monthRange.min} maxMonth={monthRange.max} />
        <SingleCategoryFilter value={catFilter} options={availableCats} setValue={setCatFilter} isWide={isWide} />
      </div>

      <div style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0) 45%), linear-gradient(145deg, rgba(22,26,32,0.7) 0%, rgba(27,34,54,0.7) 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 20,
        padding: "22px 20px 20px",
        position: "relative",
        overflow: "hidden",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.08)",
      }}>
        <div style={{
          position: "absolute", top: -40, right: -40, width: 120, height: 120,
          background: period.net >= 0 ? "rgba(52,211,153,0.13)" : "rgba(248,113,113,0.13)",
          borderRadius: "50%", filter: "blur(28px)", pointerEvents: "none",
        }} />
        <div style={{ fontSize: 10, color: "#8b94a3", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>
          {label}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.5, color: periodNetColor, lineHeight: 1.1 }}>
            {money(period.net)}
          </div>
          {heroComparisons && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {[["LM", heroComparisons.mm.net, heroComparisons.mmPctNet], ["LY", heroComparisons.yy.net, heroComparisons.yyPctNet]].map(([tag, refVal, p]) => {
                const fmtPct = (v) => v == null ? null : `${v > 0 ? "+" : ""}${v.toFixed(0)}%`;
                const pctColor = (v) => v == null ? "#6b7280" : v > 0 ? "#34d399" : "#f87171";
                return (
                  <div key={tag} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 9, color: "#6b7280", fontWeight: 600, minWidth: 14 }}>{tag}</span>
                    <span style={{ fontSize: 10, color: "#6b7280" }}>{hideValues ? "•••••" : usd0.format(refVal || 0)}</span>
                    {fmtPct(p) && <span style={{ fontSize: 10, fontWeight: 700, color: pctColor(p) }}>{hideValues ? "•••" : fmtPct(p)}</span>}
                  </div>
                );
              })}
            </div>
          )}
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

      <DailyPaceCard paceData={dashboardPaceData} hideValues={hideValues} fmtK={fmtK} paceView={paceView} setPaceView={setPaceView} />

      {/* Category breakdown for the selected period */}
      {year !== "All" && month !== "All" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={S.sectionTitle}>{label} — by Category</h3>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setCatView("list")} style={S.togglePill(catView === "list")}>
                List
              </button>
              <button onClick={() => setCatView("map")} style={S.togglePill(catView === "map")}>
                Map
              </button>
            </div>
          </div>
          {catExpenses.length === 0 ? (
            <Empty>No expenses in this period.</Empty>
          ) : catView === "map" ? (
            <CategoryTreemapCard catExpenses={catExpenses} hideValues={hideValues} />
          ) : (
            <div style={{ ...S.card, padding: "8px 0" }}>
              {catExpenses.map(([cat, total], idx) => {
                const dotColor = getCategoryColor(cat);
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
                      background: `linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0) 60%), linear-gradient(135deg, ${dotColor} 0%, ${dotColor}99 100%)`,
                      display: "grid", placeItems: "center",
                      boxShadow: `0 2px 8px ${dotColor}59, inset 0 1px 1px rgba(255,255,255,0.3)`,
                    }}>
                      {React.createElement(catIcon(cat), { size: 16, color: "#fff" })}
                    </div>
                    {/* Name + badges */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: "#e5e7eb", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cat}
                      </div>
                      <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
                        <ChangeBadge label="M/M" pct={changes.mm} hideValues={hideValues} />
                        <ChangeBadge label="Y/Y" pct={changes.yy} hideValues={hideValues} />
                        <AnomalyBadge total={total} avg12m={changes.avg12m} hideValues={hideValues} />
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

      {/* Budgets — bullet bars for the selected month (set in Settings) */}
      {year !== "All" && month !== "All" && (
        <BudgetsCard
          budgets={budgets}
          catExpenses={catExpenses}
          cutoffDay={cutoffDay}
          year={year}
          month={month}
          money={money}
          hideValues={hideValues}
        />
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

// Treemap view of the "by Category" breakdown: rectangle area ∝ net spend
// magnitude, colored with the same getCategoryColor used everywhere else.
// Categories whose refunds net the bucket to ≥ 0 are omitted (no area).
function TreemapNode(props) {
  const { x, y, width, height, name, value, depth, hideValues } = props;
  if (depth === 0 || !name || width <= 0 || height <= 0) return null;
  const color = getCategoryColor(name);
  const showName = width > 56 && height > 26;
  const showValue = !hideValues && width > 56 && height > 42;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4} fill={color} fillOpacity={0.85} stroke="#0b0d10" strokeWidth={2} />
      {showName && (
        <text x={x + 7} y={y + 17} fill="#fff" fontSize={11} fontWeight={600}>
          {name}
        </text>
      )}
      {showValue && (
        <text x={x + 7} y={y + 32} fill="rgba(255,255,255,0.85)" fontSize={10}>
          {usd0.format(value)}
        </text>
      )}
    </g>
  );
}

function CategoryTreemapCard({ catExpenses, hideValues }) {
  const data = useMemo(
    () =>
      catExpenses
        .filter(([, v]) => v < 0)
        .map(([cat, v]) => ({ name: cat, size: -v })),
    [catExpenses]
  );
  if (data.length === 0) return <Empty>No expenses in this period.</Empty>;
  return (
    <div style={{ ...S.card, padding: 8, height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={data}
          dataKey="size"
          nameKey="name"
          isAnimationActive={false}
          content={<TreemapNode hideValues={hideValues} />}
        >
          {!hideValues && (
            <Tooltip
              formatter={(v) => usd.format(v)}
              contentStyle={{ background: "#161a20", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
              itemStyle={{ color: "#e5e7eb" }}
              labelStyle={{ color: "#8b94a3" }}
            />
          )}
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}

// Average daily-spend-by-day-of-month pattern, over whatever scope Trends
// currently has selected (category filter + year range — the same `scoped`
// array MonthlyBarCard/CategoryStackedBarCard read from; granularity M/Q/H/Y
// doesn't apply here, a day-of-month pattern is granularity-independent).
// For each day 1–31, averages that day's net expense across every month
// present in scope that actually HAS that day (so day 31 divides only by
// 31-day months, not by every month — otherwise it would read artificially
// low). Cell intensity ∝ the average. Pure divs — no chart lib.
function DailyHeatmapCard({ scoped, hideValues, isWide }) {
  const { byDay, topCatsByDay, max, monthCount } = useMemo(() => {
    const daySum = new Map();
    const dayCatSum = new Map(); // day -> Map(cat -> total)
    const monthsSeen = new Set();
    for (const t of scoped) {
      if (isTransfer(t.category) || isIncome(t.category)) continue;
      const d = t.date || "";
      const day = parseInt(d.slice(8, 10), 10);
      const ym = d.slice(0, 7);
      if (!day || !ym) continue;
      monthsSeen.add(ym);
      daySum.set(day, (daySum.get(day) || 0) + (Number(t.amount) || 0));
      if (!dayCatSum.has(day)) dayCatSum.set(day, new Map());
      const catMap = dayCatSum.get(day);
      const cat = t.category || "Uncategorized";
      catMap.set(cat, (catMap.get(cat) || 0) + (Number(t.amount) || 0));
    }
    // Count, per day-of-month, how many of the scoped months actually
    // contain that day (Feb/Apr/Jun/Sep/Nov don't have a 31st, Feb often
    // lacks a 29th/30th) — the divisor for a fair average.
    const monthDayCounts = new Map();
    for (const ym of monthsSeen) {
      const [y, mo] = ym.split("-").map(Number);
      const dim = new Date(y, mo, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        monthDayCounts.set(d, (monthDayCounts.get(d) || 0) + 1);
      }
    }
    const avgByDay = new Map();
    const topCats = new Map();
    let mx = 0;
    for (let d = 1; d <= 31; d++) {
      const count = monthDayCounts.get(d) || 0;
      const total = daySum.get(d) || 0;
      const spend = total < 0 ? -total : 0;
      const avg = count > 0 ? spend / count : 0;
      avgByDay.set(d, avg);
      if (avg > mx) mx = avg;

      const catMap = dayCatSum.get(d);
      if (catMap) {
        const catAvgs = Array.from(catMap.entries())
          .map(([cat, tot]) => ({ cat, avg: tot < 0 ? (-tot / (count || 1)) : 0 }))
          .filter((c) => c.avg > 0)
          .sort((a, b) => b.avg - a.avg)
          .slice(0, 3);
        topCats.set(d, catAvgs);
      }
    }
    return { byDay: avgByDay, topCatsByDay: topCats, max: mx, monthCount: monthsSeen.size };
  }, [scoped]);

  const [activeDay, setActiveDay] = useState(null);
  useEffect(() => {
    setActiveDay(null);
  }, [scoped]);

  if (max === 0) return null;

  const cellBg = (spend) => {
    if (!spend) return "rgba(255,255,255,0.05)";
    const t = Math.sqrt(spend / max); // sqrt eases the skew from one huge day
    return `rgba(249,115,22,${(0.15 + 0.75 * t).toFixed(2)})`;
  };

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const fmt = (n) => (hideValues ? "•••••" : usd.format(n));
  const toggleDay = (d) => setActiveDay((prev) => (prev === d ? null : d));

  const activeSpend = activeDay ? byDay.get(activeDay) || 0 : 0;
  const activeCats = activeDay ? topCatsByDay.get(activeDay) || [] : [];

  return (
    <div style={{ ...S.card, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ ...S.sectionTitle, margin: 0 }}>Daily Spend Pattern</h3>
        <span style={{ fontSize: 10, color: "#6b7280" }}>avg / day, {monthCount} mo</span>
      </div>
      {isWide ? (
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: 110, width: 34, textAlign: "right" }}>
            {[max, max / 2, 0].map((v, i) => (
              <span key={i} style={{ fontSize: 9, color: "#6b7280", lineHeight: 1 }}>
                {hideValues ? "•••" : usd0.format(v)}
              </span>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 2, height: 110 }}>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", pointerEvents: "none" }}>
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />
              </div>
              {days.map((d) => {
                const spend = byDay.get(d) || 0;
                const h = max > 0 ? Math.max(spend > 0 ? 3 : 1, (spend / max) * 100) : 1;
                return (
                  <div
                    key={`bar-${d}`}
                    onClick={() => spend && toggleDay(d)}
                    style={{
                      flex: 1,
                      height: "100%",
                      display: "flex",
                      alignItems: "flex-end",
                      cursor: spend ? "pointer" : "default",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: `${h}%`,
                        borderRadius: "3px 3px 0 0",
                        background: cellBg(spend),
                        outline: activeDay === d ? "1px solid rgba(255,255,255,0.5)" : "none",
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
              {days.map((d) => (
                <div
                  key={`lbl-${d}`}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    fontSize: 8,
                    color: d === activeDay ? "#e5e7eb" : "#6b7280",
                    fontWeight: d === activeDay ? 700 : 400,
                  }}
                >
                  {d}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {days.map((d) => {
            const spend = byDay.get(d) || 0;
            return (
              <div
                key={`day-${d}`}
                onClick={() => spend && toggleDay(d)}
                style={{
                  aspectRatio: "1",
                  borderRadius: 5,
                  background: cellBg(spend),
                  display: "grid",
                  placeItems: "center",
                  fontSize: 10,
                  color: spend / max > 0.45 ? "#fff" : "#8b94a3",
                  fontWeight: spend ? 600 : 400,
                  cursor: spend ? "pointer" : "default",
                  outline: activeDay === d ? "1px solid rgba(255,255,255,0.5)" : "none",
                }}
              >
                {d}
              </div>
            );
          })}
        </div>
      )}
      {activeDay != null && (
        <div style={{
          marginTop: 10, padding: "10px 12px", borderRadius: 14,
          background: "#1e2329", border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: activeCats.length ? 8 : 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#e5e7eb" }}>Day {activeDay}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24" }}>{fmt(activeSpend)}</span>
          </div>
          {activeCats.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {activeCats.map(({ cat, avg }) => (
                <div key={cat} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8b94a3" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
                  <span style={{ color: "#e5e7eb", marginLeft: 8, whiteSpace: "nowrap" }}>{fmt(avg)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Bullet-style budget bars for the selected month. For each category with a
// budget set (Settings → Monthly budgets): filled bar = spent/budget, thin
// white marker = where spend "should" be at the current day of the month
// (cutoffDay/daysInMonth — full month for past periods). Green on pace,
// amber when >10 pts ahead of pace, red when over budget.
function BudgetsCard({ budgets, catExpenses, cutoffDay, year, month, money, hideValues }) {
  const entries = Object.entries(budgets || {}).filter(([, v]) => Number(v) > 0);
  if (entries.length === 0) return null;
  const spentBy = new Map(catExpenses);
  const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
  const pacePos = cutoffDay != null ? Math.min(Number(cutoffDay) / daysInMonth, 1) : 1;
  const rows = entries
    .map(([cat, limit]) => {
      const raw = spentBy.get(cat) || 0;
      const spent = raw < 0 ? -raw : 0; // refunds can push a bucket ≥ 0 → nothing spent
      const budget = Number(limit);
      return { cat, budget, spent, pct: spent / budget };
    })
    .sort((a, b) => b.pct - a.pct);
  return (
    <>
      <h3 style={S.sectionTitle}>Budgets</h3>
      <div style={{ ...S.card, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map(({ cat, budget, spent, pct }) => {
          const over = pct > 1;
          const ahead = pct > pacePos + 0.1;
          const barColor = over ? "#f87171" : ahead ? "#fbbf24" : "#34d399";
          return (
            <div key={cat}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5, gap: 8 }}>
                <span style={{ fontSize: 12, color: "#e5e7eb", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
                <span style={{ fontSize: 11, color: over ? "#f87171" : "#8b94a3", whiteSpace: "nowrap" }}>
                  {money(spent)} / {money(budget)}
                  {!hideValues && (
                    <span style={{ fontWeight: 700, color: barColor, marginLeft: 6 }}>{Math.round(pct * 100)}%</span>
                  )}
                </span>
              </div>
              <div style={{ position: "relative", height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)" }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(pct, 1) * 100}%`, borderRadius: 3, background: barColor }} />
                <div style={{ position: "absolute", left: `calc(${pacePos * 100}% - 1px)`, top: -2, width: 2, height: 10, background: "rgba(255,255,255,0.45)", borderRadius: 1 }} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// Amber warning badge when the period's spend in a category is already at
// least 1.5× its 12-month full-month average — an early anomaly signal.
// Conservative on purpose: `total` is month-to-date while `avg12m` is a
// full-month average, so no prorating guesswork and no false alarms early
// in the month. Both values are signed (expenses negative).
function AnomalyBadge({ total, avg12m, hideValues }) {
  if (hideValues) return null;
  if (avg12m == null || avg12m >= 0 || total >= 0) return null;
  const ratio = total / avg12m; // both negative → positive ratio
  if (ratio < 1.5) return null;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color: "#fbbf24",
      background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)",
      borderRadius: 5, padding: "1px 5px", whiteSpace: "nowrap",
    }}>
      ⚠ {ratio.toFixed(1)}× avg
    </span>
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

function MonthlyBarCard({ byBucket, hideValues, fmtK, fmtKTooltip, fmtBucketLabel, granularity }) {
  const [view, setView] = useState("expense");

  const isInc = view === "income";
  const isNet = view === "net";
  const dataKey = isNet ? "net" : isInc ? "income" : "expenses";
  const barColor = isNet ? "#34d399" : isInc ? "#06B6D4" : "#F97316";
  const cardTitle = isNet ? "Net" : isInc ? "Income" : "Expense";
  const axisFmt = isNet ? (fmtKTooltip || fmtK) : fmtK;

  // Net view needs a per-bucket `net = income - expenses` field, and each
  // bar colored by sign (green ≥ 0, red < 0) rather than a single static fill.
  // At monthly granularity, also compute trailing 3M/12M moving averages of
  // the active series (null until the window is complete, so the lines start
  // at the 3rd/12th bucket instead of showing misleading partial averages).
  const showMA = granularity === "M";
  const chartData = useMemo(() => {
    const rows = byBucket.map((row) =>
      isNet ? { ...row, net: (row.income || 0) - (row.expenses || 0) } : { ...row }
    );
    if (showMA) {
      const vals = rows.map((r) => r[dataKey] || 0);
      const trailing = (i, w) =>
        i + 1 >= w ? vals.slice(i + 1 - w, i + 1).reduce((a, b) => a + b, 0) / w : null;
      rows.forEach((r, i) => {
        r.ma3 = trailing(i, 3);
        r.ma12 = trailing(i, 12);
      });
    }
    return rows;
  }, [byBucket, isNet, dataKey, showMA]);
  const hasMa3 = showMA && chartData.length >= 3;
  const hasMa12 = showMA && chartData.length >= 12;

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
          <button
            onClick={() => setView("net")}
            style={S.togglePill(view === "net")}
          >
            Net
          </button>
        </div>
      </div>
      {hasMa3 && (
        <div style={{ display: "flex", gap: 14, padding: "8px 16px 0", justifyContent: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#8b94a3" }}>
            <span style={{ display: "inline-block", width: 14, height: 2, background: "#e5e7eb", borderRadius: 1 }} />
            3M avg
          </span>
          {hasMa12 && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#8b94a3" }}>
              <span style={{ display: "inline-block", width: 14, borderTop: "1.5px dashed #a78bfa" }} />
              12M avg
            </span>
          )}
        </div>
      )}
      <div style={{ height: 260 }}>
        {byBucket.length === 0 ? (
          <Empty>No data to chart yet.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="bucket" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtBucketLabel} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={axisFmt} width={56} />
              {!hideValues && (
                <Tooltip
                  cursor={false}
                  position={{ y: 0 }}
                  content={<ChartTooltip fmtValue={fmtKTooltip || fmtK} formatLabel={fmtBucketLabel} />}
                />
              )}
              <Bar dataKey={dataKey} name={isNet ? "Net" : isInc ? "Income" : "Expenses"} fill={barColor} radius={[4, 4, 0, 0]} activeBar={{ fill: barColor, opacity: 0.75 }}>
                {isNet &&
                  chartData.map((row, i) => (
                    <Cell key={`net-cell-${i}`} fill={row.net >= 0 ? "#34d399" : "#f87171"} />
                  ))}
                <LabelList
                  dataKey={dataKey}
                  position="top"
                  content={({ x, y, width, value }) =>
                    hideValues || !value ? null : (
                      <text x={x + width / 2} y={y - 4} textAnchor="middle" fill="#6b7280" fontSize={10}>
                        {axisFmt(value)}
                      </text>
                    )
                  }
                />
              </Bar>
              {hasMa3 && (
                <Line
                  type="monotone"
                  dataKey="ma3"
                  name="3M avg"
                  stroke="#e5e7eb"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
              {hasMa12 && (
                <Line
                  type="monotone"
                  dataKey="ma12"
                  name="12M avg"
                  stroke="#a78bfa"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bucket helpers for Charts granularity
// ---------------------------------------------------------------------------

// bucketKey / bucketLabel now live in src/ledger.js (imported above).

// ===========================================================================
// ChartTooltip — shared tooltip for every Trends chart: sorts series highest
// to lowest and colors each by its own series color. Renders full-height,
// no internal scroll — paired with the `position={{ y: 0 }}` pin on every
// <Tooltip> below, it always grows downward from the top of the chart, so
// it has the whole card's remaining height (chart + legend) to fit in
// instead of racing the cursor's Y position down toward the chart's edge.
// That room matters because every card uses `backdropFilter` (the "Liquid
// Glass" look), which creates a CSS stacking context — a tooltip that still
// overflows past its own card isn't clipped, it gets painted over by the
// next card down, since sibling stacking contexts paint in DOM order.
// `mode: "percent"` shows each series' share of the bucket (Composition
// Evolution); `mode: "currency"` (default) shows `fmtValue(value)`.
// ===========================================================================
function ChartTooltip({ active, payload, label, mode = "currency", fmtValue, formatLabel }) {
  if (!active || !payload || payload.length === 0) return null;
  const total = mode === "percent" ? payload.reduce((s, p) => s + (Number(p.value) || 0), 0) : 0;
  const sorted = [...payload]
    .filter((p) => Number(p.value) > 0)
    .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
  if (sorted.length === 0) return null;
  const labelText = formatLabel ? formatLabel(label) : label;
  return (
    <div
      style={{
        background: "#1e2329",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        padding: "6px 10px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        maxWidth: 200,
      }}
    >
      <div style={{ color: "#8b94a3", marginBottom: 3, fontSize: 11 }}>{labelText}</div>
      {sorted.map((p) => (
        <div
          key={p.dataKey ?? p.name}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, color: "#e5e7eb", fontSize: 10, lineHeight: "16px" }}
        >
          <span style={{ color: p.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
          <span style={{ flexShrink: 0 }}>
            {mode === "percent" ? (total ? `${Math.round((Number(p.value) / total) * 100)}%` : "0%") : fmtValue(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ===========================================================================
// DailyPaceCard — cumulative daily spending: this month vs previous month
// ===========================================================================

function DailyPaceCard({ paceData, hideValues, fmtK, paceView, setPaceView }) {
  if (!paceData || paceData.data.length === 0) return null;
  const { data, curLabel, prevLabel, todayDay, projectedTotal, prevTotal } = paceData;
  const isInc = paceView === "income";
  const curColor = isInc ? "#06B6D4" : "#F97316";
  // Projection vs last month: for expenses, tracking higher is bad (red);
  // for income, higher is good (green).
  const projColor =
    projectedTotal == null || !prevTotal
      ? "#8b94a3"
      : (projectedTotal > prevTotal) === isInc
      ? "#34d399"
      : "#f87171";

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={S.sectionTitle}>Daily Spending Pace</h3>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setPaceView("expense")}
            style={S.togglePill(paceView === "expense")}
          >
            Expense
          </button>
          <button
            onClick={() => setPaceView("income")}
            style={S.togglePill(paceView === "income")}
          >
            Income
          </button>
        </div>
      </div>
      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        {/* Minimal inline legend — colored line swatches, no heavy recharts Legend */}
        <div style={{ display: "flex", gap: 14, padding: "12px 16px 0", justifyContent: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#8b94a3" }}>
            <span style={{ display: "inline-block", width: 14, height: 2, background: curColor, borderRadius: 1 }} />
            {curLabel}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#6b7280" }}>
            <span style={{ display: "inline-block", width: 14, borderTop: "1.5px dashed #6b7280" }} />
            {prevLabel}
          </span>
        </div>
        {projectedTotal != null && !hideValues && (
          <div style={{ textAlign: "center", fontSize: 11, color: "#8b94a3", paddingTop: 6 }}>
            Projected {curLabel}:{" "}
            <span style={{ fontWeight: 700, color: projColor }}>{fmtK(projectedTotal)}</span>
            {prevTotal > 0 && <> · {prevLabel}: {fmtK(prevTotal)}</>}
          </div>
        )}
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="curGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={curColor} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={curColor} stopOpacity={0} />
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
                  contentStyle={{ background: "#161a20", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
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
                stroke={curColor}
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
                content={<ChartTooltip fmtValue={fmtKFull} formatLabel={(bk) => bucketLabel(bk)} />}
                cursor={false}
                position={{ y: 0 }}
              />
            )}
            {cats.map((cat, i) => (
              <Bar
                key={cat}
                dataKey={cat}
                name={cat}
                stackId="cat"
                fill={getCategoryColor(cat)}
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
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: getCategoryColor(cat) }} />
            {cat}
          </span>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// CompositionEvolutionCard — 100% stacked area of category composition over
// time. Bucketing follows the same `granularity` (M/Q/H/Y) the masthead
// switch already applies to the other Trends cards, so the X axis always
// matches what the user picked up top. Tooltip shows each category's share
// of the bucket (highest to lowest), not raw dollar amounts.
// ===========================================================================

function CompositionEvolutionCard({ scoped, granularity, hideValues }) {
  const [mode, setMode] = useState("expense");

  const { rows, cats } = useMemo(() => {
    const map = new Map();
    const catTotals = {};
    for (const t of scoped) {
      if (isTransfer(t.category)) continue;
      if (mode === "expense") {
        if (isIncome(t.category)) continue;
      } else {
        if (!isIncome(t.category)) continue;
      }
      const bk = bucketKey(t.date, granularity);
      if (!bk) continue;
      if (!map.has(bk)) map.set(bk, { bucket: bk });
      const entry = map.get(bk);
      const val = Number(t.amount) || 0; // signed: refunds/clawbacks net out
      entry[t.category] = (entry[t.category] || 0) + val;
      catTotals[t.category] = (catTotals[t.category] || 0) + val;
    }

    const cats = Object.keys(catTotals).sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    // Every category needs an explicit 0 for buckets where it had no
    // transactions — an absent key (vs. 0) reads as a gap to recharts'
    // monotone-curve stacking, which tears the fill into the jagged black
    // wedges seen when a category goes quiet for a stretch of buckets.
    const rows = [...map.values()]
      .map(({ bucket, ...vals }) => {
        const newRow = { bucket };
        for (const cat of cats) {
          newRow[cat] = Math.abs(vals[cat] || 0);
        }
        return newRow;
      })
      .sort((a, b) => (a.bucket < b.bucket ? -1 : 1));

    return { rows, cats };
  }, [scoped, mode, granularity]);

  if (rows.length === 0) return null;

  return (
    <div style={{ ...S.card, padding: 0, overflow: "visible" }}>
      {/* Header — title + Expense/Income toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 0" }}>
        <h3 style={{ ...S.sectionTitle, margin: 0 }}>Composition Evolution</h3>
        <div style={{ display: "flex", gap: 4 }}>
          {["expense", "income"].map((m) => (
            <button key={m} onClick={() => setMode(m)} style={S.togglePill(mode === m)}>
              {m === "income" ? "Income" : "Expense"}
            </button>
          ))}
        </div>
      </div>
      {/* Chart */}
      <div style={{ height: 260, marginTop: 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} stackOffset="expand" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="bucket"
              tickFormatter={(bk) => bucketLabel(bk)}
              tick={{ fill: "#6b7280", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={(v) => (hideValues ? "" : `${Math.round(v * 100)}%`)}
              tick={{ fill: "#6b7280", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            {!hideValues && (
              <Tooltip
                content={<ChartTooltip mode="percent" formatLabel={(bk) => bucketLabel(bk)} />}
                cursor={false}
                position={{ y: 0 }}
              />
            )}
            {cats.map((cat) => (
              <Area
                key={cat}
                type="monotone"
                dataKey={cat}
                name={cat}
                stackId="comp"
                stroke={getCategoryColor(cat)}
                fill={getCategoryColor(cat)}
                fillOpacity={0.75}
                strokeWidth={1}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* Legend — below chart, only categories present in the current period */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", padding: "8px 16px 14px", justifyContent: "center" }}>
        {cats.map((cat) => (
          <span key={cat} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#6b7280" }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: getCategoryColor(cat) }} />
            {cat}
          </span>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// MonthlyAvgByCategoryCard — stacked bar chart of yearly totals divided into
// a monthly average (always Y granularity, always ALL years, ignoring the
// Charts year-range filter — see `scopedAllYears` in Charts).
// ===========================================================================

function MonthlyAvgByCategoryCard({ scopedAllYears, hideValues, fmtK, fmtKFull }) {
  const [mode, setMode] = useState("expense");

  const { rows, cats } = useMemo(() => {
    const map = new Map();
    const catTotals = {};

    for (const t of scopedAllYears) {
      if (isTransfer(t.category)) continue;
      if (mode === "expense") {
        if (isIncome(t.category)) continue;
      } else {
        if (!isIncome(t.category)) continue;
      }
      const bk = bucketKey(t.date, "Y");
      if (!bk) continue;
      if (!map.has(bk)) map.set(bk, { bucket: bk });
      const entry = map.get(bk);
      const val = Number(t.amount) || 0; // signed: refunds/clawbacks net out
      entry[t.category] = (entry[t.category] || 0) + val;
      catTotals[t.category] = (catTotals[t.category] || 0) + val;
    }

    const now = new Date();
    const currentYear = String(now.getFullYear());
    const currentMonth = now.getMonth() + 1; // e.g. July = 7

    // Apply Math.abs per category after netting, then divide by the monthly
    // divisor for that year (current year in progress → month-to-date count;
    // any other year, incl. future years defensively → 12).
    const rows = [...map.values()]
      .map(({ bucket, ...cats }) => {
        const newRow = { bucket };
        const divisor = bucket === currentYear ? currentMonth : 12;
        let total = 0;
        for (const [cat, v] of Object.entries(cats)) {
          const absV = Math.abs(v) / divisor;
          newRow[cat] = absV;
          total += absV;
        }
        newRow._total = total;
        return newRow;
      })
      .sort((a, b) => a.bucket.localeCompare(b.bucket));

    // L12M — trailing 12 full months, excluding the current (partial) month.
    // E.g. today 2026-07-05 → window is 2025-07 through 2026-06. Divisor is
    // always 12 (fixed, unlike the current-year YTD bar). Appended explicitly
    // after the sort above so it always renders last, regardless of its key.
    const pad2 = n => String(n).padStart(2, "0");
    const l12mEndExclusive = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of current month
    const l12mStart = new Date(l12mEndExclusive.getFullYear(), l12mEndExclusive.getMonth() - 12, 1);
    const l12mStartKey = `${l12mStart.getFullYear()}-${pad2(l12mStart.getMonth() + 1)}`;
    const l12mEndKey = `${l12mEndExclusive.getFullYear()}-${pad2(l12mEndExclusive.getMonth() + 1)}`; // exclusive

    const l12mCatTotals = {};
    for (const t of scopedAllYears) {
      if (isTransfer(t.category)) continue;
      if (mode === "expense") {
        if (isIncome(t.category)) continue;
      } else {
        if (!isIncome(t.category)) continue;
      }
      const mk = t.date ? t.date.slice(0, 7) : null;
      if (!mk || mk < l12mStartKey || mk >= l12mEndKey) continue;
      const val = Number(t.amount) || 0; // signed: refunds/clawbacks net out
      l12mCatTotals[t.category] = (l12mCatTotals[t.category] || 0) + val;
    }
    if (Object.keys(l12mCatTotals).length > 0) {
      const l12mRow = { bucket: "L12M" };
      let l12mTotal = 0;
      for (const [cat, v] of Object.entries(l12mCatTotals)) {
        const absV = Math.abs(v) / 12;
        l12mRow[cat] = absV;
        l12mTotal += absV;
      }
      l12mRow._total = l12mTotal;
      rows.push(l12mRow);
    }

    const cats = Object.keys(catTotals).sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return { rows, cats };
  }, [scopedAllYears, mode]);

  if (rows.length === 0) return null;

  return (
    <div style={{ ...S.card, padding: 0, overflow: "visible" }}>
      {/* Header — title + mode toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 0" }}>
        <h3 style={{ ...S.sectionTitle, margin: 0 }}>Monthly Avg by Category</h3>
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
              tickFormatter={bk => (bk === "L12M" ? "L12M" : bucketLabel(bk))}
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
                content={<ChartTooltip fmtValue={fmtKFull} formatLabel={(bk) => (bk === "L12M" ? "L12M" : bucketLabel(bk))} />}
                cursor={false}
                position={{ y: 0 }}
              />
            )}
            {cats.map((cat, i) => (
              <Bar
                key={cat}
                dataKey={cat}
                name={cat}
                stackId="cat"
                fill={getCategoryColor(cat)}
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
      {/* Legend — below chart, only categories present across all years */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", padding: "8px 16px 14px", justifyContent: "center" }}>
        {cats.map(cat => (
          <span key={cat} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#6b7280" }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: getCategoryColor(cat) }} />
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

// Duplicate-visibility filter options for the Import preview segmented control
const DUP_FILTERS = [
  { v: "all", l: "All" },
  { v: "new", l: "New Only" },
  { v: "dup", l: "Dup Only" },
];

// Horizontal drag-to-select year range: a track with two draggable handles
// (pointer events, mouse + touch) mapping X position to the nearest year in
// `years` (ascending). Reuses the caller's existing clamp handlers so From/To
// ordering logic stays in one place.
function YearRangeSlider({ years, fromYear, toYear, onFromYear, onToYear, trackStyle }) {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(null); // "from" | "to" | null

  const fromIdx = Math.max(0, years.indexOf(fromYear));
  const toIdx = Math.max(0, years.indexOf(toYear));
  const n = years.length;

  const pctFor = (idx) => (n <= 1 ? 0 : (idx / (n - 1)) * 100);

  const yearFromClientX = (clientX) => {
    const el = trackRef.current;
    if (!el || n <= 1) return years[0];
    const r = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const idx = Math.round(ratio * (n - 1));
    return years[Math.max(0, Math.min(n - 1, idx))];
  };

  const startDrag = (which) => (e) => {
    e.preventDefault();
    e.target.setPointerCapture?.(e.pointerId);
    setDragging(which);
  };

  const onMove = (e) => {
    if (!dragging) return;
    const y = yearFromClientX(e.clientX);
    if (dragging === "from") onFromYear(y);
    else onToYear(y);
  };

  const endDrag = () => setDragging(null);

  if (n === 0) return null;

  return (
    <div style={{ ...S.yearRangeWrap, ...trackStyle }}>
      <div
        style={S.yearRangeTrack}
        ref={trackRef}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          style={{
            ...S.yearRangeFill,
            left: `${pctFor(Math.min(fromIdx, toIdx))}%`,
            right: `${100 - pctFor(Math.max(fromIdx, toIdx))}%`,
          }}
        />
        <div
          role="slider"
          aria-label="From year"
          aria-valuenow={fromYear}
          onPointerDown={startDrag("from")}
          style={{
            ...S.yearRangeHandle,
            left: `${pctFor(fromIdx)}%`,
            transform: `translate(${fromIdx === toIdx ? "-100%" : "-50%"}, -50%)`,
            zIndex: dragging === "from" ? 3 : 1,
          }}
        >
          {fromIdx === toIdx ? null : <span style={S.yearRangeLabel}>{fromYear}</span>}
        </div>
        <div
          role="slider"
          aria-label="To year"
          aria-valuenow={toYear}
          onPointerDown={startDrag("to")}
          style={{
            ...S.yearRangeHandle,
            left: `${pctFor(toIdx)}%`,
            transform: `translate(${fromIdx === toIdx ? "0%" : "-50%"}, -50%)`,
            zIndex: dragging === "to" ? 3 : 2,
          }}
        >
          <span style={S.yearRangeLabel}>{toYear}</span>
        </div>
      </div>
    </div>
  );
}

function Charts({ transactions, hideValues, config, isWide }) {
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

  // Central setter for the year range: applies the from/to clamp and, when
  // the resulting span exceeds one year, nudges granularity to "Y" as a
  // sensible default (not a lock — the user can still pick M/Q/H afterwards
  // even with a multi-year range). Used by drag handles and the All/L3Y/YTD
  // preset buttons alike, so the rule lives in exactly one place.
  const applyYearRange = (from, to) => {
    setFromYear(from);
    setToYear(to);
    if (from && to && from !== to) setGranularity("Y");
    else if (from && to && from === to) setGranularity("M");
  };

  // Clamp: from can't pass to, and vice versa — each handle stops at the
  // other's position rather than dragging it along.
  const handleFromYear = (v) => {
    const next = toYearEff && v > toYearEff ? toYearEff : v;
    applyYearRange(next, toYearEff);
  };
  const handleToYear = (v) => {
    const next = fromYearEff && v < fromYearEff ? fromYearEff : v;
    applyYearRange(fromYearEff, next);
  };

  // All / L3Y / YTD presets, built from the available years + current date.
  const currentYear = String(new Date().getFullYear());
  const oldestYear = years.length ? years[years.length - 1] : currentYear;
  const newestYear = years.length ? years[0] : currentYear;
  const l3yFrom = (() => {
    const target = String(Number(currentYear) - 2);
    return target > oldestYear ? target : oldestYear;
  })();

  const rangePresets = [
    { v: "all", l: "All", from: oldestYear, to: newestYear },
    { v: "l3y", l: "L3Y", from: l3yFrom, to: currentYear },
    { v: "ytd", l: "YTD", from: currentYear, to: currentYear },
  ];
  const activePreset = rangePresets.find((p) => p.from === fromYearEff && p.to === toYearEff)?.v;

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

  // Category-only scope, ignoring the year-range filter — feeds the
  // Monthly Avg by Category card, which always shows every year.
  const scopedAllYears = useMemo(() => {
    if (categoryFilter.length === 0) return transactions;
    return transactions.filter((t) => categoryFilter.includes(t.category));
  }, [transactions, categoryFilter]);

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

  // fmtK: format value as $X.XXK, respects hideValues. Values under $1K are
  // shown as a plain rounded dollar amount instead of e.g. "$0.1K".
  const fmtK = (v) => {
    if (hideValues) return "";
    const abs = Math.abs(Number(v) || 0);
    if (abs < 1000) return `$${Math.round(abs)}`;
    return `$${(abs / 1000).toFixed(1)}K`;
  };

  // Tooltip formatter that also handles the value sign (negative income is ok).
  const fmtKFull = (v) => {
    if (hideValues) return "•••••";
    const n = Number(v) || 0;
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    if (abs < 1000) return `${sign}$${Math.round(abs)}`;
    return `${sign}$${(abs / 1000).toFixed(1)}K`;
  };

  const rangeLabel =
    fromYearEff && toYearEff && fromYearEff !== toYearEff
      ? `${fromYearEff}–${toYearEff}`
      : fromYearEff || toYearEff || "All Time";

  // Year options for the range selectors (oldest first for the from/to order).
  const yearOptsAsc = [...years].sort((a, b) => (a < b ? -1 : 1));

  const categoryChip = (
    <HeaderFilter
      label="Category"
      value={categoryFilter}
      options={categoryOptions}
      onChange={setCategoryFilter}
      chip
    />
  );

  const granularitySwitch = (
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
  );

  const rangePresetsSwitch = (
    <div style={S.segmented}>
      {rangePresets.map(({ v, l, from, to }) => (
        <button
          key={v}
          onClick={() => applyYearRange(from, to)}
          style={S.segmentedBtn(activePreset === v)}
        >
          {l}
        </button>
      ))}
    </div>
  );

  const yearRangeSlider = (
    <YearRangeSlider
      years={yearOptsAsc}
      fromYear={fromYearEff}
      toYear={toYearEff}
      onFromYear={handleFromYear}
      onToYear={handleToYear}
      trackStyle={isWide ? { margin: "18px 0 8px", flexGrow: 0, flex: "0 1 260px" } : undefined}
    />
  );

  return (
    <div style={S.col}>
      {/* Trends controls: category filter, range presets, year-range slider,
          and the M/Q/H/Y granularity switch. Sticky to the top of <main> so
          the filters stay reachable while scrolling through the cards below
          (same sticky-against-the-scroll-parent pattern as importActionsBar).
          Desktop packs everything into a single row to save vertical space;
          mobile splits it into two rows (category + granularity on top,
          presets + slider below) since it's too tight for one line there. */}
      <div
        style={{
          position: "sticky",
          // `<main>` has 16px of top padding, which the sticky containment
          // rectangle treats as the stick point — without this offset the
          // bar snaps down by that 16px the instant you scroll, briefly
          // exposing the content behind it. Negative `top` cancels it out
          // (paired with the matching negative marginTop below) so the bar
          // stays flush against the app header the whole time.
          top: -16,
          zIndex: 5,
          marginLeft: -16,
          marginRight: -16,
          marginTop: -16,
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 16,
          paddingBottom: 12,
          background: "rgba(11,13,16,0.92)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {isWide ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {categoryChip}
            {rangePresetsSwitch}
            {yearRangeSlider}
            <div style={{ marginLeft: "auto" }}>{granularitySwitch}</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              {categoryChip}
              {granularitySwitch}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {rangePresetsSwitch}
              {yearRangeSlider}
            </div>
          </>
        )}
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
                    position={{ y: 0 }}
                    content={<ChartTooltip fmtValue={fmtKFull} formatLabel={(v) => bucketLabel(v)} />}
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
        granularity={granularity}
      />

      <CategoryStackedBarCard
        scoped={scoped}
        granularity={granularity}
        hideValues={hideValues}
        fmtK={fmtK}
        fmtKFull={fmtKFull}
      />

      <MonthlyAvgByCategoryCard
        scopedAllYears={scopedAllYears}
        hideValues={hideValues}
        fmtK={fmtK}
        fmtKFull={fmtKFull}
      />

      <CompositionEvolutionCard
        scoped={scoped}
        granularity={granularity}
        hideValues={hideValues}
      />

      <YearInReviewCard
        transactions={transactions}
        years={years}
        hideValues={hideValues}
        fmtKFull={fmtKFull}
      />

      <DailyHeatmapCard scoped={scoped} hideValues={hideValues} isWide={isWide} />
    </div>
  );
}

// ===========================================================================
// YearInReviewCard — annual summary: KPIs vs previous year (YTD-aligned when
// the selected year is the current one — see cutoffMD below) + a per-category
// breakdown bar chart with an Expense/Income toggle. Ignores the masthead
// year-range/granularity scope on purpose — it has its own year selector
// (default: latest year with data).
// ===========================================================================

function YearInReviewCard({ transactions, years, hideValues, fmtKFull }) {
  const [yr, setYr] = useState(() => years[0] || "");
  const [view, setView] = useState("expense");
  // Keep the selection valid when data changes (e.g. first import).
  useEffect(() => {
    if (!years.includes(yr)) setYr(years[0] || "");
  }, [years, yr]);

  const review = useMemo(() => {
    if (!yr) return null;
    const inYear = (y) => transactions.filter((t) => (t.date || "").slice(0, 4) === y);
    const curYearTxns = inYear(yr);
    const cur = computeTotals(curYearTxns);
    const prevYear = String(Number(yr) - 1);
    const hasPrev = years.includes(prevYear);

    // When reviewing the CURRENT calendar year, a full-year comparison would
    // unfairly stack e.g. 7 months of this year against 12 of last year —
    // clip both sides to the same "day of year" cutoff (YTD vs YTD). A past
    // year (not the current one) compares full year vs full year, since it's
    // already complete on both sides.
    const isCurrentYear = yr === todayISO().slice(0, 4);
    const cutoffMD = isCurrentYear ? todayISO().slice(5, 10) : null; // "MM-DD" or no cutoff
    const withCutoff = (rows) =>
      cutoffMD ? rows.filter((t) => (t.date || "").slice(5, 10) <= cutoffMD) : rows;

    const prev = hasPrev ? computeTotals(withCutoff(inYear(prevYear))) : null;
    const curForCompare = cutoffMD ? computeTotals(withCutoff(curYearTxns)) : cur;

    // Per-category totals for the selected year, split by income/expense so
    // the toggle can show either side without mixing scales. Sorted by
    // magnitude descending; tail beyond 9 grouped as "Other".
    const buildBars = (predicate) => {
      const map = new Map();
      for (const t of curYearTxns) {
        if (isTransfer(t.category) || !predicate(t.category)) continue;
        map.set(t.category, (map.get(t.category) || 0) + (Number(t.amount) || 0));
      }
      const sorted = [...map.entries()]
        .filter(([, v]) => v !== 0)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      const head = sorted.slice(0, 9);
      const tailSum = sorted.slice(9).reduce((a, [, v]) => a + v, 0);
      const bars = head.map(([name, value]) => ({ name, value: Math.abs(value), fill: getCategoryColor(name) }));
      if (sorted.length > 9) bars.push({ name: "Other", value: Math.abs(tailSum), fill: getCategoryColor("Other") });
      return bars;
    };

    return {
      cur, prev, prevYear, isCurrentYear,
      expenseBars: buildBars((c) => !isIncome(c)),
      incomeBars: buildBars((c) => isIncome(c)),
      curForCompare,
    };
  }, [transactions, years, yr]);

  if (!review) return null;
  const { cur, prev, prevYear, isCurrentYear, expenseBars, incomeBars, curForCompare } = review;
  const pct = (c, p) => (p ? ((c - p) / Math.abs(p)) * 100 : null);
  const fmtPct = (p) => (p == null ? "—" : `${p > 0 ? "+" : ""}${p.toFixed(0)}%`);
  const kpis = [
    { lbl: "Income", val: cur.income, p: prev ? pct(curForCompare.income, prev.income) : null, color: "#34d399", higherIsGood: true },
    { lbl: "Expenses", val: cur.expenses, p: prev ? pct(-curForCompare.expenses, -prev.expenses) : null, color: "#f87171", higherIsGood: false },
    { lbl: "Net", val: cur.net, p: prev ? pct(curForCompare.net, prev.net) : null, color: cur.net >= 0 ? "#34d399" : "#f87171", higherIsGood: true },
  ];
  const bars = view === "income" ? incomeBars : expenseBars;

  return (
    <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 0", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ ...S.sectionTitle, margin: 0 }}>Year in Review</h3>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setView("expense")} style={S.togglePill(view === "expense")}>Expense</button>
          <button onClick={() => setView("income")} style={S.togglePill(view === "income")}>Income</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, padding: "12px 16px 0" }}>
        {kpis.map(({ lbl, val, p, color, higherIsGood }) => (
          <div key={lbl} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, color: "#8b94a3", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{lbl}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color, marginTop: 2, whiteSpace: "nowrap" }}>
              {hideValues ? "•••••" : usd0.format(val)}
            </div>
            {prev && !hideValues && (
              <div style={{ fontSize: 10, marginTop: 1, color: p == null ? "#6b7280" : (p > 0) === higherIsGood ? "#34d399" : "#f87171" }}>
                {fmtPct(p)} vs {isCurrentYear ? `${prevYear} YTD` : prevYear}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, padding: "10px 16px 0" }}>
        <select value={yr} onChange={(e) => setYr(e.target.value)} style={{ ...S.select, flex: "0 0 auto", width: "auto", padding: "6px 10px", colorScheme: "dark" }}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <div style={{ height: 280 }}>
        {bars.length === 0 ? (
          <Empty>No {view} categories for {yr}.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} margin={{ top: 16, right: 16, left: 0, bottom: 40 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#6b7280", fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-38}
                textAnchor="end"
              />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtKFull} width={56} />
              {!hideValues && (
                <Tooltip
                  cursor={false}
                  formatter={(v) => [fmtKFull(v), "Amount"]}
                  contentStyle={{ background: "#161a20", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
                  itemStyle={{ color: "#e5e7eb" }}
                  labelStyle={{ color: "#8b94a3" }}
                />
              )}
              <Bar dataKey="value" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                {bars.map((r, i) => (
                  <Cell key={`bar-${i}`} fill={r.fill} />
                ))}
                <LabelList
                  dataKey="value"
                  position="top"
                  content={({ x, y, width, value }) =>
                    hideValues || !value ? null : (
                      <text x={x + width / 2} y={y - 4} textAnchor="middle" fill="#6b7280" fontSize={10}>
                        {fmtKFull(value)}
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

// Line-art icon per category, styled to match the header's glass tile
// (white stroke on a colored gradient) instead of the flat emoji.
const CAT_ICON = {
  "Car": Car, "Dog": Dog, "Entertainment": Clapperboard, "Fuel": Fuel,
  "Groceries": ShoppingCart, "Home": Home, "Medical": Pill, "Mobile Phone": Smartphone,
  "Mortgage": Landmark, "Other": Package, "Restaurant": UtensilsCrossed, "Services": Wrench,
  "Shopping": ShoppingBag, "Transport": Bus, "Travel": Plane, "Utilities": Lightbulb,
  "Salary": Banknote, "Bonus": Gift, "Bela Income": Coins, "Other Income": Coins,
};
function catIcon(cat) { return CAT_ICON[cat] ?? Tag; }

// Shared download helper — creates an object URL for a Blob, triggers a
// browser download via a throwaway <a>, then revokes the URL. Module-level
// (not tied to any single component) so both the Transactions tab (CSV
// export) and the Settings tab (JSON backup) can reuse it without
// duplicating the same 6 lines.
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Maps category name → a stable color from CATEGORY_COLORS palette
function catDotColor(cat) {
  if (!cat) return "#8b94a3";
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) & 0xffff;
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length];
}

// Resolves a category's color: prefer the curated map, fallback to the hash-based color
function getCategoryColor(cat) {
  return CATEGORY_COLOR_MAP[cat] || catDotColor(cat);
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
        // Date-header / chip filter: year+month pairs, keyed as "YYYY-MM" —
        // both platforms. Checking a year selects all of its month keys.
        const ym = (t.date || "").slice(0, 7);
        if (dateMonths.length && !dateMonths.includes(ym)) return false;
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

  // Abbreviated money format for the audit summary bar when the full
  // format doesn't fit on one line, e.g. "$1.23K" / "-$1.23K". Respects
  // the hideValues eye toggle the same way `money` does.
  const moneyShortK = useCallback(
    (n) => {
      if (hideValues) return "•••••";
      const v = n || 0;
      const sign = v < 0 ? "-" : "";
      const abs = Math.abs(v);
      if (abs < 1000) return `${sign}$${Math.round(abs)}`;
      return `${sign}$${(abs / 1000).toFixed(2)}K`;
    },
    [hideValues]
  );

  // Audit summary bar: once any of income/expenses/net reaches 8 digits
  // (i.e. >= $100,000.00 with its 2 decimals), the full money format is
  // long enough to push the 4 pills onto 2 lines on mobile. Switch all 3
  // monetary values to the abbreviated `moneyShortK` format together
  // (tudo-ou-nada) — a fixed digit threshold, not a measured one, since
  // measuring the rendered width proved unreliable across devices.
  const useShortFormat =
    Math.abs(summary.income) >= 100000 ||
    Math.abs(summary.expenses) >= 100000 ||
    Math.abs(net) >= 100000;

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
        <span style={{ fontSize: 11, color: "#34d399", background: "rgba(52,211,153,0.1)", borderRadius: 6, padding: "2px 8px" }}>↑ {useShortFormat ? moneyShortK(summary.income) : money(summary.income)}</span>
        <span style={{ fontSize: 11, color: summary.expenses < 0 ? "#f87171" : "#34d399", background: summary.expenses < 0 ? "rgba(248,113,113,0.1)" : "rgba(52,211,153,0.1)", borderRadius: 6, padding: "2px 8px" }}>{summary.expenses < 0 ? `↓ ${useShortFormat ? moneyShortK(Math.abs(summary.expenses)) : money(Math.abs(summary.expenses))}` : `↑ ${useShortFormat ? moneyShortK(Math.abs(summary.expenses)) : money(Math.abs(summary.expenses))}`}</span>
        <span style={{ fontSize: 11, color: net >= 0 ? "#34d399" : "#f87171", background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: "2px 8px" }}>= {useShortFormat ? moneyShortK(net) : money(net)}</span>
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
              onClick={() => { applyBulk({ category: bulkCat, categoryManual: bulkCat !== TRANSFER_CATEGORY }); setBulkCat(""); }}
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

          <button onClick={() => applyBulk({ category: TRANSFER_CATEGORY, categoryManual: false })} style={S.exportBtn(false)} title="Mark as account transfer / card payment (excluded from totals)">
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
  const yesterday = localISO(new Date(Date.now() - 86400000));
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

// Date column-header filter: multi-select years and/or months (Excel-style
// tree — a year checkbox selects all its months; "+" expands to pick
// individual months), plus optional From/To day-level range.
function DateHeaderFilter({ years, dateYears, setDateYears, dateMonths, setDateMonths, chip, from, to, setFrom, setTo }) {
  const [open, setOpen] = useState(false);
  const [expandedYears, setExpandedYears] = useState([]);
  const anchorRef = useRef(null);
  const hasRange = !!(from || to);
  const active = dateYears.length > 0 || dateMonths.length > 0 || hasRange;
  const toggle = (arr, set, v) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const toggleExpand = (y) => toggleYearExpand(y);
  function toggleYearExpand(y) {
    setExpandedYears((arr) => (arr.includes(y) ? arr.filter((x) => x !== y) : [...arr, y]));
  }
  // Months of a given year, keyed as "YYYY-MM" to disambiguate across years.
  const monthKey = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
  const yearMonthKeys = (y) => MONTHS.map((m) => monthKey(y, m.v));
  const toggleYear = (y) => {
    const keys = yearMonthKeys(y);
    const allSelected = keys.every((k) => dateMonths.includes(k));
    if (dateYears.includes(y) || allSelected) {
      setDateYears(dateYears.filter((x) => x !== y));
      setDateMonths(dateMonths.filter((k) => !keys.includes(k)));
    } else {
      setDateYears(dateYears.includes(y) ? dateYears : [...dateYears, y]);
      setDateMonths([...dateMonths.filter((k) => !keys.includes(k)), ...keys]);
    }
  };
  const toggleMonth = (y, m) => {
    const k = monthKey(y, m);
    const keys = yearMonthKeys(y);
    const nextMonths = dateMonths.includes(k) ? dateMonths.filter((x) => x !== k) : [...dateMonths, k];
    setDateMonths(nextMonths);
    const allSelected = keys.every((kk) => nextMonths.includes(kk));
    setDateYears(allSelected ? (dateYears.includes(y) ? dateYears : [...dateYears, y]) : dateYears.filter((x) => x !== y));
  };
  const labelText = !active
    ? "Date"
    : hasRange && dateYears.length === 0 && dateMonths.length === 0
    ? `Date: ${from || "…"} → ${to || "…"}`
    : `Date (${dateYears.length + dateMonths.length} selected)`;
  return (
    <div ref={anchorRef} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={chip ? S.chipBtn(active) : S.thBtn(active)} title="Filter by date">
        <span>{labelText}</span>
        <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
      </button>
      <Popover open={open} setOpen={setOpen} anchorRef={anchorRef} style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 220 }}>
          {/* From/To range — only when setFrom/setTo are provided */}
          {setFrom && setTo && (
            <div>
              <div style={S.popHead}>Date range</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 8px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#8b94a3" }}>
                  <span style={{ width: 28 }}>From</span>
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...S.input, flex: 1, padding: "6px 8px", fontSize: 12, fontFamily: S.app.fontFamily }} />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#8b94a3" }}>
                  <span style={{ width: 28 }}>To</span>
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...S.input, flex: 1, padding: "6px 8px", fontSize: 12, fontFamily: S.app.fontFamily }} />
                </label>
              </div>
            </div>
          )}
          <div>
            <div style={S.popHead}>Year / Month</div>
            {years.length === 0 ? <div style={{ ...S.popItem(false), color: "#6b7280" }}>—</div> : null}
            {years.map((y) => {
              const keys = yearMonthKeys(y);
              const allSelected = keys.every((k) => dateMonths.includes(k));
              const someSelected = keys.some((k) => dateMonths.includes(k));
              const expanded = expandedYears.includes(y);
              return (
                <div key={y}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button
                      onClick={() => toggleExpand(y)}
                      style={{ ...S.deleteBtn, width: 20, height: 20, padding: 0, flexShrink: 0 }}
                      title={expanded ? "Collapse" : "Expand months"}
                    >
                      {expanded ? "−" : "+"}
                    </button>
                    <button onClick={() => toggleYear(y)} style={{ ...S.popItem(allSelected), flex: 1, textAlign: "left" }}>
                      <span style={{ display: "inline-block", width: 14 }}>{allSelected ? "✓" : someSelected ? "•" : ""}</span>
                      {y}
                    </button>
                  </div>
                  {expanded && (
                    <div style={{ paddingLeft: 24 }}>
                      {MONTHS.map((m) => {
                        const k = monthKey(y, m.v);
                        const sel = dateMonths.includes(k);
                        return (
                          <button key={k} onClick={() => toggleMonth(y, m.v)} style={S.popItem(sel)}>
                            <span style={{ display: "inline-block", width: 14 }}>{sel ? "✓" : ""}</span>
                            {m.l}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
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
    const next = {
      ...txn,
      date,
      description: description.trim(),
      amount: amt,
      category,
      account,
    };
    // Track manual category corrections (forward-only, explicit flag). Only
    // touch the flag when the category actually changed: correcting to a
    // non-Transfer category flags it as a manual fix (feeds the Audit "manual
    // corrections" suggestions); moving to Transfer clears the flag (becoming
    // a transfer is not a category correction); leaving the category unchanged
    // preserves whatever flag the row already had.
    if (category !== txn.category) {
      next.categoryManual = category !== TRANSFER_CATEGORY;
    }
    onSave(next);
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
// `id` lets other sections scroll a specific card into view (e.g. the
// "Suggested rules" audit panel jumping to "Account aliases"/"Category
// mapping"). `openSignal` is an opaque value (e.g. a timestamp/nonce) that,
// whenever it changes to a truthy value, forces the card open — used for the
// same "jump here and show the field" flows without any new global state.
function CollapsibleCard({ title, badge, defaultOpen = false, icon: Icon, children, id, openSignal }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);
  return (
    <div id={id} style={{
      marginBottom: 10,
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14,
      overflow: "hidden",
      background: "rgba(22,26,32,0.7)",
      backdropFilter: "blur(16px) saturate(160%)",
      WebkitBackdropFilter: "blur(16px) saturate(160%)",
    }}>
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
function AccountAliasRow({ account, fragments, onChange, suggestedFragment }) {
  const [adding, setAdding] = useState("");
  // "Use this fragment" (Suggested rules panel) pre-fills every account row's
  // add box with the suggested text — the user still picks which account it
  // actually belongs to and clicks its own "+"; nothing is added automatically.
  useEffect(() => {
    if (suggestedFragment && suggestedFragment.fragment) setAdding(suggestedFragment.fragment);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedFragment && suggestedFragment.nonce]);
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
function AccountAliasesSection({ transactions, accountMap, aliases, onSave, prefillFragment }) {
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
    <CollapsibleCard
      id="account-aliases-section"
      title="Account aliases"
      badge={ACCOUNTS.length}
      openSignal={prefillFragment && prefillFragment.nonce}
    >
      <div style={{ fontSize: 12, color: "#8b94a3", margin: "0 0 10px", lineHeight: 1.5 }}>
        Fragments matched (case/punctuation-insensitive) against the source
        account/card field when a transaction has no card mapping for its URN.
        Add or remove fragments per account, then preview the impact on
        existing transactions before saving.
      </div>
      {prefillFragment && prefillFragment.fragment ? (
        <div style={{ background: "#0b2a1f", border: "1px solid #14532d", borderRadius: 10, padding: "8px 10px", margin: "0 0 10px", fontSize: 12, color: "#86efac" }}>
          Suggested fragment "{prefillFragment.fragment}" pre-filled below in
          every account's add box — pick the right account and click "+".
        </div>
      ) : null}
      <div>
        {ACCOUNTS.map((a) => (
          <AccountAliasRow
            key={a}
            account={a}
            fragments={draft[a] || []}
            onChange={(frags) => setFrags(a, frags)}
            suggestedFragment={prefillFragment}
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
// One managed item: swipe left to reveal Edit/Delete, reorder via dragging
// the grip handle, or (when editing) an inline name field with Save/Cancel
// below.
function ManagedRow({ name, used, editing, editVal, setEditVal, onStartEdit, onCommitEdit, onCancelEdit, onDelete, rowRef, yShift, dragging, dragActive, onGripPointerDown, onGripPointerMove, onGripPointerEnd }) {
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const start = useRef(null);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 2500);
    return () => clearTimeout(t);
  }, [confirming]);

  // Any row's drag (not just this one, since a row being shifted to make
  // room for the drop target isn't itself "dragging") should close a
  // leftover swipe-open Edit/Delete rail — otherwise it stays visible
  // underneath the reorder shift. useLayoutEffect (not useEffect) so this
  // resolves before paint, with no visible flash of the open rail.
  useLayoutEffect(() => {
    if (dragActive) { setOpen(false); setDx(0); }
  }, [dragActive]);

  // Pointer Events (not touch-only) so the swipe-to-reveal gesture works
  // with mouse drags on desktop too, not just touch.
  const onRowPointerDown = (e) => {
    start.current = { x: e.clientX, y: e.clientY, base: open ? -SWIPE_ACTION_WIDTH : 0, horiz: null };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };
  const onRowPointerMove = (e) => {
    if (!start.current) return;
    const ddx = e.clientX - start.current.x;
    const ddy = e.clientY - start.current.y;
    if (start.current.horiz === null && (Math.abs(ddx) > 6 || Math.abs(ddy) > 6)) start.current.horiz = Math.abs(ddx) > Math.abs(ddy);
    if (!start.current.horiz) return;
    setDx(Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, start.current.base + ddx)));
  };
  const onRowPointerEnd = () => {
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
    <div style={{ position: "relative", borderRadius: 10, overflow: dragActive ? "visible" : "hidden" }}>
      {/* Swipe action rail — only the foreground row is translated during a
          drag (this row's own drag, or another row's shift to make room),
          so this sibling rail would sit exposed at its untransformed spot
          once the foreground slides away from covering it. Hide it
          entirely while any drag is active in the list. */}
      {!dragActive && (
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
      )}

      {/* Foreground row */}
      <div
        ref={rowRef}
        onPointerDown={onRowPointerDown}
        onPointerMove={onRowPointerMove}
        onPointerUp={onRowPointerEnd}
        onPointerCancel={onRowPointerEnd}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "#161a20", border: "1px solid #1e2530", borderRadius: 10,
          padding: "8px 10px", position: "relative",
          touchAction: "pan-y",
          transform: `translateX(${translate}px) translateY(${yShift || 0}px)`,
          transition: start.current || dragging ? "none" : "transform 0.15s ease",
          zIndex: dragging ? 10 : "auto",
          boxShadow: dragging ? "0 4px 14px rgba(0,0,0,0.4)" : "none",
        }}
      >
        <button
          onPointerDown={(e) => { e.stopPropagation(); onGripPointerDown(e); }}
          onPointerMove={(e) => { e.stopPropagation(); onGripPointerMove(e); }}
          onPointerUp={(e) => { e.stopPropagation(); onGripPointerEnd(e); }}
          onPointerCancel={(e) => { e.stopPropagation(); onGripPointerEnd(e); }}
          title="Drag to reorder"
          style={{ ...S.reorderBtn, flexShrink: 0, cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
        >
          <GripVertical size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#e5e7eb", overflowWrap: "anywhere" }}>
          {name}
          {used ? <span style={{ color: "#8b94a3", fontSize: 11 }}> · {used} txn{used === 1 ? "" : "s"}</span> : null}
        </div>
      </div>
    </div>
  );
}

// `bare`: renders just the subheading + list + add box, without the outer
// CollapsibleCard chrome — used to nest two lists (Expense/Income) inside
// one shared card.
function ManagedList({ title, items, usage, onAdd, onRename, onDelete, onReorder, bare = false }) {
  const [adding, setAdding] = useState("");
  const [editName, setEditName] = useState(null);
  const [editVal, setEditVal] = useState("");
  // Drag-to-reorder: dragged row follows the pointer 1:1 (`delta`), the
  // other rows shift by a full row height to open a gap at `target` — the
  // real `items` order is only committed once, on pointer up.
  const [drag, setDrag] = useState(null); // { idx, startY, delta, height, target }
  const rowRefs = useRef([]);
  rowRefs.current = [];

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

  const onGripPointerDown = (idx) => (e) => {
    e.preventDefault();
    const height = (rowRefs.current[idx]?.offsetHeight || 40) + 6; // + column gap
    setDrag({ idx, startY: e.clientY, delta: 0, height, target: idx });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };
  const onDragPointerMove = (e) => {
    if (!drag) return;
    const delta = e.clientY - drag.startY;
    const rawTarget = drag.idx + Math.round(delta / drag.height);
    const target = Math.max(0, Math.min(items.length - 1, rawTarget));
    setDrag((d) => (d ? { ...d, delta, target } : d));
  };
  const onDragPointerEnd = () => {
    if (!drag) return;
    if (drag.target !== drag.idx) {
      const next = [...items];
      const [moved] = next.splice(drag.idx, 1);
      next.splice(drag.target, 0, moved);
      onReorder(next);
    }
    setDrag(null);
  };
  const dragShiftFor = (idx) => {
    if (!drag) return 0;
    if (idx === drag.idx) return drag.delta;
    if (drag.idx < drag.target && idx > drag.idx && idx <= drag.target) return -drag.height;
    if (drag.idx > drag.target && idx >= drag.target && idx < drag.idx) return drag.height;
    return 0;
  };

  const content = (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((name, idx) => (
          <ManagedRow
            key={name}
            rowRef={(el) => (rowRefs.current[idx] = el)}
            name={name}
            used={usage[name] || 0}
            editing={editName === name}
            editVal={editVal}
            setEditVal={setEditVal}
            onStartEdit={() => startEdit(name)}
            onCommitEdit={commitEdit}
            onCancelEdit={cancelEdit}
            onDelete={() => onDelete(name)}
            yShift={dragShiftFor(idx)}
            dragging={!!drag && drag.idx === idx}
            dragActive={!!drag}
            onGripPointerDown={onGripPointerDown(idx)}
            onGripPointerMove={onDragPointerMove}
            onGripPointerEnd={onDragPointerEnd}
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
    </>
  );

  if (bare) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>{title}</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#8b94a3" }}>{items.length}</span>
        </div>
        {content}
      </div>
    );
  }

  return (
    <CollapsibleCard title={title} badge={items.length}>
      {content}
    </CollapsibleCard>
  );
}

// ===========================================================================
// Audit tab
// ===========================================================================

// "Suggested rules": two read-only lists of classification gaps detected
// purely from in-memory `transactions` (Unassigned account fragments seen
// more than once, and "Other"-category tokens with a raw `ckCategory` seen
// more than once). No auto-write — each action just scrolls/pre-fills the
// existing "Account aliases" / "Category mapping" sections so the user picks
// the destination and saves through those sections' own existing flows.
// Dismissal is persisted household-wide via /api/dismissed-suggestions (Redis,
// same auth/scope as the rest of Settings), so it survives tab switches,
// reloads and other devices — not just client-side for the current session.
function SuggestedRulesSection({ suggestedFragments, suggestedTokens, suggestedCorrections, dismissedSuggestions, onDismissSuggestion, onUseFragment, onReviewToken, onCreateRule }) {
  const dismissed = useMemo(() => new Set(dismissedSuggestions || []), [dismissedSuggestions]);
  const fragments = suggestedFragments.filter((f) => !dismissed.has(`frag:${f.fragment}`));
  const tokens = suggestedTokens.filter((t) => !dismissed.has(`tok:${t.token}`));
  const corrections = (suggestedCorrections || []).filter((c) => !dismissed.has(`manual:${c.key}`));
  const total = fragments.length + tokens.length + corrections.length;

  const dismiss = (key) => onDismissSuggestion?.(key);

  return (
    <CollapsibleCard title="Suggested rules" badge={total > 0 ? total : undefined} defaultOpen>
      <div style={{ fontSize: 12, color: "#8b94a3", margin: "0 0 10px", lineHeight: 1.5 }}>
        {total === 0 ? (
          <>
            Nothing to suggest yet — this is normal, not an error. This panel
            fills in automatically as you import more transactions and correct
            categories manually, once a pattern repeats enough to be worth
            turning into a rule.
          </>
        ) : (
          <>
            Patterns detected in your current transactions that repeat often
            enough to be worth turning into a rule. Nothing here is saved
            automatically — each action jumps to the matching section below so
            you can pick the destination and save yourself.
          </>
        )}
      </div>

      <div style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 600, margin: "4px 0 6px" }}>
        Unassigned account fragments
      </div>
      {fragments.length === 0 ? (
        <div style={{ fontSize: 12, color: "#8b94a3", marginBottom: 10 }}>Nothing repeats enough to suggest.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {fragments.map((f) => (
            <div key={f.fragment} style={{ background: "#161a20", border: "1px solid #1e2530", borderRadius: 10, padding: "8px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontFamily: "monospace", color: "#e5e7eb", overflowWrap: "anywhere" }}>
                  {f.fragment}
                </div>
                <span style={{ fontSize: 11, color: "#8b94a3", flexShrink: 0 }}>{f.count} unassigned</span>
              </div>
              {f.examples.length ? (
                <div style={{ fontSize: 11, color: "#8b94a3", marginTop: 4, overflowWrap: "anywhere" }}>
                  e.g. {f.examples.join(" · ")}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => onUseFragment(f.fragment)}
                  style={{ background: "#0A84FF", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Use this fragment
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(`frag:${f.fragment}`)}
                  title="Dismiss"
                  style={{ background: "transparent", border: "1px solid #2a313c", color: "#8b94a3", borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 600, margin: "4px 0 6px" }}>
        Category tokens mapped to "Other"
      </div>
      {tokens.length === 0 ? (
        <div style={{ fontSize: 12, color: "#8b94a3" }}>Nothing repeats enough to suggest.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tokens.map((t) => (
            <div key={t.token} style={{ background: "#161a20", border: "1px solid #1e2530", borderRadius: 10, padding: "8px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontFamily: "monospace", color: "#e5e7eb", overflowWrap: "anywhere" }}>
                  {t.token}
                </div>
                <span style={{ fontSize: 11, color: "#8b94a3", flexShrink: 0 }}>{t.count} txns in Other</span>
              </div>
              {t.examples.length ? (
                <div style={{ fontSize: 11, color: "#8b94a3", marginTop: 4, overflowWrap: "anywhere" }}>
                  e.g. {t.examples.join(" · ")}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => onReviewToken(t.token)}
                  style={{ background: "#0A84FF", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Review this token
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(`tok:${t.token}`)}
                  title="Dismiss"
                  style={{ background: "transparent", border: "1px solid #2a313c", color: "#8b94a3", borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 600, margin: "12px 0 6px" }}>
        Manual category corrections
      </div>
      {corrections.length === 0 ? (
        <div style={{ fontSize: 12, color: "#8b94a3" }}>
          No repeated manual corrections yet. This group only lists category
          corrections you make manually (via Edit or bulk selection) from now
          on, grouped once they repeat — so it's expected to be empty right
          after this update.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {corrections.map((c) => (
            <div key={c.key} style={{ background: "#161a20", border: "1px solid #1e2530", borderRadius: 10, padding: "8px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontFamily: "monospace", color: "#e5e7eb", overflowWrap: "anywhere" }}>
                  {c.pattern}
                </div>
                <span style={{ fontSize: 11, color: "#8b94a3", flexShrink: 0 }}>{c.count} corrected → {c.destinationCategory}</span>
              </div>
              {c.examples.length ? (
                <div style={{ fontSize: 11, color: "#8b94a3", marginTop: 4, overflowWrap: "anywhere" }}>
                  {c.examples.map((ex, i) => (
                    <div key={i}>
                      {ex.description}
                      {ex.autoCategory ? (
                        <span style={{ color: "#636366" }}> — was {ex.autoCategory} → you: {ex.category || c.destinationCategory}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => onCreateRule(c)}
                  style={{ background: "#0A84FF", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Create rule from this
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(`manual:${c.key}`)}
                  title="Dismiss"
                  style={{ background: "transparent", border: "1px solid #2a313c", color: "#8b94a3", borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}

// Lists the automatic daily Redis snapshots (written on the first save of
// each UTC day, TTL 30 days) and restores one through the normal restore
// flow — the restored array goes through PUT /api/transactions, so
// optimistic concurrency and server-side validation still apply. Restore
// requires a 2-click confirm (same pattern as ManagedRow's delete).
function SnapshotsSection({ onRestore }) {
  const [snapshots, setSnapshots] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDate, setConfirmDate] = useState(null);
  const [busyDate, setBusyDate] = useState(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/snapshots", { headers: buildAuthHeaders() });
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const data = await res.json();
      setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []);
    } catch (err) {
      setError(err.message || "Failed to load snapshots");
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // 2-click confirm with auto-reset, mirroring the delete chips elsewhere.
  useEffect(() => {
    if (!confirmDate) return;
    const t = setTimeout(() => setConfirmDate(null), 2500);
    return () => clearTimeout(t);
  }, [confirmDate]);

  const restore = async (date) => {
    if (confirmDate !== date) {
      setConfirmDate(date);
      return;
    }
    setConfirmDate(null);
    setBusyDate(date);
    setError("");
    try {
      const res = await fetch(`/api/snapshots?date=${date}`, { headers: buildAuthHeaders() });
      if (!res.ok) throw new Error(`Snapshot fetch failed (${res.status})`);
      const data = await res.json();
      if (!Array.isArray(data.transactions) || data.transactions.length === 0) {
        throw new Error("Snapshot is empty — not restoring");
      }
      onRestore(data.transactions);
    } catch (err) {
      setError(err.message || "Restore failed");
    } finally {
      setBusyDate(null);
    }
  };

  return (
    <CollapsibleCard title="Daily snapshots" badge={snapshots ? snapshots.length : ""}>
      <div style={{ fontSize: 11, color: "#8b94a3", marginBottom: 10 }}>
        Automatic safety copies: the first save of each day stores an
        immutable snapshot (kept for 30 days). Restoring replaces the current
        ledger with that day's first state — your current data is still
        recoverable from today's snapshot.
      </div>
      {loading && <div style={{ fontSize: 12, color: "#8b94a3" }}>Loading…</div>}
      {error && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 8 }}>{error}</div>}
      {snapshots && snapshots.length === 0 && !loading && (
        <div style={{ fontSize: 12, color: "#8b94a3" }}>No snapshots yet — they appear after the first save of a day.</div>
      )}
      {snapshots && snapshots.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {snapshots.map((date) => (
            <div key={date} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, fontSize: 13, color: "#e5e7eb", fontVariantNumeric: "tabular-nums" }}>{date}</span>
              <button
                onClick={() => restore(date)}
                disabled={busyDate !== null}
                style={{
                  ...S.secondaryBtn,
                  fontSize: 11,
                  padding: "4px 10px",
                  color: confirmDate === date ? "#f87171" : undefined,
                  borderColor: confirmDate === date ? "rgba(248,113,113,0.5)" : undefined,
                  opacity: busyDate && busyDate !== date ? 0.5 : 1,
                }}
              >
                {busyDate === date ? "Restoring…" : confirmDate === date ? "Confirm restore?" : "Restore"}
              </button>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}

// Settings editor for the monthly budgets map ({ [category]: number }).
// Draft is local; "Save budgets" persists only positive numeric values.
function BudgetsSection({ budgets, expenseCategories, onSave }) {
  const [draft, setDraft] = useState(() => ({ ...(budgets || {}) }));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setDraft({ ...(budgets || {}) });
    setDirty(false);
  }, [budgets]);
  const setVal = (cat, v) => {
    setDraft((d) => ({ ...d, [cat]: v }));
    setDirty(true);
  };
  const handleSave = () => {
    const clean = {};
    for (const cat of expenseCategories) {
      const n = parseFloat(draft[cat]);
      if (Number.isFinite(n) && n > 0) clean[cat] = n;
    }
    onSave(clean);
    setDirty(false);
  };
  const count = Object.values(budgets || {}).filter((v) => Number(v) > 0).length;
  return (
    <CollapsibleCard title="Monthly budgets" badge={count}>
      <div style={{ fontSize: 11, color: "#8b94a3", marginBottom: 10 }}>
        Monthly spending limit per expense category — leave empty for no
        budget. Categories with a budget show bullet bars on the Home tab for
        the selected month.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {expenseCategories.map((cat) => (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: 1, fontSize: 13, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
            <input
              type="number"
              min="0"
              step="10"
              inputMode="decimal"
              placeholder="—"
              value={draft[cat] ?? ""}
              onChange={(e) => setVal(cat, e.target.value)}
              style={{ ...S.input, width: 110, textAlign: "right" }}
            />
          </div>
        ))}
      </div>
      {dirty && (
        <button onClick={handleSave} style={{ ...S.primaryBtn, marginTop: 12 }}>
          Save budgets
        </button>
      )}
    </CollapsibleCard>
  );
}

function SettingsTab({
  transactions, accountMap, accountAliases, onSaveAccountAliases,
  dismissedSuggestions, onDismissSuggestion,
  ckCategoryMap, onSaveCkCategoryMap,
  categoryDescriptionRules, onSaveCategoryDescriptionRules,
  config,
  onSaveAccountMap,
  onAddAccount, onRenameAccount, onDeleteAccount,
  onAddCategory, onRenameCategory, onDeleteCategory,
  onReorderAccounts, onReorderCategories,
  onRestoreTransactions,
  budgets, onSaveBudgets,
}) {
  const usage = useMemo(() => {
    const acc = {}, cat = {};
    for (const t of transactions) {
      if (t.account) acc[t.account] = (acc[t.account] || 0) + 1;
      if (t.category) cat[t.category] = (cat[t.category] || 0) + 1;
    }
    return { acc, cat };
  }, [transactions]);
  const aliasesArray = useMemo(() => buildAliasArray(accountAliases || {}), [accountAliases]);
  const suggestedFragments = useMemo(
    () => detectSuggestedAliasFragments(transactions, aliasesArray),
    [transactions, aliasesArray]
  );
  const suggestedTokens = useMemo(
    () => detectSuggestedCategoryTokens(transactions, ckCategoryMap),
    [transactions, ckCategoryMap]
  );
  const suggestedCorrections = useMemo(
    () => detectManualCategoryCorrections(transactions, categoryDescriptionRules),
    [transactions, categoryDescriptionRules]
  );

  // Pre-fill/highlight signals for the "Account aliases"/"Category mapping"/
  // "Description rules" sections below, set by the "Use this fragment"/"Review
  // this token"/"Create rule from this" buttons. Never written anywhere —
  // purely local UI state driving a scroll + a pre-filled/highlighted field the
  // user still has to act on and save.
  const [aliasPrefill, setAliasPrefill] = useState(null);
  const [categoryHighlight, setCategoryHighlight] = useState(null);
  const [rulePrefill, setRulePrefill] = useState(null);

  const handleUseFragment = (fragment) => {
    setAliasPrefill({ fragment, nonce: Date.now() });
    document.getElementById("account-aliases-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const handleReviewToken = (token) => {
    setCategoryHighlight({ token, nonce: Date.now() });
    document.getElementById("category-mapping-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const handleCreateRule = (correction) => {
    setRulePrefill({
      pattern: correction.pattern,
      matchField: "description",
      destinationCategory: correction.destinationCategory,
      nonce: Date.now(),
    });
    document.getElementById("description-rules-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div style={S.col}>
      <h3 style={S.sectionTitle}>Settings</h3>
      <SuggestedRulesSection
        suggestedFragments={suggestedFragments}
        suggestedTokens={suggestedTokens}
        suggestedCorrections={suggestedCorrections}
        dismissedSuggestions={dismissedSuggestions}
        onDismissSuggestion={onDismissSuggestion}
        onUseFragment={handleUseFragment}
        onReviewToken={handleReviewToken}
        onCreateRule={handleCreateRule}
      />
      <AccountAliasesSection
        transactions={transactions}
        accountMap={accountMap}
        aliases={accountAliases}
        onSave={onSaveAccountAliases}
        prefillFragment={aliasPrefill}
      />
      <AccountMapSection
        transactions={transactions}
        accountMap={accountMap}
        onSave={onSaveAccountMap}
      />
      <BudgetsSection
        budgets={budgets}
        expenseCategories={config.expenseCategories}
        onSave={onSaveBudgets}
      />
      <CollapsibleCard
        title="Accounts & Categories"
        badge={config.accounts.length + config.expenseCategories.length + config.incomeCategories.length}
      >
        <ManagedList
          bare
          title="Accounts"
          items={config.accounts}
          usage={usage.acc}
          onAdd={onAddAccount}
          onRename={onRenameAccount}
          onDelete={onDeleteAccount}
          onReorder={onReorderAccounts}
        />
        <div style={{ borderTop: "1px solid #2a313c", margin: "14px 0" }} />
        <ManagedList
          bare
          title="Expense categories"
          items={config.expenseCategories}
          usage={usage.cat}
          onAdd={(n) => onAddCategory("expense", n)}
          onRename={onRenameCategory}
          onDelete={onDeleteCategory}
          onReorder={(names) => onReorderCategories("expense", names)}
        />
        <div style={{ borderTop: "1px solid #2a313c", margin: "14px 0" }} />
        <ManagedList
          bare
          title="Income categories"
          items={config.incomeCategories}
          usage={usage.cat}
          onAdd={(n) => onAddCategory("income", n)}
          onRename={onRenameCategory}
          onDelete={onDeleteCategory}
          onReorder={(names) => onReorderCategories("income", names)}
        />
      </CollapsibleCard>
      <DescriptionRulesSection
        rules={categoryDescriptionRules}
        onSave={onSaveCategoryDescriptionRules}
        config={config}
        prefill={rulePrefill}
        transactions={transactions}
      />
      <CkCategoryMapSection
        transactions={transactions}
        map={ckCategoryMap}
        onSave={onSaveCkCategoryMap}
        config={config}
        highlightToken={categoryHighlight}
      />
      <DataBackupSection transactions={transactions} onRestore={onRestoreTransactions} />
      <SnapshotsSection onRestore={onRestoreTransactions} />
    </div>
  );
}

// Local, client-side backup of the transaction ledger — downloads a JSON
// snapshot of everything currently in memory (the same array that feeds
// GET/PUT /api/transactions), and can restore that same snapshot back,
// replacing whatever is currently loaded. Purely client-side: no new
// endpoint, no change to the Redis-persisted shape.
function DataBackupSection({ transactions, onRestore }) {
  const [justDownloaded, setJustDownloaded] = useState(null);
  const [importStatus, setImportStatus] = useState(null); // { kind: "ok" | "error", text }
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!justDownloaded) return;
    const t = setTimeout(() => setJustDownloaded(null), 2000);
    return () => clearTimeout(t);
  }, [justDownloaded]);

  useEffect(() => {
    if (!importStatus) return;
    const t = setTimeout(() => setImportStatus(null), 4000);
    return () => clearTimeout(t);
  }, [importStatus]);

  const handleBackup = () => {
    const payload = { transactions, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    triggerDownload(blob, `household-transactions-backup-${todayISO()}.json`);
    setJustDownloaded(transactions.length);
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      let rows = Array.isArray(parsed) ? parsed : parsed?.transactions;
      if (!Array.isArray(rows)) throw new Error("File does not contain a transactions array.");
      // Shape check before wiping the ledger with arbitrary JSON: every row
      // must at least look like a transaction (date + finite amount). Rows
      // without an id (hand-edited files) get one assigned.
      const invalid = rows.filter(
        (r) =>
          !r || typeof r !== "object" || Array.isArray(r) ||
          !/^\d{4}-\d{2}-\d{2}/.test(String(r.date || "")) ||
          !Number.isFinite(Number(r.amount))
      ).length;
      if (invalid > 0) {
        throw new Error(`Not a valid backup: ${invalid} row${invalid === 1 ? "" : "s"} missing a date/amount.`);
      }
      rows = rows.map((r) => (r.id ? r : { ...r, id: uid() }));
      const confirmed = window.confirm(
        `Restore ${rows.length} transaction${rows.length === 1 ? "" : "s"} from this backup? ` +
        `This replaces all ${transactions.length} transaction${transactions.length === 1 ? "" : "s"} currently loaded.`
      );
      if (!confirmed) return;
      onRestore(rows);
      setImportStatus({ kind: "ok", text: `Restored ${rows.length} transaction${rows.length === 1 ? "" : "s"}.` });
    } catch (err) {
      setImportStatus({ kind: "error", text: err.message || "Could not read this file." });
    }
  };

  return (
    <CollapsibleCard title="Data & Backup">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" style={S.primaryBtn} onClick={handleBackup}>
          Backup transactions
        </button>
        <button type="button" style={S.secondaryBtn} onClick={handleImportClick}>
          Restore from backup
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>
      <div style={{ fontSize: 12, color: importStatus?.kind === "error" ? "#e5484d" : "#8b94a3", marginTop: 8 }}>
        {importStatus
          ? importStatus.text
          : justDownloaded !== null
          ? `Downloaded ${justDownloaded} transaction${justDownloaded === 1 ? "" : "s"}.`
          : "Backup downloads a local JSON copy of all your transactions. Restore replaces all currently loaded transactions with the contents of a backup file."}
      </div>
    </CollapsibleCard>
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
function CkCategoryMapSection({ transactions, map, onSave, config, highlightToken }) {
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
    <CollapsibleCard
      id="category-mapping-section"
      title="Category mapping"
      badge={tokens.length}
      openSignal={highlightToken && highlightToken.nonce}
    >
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
            style={{
              display: "flex", alignItems: "center", gap: 8, borderRadius: 10, padding: "8px 10px",
              background: highlightToken && highlightToken.token === token ? "#1a1500" : "#161a20",
              border: highlightToken && highlightToken.token === token ? "1px solid #4b3a00" : "1px solid #1e2530",
            }}
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

// Editable Apple Daily Cash heuristic: Apple Card cashback deposits that
// arrive tagged with the wrong category (often Transfer) get reclassified to
// a destination category when the provider pattern + a description keyword
// both match. Same visual/save pattern as `CkCategoryMapSection` — plain PUT,
// no impact preview, no retroactive cascade: only affects NEW imports.
// Editable, ordered list of category-by-description override rules. Each rule
// forces a destination category when the description and/or provider contains
// a substring pattern; the FIRST matching rule wins, so order is semantic
// (reorder with ↑/↓). These take precedence over the Credit Karma category
// map — EXCEPT they never touch rows that are already Transfer (see the
// Transfer safety net in buildRow). Transfer is deliberately absent from the
// destination dropdown. Same visual/save pattern as the sibling sections —
// plain PUT, no impact preview, no retroactive cascade: only affects NEW
// imports.
function DescriptionRulesSection({ rules, onSave, config, prefill, transactions }) {
  const [draft, setDraft] = useState(() => (rules || []).map((r) => ({ ...r })));
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [newRule, setNewRule] = useState({
    pattern: "", matchField: "both", destinationCategory: "",
    allowTransferOverride: false, providerPattern: "",
  });
  // Pre-save conflict warning (purely informational — see
  // `computeDescriptionRuleConflicts`). Any further edit to `draft` resets
  // this back to false, same pattern as `showPreview` in
  // `AccountAliasesSection`.
  const [showConflicts, setShowConflicts] = useState(false);

  useEffect(() => {
    setDraft((rules || []).map((r) => ({ ...r })));
  }, [rules]);

  // Pre-fill the "add rule" form from a Suggested-rules "Create rule from this"
  // action. The user still reviews and clicks "+" / "Save rules" — nothing is
  // persisted automatically.
  useEffect(() => {
    if (prefill && prefill.nonce) {
      setNewRule({
        pattern: prefill.pattern || "",
        matchField: prefill.matchField || "description",
        destinationCategory: prefill.destinationCategory || "",
        allowTransferOverride: false,
        providerPattern: "",
      });
    }
  }, [prefill]);

  // Destination options: current expense + income categories, NO Transfer
  // (a description rule may never de-transfer a row).
  const destinationOptions = useMemo(() => {
    const expense = config?.expenseCategories || EXPENSE_CATEGORIES;
    const income = config?.incomeCategories || INCOME_CATEGORIES;
    return [...expense, ...income];
  }, [config]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify((rules || []).map((r) => ({ ...r }))),
    [draft, rules]
  );

  const updateRule = (idx, patch) => {
    setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setShowConflicts(false); // any further edit invalidates a shown warning
  };

  const deleteRule = (idx) => {
    setDraft((prev) => prev.filter((_, i) => i !== idx));
    setConfirmDelete(null);
    setShowConflicts(false);
  };

  const reorder = (idx, dir) => {
    setDraft((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    setShowConflicts(false);
  };

  const addRule = () => {
    const pattern = newRule.pattern.trim();
    const destinationCategory = newRule.destinationCategory || destinationOptions[0] || "";
    if (!pattern || !destinationCategory) return;
    const allowTransferOverride = !!newRule.allowTransferOverride;
    const providerPattern = String(newRule.providerPattern || "").trim();
    // A rule that can override Transfer MUST carry a provider pattern.
    if (allowTransferOverride && !providerPattern) return;
    setDraft((prev) => [
      ...prev,
      {
        id: uid(), pattern, matchField: newRule.matchField, destinationCategory,
        ...(allowTransferOverride
          ? { allowTransferOverride: true, providerPattern }
          : {}),
      },
    ]);
    setNewRule({
      pattern: "", matchField: "both", destinationCategory: "",
      allowTransferOverride: false, providerPattern: "",
    });
    setShowConflicts(false);
  };

  // Conflicts per draft rule (only rules with a non-empty pattern), computed
  // eagerly whenever the draft changes so the "Save rules" click can decide
  // synchronously whether to show the warning or save right away.
  const conflictsByRule = useMemo(() => {
    return draft
      .filter((r) => String(r.pattern || "").trim())
      .map((r) => ({ rule: r, conflict: computeDescriptionRuleConflicts(transactions, r) }))
      .filter((e) => e.conflict.transferCount > 0 || e.conflict.manualCount > 0);
  }, [draft, transactions]);

  // Client-side validation: a rule that can override Transfer MUST carry a
  // provider pattern (that AND condition is what makes the special power safe).
  const invalidOverrideRules = useMemo(
    () => draft.filter((r) => r.allowTransferOverride && !String(r.providerPattern || "").trim()),
    [draft]
  );
  const hasInvalidOverride = invalidOverrideRules.length > 0;

  const handleSaveClick = () => {
    if (hasInvalidOverride) return;
    if (!showConflicts && conflictsByRule.length > 0) {
      setShowConflicts(true);
      return;
    }
    onSave(draft);
    setShowConflicts(false);
  };

  return (
    <CollapsibleCard
      id="description-rules-section"
      title="Description rules"
      badge={draft.length}
      openSignal={prefill && prefill.nonce}
    >
      <div style={{ fontSize: 12, color: "#8b94a3", margin: "0 0 10px", lineHeight: 1.5 }}>
        Force a destination category when a transaction's description and/or
        provider contains a text fragment. The first matching rule wins, so
        order matters — reorder with ↑/↓. These take precedence over the Credit
        Karma category map, except they never change transactions that are
        already Transfer. Only the category is set; the imported amount and its
        sign are never touched. Saving only affects future imports — existing
        transactions keep their current category.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {draft.map((r, idx) => (
          <div
            key={r.id || idx}
            style={r.allowTransferOverride ? S.overrideRuleCard : S.descRuleCard}
          >
            <input
              type="text"
              value={r.pattern}
              onChange={(e) => updateRule(idx, { pattern: e.target.value })}
              placeholder="e.g. starbucks"
              style={S.input}
            />
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select
                value={r.matchField}
                onChange={(e) => updateRule(idx, { matchField: e.target.value })}
                style={{ ...S.select, flex: 1 }}
              >
                <option value="description">Description</option>
                <option value="provider">Provider</option>
                <option value="both">Both</option>
              </select>
              <select
                value={r.destinationCategory}
                onChange={(e) => updateRule(idx, { destinationCategory: e.target.value })}
                style={{ ...S.select, flex: 1 }}
              >
                {destinationOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <label style={S.overrideCheckboxRow}>
              <input
                type="checkbox"
                checked={!!r.allowTransferOverride}
                onChange={(e) => updateRule(idx, {
                  allowTransferOverride: e.target.checked,
                  ...(e.target.checked ? {} : { providerPattern: "" }),
                })}
              />
              Allow removing from Transfer
            </label>
            {r.allowTransferOverride ? (
              <>
                <input
                  type="text"
                  value={r.providerPattern || ""}
                  onChange={(e) => updateRule(idx, { providerPattern: e.target.value })}
                  placeholder="Provider/account pattern (e.g. Apple Card)"
                  style={S.input}
                />
                <div style={S.overrideNote}>
                  This rule can move a transaction OUT of Transfer on future imports.
                </div>
                {!String(r.providerPattern || "").trim() ? (
                  <div style={S.overrideError}>
                    Provider pattern is required when this rule can override Transfer.
                  </div>
                ) : null}
              </>
            ) : null}
            <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => reorder(idx, -1)}
                disabled={idx === 0}
                title="Move up"
                style={{ ...S.iconBtnSmall, opacity: idx === 0 ? 0.35 : 1, cursor: idx === 0 ? "not-allowed" : "pointer" }}
              >
                <ChevronUp size={15} />
              </button>
              <button
                type="button"
                onClick={() => reorder(idx, 1)}
                disabled={idx === draft.length - 1}
                title="Move down"
                style={{ ...S.iconBtnSmall, opacity: idx === draft.length - 1 ? 0.35 : 1, cursor: idx === draft.length - 1 ? "not-allowed" : "pointer" }}
              >
                <ChevronDown size={15} />
              </button>
              <button
                type="button"
                onClick={() => (confirmDelete === idx ? deleteRule(idx) : setConfirmDelete(idx))}
                onBlur={() => setConfirmDelete((c) => (c === idx ? null : c))}
                title="Delete rule"
                style={{
                  ...S.iconBtnSmall,
                  color: "#f87171",
                  borderColor: confirmDelete === idx ? "#f87171" : "#232a33",
                  fontSize: 12,
                  width: confirmDelete === idx ? "auto" : undefined,
                  padding: confirmDelete === idx ? "0 8px" : undefined,
                }}
              >
                {confirmDelete === idx ? "Confirm?" : <Trash2 size={15} />}
              </button>
            </div>
          </div>
        ))}
        {draft.length === 0 ? (
          <div style={{ fontSize: 12, color: "#636366", padding: "4px 0" }}>No rules yet.</div>
        ) : null}
      </div>

      {/* Add rule */}
      <div style={{ marginTop: 10, borderTop: "1px solid #1e2530", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        <input
          type="text"
          value={newRule.pattern}
          onChange={(e) => setNewRule((p) => ({ ...p, pattern: e.target.value }))}
          placeholder="New rule pattern (e.g. starbucks)"
          style={S.input}
        />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select
            value={newRule.matchField}
            onChange={(e) => setNewRule((p) => ({ ...p, matchField: e.target.value }))}
            style={{ ...S.select, flex: 1 }}
          >
            <option value="description">Description</option>
            <option value="provider">Provider</option>
            <option value="both">Both</option>
          </select>
          <select
            value={newRule.destinationCategory || (destinationOptions[0] || "")}
            onChange={(e) => setNewRule((p) => ({ ...p, destinationCategory: e.target.value }))}
            style={{ ...S.select, flex: 1 }}
          >
            {destinationOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={addRule}
            disabled={!newRule.pattern.trim() || (newRule.allowTransferOverride && !String(newRule.providerPattern || "").trim())}
            title="Add rule"
            style={{ ...S.iconBtnSmall, opacity: (newRule.pattern.trim() && !(newRule.allowTransferOverride && !String(newRule.providerPattern || "").trim())) ? 1 : 0.4, cursor: newRule.pattern.trim() ? "pointer" : "not-allowed" }}
          >
            <Plus size={16} />
          </button>
        </div>
        <label style={S.overrideCheckboxRow}>
          <input
            type="checkbox"
            checked={!!newRule.allowTransferOverride}
            onChange={(e) => setNewRule((p) => ({
              ...p,
              allowTransferOverride: e.target.checked,
              ...(e.target.checked ? {} : { providerPattern: "" }),
            }))}
          />
          Allow removing from Transfer
        </label>
        {newRule.allowTransferOverride ? (
          <>
            <input
              type="text"
              value={newRule.providerPattern}
              onChange={(e) => setNewRule((p) => ({ ...p, providerPattern: e.target.value }))}
              placeholder="Provider/account pattern (e.g. Apple Card)"
              style={S.input}
            />
            <div style={S.overrideNote}>
              This rule can move a transaction OUT of Transfer on future imports.
            </div>
            {!String(newRule.providerPattern || "").trim() ? (
              <div style={S.overrideError}>
                Provider pattern is required when this rule can override Transfer.
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {dirty && showConflicts && conflictsByRule.length > 0 ? (
        <div style={{ background: "#1a1500", border: "1px solid #4b3a00", borderRadius: 10, padding: 10, margin: "6px 0 10px", fontSize: 12, color: "#fbbf24" }}>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>
            Heads up — saving never reprocesses existing transactions; it only
            affects future imports. Rules without "Allow removing from Transfer"
            can never move a transaction out of Transfer; rules that DO have it
            can (see the highlighted note per rule below).
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {conflictsByRule.map(({ rule, conflict }, i) => (
              <div key={rule.id || i}>
                <div style={{ color: "#e5e7eb" }}>
                  "{rule.pattern}" ({rule.matchField}) → {rule.destinationCategory}:{" "}
                  {conflict.transferCount > 0
                    ? `${conflict.transferCount} transaction${conflict.transferCount === 1 ? "" : "s"} already tagged Transfer`
                    : null}
                  {conflict.transferCount > 0 && conflict.manualCount > 0 ? ", " : null}
                  {conflict.manualCount > 0
                    ? `${conflict.manualCount} with a manual correction`
                    : null}
                </div>
                {rule.allowTransferOverride && conflict.transferCount > 0 ? (
                  <div style={{ color: "#f87171", marginTop: 2, fontWeight: 600 }}>
                    This rule WILL be able to move future matching imports out of
                    Transfer — review the examples below carefully.
                  </div>
                ) : null}
                {conflict.transferExamples.length || conflict.manualExamples.length ? (
                  <div style={{ color: "#8b94a3", marginTop: 2 }}>
                    e.g. {[...conflict.transferExamples, ...conflict.manualExamples].slice(0, 5).join("; ")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {hasInvalidOverride ? (
        <div style={{ ...S.overrideError, marginTop: 8 }}>
          Provider pattern is required when a rule can override Transfer.
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={handleSaveClick}
          disabled={!dirty || hasInvalidOverride}
          style={{ ...S.primaryBtn, marginTop: 10, opacity: (dirty && !hasInvalidOverride) ? 1 : 0.5, cursor: (dirty && !hasInvalidOverride) ? "pointer" : "not-allowed" }}
        >
          {showConflicts && conflictsByRule.length > 0 ? "Save anyway" : "Save rules"}
        </button>
        {showConflicts && conflictsByRule.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowConflicts(false)}
            style={{ marginTop: 10, background: "transparent", border: "1px solid #2a313c", color: "#cbd5e1", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </CollapsibleCard>
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

  const description = val("description");

  // Description/provider override rules (Settings → "Description rules"). A
  // SINGLE pass over the ordered list — the first matching rule wins. These
  // OVERRIDE the CK-map/CSV category for the "CK got the category wrong, my
  // rule fixes it" case. Never touches `amount`/its sign.
  const matchedRule = findMatchingDescriptionRule(
    { description, srcAccount: rawAccount, account },
    CATEGORY_DESCRIPTION_RULES
  );
  const overridden = matchedRule ? matchedRule.destinationCategory : recomputedCategory;

  // Transfer safety-net: keeps a CK-sourced (or CSV-sourced) Transfer as
  // Transfer even when a rule matches — a description rule can NEVER de-transfer
  // a row by default (intentional invariant, PR #111). The ONLY escape hatch is
  // a winning rule that explicitly opted into `allowTransferOverride: true`
  // (which requires a non-empty `providerPattern`); such a rule skips the
  // safety net entirely and promotes the row into its destination category —
  // this is the generalization of the former Apple Daily Cash heuristic. Note
  // that "first match wins" applies here too: a broader non-override rule
  // ordered before the override rule would win and the override never fires,
  // which is why migrated Apple Daily Cash rules are prepended to the array.
  const category = (matchedRule && matchedRule.allowTransferOverride)
    ? matchedRule.destinationCategory
    : ((overridden === TRANSFER_CATEGORY || csvCategory === TRANSFER_CATEGORY)
        ? TRANSFER_CATEGORY
        : matchOption(overridden, CATEGORIES, "Other"));

  const row = {
    id: uid(),
    date,
    description,
    amount,
    category,
    account,
  };
  if (ckCategory) row.ckCategory = ckCategory;
  // The auto-classified category this import computed. Written ONLY here and
  // never rewritten afterwards — used purely by the Audit UI to show "was X →
  // you: Y" once the user manually corrects the category. The manual-correction
  // detection itself does NOT depend on this field.
  row.autoCategory = category;
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

// txnFingerprint / descOverlap / dateToDayInt / markDuplicates now live in
// src/ledger.js (imported above).


function ImportTransactions({ onImport, accountMap, config, transactions, ckCategoryMap, categoryDescriptionRules }) {
  // Three methods: Credit Karma (auto-mapped, day-to-day), CSV (manual
  // mapping, one-time history backfill), and SimpleFin (on-demand pull via
  // api/simplefin-sync.js — complementary to the manual CK import, not a
  // replacement; there's no background/cron sync, just a "Sync now" button).
  const [method, setMethod] = useState("ck");
  const profile = BANK_PROFILES.find((p) => p.id === (method === "ck" ? "credit-karma" : "generic"));

  const [rawRows, setRawRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  // SimpleFin-only state: rows come back from the endpoint already shaped
  // like a ledger row (see mapSimpleFinRows below), so they feed the same
  // preview/dedup pipeline as csvRows further down instead of a parallel one.
  const [sfRows, setSfRows] = useState([]);
  const [sfLoading, setSfLoading] = useState(false);
  // Phase 2 (daily cron, v1.49.0): the cron fetches on its own and only
  // queues transactions server-side (household:*:simplefin-pending) — it
  // never writes the ledger. This tracks that queue so the Import tab can
  // surface "N pending" and let the user pull them into this same preview
  // pipeline instead of (or in addition to) a manual "Sync now".
  const [sfPendingCount, setSfPendingCount] = useState(0);
  // True when the rows currently in the preview came from the pending queue
  // rather than a fresh "Sync now" pull — decides whether confirm() needs to
  // clear the server-side queue afterwards.
  const [sfFromPending, setSfFromPending] = useState(false);

  const refreshSfPendingCount = async () => {
    try {
      const res = await fetch("/api/simplefin-sync?pending=1", { headers: buildAuthHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSfPendingCount((data.transactions || []).length);
    } catch {
      // best-effort — no pending banner if this fails, "Sync now" still works
    }
  };
  useEffect(() => {
    refreshSfPendingCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetAll = () => {
    setRawRows([]);
    setHeaders([]);
    setMapping({});
    setFileName("");
    setError("");
    setDone("");
    setSfRows([]);
    setSfFromPending(false);
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
    if (method === "sf") return { csvRows: sfRows, skippedCount: 0 };
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
    // ckCategoryMap / categoryDescriptionRules aren't read directly here —
    // buildRow reads their module-level mirrors — but they must invalidate
    // this memo so editing a rule in Settings recomputes an already-parsed
    // preview instead of showing stale categories.
  }, [method, sfRows, rawRows, mapping, profile, accountMap, config, ckCategoryMap, categoryDescriptionRules]);

  // Flag duplicates against existing data + within the batch.
  const dedupedRows = useMemo(() => markDuplicates(csvRows, transactions || []), [csvRows, transactions]);
  const dupCount = useMemo(() => dedupedRows.filter((r) => r._dup).length, [dedupedRows]);

  // Per-row selection. Default: keep non-duplicates checked, duplicates
  // unchecked. Resets whenever the parsed/mapped batch changes.
  const [selected, setSelected] = useState(() => new Set());
  // Duplicate-visibility filter for the preview list only ("all" | "new" |
  // "dup"). Independent from `selected` (what actually gets imported).
  const [dupFilter, setDupFilter] = useState("all");
  // Per-row category corrections made in the preview, before import. Keyed
  // by row id -> { category, categoryManual }. Same manual-correction
  // semantics as EditModal (see setCategoryOverride below), so these
  // corrections feed detectManualCategoryCorrections / "Suggested rules"
  // just like edits made after import. Reset whenever the parsed/mapped
  // batch changes (same trigger as `selected`/`dupFilter`).
  const [categoryOverrides, setCategoryOverrides] = useState(() => new Map());
  useEffect(() => {
    setSelected(new Set(dedupedRows.filter((r) => !r._dup).map((r) => r.id)));
    setDupFilter("all");
    setCategoryOverrides(new Map());
  }, [dedupedRows]);

  const setCategoryOverride = (id, autoCategory, newCategory) => {
    setCategoryOverrides((prev) => {
      const next = new Map(prev);
      if (newCategory === autoCategory) {
        next.delete(id);
      } else {
        next.set(id, { category: newCategory, categoryManual: newCategory !== TRANSFER_CATEGORY });
      }
      return next;
    });
  };

  // Rows as they should be shown/imported, with any preview-time category
  // corrections applied on top of the deduped/auto-classified rows.
  const displayRows = useMemo(() => {
    if (categoryOverrides.size === 0) return dedupedRows;
    return dedupedRows.map((r) => {
      const ov = categoryOverrides.get(r.id);
      return ov ? { ...r, ...ov } : r;
    });
  }, [dedupedRows, categoryOverrides]);

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
    const toImport = displayRows.filter((r) => selected.has(r.id)).map(({ _dup, ...t }) => t);
    onImport(toImport);
    setDone(`Imported ${toImport.length} transactions${dupCount ? ` · ${dupCount} duplicate(s) detected` : ""}.`);
    // These rows came from the server-side pending queue (cron-fetched, not
    // this session's "Sync now") — now that the user has reviewed and
    // imported them, clear the queue so the same items don't show up as
    // "pending" again next time the Import tab loads.
    if (sfFromPending) {
      fetch("/api/simplefin-sync?pending=1", { method: "DELETE", headers: buildAuthHeaders() })
        .then(() => setSfPendingCount(0))
        .catch(() => { /* best-effort — worst case it shows up again next load */ });
    }
    resetAll();
  };

  const methods = [
    { id: "ck", title: "Credit Karma", desc: "Daily export — auto-mapped, sign preserved." },
    { id: "csv", title: "CSV", desc: "Manual mapping — for backfilling old history." },
    { id: "sf", title: "SimpleFin (auto)", desc: "Pulls transactions from SimpleFin on demand — complements, doesn't replace, the CSV/Credit Karma import." },
  ];

  // SimpleFin sync: hits the server endpoint, then runs the returned rows
  // through the same account-matching / category-fallback buildRow already
  // applies for CSV rows, so they land in the shared preview/dedup pipeline
  // looking exactly like any other imported row.
  const syncSimpleFin = async () => {
    setError("");
    setDone("");
    setSfLoading(true);
    setSfFromPending(false);
    try {
      const res = await fetch("/api/simplefin-sync", { headers: buildAuthHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          res.status === 501
            ? "SimpleFin não configurado (SIMPLEFIN_ACCESS_URL ausente no servidor)."
            : (data.error || "Falha ao sincronizar com o SimpleFin.")
        );
        setSfRows([]);
        return;
      }
      const mapped = classifySimpleFinRows(data.transactions, accountMap);
      setSfRows(mapped);
      setFileName(`SimpleFin sync — ${mapped.length} transaction${mapped.length === 1 ? "" : "s"}`);
      if (data.errors && data.errors.length) {
        setError(`SimpleFin warnings: ${data.errors.join("; ")}`);
      }
    } catch (err) {
      setError(`Could not reach the sync endpoint: ${err.message}`);
      setSfRows([]);
    } finally {
      setSfLoading(false);
    }
  };

  // Pulls the cron-queued pending transactions (household:*:simplefin-pending)
  // instead of hitting SimpleFin again, and runs them through the exact same
  // account-matching / category-fallback as a manual sync so they land in the
  // shared preview/dedup pipeline looking identical either way.
  const loadSimpleFinPending = async () => {
    setError("");
    setDone("");
    setSfLoading(true);
    try {
      const res = await fetch("/api/simplefin-sync?pending=1", { headers: buildAuthHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Falha ao carregar pendências do SimpleFin.");
        return;
      }
      const mapped = classifySimpleFinRows(data.transactions, accountMap);
      setSfRows(mapped);
      setSfFromPending(true);
      setFileName(`SimpleFin pendentes — ${mapped.length} transaction${mapped.length === 1 ? "" : "s"}`);
    } catch (err) {
      setError(`Could not reach the pending queue: ${err.message}`);
    } finally {
      setSfLoading(false);
    }
  };

  const showPreview = method === "sf" ? sfRows.length > 0 : headers.length > 0;

  return (
    <div style={S.col}>
      <h3 style={S.sectionTitle}>Import</h3>

      {/* Method picker — segmented control (first decision of the flow,
          so it gets a bigger touch target than the Analyze granularity
          picker). Legend below shows the currently selected method's
          description. */}
      <div>
        <div style={S.segmented}>
          {methods.map((m) => (
            <button
              key={m.id}
              onClick={() => selectMethod(m.id)}
              style={{ ...S.segmentedBtn(method === m.id), flex: 1, padding: "8px 16px", minHeight: 36, fontSize: 13 }}
            >
              {m.title}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#8b94a3", marginTop: 6, lineHeight: 1.35 }}>
          {methods.find((m) => m.id === method)?.desc}
        </div>
      </div>

      {/* File dropzone — CK/CSV only. SimpleFin has no file, just a sync button. */}
      {method === "sf" ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "26px 16px", borderRadius: 16, textAlign: "center", border: "1.5px dashed #2a313c", background: "#12161c" }}>
          <RefreshCw size={22} color="#8b94a3" />
          <span style={{ fontSize: 14, color: "#cbd5e1", overflowWrap: "anywhere" }}>
            {fileName || "Pull the latest transactions from SimpleFin"}
          </span>
          {sfPendingCount > 0 ? (
            <div style={{ fontSize: 12, color: "#fbbf24", background: "#241d0f", border: "1px solid #4a3a12", borderRadius: 10, padding: "6px 10px", lineHeight: 1.4 }}>
              {sfPendingCount} transaç{sfPendingCount === 1 ? "ão" : "ões"} do SimpleFin (sync automático diário) pendente{sfPendingCount === 1 ? "" : "s"} de revisão.
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {sfPendingCount > 0 ? (
              <button
                onClick={loadSimpleFinPending}
                disabled={sfLoading}
                style={{ ...S.primaryBtn, opacity: sfLoading ? 0.6 : 1, cursor: sfLoading ? "not-allowed" : "pointer", padding: "8px 20px", minHeight: 36, fontSize: 13 }}
              >
                {sfLoading ? "Carregando…" : `Revisar ${sfPendingCount} pendente${sfPendingCount === 1 ? "" : "s"}`}
              </button>
            ) : null}
            <button
              onClick={syncSimpleFin}
              disabled={sfLoading}
              style={{
                ...(sfPendingCount > 0 ? S.secondaryBtn : S.primaryBtn),
                opacity: sfLoading ? 0.6 : 1,
                cursor: sfLoading ? "not-allowed" : "pointer",
                padding: "8px 20px",
                minHeight: 36,
                fontSize: 13,
              }}
            >
              {sfLoading ? "Syncing…" : "Sync now"}
            </button>
          </div>
        </div>
      ) : (
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
      )}

      {error ? <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div> : null}
      {done ? <div style={{ color: "#34d399", fontSize: 13 }}>{done}</div> : null}

      {showPreview ? (
        <>
          {/* Manual column mapping — CSV method only. Collapsed by default
              once the auto-guessed mapping already satisfies the required
              fields; forced open when something still needs attention. */}
          {method === "csv" && (
            <>
              <CollapsibleCard title="Column mapping" defaultOpen={missingRequired.length > 0}>
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
              </CollapsibleCard>
              {missingRequired.length > 0 ? (
                <div style={{ color: "#fbbf24", fontSize: 13 }}>
                  Map a column for: {missingRequired.map((f) => f.label).join(", ")}.
                </div>
              ) : null}
            </>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12, color: "#8b94a3" }}>
            <span>
              {rawRows.length === csvRows.length ? `${csvRows.length} valid` : `${rawRows.length} parsed · ${csvRows.length} valid`}
              {skippedCount > 0 ? <span style={{ color: "#fbbf24" }}> · {skippedCount} skipped (non-numeric rows)</span> : null} · <span style={{ color: "#cbd5e1" }}>{selectedCount} selected</span>
              {dupCount ? <span style={{ color: "#fbbf24" }}> · {dupCount} duplicate{dupCount === 1 ? "" : "s"} auto-unchecked</span> : null}
            </span>
            <button onClick={selectAll} style={S.linkBtn}>Select all</button>
            <button onClick={selectNone} style={S.linkBtn}>Deselect all</button>
            {dupCount ? (
              <div style={S.segmented}>
                {DUP_FILTERS.map(({ v, l }) => (
                  <button key={v} onClick={() => setDupFilter(v)} style={S.segmentedBtn(dupFilter === v)}>
                    {l}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div style={{ ...S.list, maxHeight: 300, overflowY: "auto" }}>
            {(() => {
              const previewRows = displayRows.filter((t) => (dupFilter === "dup" ? t._dup : dupFilter === "new" ? !t._dup : true));
              return (
                <>
            {previewRows.slice(0, 400).map((t) => {
              const checked = selected.has(t.id);
              const autoCategory = t.autoCategory ?? t.category;
              const edited = t.category !== autoCategory;
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
                      {edited ? <span title={`Auto-detected as ${autoCategory}`} style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#60a5fa", border: "1px solid #1d3a5f", borderRadius: 6, padding: "1px 5px", verticalAlign: "1px" }}>EDITED</span> : null}
                    </div>
                    <div style={{ fontSize: 11, color: "#8b94a3", display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                      <span style={{ whiteSpace: "nowrap" }}>{t.date}{t.account ? ` · ${t.account}` : ""}</span>
                      <select
                        value={t.category}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setCategoryOverride(t.id, autoCategory, e.target.value)}
                        style={S.importCatSelect}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <span style={{ fontSize: 14, color: "#cbd5e1", whiteSpace: "nowrap" }}>{usd.format(t.amount)}</span>
                </div>
              );
            })}
            {previewRows.length > 400 ? (
              <div style={{ fontSize: 11, color: "#fbbf24", padding: "8px 4px", textAlign: "center" }}>
                Preview limited to the first 400 of {previewRows.length} rows — rows beyond it are
                not shown here but are still counted, selected and imported per the totals above.
              </div>
            ) : null}
                </>
              );
            })()}
          </div>
          <div style={S.importActionsBar}>
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
          </div>
        </>
      ) : null}
    </div>
  );
}

// Read-only vitrine of the SimpleFin pending queue (household:*:simplefin-pending),
// with the same account/category classification the Import tab uses — no
// write actions, no dedup against the ledger, purely a preview so the user
// can eyeball what the next "Revisar pendentes" import will look like.
function SimpleFinPreview({ accountMap, money }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/simplefin-sync?pending=1", { headers: buildAuthHeaders() });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(
            res.status === 501
              ? "SimpleFin não configurado (SIMPLEFIN_ACCESS_URL ausente no servidor)."
              : (data.error || "Falha ao carregar pendências do SimpleFin.")
          );
          setRows([]);
          return;
        }
        setRows(classifySimpleFinRows(data.transactions, accountMap));
      } catch (err) {
        if (!cancelled) {
          setError(`Could not reach the pending queue: ${err.message}`);
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accountMap]);

  if (loading) return <div style={S.center}>Loading…</div>;

  return (
    <div style={S.col}>
      <h3 style={S.sectionTitle}>Preview</h3>
      <div style={{ fontSize: 12, color: "#8b94a3", lineHeight: 1.4, padding: "8px 10px", borderRadius: 10, background: "#12161c", border: "1px solid #1e2530" }}>
        Estas transações ainda não foram importadas — são apenas uma sugestão de classificação. Confirme na tab Import para gravá-las no ledger.
      </div>
      {error ? <div style={S.errorBar}>{error}</div> : null}
      {!error && rows.length === 0 ? (
        <Empty>Nenhuma transação pendente.</Empty>
      ) : (
        <div style={S.col}>
          {rows.map((t) => (
            <TxnRow key={t.id || `${t.date}-${t.description}-${t.amount}`} t={t} money={money} />
          ))}
        </div>
      )}
    </div>
  );
}

function matchOption(value, options, fallback) {
  if (!value) return fallback;
  const v = value.toLowerCase();
  const hit = options.find((o) => o.toLowerCase() === v);
  return hit || fallback;
}

// normAccount / matchAccountWithAliasesReason / matchAccountWithAliases now
// live in src/ledger.js (imported above) and take the accounts list as a
// parameter; the wrappers below bind them to the live module state.

// Same as the pure matcher, using the current live alias table + accounts.
function matchAccount(rawValue) {
  return matchAccountWithAliases(rawValue, ACCOUNT_ALIASES, ACCOUNTS);
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
// Shared classification for SimpleFin queue rows (pending review or a fresh
// sync): resolves the suggested account via classifyAccount and falls back
// the category through matchOption, same as the import preview pipeline.
// Used by ImportTransactions (both "Sync now" and "Revisar pendentes") and
// by the read-only SimpleFinPreview tab.
function classifySimpleFinRows(transactions, accountMap) {
  return (transactions || []).map((t) => {
    const account = classifyAccount(t.srcAccount, "", accountMap) || "";
    const category = matchOption(t.category, CATEGORIES, "Other");
    return { ...t, account, category, autoCategory: category };
  });
}

function computeAliasImpact(transactions, accountMap, aliasesArray) {
  const impacted = [];
  for (const t of transactions || []) {
    if (t.accountUrn && accountMap && accountMap[t.accountUrn]) continue;
    const raw = t.srcAccount || "";
    if (!raw) continue;
    const to = matchAccountWithAliases(raw, aliasesArray, ACCOUNTS);
    if (to && to !== t.account) {
      impacted.push({ id: t.id, from: t.account || "", to, description: t.description, date: t.date, srcAccount: raw });
    }
  }
  return impacted;
}

// ---------------------------------------------------------------------------
// Suggested rules (Audit → "Suggested rules"): purely client-side detection
// over already-loaded `transactions`, derived data only — no new endpoint, no
// automatic persistence. Both functions are pure and read-only; any resulting
// change still goes through the existing save flows
// (`saveAccountAliasesAndApply` / the Category mapping save button).

// Group A: transactions with no account (`account === ""`, i.e. Unassigned)
// that share a normalized `srcAccount` fragment. Reuses `normAccount` (the
// same normalization `matchAccountWithAliases` matches against) instead of a
// new string heuristic, and skips anything an existing alias would already
// catch. Returns groups with >= 2 occurrences, sorted by count desc.
function detectSuggestedAliasFragments(transactions, aliasesArray) {
  const groups = new Map();
  for (const t of transactions || []) {
    if ((t.account || "") !== "") continue;
    const raw = t.srcAccount || "";
    if (!raw) continue;
    if (matchAccountWithAliases(raw, aliasesArray || [], ACCOUNTS)) continue; // already covered
    const n = normAccount(raw);
    if (!n) continue;
    const e = groups.get(n) || { fragment: n, count: 0, examples: [] };
    e.count++;
    if (e.examples.length < 3 && t.description && !e.examples.includes(t.description)) {
      e.examples.push(t.description);
    }
    groups.set(n, e);
  }
  return [...groups.values()]
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count);
}

// Group B: transactions classified as "Other" that still carry a raw
// `ckCategory`, grouped by `ckCategoryToken` (same tokenizer `mapCkCategory`
// uses). Kept only when the token's current mapping resolves to "Other" (or
// is unmapped, which also falls back to "Other" — see `mapCkCategory`), since
// a token already routed elsewhere isn't a classification gap. Returns groups
// with >= 2 occurrences, sorted by count desc.
function detectSuggestedCategoryTokens(transactions, ckCategoryMapObj) {
  const groups = new Map();
  for (const t of transactions || []) {
    if ((t.category || "") !== "Other") continue;
    if (!t.ckCategory) continue;
    const token = ckCategoryToken(t.ckCategory);
    if (!token) continue;
    const mapped = (ckCategoryMapObj && ckCategoryMapObj[token]) || "Other";
    if (mapped !== "Other") continue;
    const e = groups.get(token) || { token, count: 0, examples: [] };
    e.count++;
    if (e.examples.length < 3 && t.description && !e.examples.includes(t.description)) {
      e.examples.push(t.description);
    }
    groups.set(token, e);
  }
  return [...groups.values()]
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count);
}

// A short, normalized description fragment used both to group generic-CSV
// manual corrections (no ckCategory) and to seed a description rule's pattern.
// Reuses `descWords` (the dedup tokenizer: >=3 chars, stop words removed),
// drops purely-numeric tokens (store/order numbers vary per transaction), and
// keeps the first up-to-2 significant words joined — e.g. "STARBUCKS #4821" and
// "STARBUCKS STORE 12" both collapse to "starbucks".
// Exported (alongside the default App component) so
// src/App.integration.test.js can exercise it directly — plain named
// exports, no change to the single-file monolith structure.
export function descFragment(desc) {
  const words = descWords(desc).filter((w) => !/^[0-9]+$/.test(w));
  return words.slice(0, 2).join(" ");
}

// Group C (manual category corrections): rows the user explicitly re-categorized
// (categoryManual === true), excluding Transfer. Grouping key is the normalized
// description fragment (the merchant — the same thing the created description
// rule will match on), falling back to the CK category token only when the
// description yields no fragment. Grouping by ckCategory token here would lump
// unrelated merchants that happen to share a source category (e.g. every
// income row corrected in one import) into a single bogus suggestion. Each
// group carries up to 3 examples (each with its own corrected category) and
// the most-frequent destination category (what the user keeps picking) as the
// rule target. Threshold >= 2. Sorted by count desc. Pure — memoized by caller.
// Like Group A (matchAccountWithAliases) and Group B (token already mapped
// away from "Other"), skips rows already covered by an existing Description
// rule — categoryManual is a permanent snapshot on historical rows (never
// rewritten once a rule starts auto-classifying new imports), so without this
// check a group would resurface forever even after the user creates the
// exact rule the suggestion asked for.
export function detectManualCategoryCorrections(transactions, descriptionRules) {
  const groups = new Map();
  for (const t of transactions || []) {
    if (t.categoryManual !== true) continue;
    if (isTransfer(t.category)) continue;
    if (matchDescriptionCategoryRule(t, descriptionRules) === t.category) continue; // already covered
    const key = descFragment(t.description) || (t.ckCategory ? ckCategoryToken(t.ckCategory) : "");
    if (!key) continue;
    let e = groups.get(key);
    if (!e) {
      e = { key, count: 0, examples: [], destCounts: new Map() };
      groups.set(key, e);
    }
    e.count++;
    e.destCounts.set(t.category, (e.destCounts.get(t.category) || 0) + 1);
    if (e.examples.length < 3 && t.description) {
      e.examples.push({ description: t.description, autoCategory: t.autoCategory || "", category: t.category });
    }
  }
  const pickTop = (m) => {
    let best = -1, val = "";
    for (const [k, n] of m) if (n > best) { best = n; val = k; }
    return val;
  };
  return [...groups.values()]
    .filter((g) => g.count >= 2)
    .map((g) => ({
      key: g.key,
      count: g.count,
      examples: g.examples,
      destinationCategory: pickTop(g.destCounts),
      pattern: g.key,
    }))
    .sort((a, b) => b.count - a.count);
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

// App-wide font stack. Kept as a standalone constant (not just S.app.fontFamily)
// because some elements — e.g. the Popover — are rendered via createPortal
// into document.body, escaping the .app tree that would otherwise cascade
// the font down; those need to restate it explicitly.
const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

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
    fontFamily: FONT_STACK,
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
    background: "rgba(22,26,32,0.7)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 16,
    backdropFilter: "blur(16px) saturate(160%)",
    WebkitBackdropFilter: "blur(16px) saturate(160%)",
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
    background: "rgba(11,13,16,0.85)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    borderTop: "1px solid rgba(255,255,255,0.08)",
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
    background: "rgba(15,18,22,0.92)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: "12px 14px",
    color: "#e5e7eb",
    fontSize: 15,
    outline: "none",
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)",
  },
  select: {
    flex: 1,
    background: "rgba(15,18,22,0.92)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: "10px 12px",
    color: "#e5e7eb",
    fontSize: 14,
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)",
  },
  // iOS-style wheel picker column (SinglePeriodFilter, mobile/iOS only). Scroll-snap
  // keeps the centered row aligned; rows fade/shrink with distance from center.
  wheelCol: {
    flex: 1,
    height: WHEEL_VISIBLE * WHEEL_ITEM_H,
    overflowY: "scroll",
    scrollSnapType: "y mandatory",
    scrollbarWidth: "none",
    WebkitOverflowScrolling: "touch",
  },
  wheelItem: (dist) => ({
    height: WHEEL_ITEM_H,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    scrollSnapAlign: "center",
    fontSize: dist === 0 ? 16 : 13,
    fontWeight: dist === 0 ? 700 : 400,
    color: dist === 0 ? "#f4f6f8" : dist === 1 ? "#8b94a3" : "#4b5563",
    cursor: "pointer",
    userSelect: "none",
  }),
  // Description rule card (Settings → Description rules). Default state uses the
  // muted surface/border; `overrideRuleCard` swaps to an amber accent while the
  // rule has the special "Allow removing from Transfer" power turned on.
  descRuleCard: {
    display: "flex", flexDirection: "column", gap: 6, borderRadius: 10,
    padding: "8px 10px", background: "#161a20", border: "1px solid #1e2530",
  },
  overrideRuleCard: {
    display: "flex", flexDirection: "column", gap: 6, borderRadius: 10,
    padding: "8px 10px", background: "#1a1500", border: "1px solid #b45309",
  },
  overrideCheckboxRow: {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 12, color: "#8b94a3", cursor: "pointer",
  },
  overrideNote: {
    fontSize: 11, color: "#fbbf24", lineHeight: 1.4,
  },
  overrideError: {
    fontSize: 11, color: "#f87171", lineHeight: 1.4,
  },
  // Compact category picker inside the Import preview row — same tokens as
  // `select` but sized to sit inline next to the date/account line without
  // breaking the row layout or the sticky import bar below it.
  importCatSelect: {
    flex: "0 1 auto",
    minWidth: 0,
    maxWidth: 130,
    background: "rgba(15,18,22,0.92)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: "2px 4px",
    color: "#8b94a3",
    fontSize: 11,
    lineHeight: 1.4,
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)",
  },
  primaryBtn: {
    width: "100%",
    background: "linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0) 60%), linear-gradient(135deg, #0A84FF 0%, #0055cc 100%)",
    border: "none",
    borderRadius: 12,
    padding: "13px 16px",
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(10,132,255,0.3), inset 0 1px 1px rgba(255,255,255,0.2)",
  },
  secondaryBtn: {
    width: "100%",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.14)",
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
  // Keeps the "Import N transactions" CTA reachable without scrolling past
  // the preview list — sticks to the bottom of <main> (the only scroll
  // parent) with a soft gradient so it doesn't clip abruptly over content.
  importActionsBar: {
    position: "sticky",
    bottom: 0,
    marginTop: -4,
    paddingTop: 16,
    paddingBottom: 2,
    background: "linear-gradient(to bottom, rgba(11,13,16,0) 0%, #0b0d10 55%)",
  },
  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(15,18,22,0.92)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: "0 10px",
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)",
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
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
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
    background: "rgba(22,26,32,0.82)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: 16,
    boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
  },
  loginCard: {
    background: "rgba(22,26,32,0.82)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: 24,
    margin: 16,
    boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
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
    flexWrap: "nowrap",
    overflow: "hidden",
    alignItems: "center",
    minWidth: 0,
    fontSize: 12,
    padding: "6px 10px",
    background: "rgba(22,26,32,0.7)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    backdropFilter: "blur(16px) saturate(160%)",
    WebkitBackdropFilter: "blur(16px) saturate(160%)",
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
    padding: "4px 6px",
    margin: "-4px -6px",
    display: "grid",
    placeItems: "center",
  },
  iconBtnSmall: {
    background: "#161a20",
    border: "1px solid #232a33",
    color: "#8b94a3",
    cursor: "pointer",
    borderRadius: 8,
    height: 30,
    minWidth: 30,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
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
    background: "rgba(16,24,38,0.7)",
    border: "1px solid rgba(96,165,250,0.35)",
    borderRadius: 14,
    backdropFilter: "blur(16px) saturate(160%)",
    WebkitBackdropFilter: "blur(16px) saturate(160%)",
  },
  cellSelect: {
    background: "rgba(15,18,22,0.92)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: "5px 8px",
    color: "#e5e7eb",
    fontSize: 12,
    maxWidth: 170,
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)",
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
    // Popover is rendered via createPortal into document.body, escaping the
    // .app tree that sets the app-wide font — restate it explicitly so
    // buttons/inputs inside don't fall back to the browser default font.
    fontFamily: FONT_STACK,
    maxHeight: 280,
    overflowY: "auto",
    background: "rgba(22,26,32,0.82)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.08)",
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
    background: active ? "rgba(30,58,95,0.75)" : "rgba(30,35,40,0.7)",
    border: active ? "1px solid #3b82f6" : "1px solid #3a3f4a",
    color: active ? "#93c5fd" : "#cbd5e1",
    borderRadius: 999,
    padding: "7px 14px",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
  }),
  // Native <select> styled to look like chipBtn (desktop SingleCategoryFilter).
  // appearance: "none" hides the browser's default arrow; chipSelectArrow draws ours.
  chipSelect: (active) => ({
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    display: "inline-flex",
    alignItems: "center",
    background: active ? "rgba(30,58,95,0.75)" : "rgba(30,35,40,0.7)",
    border: active ? "1px solid #3b82f6" : "1px solid #3a3f4a",
    color: active ? "#93c5fd" : "#cbd5e1",
    borderRadius: 999,
    padding: "7px 26px 7px 14px",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    fontFamily: "inherit",
    colorScheme: "dark",
  }),
  chipSelectArrow: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: 9,
    opacity: 0.7,
    pointerEvents: "none",
  },
  // Toggle pill used in MonthlyBarCard (Income / Expense selector)
  togglePill: (active) => ({
    background: active ? "rgba(10,132,255,0.75)" : "transparent",
    border: active ? "1px solid #0A84FF" : "1px solid #3a3f4a",
    color: active ? "#fff" : "#8b94a3",
    borderRadius: 999,
    padding: "4px 12px",
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
  }),
  // Generic segmented control, same visual pattern as the Analyze
  // granularity picker (GRANULARITIES). Container + per-button style;
  // callers can spread extra overrides (e.g. bigger padding) on top of
  // segmentedBtn's return value.
  segmented: {
    display: "flex",
    gap: 2,
    background: "rgba(15,18,22,0.92)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: 3,
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)",
  },
  segmentedBtn: (active) => ({
    background: active ? "rgba(10,132,255,0.75)" : "transparent",
    border: "none",
    color: active ? "#fff" : "#8b94a3",
    borderRadius: 7,
    padding: "3px 10px",
    fontSize: 12,
    fontWeight: active ? 700 : 400,
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
  }),
  // Year-range drag slider (Charts / Trends), replaces from/to <select>s.
  yearRangeTrack: {
    position: "relative",
    height: 4,
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
  },
  yearRangeWrap: {
    position: "relative",
    margin: "18px auto 8px",
    maxWidth: 260,
    flex: "1 1 200px",
    paddingLeft: 12,
    paddingRight: 12,
    boxSizing: "border-box",
  },
  yearRangeFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: 999,
    background: "rgba(10,132,255,0.75)",
  },
  yearRangeHandle: {
    position: "absolute",
    top: "50%",
    width: 20,
    height: 20,
    borderRadius: "50%",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.35), rgba(255,255,255,0) 50%), rgba(10,132,255,0.85)",
    border: "1px solid rgba(255,255,255,0.5)",
    backdropFilter: "blur(6px) saturate(160%)",
    WebkitBackdropFilter: "blur(6px) saturate(160%)",
    transform: "translate(-50%, -50%)",
    cursor: "grab",
    touchAction: "none",
    boxShadow: "0 2px 6px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.35)",
  },
  yearRangeLabel: {
    position: "absolute",
    top: -18,
    transform: "translateX(-50%)",
    fontSize: 11,
    fontWeight: 700,
    color: "#93c5fd",
    whiteSpace: "nowrap",
  },
};
