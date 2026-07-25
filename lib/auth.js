// lib/auth.js
// Auth: Google Sign-In (Google Identity Services), restricted to a fixed
// email allowlist, with a server-issued opaque session token.
//
// History: a Google-login path existed before and was removed in v1.30.0
// because the client re-sent the Google ID token on every request — it
// expires after ~1h, and this app is a PWA left open for hours, so saves
// started failing silently mid-session. It was replaced with a shared app
// password (x-app-password). v1.55.0 reinstates Google login but fixes that
// bug at the root: the ID token is only used ONCE, at login, to mint a
// long-lived (30-day) opaque session token stored server-side in Redis. The
// client only ever sends that session token (x-session-token header), which
// never expires mid-session the way the Google ID token did.
//
// IMPORTANT — storage key must NOT change: before this feature, storageKey
// was derived from the shared APP_PASSWORD
// ("portfolio:pwd:<sha256-16>:holdings"). Deriving it from the logged-in
// email instead would split the two allowed users into two different
// households, which is the opposite of what's wanted (both emails must see
// the exact same data, with zero migration). So storageKey keeps being
// derived from APP_PASSWORD/HOUSEHOLD_ID under the hood — it's just no
// longer used to authenticate the request, only to namespace the blob.

import crypto from 'crypto';
import { getRedis } from './redis.js';

// ---------------------------------------------------------------------------
// Storage key (unchanged namespace, no auth role anymore)
// ---------------------------------------------------------------------------

function sha256Short(input) {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export function passwordStorageKey(password) {
  return `portfolio:pwd:${sha256Short(password)}:holdings`;
}

// Every allowed user must resolve to the SAME storage key (one household).
// Prefer the legacy APP_PASSWORD (still set in Vercel — kept only to
// reproduce the exact pre-existing key, not to authenticate anyone), then a
// dedicated HOUSEHOLD_ID, then a fixed fallback so a fresh deploy still
// works.
export function householdStorageKey() {
  const seed = process.env.APP_PASSWORD || process.env.HOUSEHOLD_ID || 'household-ledger-default';
  return passwordStorageKey(seed);
}

// ---------------------------------------------------------------------------
// IP throttle (shared by login attempts)
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX_FAILURES = 20;
const RATE_LIMIT_WINDOW_SECONDS = 60;

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

async function failuresKeyCount(ip, { increment } = {}) {
  try {
    const redis = getRedis();
    const key = `household:authfail:${ip}`;
    if (increment) {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
      return n;
    }
    const n = await redis.get(key);
    return n ? parseInt(n, 10) : 0;
  } catch {
    return 0; // fail open — Redis down shouldn't lock out the household
  }
}

// ---------------------------------------------------------------------------
// Google ID token verification
// ---------------------------------------------------------------------------

// Verifying via Google's tokeninfo endpoint (instead of pulling in a JWT/JWKS
// library) keeps this dependency-free: Google validates the signature,
// audience shape and expiry server-side and just hands back the claims.
async function verifyGoogleIdToken(idToken) {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!res.ok) return null;
  const payload = await res.json().catch(() => null);
  if (!payload || !payload.email || !payload.aud) return null;

  const expectedAud = process.env.GOOGLE_CLIENT_ID;
  if (!expectedAud || payload.aud !== expectedAud) return null;

  const exp = parseInt(payload.exp, 10);
  if (!exp || Date.now() / 1000 > exp) return null;

  if (payload.email_verified === false || payload.email_verified === 'false') return null;

  return { email: String(payload.email).toLowerCase().trim() };
}

function allowedEmails() {
  const raw = process.env.ALLOWED_EMAILS || 'pnetto@gmail.com,belasp@hotmail.com';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Session tokens (opaque, server-issued, stored in Redis)
// ---------------------------------------------------------------------------

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const SESSION_PREFIX = 'household:session:';

function sessionKey(token) {
  return `${SESSION_PREFIX}${token}`;
}

async function createSession(email) {
  const token = crypto.randomBytes(32).toString('hex');
  const redis = getRedis();
  await redis.set(
    sessionKey(token),
    JSON.stringify({ email, createdAt: new Date().toISOString() }),
    'EX',
    SESSION_TTL_SECONDS
  );
  return token;
}

// Exchanges a Google ID token (obtained client-side via Google Identity
// Services) for a session token, after checking the email allowlist.
// Returns { ok, status, error } | { ok: true, token, email }.
export async function loginWithGoogle(req) {
  const ip = clientIp(req);
  if ((await failuresKeyCount(ip)) >= RATE_LIMIT_MAX_FAILURES) {
    return { ok: false, status: 429, error: 'Too many attempts — try again later' };
  }

  const idToken = req.body?.credential;
  if (!idToken || typeof idToken !== 'string') {
    return { ok: false, status: 400, error: 'Missing Google credential' };
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    return { ok: false, status: 500, error: 'GOOGLE_CLIENT_ID not configured' };
  }

  let claims;
  try {
    claims = await verifyGoogleIdToken(idToken);
  } catch {
    claims = null;
  }

  if (!claims) {
    await failuresKeyCount(ip, { increment: true });
    return { ok: false, status: 401, error: 'Invalid Google credential' };
  }

  if (!allowedEmails().includes(claims.email)) {
    await failuresKeyCount(ip, { increment: true });
    return { ok: false, status: 403, error: 'This Google account is not allowed' };
  }

  const token = await createSession(claims.email);
  return { ok: true, token, email: claims.email };
}

export async function logout(req) {
  const token = req.headers['x-session-token'] || req.headers['X-Session-Token'];
  if (token && typeof token === 'string') {
    try {
      await getRedis().del(sessionKey(token));
    } catch {
      // best-effort — an expired/unknown token is fine to ignore
    }
  }
  return { ok: true };
}

// Validates the session token sent on every API request.
export async function authenticate(req) {
  const token = req.headers['x-session-token'] || req.headers['X-Session-Token'];
  if (!token || typeof token !== 'string') {
    return { ok: false, status: 401, error: 'No auth provided' };
  }

  let raw;
  try {
    raw = await getRedis().get(sessionKey(token));
  } catch (err) {
    return { ok: false, status: 503, error: `Storage unavailable: ${err.message}` };
  }

  if (!raw) {
    return { ok: false, status: 401, error: 'Invalid or expired session' };
  }

  let session;
  try {
    session = JSON.parse(raw);
  } catch {
    session = null;
  }
  if (!session || !session.email) {
    return { ok: false, status: 401, error: 'Invalid session' };
  }

  return {
    ok: true,
    method: 'google',
    email: session.email,
    storageKey: householdStorageKey(),
    admin: false,
  };
}
