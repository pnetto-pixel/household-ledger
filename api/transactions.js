// api/transactions.js
// GET: { exists, transactions, savedAt, method, email, admin }
// PUT { transactions, expectedSavedAt? }: { ok, savedAt } | 409 { error, savedAt }
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
// Snapshots: the first successful PUT of each (UTC) day also writes an
// immutable copy under "<key>:snapshot:YYYY-MM-DD" with a 30-day TTL, as an
// automatic safety net against a bad save/restore. SET NX keeps only the
// day's first state; snapshots are additive and never read by the app.

import { getRedis } from '../lib/redis.js';
import { authenticate } from '../lib/auth.js';

const SNAPSHOT_TTL_SECONDS = 30 * 24 * 60 * 60;

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

  try {
    if (req.method === 'GET') {
      const raw = await redis.get(storageKey);
      const { transactions, savedAt } = parseStored(raw);
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
      const transactions = body.transactions;
      if (!Array.isArray(transactions)) {
        return res.status(400).json({ error: 'transactions array required' });
      }

      // Optimistic-concurrency check (only when the client opted in by
      // sending expectedSavedAt; null means "I loaded an empty ledger").
      if ('expectedSavedAt' in body) {
        const raw = await redis.get(storageKey);
        const { savedAt: storedSavedAt } = parseStored(raw);
        const expected = body.expectedSavedAt || null;
        if (storedSavedAt !== expected) {
          return res.status(409).json({
            error: 'Ledger was updated by another device',
            savedAt: storedSavedAt,
          });
        }
      }

      const savedAt = new Date().toISOString();
      const payload = JSON.stringify({ transactions, savedAt });
      await redis.set(storageKey, payload);

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
