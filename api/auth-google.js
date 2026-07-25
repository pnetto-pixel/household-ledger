// api/auth-google.js
// POST { credential } — credential is the Google ID token (JWT) returned by
// Google Identity Services' `credential` callback on the client. Verifies it
// against Google's tokeninfo endpoint, checks the email against a fixed
// allowlist (ALLOWED_EMAILS), and — on success — mints an opaque, long-lived
// (30-day) session token stored in Redis. The client stores that token and
// sends it as `x-session-token` on every subsequent request; the Google ID
// token itself is used exactly once and then discarded (see lib/auth.js for
// why: re-sending the ~1h-lived Google token caused silent save failures in
// a previous version of this feature).
//
// Response: 200 { token, email } | 4xx/5xx { error }.

import { loginWithGoogle } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = await loginWithGoogle(req);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.status(200).json({ token: result.token, email: result.email });
  } catch (err) {
    console.error('auth-google handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
