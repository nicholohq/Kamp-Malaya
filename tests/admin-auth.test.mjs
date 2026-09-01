import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.ADMIN_ORIGIN = 'https://www.kampmalaya.tours';

const {
  safeEqual, hashPassword, verifyPassword,
  signSession, verifySession, sessionCookie, clearSessionCookie,
  readCookie, withAdmin, COOKIE_NAME, MAX_PASSWORD_LENGTH,
} = await import('../api/_lib/auth.js');

function mockRes() {
  return {
    headers: {}, code: 0, payload: null, ended: false,
    setHeader(k, v) { this.headers[k] = v; },
    getHeader(k) { return this.headers[k]; },
    status(c) { this.code = c; return this; },
    json(o) { this.payload = o; return this; },
    end() { this.ended = true; return this; },
  };
}

const GOOD_HEADERS = {
  'content-type': 'application/json',
  'origin': 'https://www.kampmalaya.tours',
  'x-admin-request': '1',
};

// ---------------------------------------------------------------- safeEqual

test('safeEqual matches identical strings and rejects different ones', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
});

test('safeEqual does not throw on differing lengths', () => {
  // crypto.timingSafeEqual throws on length mismatch; hashing first is what
  // stops that from both crashing and leaking length.
  assert.doesNotThrow(() => safeEqual('short', 'a much longer value'));
  assert.equal(safeEqual('short', 'a much longer value'), false);
  assert.equal(safeEqual('', 'x'), false);
});

// ----------------------------------------------------------------- password

test('a hashed password verifies, and a wrong one does not', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.match(hash, /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(await verifyPassword('correct horse battery staple', hash), true);
  assert.equal(await verifyPassword('correct horse battery stapl', hash), false);
  assert.equal(await verifyPassword('', hash), false);
});

test('verifyPassword fails closed on a malformed stored hash, without throwing', async () => {
  const cases = ['', 'not-a-hash', 'scrypt$1$2$3', 'bcrypt$16384$8$1$aa$bb',
                 'scrypt$x$8$1$aa$bb', 'scrypt$16384$8$1$$'];
  for (const stored of cases) {
    assert.equal(await verifyPassword('anything', stored), false, `stored=${stored}`);
  }
  assert.equal(await verifyPassword('anything', undefined), false);
  assert.equal(await verifyPassword('anything', null), false);
});

test('an over-long password is rejected before scrypt runs', async () => {
  const hash = await hashPassword('pw');
  const huge = 'x'.repeat(MAX_PASSWORD_LENGTH + 1);
  const started = process.hrtime.bigint();
  assert.equal(await verifyPassword(huge, hash), false);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  // A real scrypt round is ~100ms. Returning in single-digit ms proves the cap
  // short-circuited rather than hashing a huge input.
  assert.ok(elapsedMs < 50, `took ${elapsedMs.toFixed(1)}ms — cap did not apply`);
});

// ------------------------------------------------------------------ session

test('a signed session round-trips', () => {
  const { token, payload } = signSession(1000);
  const back = verifySession(token, 1000);
  assert.ok(back);
  assert.equal(back.sid, payload.sid);
  assert.equal(back.iat, 1000);
  assert.equal(back.v, 1);
});

test('verifySession rejects tampering, expiry and junk', () => {
  const { token } = signSession(1000);
  const [body, sig] = token.split('.');

  assert.equal(verifySession(token, 1000 + 12 * 3600 + 1), null, 'expired');
  assert.equal(verifySession(`${body}.${'a'.repeat(sig.length)}`, 1000), null, 'bad signature');

  const forged = Buffer.from(JSON.stringify({ v: 1, iat: 1, exp: 9e9, sid: 'x' })).toString('base64url');
  assert.equal(verifySession(`${forged}.${sig}`, 1000), null, 'swapped payload');

  for (const junk of ['', 'no-dot', '.', 'a.', '.b', 'a.b.c', null, undefined, 42, {}]) {
    assert.equal(verifySession(junk, 1000), null, `junk=${String(junk)}`);
  }
});

test('a token signed with a different secret is rejected', async () => {
  const { token } = signSession(1000);
  const original = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = 'a-completely-different-secret-value';
  try {
    assert.equal(verifySession(token, 1000), null);
  } finally {
    process.env.ADMIN_SESSION_SECRET = original;
  }
});

// ------------------------------------------------------------------- cookie

