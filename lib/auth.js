// lib/auth.js
// Auth: shared app password only (x-app-password header). The Google JWT
// path was removed — this household uses a single password across devices,
// and the short-lived Google ID token caused silent save failures after it
// expired mid-session.
//
// IMPORTANT: passwordStorageKey must keep producing the exact same key as
// before ("portfolio:pwd:<sha256-16>:holdings") — all persisted data is
// namespaced under it (rewritten to "household:...:transactions" etc. by the
// API routes).

import crypto from 'crypto';
import { getRedis } from './redis.js';

// Brute-force throttle: max failed password attempts per IP per window.
// Counted in Redis (INCR + EX) so it works across serverless instances.
// Fails open if Redis is unavailable — auth still requires the password.
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

function sha256Short(input) {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

// Constant-time comparison over fixed-length digests, so neither the length
// nor the content of the expected password leaks through timing.
function passwordsMatch(candidate, expected) {
  const a = crypto.createHash('sha256').update(candidate).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function passwordStorageKey(password) {
  return `portfolio:pwd:${sha256Short(password)}:holdings`;
}

export async function authenticate(req) {
  const password =
    req.headers['x-app-password'] || req.headers['X-App-Password'];

  if (!password) {
    return { ok: false, status: 401, error: 'No auth provided' };
  }

  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return { ok: false, status: 500, error: 'APP_PASSWORD not configured' };
  }

  const ip = clientIp(req);
  if ((await failuresKeyCount(ip)) >= RATE_LIMIT_MAX_FAILURES) {
    return { ok: false, status: 429, error: 'Too many attempts — try again later' };
  }

  const pw = String(password).trim();
  if (!passwordsMatch(pw, expected)) {
    await failuresKeyCount(ip, { increment: true });
    return { ok: false, status: 401, error: 'Invalid password' };
  }
  return {
    ok: true,
    method: 'password',
    email: null,
    storageKey: passwordStorageKey(pw),
    admin: false,
  };
}
