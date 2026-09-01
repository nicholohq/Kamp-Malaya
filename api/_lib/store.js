// /api/_lib/store.js
//
// The small amount of mutable state the admin area needs, in Upstash Redis.
// Serverless has no shared memory between invocations, so without this there
// can be no real rate limiting, no instant session revocation, and no way to
// change the password without a redeploy (Vercel only applies env var changes
// to NEW deployments).
//
// Every read has a documented fallback. An outage of a third-party store must
// not lock the owner out of their own dashboard.

import crypto from 'node:crypto';

const KEY_PASSWORD = 'admin:password';
const KEY_VALID_AFTER = 'admin:sessions_valid_after';
const KEY_KEEP_SID = 'admin:sessions_keep_sid';
const KEY_LOGIN_FAIL = 'admin:login_fail:';

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_S = 900; // 15 minutes

let _client;          // memoised across warm invocations
let _clientResolved = false;

/** Tests inject a stub; pass null to fall back to the real lookup again. */
export function __setClient(client) {
  _client = client;
  _clientResolved = client !== null && client !== undefined;
}

async function client() {
  if (_clientResolved) return _client;
  _clientResolved = true;
  _client = null;

  // The Marketplace integration injects UPSTASH_*; stores migrated from the
  // retired Vercel KV product carry the KV_* names instead. Accept either.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;

  try {
    const { Redis } = await import('@upstash/redis');
    _client = new Redis({ url, token });
  } catch (err) {
    console.error('[admin store] client init failed', err);
    _client = null;
  }
  return _client;
}

// ------------------------------------------------------------------ password

/**
 * The stored password hash, or the env-var seed when the store has none.
 *
 * That fallback is the recovery path, not a convenience: deleting the
 * `admin:password` key in the Upstash console restores the env password, so a
 * forgotten password can never become an outage. It also keeps login working
 * through a store outage.
 */
export async function getPasswordHash() {
  try {
    const redis = await client();
    if (redis) {
      const stored = await redis.get(KEY_PASSWORD);
      if (typeof stored === 'string' && stored.length > 0) return stored;
    }
  } catch (err) {
    console.error('[admin store] password read failed, using env fallback', err);
  }
  const seed = process.env.ADMIN_PASSWORD_HASH;
  return typeof seed === 'string' && seed.length > 0 ? seed : null;
}

/**
 * Persists a new password hash. Unlike the reads, this throws on failure —
 * silently "succeeding" would tell the owner their password changed when it
 * had not, and lock them out of a password they think is live.
 */
export async function setPasswordHash(hash) {
  const redis = await client();
  if (!redis) throw new Error('store unavailable');
  await redis.set(KEY_PASSWORD, hash);
}

// ---------------------------------------------------------------- revocation

/**
 * Sessions issued before this cutoff are dead. This is what a stateless token
 * cannot do on its own, and the reason `iat` is in the payload.
 * Unreadable → 0, i.e. revoke nothing: an outage must not sign everyone out.
 */
export async function getSessionsValidAfter() {
  try {
    const redis = await client();
    if (!redis) return 0;
    const value = await redis.get(KEY_VALID_AFTER);
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (err) {
    console.error('[admin store] revocation read failed, treating as none', err);
    return 0;
  }
}

/**
 * Kills every session issued at or before `now`.
 *
 * `keepSid` exempts exactly one session, and it is not a convenience: `iat` has
 * second granularity, so the replacement token minted during a password change
 * shares a timestamp with the sessions being revoked. A purely time-based
 * cutoff therefore either spares the old sessions or kills the new one. Naming
 * the survivor is exact, and leaves no one-second window.
 */
export async function revokeAllSessions(now = Math.floor(Date.now() / 1000), keepSid = null) {
  const redis = await client();
  if (!redis) throw new Error('store unavailable');
  await redis.set(KEY_VALID_AFTER, now);
  if (keepSid) await redis.set(KEY_KEEP_SID, keepSid);
  else await redis.del(KEY_KEEP_SID);
}

/** Guard suitable for `withAdmin({ verifyRevocation })`. */
export async function sessionNotRevoked(session) {
  if (!session || !Number.isInteger(session.iat)) return false;
  let cutoff = 0;
  let keepSid = null;
  try {
    const redis = await client();
    if (redis) {
      const [after, keep] = await Promise.all([
        redis.get(KEY_VALID_AFTER),
        redis.get(KEY_KEEP_SID),
      ]);
      const n = Number(after);
      cutoff = Number.isFinite(n) && n > 0 ? n : 0;
      keepSid = typeof keep === 'string' ? keep : null;
    }
  } catch (err) {
    // An outage must not sign everyone out.
    console.error('[admin store] revocation read failed, treating as none', err);
    return true;
  }
  if (cutoff === 0) return true;
  if (keepSid && session.sid === keepSid) return true;
  return session.iat > cutoff;
}

// -------------------------------------------------------------- rate limiting

/** Never log or store a raw IP; a truncated hash is enough to spot a pattern. */
export function hashIp(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : String(fwd || ''))
    .split(',')[0].trim() || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

/**
 * Counts failed logins per IP in a fixed window.
 *
 * Fails OPEN on a store error, deliberately. The alternative is that an Upstash
 * outage locks the owner out of their own dashboard. The cost is that anyone
 * who can take the store down also disables rate limiting — acceptable only
 * because password entropy is the primary control here.
 */
export async function checkRateLimit(ipHash) {
  try {
    const redis = await client();
    if (!redis) return { allowed: true, degraded: true };
    const count = Number(await redis.get(KEY_LOGIN_FAIL + ipHash)) || 0;
    return { allowed: count < RATE_LIMIT_MAX, degraded: false, count };
  } catch (err) {
    console.error('[admin store] rate limit read failed, allowing', err);
    return { allowed: true, degraded: true };
  }
}

export async function recordLoginFailure(ipHash) {
  try {
    const redis = await client();
    if (!redis) return;
    const key = KEY_LOGIN_FAIL + ipHash;
    const count = await redis.incr(key);
    // Set the TTL on first failure so the window slides from the first attempt
    // rather than being extended by every subsequent one.
    if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW_S);
  } catch (err) {
    console.error('[admin store] rate limit write failed', err);
  }
}

export async function clearLoginFailures(ipHash) {
  try {
    const redis = await client();
    if (!redis) return;
    await redis.del(KEY_LOGIN_FAIL + ipHash);
  } catch {
    // A successful login that cannot clear its counter is harmless; the key
    // expires on its own.
  }
}

export { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_S };