test('the session cookie carries the flags the scheme depends on', () => {
  const c = sessionCookie('tok');
  assert.ok(c.startsWith(`${COOKIE_NAME}=tok`));
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=']) {
    assert.ok(c.includes(flag), `missing ${flag}`);
  }
  // __Host- requires no Domain; adding one silently voids the whole prefix.
  assert.ok(!/Domain=/i.test(c), 'must not set Domain');
  assert.ok(COOKIE_NAME.startsWith('__Host-'));
  assert.ok(clearSessionCookie().includes('Max-Age=0'));
});

test('readCookie picks the right value out of a crowded header', () => {
  const req = { headers: { cookie: `other=1; ${COOKIE_NAME}=abc.def; trailing=2` } };
  assert.equal(readCookie(req), 'abc.def');
  assert.equal(readCookie({ headers: {} }), null);
  assert.equal(readCookie({ headers: { cookie: 'nothing=here' } }), null);
});

// -------------------------------------------------------------------- guard

test('an unauthenticated request is 401 AND the inner handler never runs', async () => {
  let ran = false;
  const guarded = withAdmin(async (_req, res) => { ran = true; return res.status(200).json({ ok: true }); });
  const res = mockRes();
  await guarded({ method: 'GET', headers: {} }, res);
  assert.equal(res.code, 401);
  assert.equal(ran, false, 'the handler ran despite no session — the guard is not guarding');
});

test('a valid session reaches the handler and receives the payload', async () => {
  const { token, payload } = signSession();
  let seen = null;
  const guarded = withAdmin(async (_req, res, session) => { seen = session; return res.status(200).json({ ok: true }); });
  const res = mockRes();
  await guarded({ method: 'GET', headers: { cookie: `${COOKIE_NAME}=${token}` } }, res);
  assert.equal(res.code, 200);
  assert.equal(seen.sid, payload.sid);
});

test('every guarded response is no-store and sets no CORS header', async () => {
  const guarded = withAdmin(async (_req, res) => res.status(200).json({}));
  const res = mockRes();
  await guarded({ method: 'GET', headers: {} }, res);
  assert.match(res.headers['Cache-Control'], /no-store/);
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.headers['Access-Control-Allow-Origin'], undefined,
    'reflecting an origin on a cookie-authed endpoint is a data faucet');
});

test('the method allowlist is enforced', async () => {
  const guarded = withAdmin(async (_req, res) => res.status(200).json({}), { methods: ['POST'] });
  const res = mockRes();
  await guarded({ method: 'GET', headers: {} }, res);
  assert.equal(res.code, 405);
  assert.equal(res.headers.Allow, 'POST');
});

test('CSRF: non-GET needs JSON, an exact origin and the custom header', async () => {
  const { token } = signSession();
  const cookie = `${COOKIE_NAME}=${token}`;
  const guarded = withAdmin(async (_req, res) => res.status(200).json({ ok: true }), { methods: ['POST'] });

  const cases = [
    [{ ...GOOD_HEADERS, 'content-type': 'text/plain' }, 415, 'non-JSON body'],
    [{ ...GOOD_HEADERS, origin: undefined }, 403, 'missing origin'],
    [{ ...GOOD_HEADERS, origin: 'https://evil.example' }, 403, 'foreign origin'],
    [{ ...GOOD_HEADERS, origin: 'https://sub.kampmalaya.tours' }, 403, 'sibling subdomain'],
    [{ ...GOOD_HEADERS, 'x-admin-request': undefined }, 403, 'missing custom header'],
  ];
  for (const [headers, expected, label] of cases) {
    const res = mockRes();
    await guarded({ method: 'POST', headers: { ...headers, cookie } }, res);
    assert.equal(res.code, expected, label);
  }

  const ok = mockRes();
  await guarded({ method: 'POST', headers: { ...GOOD_HEADERS, cookie } }, ok);
  assert.equal(ok.code, 200);
});

test('revocation rejects a session the store says is too old', async () => {
  const { token } = signSession(1000);
  let ran = false;
  const guarded = withAdmin(
    async (_req, res) => { ran = true; return res.status(200).json({}); },
    { verifyRevocation: async (s) => s.iat >= 2000 },
  );
  const res = mockRes();
  await guarded({ method: 'GET', headers: { cookie: `${COOKIE_NAME}=${token}` } }, res);
  assert.equal(res.code, 401);
  assert.equal(ran, false);
});

test('a throwing handler yields a generic 500 with no stack in the body', async () => {
  const guarded = withAdmin(async () => { throw new Error('boom: secret internals'); });
  const { token } = signSession();
  const res = mockRes();
  await guarded({ method: 'GET', headers: { cookie: `${COOKIE_NAME}=${token}` } }, res);
  assert.equal(res.code, 500);
  assert.match(res.payload.ref, /^[0-9a-f]{8}$/);
  assert.ok(!JSON.stringify(res.payload).includes('secret internals'));
});
