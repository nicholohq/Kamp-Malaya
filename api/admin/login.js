// /api/admin/login.js
//
// Exchanges the shared password for a signed session cookie.
//
// Runs through the same guard as every other admin endpoint (headers, method
// allowlist, CSRF) with the session requirement switched off — there is no
// session to check yet.

import {
  withAdmin, verifyPassword, signSession, sessionCookie, MAX_PASSWORD_LENGTH,
} from '../_lib/auth.js';
import {
  getPasswordHash, hashIp, checkRateLimit, recordLoginFailure, clearLoginFailures,
} from '../_lib/store.js';

export default withAdmin(async function handler(req, res) {
  const ipHash = hashIp(req);

  const limit = await checkRateLimit(ipHash);
  if (!limit.allowed) {
    console.log(JSON.stringify({ evt: 'admin.login.blocked', ipHash }));
    return res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.' });
  }
  if (limit.degraded) {
    console.error('[admin] rate limiting is NOT being enforced — store unreachable');
  }

  const password = req.body?.password;
  // Rejected before any hashing, and the message is deliberately identical in
  // shape to a wrong password: this must not become an oracle for what the
  // password looks like.
  if (typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({ error: 'Invalid password' });
  }

  const stored = await getPasswordHash();
  if (!stored) {
    // Neither the store nor the env var has a usable hash. Fail closed, and say
    // so plainly — this is a misconfiguration, not a rejected password, and
    // conflating them costs an hour of debugging.
    console.error('[admin] no password configured: set ADMIN_PASSWORD_HASH');
    return res.status(500).json({ error: 'Admin login is not configured' });
  }

  const ok = await verifyPassword(password, stored);
  if (!ok) {
    await recordLoginFailure(ipHash);
    console.log(JSON.stringify({ evt: 'admin.login.fail', ipHash }));
    return res.status(401).json({ error: 'That password did not work.' });
  }

  await clearLoginFailures(ipHash);

  const { token, payload } = signSession();
  res.setHeader('Set-Cookie', sessionCookie(token));
  console.log(JSON.stringify({ evt: 'admin.login.ok', sid: payload.sid, ipHash }));

  // No body worth returning, and nothing about the password ever echoed back.
  return res.status(204).end();
}, { methods: ['POST'], requireSession: false });
