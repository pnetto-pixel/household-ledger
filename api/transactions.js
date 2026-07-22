// api/transactions.js
// GET: { exists, transactions, savedAt, method, email, admin }
// PUT { transactions, expectedSavedAt?, clientId? }: { ok, savedAt } | 409 { error, savedAt }
// Auth required (x-app-password).
//
// Storage: derives a household-scoped key from auth.storageKey. The auth
// layer hands back keys shaped like "portfolio:email:<hash>:holdings"; we
// rewrite the namespace prefix to "household:" and swap the ":holdings"
// suffix for ":transactions" so the ledger lives under its own key and
// never collides with any portfolio blob.
//
// Concurrency: PUT is optimistic. When the client sends `expectedSavedAt`
// (the savedAt it loaded/last saved), the write is rejected with 409 if the
// stored savedAt differs — another device saved in between, and accepting
// the write would silently overwrite its changes (the payload is the whole
// array). Clients that don't send the field keep the old last-write-wins
// behavior (back-compat).
//
// Self-conflict escape hatch: the client also sends a per-page-load
// `clientId`, stored alongside the blob. When expectedSavedAt mismatches but
// the stored blob was written by the SAME clientId, the write is accepted:
// the only writer since this client's last load was this client itself — its
// in-memory state already contains that write, so nothing is overwritten.
// This happens on iOS when a save's PUT lands but the page is suspended
// before the response is processed (the visibilitychange/pagehide keepalive
// flush): the client keeps the stale savedAt and its next save used to 409
// against its own earlier write ("updated on another device" with no other
// device involved).
//
// Snapshots: the first successful PUT of each (UTC) day also writes an
// immutable copy under "<key>:snapshot:YYYY-MM-DD" with a 7-day TTL, as an
// automatic safety net against a bad save/restore. SET NX keeps only the
// day's first state; snapshots are additive and read only by
// api/snapshots.js (Settings restore UI).
//
// Kept short (7d, not 30d) because each snapshot duplicates the full
// transactions blob — on the shared Redis Cloud free tier (30MB, split with
// the portfolio app) 30 days of daily snapshots was the single largest
// consumer of the quota.

import { getRedis } from '../lib/redis.js';
import { authenticate } from '../lib/auth.js';

const SNAPSHOT_TTL_SECONDS = 7 * 24 * 60 * 60;

// Atomic compare-and-set for the optimistic-concurrency PUT. The old
// JS-side "GET savedAt → compare → SET" left a window where two devices
// could both pass the check and the later SET silently won; doing the same
// three steps in one Lua script closes it.
//
// v1.47.1: the compare no longer decodes the JSON blob. cjson is stricter
// than JS JSON: one lone UTF-16 surrogate in a transaction description
// (an emoji cut in half by a CSV truncation) made cjson.decode fail on the
// whole blob while parseStored (JS) read it fine — stored savedAt came
// back '' and EVERY optimistic PUT 409'd forever (the field signature
// "[other write ? by old-vers · merge failed: put 409]"). The compare
// values now live in a tiny side key KEYS[2] = "savedAt|clientId" that Lua
// string-splits without parsing JSON. Fallbacks when the meta key doesn't
// exist yet (pre-v1.47.1 ledgers): decode the blob the old way; if even
// that fails (a wedged ledger — the exact bug), accept the write to heal.
//
// KEYS[1]=blob, KEYS[2]=meta. ARGV[1]=expected savedAt ('' = client loaded
// an empty/legacy ledger), ARGV[2]=payload, ARGV[3]=clientId ('' from old
// clients; same-client savedAt mismatch is forgiven — see header comment),
// ARGV[4]=new meta value. Returns {1, ''} on success, {0, storedSavedAt,
// storedClientId} on conflict.
const CAS_PUT_SCRIPT = `
local stored = ''
local storedClient = ''
local meta = redis.call('GET', KEYS[2])
if meta then
  local sep = string.find(meta, '|', 1, true)
  if sep then
    stored = string.sub(meta, 1, sep - 1)
    storedClient = string.sub(meta, sep + 1)
  end
else
  local raw = redis.call('GET', KEYS[1])
  if raw then
    local ok, parsed = pcall(cjson.decode, raw)
    if ok and type(parsed) == 'table' then
      if type(parsed.savedAt) == 'string' then
        stored = parsed.savedAt
      end
      if type(parsed.clientId) == 'string' then
        storedClient = parsed.clientId
      end
    else
      stored = ARGV[1]
    end
  end
end
if stored ~= ARGV[1] then
  if ARGV[3] == '' or storedClient ~= ARGV[3] then
    return {0, stored, storedClient}
  end
end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], ARGV[4])
return {1, ''}
`;

