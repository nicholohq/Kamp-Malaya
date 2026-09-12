import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.ADMIN_ORIGIN = 'https://www.kampmalaya.tours';
process.env.GHL_API_KEY = 'super-secret-ghl-token';

const { signSession, COOKIE_NAME } = await import('../api/_lib/auth.js');
const { default: markRead } = await import('../api/admin/mark-conversation-read.js');

function mockRes() {
  return {
    headers: {}, code: 0, payload: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.payload = o; return this; },
    end() { return this; },
  };
}

function stubFetch(responses) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const next = responses.shift() ?? { status: 200, body: {} };
    if (next.throw) throw next.throw;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      async text() { return typeof next.body === 'string' ? next.body : JSON.stringify(next.body); },
    };
  };
  return calls;
}

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

const HEADERS = {
  'content-type': 'application/json',
  origin: 'https://www.kampmalaya.tours',
  'x-admin-request': '1',
};

function authedPost(body) {
  const { token } = signSession();
  return { method: 'POST', headers: { ...HEADERS, cookie: `${COOKIE_NAME}=${token}` }, body };
}

const CONVO_ID = 'convoabcdefghij12';

test('marks a conversation read via PUT with unreadCount reset to 0', async () => {
  const calls = stubFetch([{ status: 200, body: { conversation: { id: CONVO_ID } } }]);
  const res = mockRes();
  await markRead(authedPost({ conversationId: CONVO_ID }), res);
  assert.equal(res.code, 200);
  assert.equal(res.payload.ok, true);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://services.leadconnectorhq.com/conversations/${CONVO_ID}`);
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(calls[0].options.headers.Version, '2021-04-15');
  const sentBody = JSON.parse(calls[0].options.body);
  assert.equal(sentBody.unreadCount, 0);
  assert.ok(sentBody.locationId, 'GHL requires locationId on every update');
});

test('a traversal-shaped id is rejected with zero outbound calls', async () => {
  const calls = stubFetch([{ status: 200, body: {} }]);
  for (const id of ['../../contacts', 'short', '', 'has space']) {
    const res = mockRes();
    await markRead(authedPost({ conversationId: id }), res);
    assert.equal(res.code, 400, `id=${id}`);
  }
  assert.equal(calls.length, 0);
});

test('unreachable without a session, and makes no outbound call', async () => {
  const calls = stubFetch([{ status: 200, body: {} }]);
  const res = mockRes();
  await markRead({ method: 'POST', headers: HEADERS, body: { conversationId: CONVO_ID } }, res);
  assert.equal(res.code, 401);
  assert.equal(calls.length, 0);
});

test('a GHL error is mapped and never relayed', async () => {
  stubFetch([{ status: 403, body: '{"message":"missing scope conversations.write"}' }]);
  const res = mockRes();
  await markRead(authedPost({ conversationId: CONVO_ID }), res);
  assert.equal(res.code, 502);
  assert.ok(!JSON.stringify(res.payload).includes('conversations.write'));
});
