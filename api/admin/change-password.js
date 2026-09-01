// /api/admin/change-password.js
//
// Lets the owner rotate the password from the page itself. This is why the
// store exists: Vercel only applies env var changes to NEW deployments, so an
// env-var password would make every reset a developer task plus a redeploy.

import {
  withAdmin, verifyPassword, hashPassword, signSession, sessionCookie,
  MAX_PASSWORD_LENGTH,
} from '../_lib/auth.js';
import {
  getPasswordHash, setPasswordHash, revokeAllSessions, sessionNotRevoked,
} from '../_lib/store.js';

const MIN_NEW_LENGTH = 12;

export default withAdmin(async function handler(req, res, session) {
  const current = req.body?.currentPassword;
  const next = req.body?.newPassword;

  if (typeof current !== 'string' || typeof next !== 'string') {
    return res.status(400).json({ error: 'Both the current and new password are required.' });
  }
  if (next.length < MIN_NEW_LENGTH || next.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({
      error: `The new password must be between ${MIN_NEW_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
    });
  }
  if (next === current) {
    return res.status(400).json({ error: 'The new password must be different.' });
  }

  const stored = await getPasswordHash();
  if (!stored) {
    return res.status(500).json({ error: 'Admin login is not configured' });
  }

  // The CURRENT password is required, not merely a valid session. Without this,
  // anyone who got hold of a session — an XSS on this page, a borrowed laptop —
  // could change the password and lock the owner out of their own dashboard.
  if (!(await verifyPassword(current, stored))) {
    console.log(JSON.stringify({ evt: 'admin.password.reject', sid: session.sid }));
    return res.status(403).json({ error: 'Your current password did not match.' });
  }

  const hash = await hashPassword(next);
  try {
    await setPasswordHash(hash);
  } catch (err) {
    // setPasswordHash throws rather than failing quietly: telling the owner the
    // password changed when it did not is how you lock someone out.
    console.error('[admin] password write failed', err);
    return res.status(503).json({ error: 'Could not save the new password. Try again shortly.' });
  }

  // Mint the replacement first so its sid can be named as the survivor. `iat`
  // is in whole seconds, so the new token shares a timestamp with the ones
  // being revoked — a purely time-based cutoff would either spare the old
  // sessions or kill this one.
  const now = Math.floor(Date.now() / 1000);
  const { token, payload } = signSession(now);
  await revokeAllSessions(now, payload.sid);
  res.setHeader('Set-Cookie', sessionCookie(token));
  console.log(JSON.stringify({ evt: 'admin.password.changed', sid: payload.sid }));

  return res.status(200).json({ ok: true, otherSessionsSignedOut: true });
}, { methods: ['POST'], verifyRevocation: sessionNotRevoked });