// Strip unpaired UTF-16 surrogates from user strings, replacing them with
// U+FFFD. A lone surrogate survives JS JSON round-trips but is invalid to
// strict parsers — it is corrupt text either way (renders as �), and one
// of them is what wedged the Lua CAS above. Scrubbing on write keeps the
// stored blob valid JSON for every parser from here on.
const LONE_SURROGATE_RE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
function sanitizeStrings(value) {
  if (typeof value === 'string') return value.replace(LONE_SURROGATE_RE, '�');
  if (Array.isArray(value)) return value.map(sanitizeStrings);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = sanitizeStrings(value[k]);
    return out;
  }
  return value;
}

// Minimal server-side shape check (defense in depth — the client already
// validates imports/restores). Every row must have a YYYY-MM-DD date string
// and a finite numeric amount; anything else means a buggy client is about
// to overwrite the whole ledger with garbage.
function findInvalidRow(transactions) {
  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    if (!t || typeof t !== 'object') return { index: i, reason: 'not an object' };
    if (typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
      return { index: i, reason: 'invalid date' };
    }
    if (typeof t.amount !== 'number' || !Number.isFinite(t.amount)) {
      return { index: i, reason: 'invalid amount' };
    }
  }
  return null;
}

function transactionsKeyFromAuth(auth) {
  // auth.storageKey: "portfolio:<scope>:<hash>:holdings"
  // -> "household:<scope>:<hash>:transactions"
  if (!auth?.storageKey) return null;
  return auth.storageKey
    .replace(/^portfolio:/, 'household:')
    .replace(/:holdings$/, ':transactions');
}

function parseStored(raw) {
  if (!raw) return { transactions: null, savedAt: null };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { transactions: parsed, savedAt: null };
    if (parsed && Array.isArray(parsed.transactions)) {
      return { transactions: parsed.transactions, savedAt: parsed.savedAt || null };
    }
  } catch {
    // fall through
  }
  return { transactions: null, savedAt: null };
}

export default async function handler(req, res) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const storageKey = transactionsKeyFromAuth(auth);
  if (!storageKey) {
    return res.status(500).json({ error: 'No storage key derived' });
  }

  let redis;
  try {
    redis = getRedis();
  } catch (err) {
    return res.status(503).json({ error: `Storage unavailable: ${err.message}` });
  }

  const metaKey = `${storageKey}:meta`;

  try {
    if (req.method === 'GET') {
      const raw = await redis.get(storageKey);
      const { transactions, savedAt } = parseStored(raw);
      // Migration/backfill: seed the CAS meta key from the JS-parsed blob
      // (JS parse is tolerant where cjson is not). NX so a concurrent PUT's
      // freshly written meta is never clobbered by a stale GET.
      if (raw) {
        try {
          await redis.set(metaKey, `${savedAt || ''}|`, 'NX');
        } catch (err) {
          console.error('meta seed failed:', err.message);
        }
      }
      return res.status(200).json({
        exists: Array.isArray(transactions),
        transactions: transactions || [],
        savedAt,
        method: auth.method,
        email: auth.email,
        admin: auth.admin,
      });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      if (!Array.isArray(body.transactions)) {
        return res.status(400).json({ error: 'transactions array required' });
      }
      const transactions = sanitizeStrings(body.transactions);

      const invalid = findInvalidRow(transactions);
      if (invalid) {
        return res.status(400).json({
          error: `Invalid transaction at index ${invalid.index}: ${invalid.reason}`,
        });
      }

      const savedAt = new Date().toISOString();
      const clientId = typeof body.clientId === 'string' ? body.clientId : '';
      const payload = JSON.stringify({ transactions, savedAt, clientId });
      const metaValue = `${savedAt}|${clientId}`;

      // Optimistic-concurrency write (only when the client opted in by
      // sending expectedSavedAt; null means "I loaded an empty ledger").
      // Atomic compare-and-set via Lua — see CAS_PUT_SCRIPT.
      if ('expectedSavedAt' in body) {
        const expected = body.expectedSavedAt || '';
        const [okFlag, storedSavedAt, storedClientId] = await redis.eval(
          CAS_PUT_SCRIPT, 2, storageKey, metaKey, expected, payload, clientId, metaValue
        );
        if (okFlag !== 1) {
          // savedAt + clientId of the conflicting write feed the client's
          // on-screen diagnostics (who wrote, when, from which device).
          return res.status(409).json({
            error: 'Ledger was updated by another device',
            savedAt: storedSavedAt || null,
            clientId: storedClientId || null,
          });
        }
      } else {
        // No expectedSavedAt — old client, keep last-write-wins (back-compat).
        await redis.set(storageKey, payload);
        await redis.set(metaKey, metaValue);
      }

      // Daily snapshot (best-effort — a snapshot failure never fails the save).
      try {
        const snapKey = `${storageKey}:snapshot:${savedAt.slice(0, 10)}`;
        await redis.set(snapKey, payload, 'EX', SNAPSHOT_TTL_SECONDS, 'NX');
      } catch (err) {
        console.error('snapshot write failed:', err.message);
      }

      return res.status(200).json({ ok: true, savedAt });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('transactions handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
