// Generates the ADMIN_PASSWORD_HASH seed for the admin dashboard.
//
//   node scripts/hash-admin-password.mjs
//   node scripts/hash-admin-password.mjs 'a-password-you-already-chose'
//
// With no argument it generates a strong password for you, which is the
// intended path: rate limiting exists, but password entropy is still the
// primary control and a memorable password materially weakens the design.
//
// The value printed is a HASH. The plaintext is never written to disk and never
// stored in Vercel — that is the point of hashing it here rather than pasting
// the password itself into an env var.

import crypto from 'node:crypto';
import { hashPassword } from '../api/_lib/auth.js';

const provided = process.argv[2];
const password = provided || crypto.randomBytes(18).toString('base64');

const hash = await hashPassword(password);

console.log('');
if (!provided) {
  console.log('  Password (save this in a password manager — it is not stored anywhere):');
  console.log('');
  console.log(`      ${password}`);
  console.log('');
}
console.log('  Set this in Vercel → Settings → Environment Variables:');
console.log('');
console.log(`      ADMIN_PASSWORD_HASH=${hash}`);
console.log('');
console.log('  And a signing key, if you have not set one already:');
console.log('');
console.log(`      ADMIN_SESSION_SECRET=${crypto.randomBytes(32).toString('base64')}`);
console.log('');
console.log('  Env var changes only apply to NEW deployments — redeploy afterwards.');
console.log('  Once signed in, the password can be changed from the page itself,');
console.log('  with no redeploy. This hash is the seed and the recovery path:');
console.log('  delete the `admin:password` key in Upstash to fall back to it.');
console.log('');
