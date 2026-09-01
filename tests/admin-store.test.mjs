import test from 'node:test';
import assert from 'node:assert/strict';

const store = await import('../api/_lib/store.js');
const {
  __setClient, getPasswordHash, setPasswordHash,
  getSessionsValidAfter, revokeAllSessions, sessionNotRevoked,
  hashIp, checkRateLimit, recordLoginFailure, clearLoginFailures,
  RATE_LIMIT_MAX,
} = store;

/** Minimal in-memory stand-in for the Upstash client. */
function fakeRedis(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    calls: [],
    async get(k) { this.calls.push(['get', k]); return data.has(k) ? data.get(k) : null; },
    async set(k, v) { this.calls.push(['set', k, v]); data.set(k, v); },
    async del(k) { this.calls.push(['del', k]); data.delete(k); },
    async incr(k) { const n = (Number(data.get(k)) || 0) + 1; data.set(k, n); this.calls.push(['incr', k]); return n; },
    async expire(k, s) { this.calls.push(['expire', k, s]); },
  };
}

/** A client where every operation rejects, to exercise the fallbacks. */
function brokenRedis() {
  const boom = async () => { throw new Error('upstash is down'); };
  return { get: boom, set: boom, del: boom, incr: boom, expire: boom };
}

test.afterEach(() => { __setClient(null); delete process.env.ADMIN_PASSWORD_HASH; });

// ------------------------------------------------------------------ password

test('the stored hash wins over the env seed', async () => {
  process.env.ADMIN_PASSWORD_HASH = 'scrypt$env$seed';
  __setClient(fakeRedis({ 'admin:password': 'scrypt$stored$value' }));
  assert.equal(await getPasswordHash(), 'scrypt$stored$value');
});

test('the env seed is used when the store has no password', async () => {
  process.env.ADMIN_PASSWORD_HASH = 'scrypt$env$seed';
  __setClient(fakeRedis());
  assert.equal(await getPasswordHash(), 'scrypt$env$seed');
});

test('deleting the stored key restores the env password — the recovery path', async () => {
  process.env.ADMIN_PASSWORD_HASH = 'scrypt$env$seed';
  const redis = fakeRedis({ 'admin:password': 'scrypt$stored$value' });
  __setClient(redis);
  assert.equal(await getPasswordHash(), 'scrypt$stored$value');
  redis.data.delete('admin:password');
  assert.equal(await getPasswordHash(), 'scrypt$env$seed',
    'a forgotten password must never become an outage');
});

test('a store outage falls back to the env password rather than failing login', async () => {
  process.env.ADMIN_PASSWORD_HASH = 'scrypt$env$seed';
  __setClient(brokenRedis());
  assert.equal(await getPasswordHash(), 'scrypt$env$seed');
});

test('with neither store nor env, getPasswordHash returns null and login fails closed', async () => {
  __setClient(fakeRedis());
  assert.equal(await getPasswordHash(), null);
});

test('setPasswordHash throws when the store is unavailable', async () => {
  __setClient(undefined);           // no client configured at all
  await assert.rejects(() => setPasswordHash('scrypt$x$y'), /store unavailable/,
    'reporting success on a failed write would lock the owner out');
});

// ---------------------------------------------------------------- revocation

test('revoking sessions kills everything issued at or before the cutoff', async () => {
  __setClient(fakeRedis());
  assert.equal(await getSessionsValidAfter(), 0);

  await revokeAllSessions(5000);
  assert.equal(await getSessionsValidAfter(), 5000);

  assert.equal(await sessionNotRevoked({ iat: 4999, sid: 'a' }), false);
  // iat has second granularity, so a session minted in the same second as the
  // revocation must die too — otherwise a password change leaves a one-second
  // window in which an old session survives.
  assert.equal(await sessionNotRevoked({ iat: 5000, sid: 'a' }), false);
  assert.equal(await sessionNotRevoked({ iat: 5001, sid: 'a' }), true);
});

