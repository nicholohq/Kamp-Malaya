// /api/_lib/auth.js
//
// Password verification, session cookies, and the guard every admin endpoint
// runs behind. Nothing here talks to the network — the store lives in
// ./store.js so this file stays pure and unit-testable.
//
// The `_` prefix on this directory keeps Vercel's zero-config router from
// treating these as endpoints; they are still bundled when imported.

import crypto from 'node:crypto';

export const COOKIE_NAME = '__Host-km_admin';

// scrypt parameters, encoded into the hash string so they can change later
// without a migration: scrypt$N$r$p$saltB64$hashB64
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

// scrypt needs more memory than node's default 32MB at N=16384, r=8.
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

const SESSION_VERSION = 1;
const MAX_PASSWORD_LENGTH = 200;

// ---------------------------------------------------------------- comparison

/**
 * Constant-time equality for secrets.
 *
 * `===` on a secret leaks it: V8 short-circuits at the first differing byte, so
 * response latency becomes a function of how many leading characters a guess
 * got right, turning an O(charset^n) search into O(charset*n).
 *
 * crypto.timingSafeEqual throws when its inputs differ in length, which leaks
 * length by itself — so both sides are hashed to a fixed 32 bytes first and the
 * digests are what get compared.
 */
export function safeEqual(a, b) {
  const da = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const db = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(da, db);
}

// ------------------------------------------------------------------ password

function scryptHash(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password, salt, KEY_LEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

/** Hashes a password into the self-describing storage format. */
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('password must be a non-empty string');
  }
  const salt = crypto.randomBytes(16);
  const key = await scryptHash(password, salt);
  return [
    'scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P,
    salt.toString('base64'), key.toString('base64'),
  ].join('$');
}

/**
 * Verifies a candidate against a stored hash. Returns false rather than
 * throwing for every malformed input, so a corrupt stored value fails closed
 * instead of 500-ing the login endpoint.
 */
