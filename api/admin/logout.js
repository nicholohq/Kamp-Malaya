// /api/admin/logout.js
//
// Clears the session cookie. Requires a valid session so a drive-by request
// cannot force-expire the owner's login.

import { withAdmin, clearSessionCookie } from '../_lib/auth.js';
import { sessionNotRevoked } from '../_lib/store.js';

export default withAdmin(async function handler(req, res, session) {
  res.setHeader('Set-Cookie', clearSessionCookie());
  console.log(JSON.stringify({ evt: 'admin.logout', sid: session.sid }));
  return res.status(204).end();
}, { methods: ['POST'], verifyRevocation: sessionNotRevoked });
