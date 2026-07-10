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
  const pw = String(password).trim();
  if (!passwordsMatch(pw, expected)) {
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
