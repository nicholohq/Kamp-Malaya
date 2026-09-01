import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.ADMIN_ORIGIN = 'https://www.kampmalaya.tours';

const { hashPassword, verifySession, COOKIE_NAME } = await import('../api/_lib/auth.js');
const store = await import('../api/_lib/store.js');
const { default: login } = await import('../api/admin/login.js');
const { default: changePassword } = await import('../api/admin/change-password.js');

const PASSWORD = 'a-generated-password-value';
const HASH = await hashPassword(PASSWORD);

function mockRes() {
  return {
    headers: {}, code: 0, payload: null, ended: false,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.payload = o; return this; },
    end() { this.ended = true; return this; },
  };
}

function fakeRedis(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async get(k) { return data.has(k) ? data.get(k) : null; },
    async set(k, v) { data.set(k, v); },
    async del(k) { data.delete(k); },
    async incr(k) { const n = (Number(data.get(k)) || 0) + 1; data.set(k, n); return n; },
    async expire() {},
  };
}

const HEADERS = {
  'content-type': 'application/json',
  'origin': 'https://www.kampmalaya.tours',
  'x-admin-request': '1',
  'x-forwarded-for': '203.0.113.5',
};

const post = (body, extra = {}) => ({ method: 'POST', headers: { ...HEADERS, ...extra }, body });

function cookieValue(res) {
  const raw = res.headers['Set-Cookie'];
  if (!raw) return null;
  return raw.split(';')[0].slice(COOKIE_NAME.length + 1);
}

test.beforeEach(() => { store.__setClient(fakeRedis({ 'admin:password': HASH })); });
test.afterEach(() => { store.__setClient(null); delete process.env.ADMIN_PASSWORD_HASH; });

// -------------------------------------------------------------------- login

test('the right password returns 204 and a session cookie', async () => {
  const res = mockRes();
  await login(post({ password: PASSWORD }), res);
  assert.equal(res.code, 204);
  const token = cookieValue(res);
  assert.ok(token, 'no Set-Cookie');
  assert.ok(verifySession(token), 'the issued token does not verify');
});

test('a wrong password is 401 and sets no cookie', async () => {
  const res = mockRes();
  await login(post({ password: 'wrong' }), res);
  assert.equal(res.code, 401);
  assert.equal(res.headers['Set-Cookie'], undefined,
    'a rejected login must never hand out a session');
});

test('no response ever echoes the password back', async () => {
  for (const body of [{ password: PASSWORD }, { password: 'wrong' }]) {
    const res = mockRes();
    await login(post(body), res);
    const dump = JSON.stringify(res.payload) + JSON.stringify(res.headers);
    assert.ok(!dump.includes(body.password), `password leaked for ${body.password}`);
  }
});

test('missing, non-string and over-long passwords are 400', async () => {
  for (const body of [{}, { password: 123 }, { password: '' }, { password: 'x'.repeat(201) }]) {
    const res = mockRes();
    await login(post(body), res);
    assert.equal(res.code, 400, JSON.stringify(body));
  }
});

test('with no password configured anywhere, login is 500 not 401', async () => {
  store.__setClient(fakeRedis());               // store empty
  delete process.env.ADMIN_PASSWORD_HASH;       // and no seed
  const res = mockRes();
  await login(post({ password: PASSWORD }), res);
  assert.equal(res.code, 500, 'a misconfiguration must not look like a wrong password');
});

test('the eleventh failed attempt is rate limited', async () => {
  for (let i = 0; i < 10; i++) {
    const res = mockRes();
    await login(post({ password: 'wrong' }), res);
    assert.equal(res.code, 401, `attempt ${i + 1}`);
  }
  const blocked = mockRes();
  await login(post({ password: 'wrong' }), blocked);
  assert.equal(blocked.code, 429);

  // And the limit holds even against the correct password, so an attacker
  // cannot use the block as a signal that they have guessed right.
  const evenCorrect = mockRes();
  await login(post({ password: PASSWORD }), evenCorrect);
  assert.equal(evenCorrect.code, 429);
});

test('a successful login clears the failure counter', async () => {
  for (let i = 0; i < 5; i++) await login(post({ password: 'wrong' }), mockRes());
  await login(post({ password: PASSWORD }), mockRes());
  for (let i = 0; i < 10; i++) {
    const res = mockRes();
    await login(post({ password: 'wrong' }), res);
    assert.equal(res.code, 401, `counter was not reset (attempt ${i + 1})`);
  }
});

test('login refuses GET, non-JSON and a foreign origin', async () => {
  const get = mockRes();
  await login({ method: 'GET', headers: HEADERS }, get);
  assert.equal(get.code, 405);

  const plain = mockRes();
  await login(post({ password: PASSWORD }, { 'content-type': 'text/plain' }), plain);
  assert.equal(plain.code, 415);

  const evil = mockRes();
  await login(post({ password: PASSWORD }, { origin: 'https://evil.example' }), evil);
  assert.equal(evil.code, 403);
});

// ---------------------------------------------------------- change password

async function loginAndGetCookie() {
  const res = mockRes();
  await login(post({ password: PASSWORD }), res);
  return `${COOKIE_NAME}=${cookieValue(res)}`;
}

test('changing the password requires the current one', async () => {
  const cookie = await loginAndGetCookie();
  const res = mockRes();
  await changePassword(
    post({ currentPassword: 'not-it', newPassword: 'a-brand-new-password' }, { cookie }),
    res,
  );
  assert.equal(res.code, 403);
  assert.equal(await store.getPasswordHash(), HASH, 'the stored hash must be untouched');
});

test('a valid change rotates the hash, signs others out, and keeps the caller in', async () => {
  const cookie = await loginAndGetCookie();
  const res = mockRes();
  await changePassword(
    post({ currentPassword: PASSWORD, newPassword: 'a-brand-new-password' }, { cookie }),
    res,
  );
  assert.equal(res.code, 200);
  assert.equal(res.payload.otherSessionsSignedOut, true);

  const stored = await store.getPasswordHash();
  assert.notEqual(stored, HASH, 'the hash did not change');

  // Old sessions are dead...
  const oldToken = cookie.slice(COOKIE_NAME.length + 1);
  assert.equal(await store.sessionNotRevoked(verifySession(oldToken)), false);
  // ...and the caller got a fresh cookie that is not.
  const fresh = cookieValue(res);
  assert.ok(fresh, 'no replacement cookie issued');
  assert.equal(await store.sessionNotRevoked(verifySession(fresh)), true);
});

test('the new password is length-checked and must differ', async () => {
  const cookie = await loginAndGetCookie();
  const cases = [
    [{ currentPassword: PASSWORD, newPassword: 'short' }, 400],
    [{ currentPassword: PASSWORD, newPassword: PASSWORD }, 400],
    [{ currentPassword: PASSWORD }, 400],
    [{ newPassword: 'a-brand-new-password' }, 400],
  ];
  for (const [body, expected] of cases) {
    const res = mockRes();
    await changePassword(post(body, { cookie }), res);
    assert.equal(res.code, expected, JSON.stringify(body));
  }
  assert.equal(await store.getPasswordHash(), HASH);
});

test('change-password is unreachable without a session', async () => {
  const res = mockRes();
  await changePassword(post({ currentPassword: PASSWORD, newPassword: 'a-brand-new-password' }), res);
  assert.equal(res.code, 401);
  assert.equal(await store.getPasswordHash(), HASH);
});