export async function verifyPassword(candidate, stored) {
  if (typeof candidate !== 'string' || typeof stored !== 'string') return false;
  // Cap BEFORE scrypt: without this a 10MB password field burns CPU through
  // our own KDF, which is a denial of service we would be paying for.
  if (candidate.length === 0 || candidate.length > MAX_PASSWORD_LENGTH) return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const actual = await new Promise((resolve, reject) => {
      crypto.scrypt(
        candidate, salt, expected.length,
        { N, r, p, maxmem: SCRYPT_MAXMEM },
        (err, key) => (err ? reject(err) : resolve(key)),
      );
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export { MAX_PASSWORD_LENGTH };

// ------------------------------------------------------------------- session

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function sessionSecret() {
  // Read env inside the function, never at module scope: the existing
  // ghl-webhook test has to set env before `await import(...)` because that
  // module reads eagerly, which makes two env states untestable in one file.
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) return null;
  return secret;
}

export function sessionTtlSeconds() {
  const hours = Number(process.env.ADMIN_SESSION_TTL_HOURS);
  const safe = Number.isFinite(hours) && hours > 0 && hours <= 720 ? hours : 12;
  return Math.round(safe * 3600);
}

/**
 * Signs a session token: base64url(payload).base64url(HMAC-SHA256(payload)).
 *
 * Stateless is the right call on serverless — the alternative is a store round
 * trip on every request purely to look up a session that carries no data. The
 * one thing it cannot do on its own is revocation, which is why `iat` is in the
 * payload and gets compared against a stored cutoff (see store.js).
 */
export function signSession(now = Math.floor(Date.now() / 1000)) {
  const secret = sessionSecret();
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured');

  const payload = {
    v: SESSION_VERSION,
    iat: now,
    exp: now + sessionTtlSeconds(),
    sid: crypto.randomBytes(16).toString('hex'),
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  return { token: `${body}.${sig}`, payload };
}

/**
 * Verifies a token's signature, version and expiry. Returns the payload, or
 * null for anything at all suspect. Revocation is checked separately by the
 * caller, since it needs the store.
 */
export function verifySession(token, now = Math.floor(Date.now() / 1000)) {
  const secret = sessionSecret();
  if (!secret) return null;
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) return null;

  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  if (token.indexOf('.', dot + 1) !== -1) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expectedSig = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  if (!safeEqual(sig, expectedSig)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (payload.v !== SESSION_VERSION) return null;
  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) return null;

  // Expiry is enforced from `exp` here. Max-Age on the cookie is only a hint to
  // the client, and the client is the thing we do not trust.
  if (payload.exp <= now) return null;

  return payload;
}

// -------------------------------------------------------------------- cookie

/**
 * The __Host- prefix makes the browser refuse the cookie unless it is Secure,
 * Path=/ and carries no Domain. That is what stops a sibling subdomain from
 * overwriting the session cookie, which SameSite alone does not prevent.
 * Adding a Domain attribute here would silently break the whole scheme.
 */
export function sessionCookie(token) {
  return [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${sessionTtlSeconds()}`,
  ].join('; ');
}

export function clearSessionCookie() {
  return [
    `${COOKIE_NAME}=`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=0',
  ].join('; ');
}

export function readCookie(req, name = COOKIE_NAME) {
  const header = req.headers?.cookie;
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

// --------------------------------------------------------------------- guard

function adminOrigin() {
  return process.env.ADMIN_ORIGIN || 'https://www.kampmalaya.tours';
}

function applyBaseHeaders(res) {
  // Every admin response. no-store is not optional: these bodies carry customer
  // PII, and availability.js's `s-maxage=120` pattern would put it in Vercel's
  // shared edge cache.
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Deliberately NO Access-Control-Allow-Origin. The admin page is same-origin,
  // and same-origin requests never preflight. Absent is stronger than
  // present-and-narrow: there is nothing to misconfigure. Do not copy the
  // reflect-any-origin pattern from ghl-webhook.js / availability.js.
}

/**
 * Wraps a handler so it cannot be reached unauthenticated.
 *
 * A `if (!requireAdmin(req, res)) return;` helper reads better but fails open
 * the first time someone forgets the `return` — the endpoint stays silently
 * public. Making the guard the export removes that possibility.
 *
 * `verifyRevocation` is injected so this module never imports the store, which
 * keeps it free of network calls and trivial to test.
 */
export function withAdmin(handler, {
  methods = ['GET'],
  verifyRevocation = null,
  // Login cannot require a session, but it still needs the headers, the method
  // allowlist and the CSRF layers — so it runs through the same guard rather
  // than growing a second, subtly different copy of them.
  requireSession = true,
} = {}) {
  return async function guarded(req, res) {
    applyBaseHeaders(res);

    try {
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        return res.status(405).json({ error: 'Method not allowed' });
      }

      // CSRF, three layers, all on state-changing requests.
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        // 1. A cross-origin HTML form can only send urlencoded, multipart or
        //    text/plain without a preflight. Demanding JSON means a forged form
        //    post cannot be constructed at all.
        const ct = String(req.headers['content-type'] || '');
        if (!ct.toLowerCase().includes('application/json')) {
          return res.status(415).json({ error: 'Expected application/json' });
        }
        // 2. Strict origin match, and a MISSING origin is rejected. Browsers
        //    always send Origin on POST; absence means a non-browser client.
        //    SameSite=Strict does not cover this, because it is same-*site* —
        //    any subdomain still sends the cookie.
        const origin = req.headers.origin;
        if (!origin || origin !== adminOrigin()) {
          return res.status(403).json({ error: 'Bad origin' });
        }
        // 3. Cross-origin JS cannot set a custom header without a preflight we
        //    never grant.
        if (req.headers['x-admin-request'] !== '1') {
          return res.status(403).json({ error: 'Bad request' });
        }
      }

      let session = null;
      if (requireSession) {
        session = verifySession(readCookie(req));
        if (!session) {
          return res.status(401).json({ error: 'Not authenticated' });
        }
        if (verifyRevocation) {
          const stillValid = await verifyRevocation(session);
          if (!stillValid) {
            return res.status(401).json({ error: 'Not authenticated' });
          }
        }
      }

      return await handler(req, res, session);
    } catch (err) {
      // A stack trace must never reach the browser. Log it under a ref the
      // owner can quote, return nothing useful to an attacker.
      const ref = crypto.randomBytes(4).toString('hex');
      console.error(`[admin ${ref}]`, err);
      return res.status(500).json({ error: 'Something went wrong', ref });
    }
  };
}