test('a named session survives its own revocation sweep', async () => {
  __setClient(fakeRedis());
  await revokeAllSessions(5000, 'the-new-session');

  assert.equal(await sessionNotRevoked({ iat: 5000, sid: 'the-new-session' }), true,
    'the replacement token issued during a password change must stay valid');
  assert.equal(await sessionNotRevoked({ iat: 5000, sid: 'some-old-session' }), false);
});

test('a later sweep with no exemption clears the previous one', async () => {
  __setClient(fakeRedis());
  await revokeAllSessions(5000, 'keeper');
  assert.equal(await sessionNotRevoked({ iat: 5000, sid: 'keeper' }), true);

  await revokeAllSessions(6000);          // e.g. sign-out-everywhere
  assert.equal(await sessionNotRevoked({ iat: 5000, sid: 'keeper' }), false,
    'a stale exemption must not outlive its sweep');
});

test('sessionNotRevoked rejects a malformed session outright', async () => {
  __setClient(fakeRedis());
  await revokeAllSessions(5000);
  for (const bad of [null, undefined, {}, { iat: 'soon' }, { iat: 1.5 }]) {
    assert.equal(await sessionNotRevoked(bad), false, JSON.stringify(bad));
  }
});

test('an unreadable revocation cutoff revokes nothing', async () => {
  __setClient(brokenRedis());
  assert.equal(await getSessionsValidAfter(), 0);
  assert.equal(await sessionNotRevoked({ iat: 1, sid: 'x' }), true,
    'an outage must not sign everyone out');
});

// -------------------------------------------------------------- rate limiting

test('hashIp never returns the raw address', () => {
  const h = hashIp({ headers: { 'x-forwarded-for': '203.0.113.9, 70.41.3.18' } });
  assert.match(h, /^[0-9a-f]{16}$/);
  assert.ok(!h.includes('203.0.113.9'));
  // Same address, same bucket; different address, different bucket.
  assert.equal(h, hashIp({ headers: { 'x-forwarded-for': '203.0.113.9' } }));
  assert.notEqual(h, hashIp({ headers: { 'x-forwarded-for': '198.51.100.1' } }));
  assert.match(hashIp({ headers: {} }), /^[0-9a-f]{16}$/);
});

test('the limit blocks only after the allowance is spent', async () => {
  __setClient(fakeRedis());
  const ip = hashIp({ headers: { 'x-forwarded-for': '198.51.100.7' } });

  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    assert.equal((await checkRateLimit(ip)).allowed, true, `attempt ${i + 1} should be allowed`);
    await recordLoginFailure(ip);
  }
  assert.equal((await checkRateLimit(ip)).allowed, false, 'blocked once the allowance is spent');
});

test('the window is set once, on the first failure, so it does not slide forever', async () => {
  const redis = fakeRedis();
  __setClient(redis);
  const ip = 'deadbeefdeadbeef';
  await recordLoginFailure(ip);
  await recordLoginFailure(ip);
  await recordLoginFailure(ip);
  const expires = redis.calls.filter(c => c[0] === 'expire');
  assert.equal(expires.length, 1, 'expire on every failure would extend the window indefinitely');
  assert.equal(expires[0][2], 900);
});

test('a successful login clears the counter', async () => {
  const redis = fakeRedis();
  __setClient(redis);
  await recordLoginFailure('abc');
  await clearLoginFailures('abc');
  assert.equal((await checkRateLimit('abc')).count, 0);
});

test('rate limiting fails OPEN when the store is down, and flags it', async () => {
  __setClient(brokenRedis());
  const result = await checkRateLimit('abc');
  assert.equal(result.allowed, true, 'an outage must not lock the owner out');
  assert.equal(result.degraded, true, 'the caller needs to know the limit is not being enforced');
  await assert.doesNotReject(() => recordLoginFailure('abc'));
});
