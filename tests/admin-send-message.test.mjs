import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.ADMIN_ORIGIN = 'https://www.kampmalaya.tours';
process.env.GHL_API_KEY = 'super-secret-ghl-token';

const { signSession, COOKIE_NAME } = await import('../api/_lib/auth.js');
const store = await import('../api/_lib/store.js');
const { default: sendMessage } = await import('../api/admin/send-message.js');

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

/** Minimal in-memory stand-in for the Upstash client, same shape as admin-store.test.mjs. */
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

const realFetch = globalThis.fetch;
test.beforeEach(() => { store.__setClient(fakeRedis()); });
test.afterEach(() => { globalThis.fetch = realFetch; store.__setClient(null); });

const HEADERS = {
  'content-type': 'application/json',
  origin: 'https://www.kampmalaya.tours',
  'x-admin-request': '1',
};

function authedPost(body, extra = {}) {
  const { token } = signSession();
  return { method: 'POST', headers: { ...HEADERS, cookie: `${COOKIE_NAME}=${token}`, ...extra }, body };
}

const CONVO_ID = 'convoabcdefghij12';
const CONTACT_ID = 'contactabcdefghij1';
const VALID_BODY = { conversationId: CONVO_ID, contactId: CONTACT_ID, type: 'SMS', message: 'Hi, see you at check-in!' };

// --------------------------------------------------------------------- send

test('a valid reply is sent on the requested channel and version', async () => {
  const calls = stubFetch([{ status: 200, body: { messageId: 'sentmsg123456789' } }]);
  const res = mockRes();
  await sendMessage(authedPost(VALID_BODY), res);
  assert.equal(res.code, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.messageId, 'sentmsg123456789');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://services.leadconnectorhq.com/conversations/messages');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Version, '2021-04-15');
  const sentBody = JSON.parse(calls[0].options.body);
  assert.deepEqual(sentBody, { type: 'SMS', contactId: CONTACT_ID, conversationId: CONVO_ID, message: VALID_BODY.message });
});

test('a valid threadId/replyMessageId/emailFrom are forwarded as-is', async () => {
  const calls = stubFetch([{ status: 200, body: { messageId: 'x' } }]);
  await sendMessage(authedPost({
    ...VALID_BODY,
    type: 'Email',
    threadId: 'threadabcdefghij123',
    replyMessageId: 'replymsgabcdefghij1',
    emailFrom: 'bookings@mail.kampmalaya.tours',
  }), mockRes());
  const sentBody = JSON.parse(calls[0].options.body);
  assert.equal(sentBody.threadId, 'threadabcdefghij123');
  assert.equal(sentBody.replyMessageId, 'replymsgabcdefghij1');
  assert.equal(sentBody.emailFrom, 'bookings@mail.kampmalaya.tours');
});

test('a malformed threadId, replyMessageId or emailFrom is dropped, not sent, and does not block the send', async () => {
  const calls = stubFetch([{ status: 200, body: { messageId: 'x' } }]);
  const res = mockRes();
  await sendMessage(authedPost({
    ...VALID_BODY,
    type: 'Email',
    threadId: '../../x',
    replyMessageId: 'short',
    emailFrom: 'not-an-email',
  }), res);
  assert.equal(res.code, 200, 'a bad reply-context field must not block the send itself');
  const sentBody = JSON.parse(calls[0].options.body);
  assert.ok(!('threadId' in sentBody));
  assert.ok(!('replyMessageId' in sentBody));
  assert.ok(!('emailFrom' in sentBody));
});

test('an Email send with no subject gets a default one — GHL 422s without it', async () => {
  // Confirmed against GHL's own published guidance, not just their OpenAPI
  // schema (which doesn't list subject as required): a real Email-type send
  // with no subject is rejected. Every real conversation in this account is
  // Email, so this was the actual cause of "The CRM rejected this request."
  const calls = stubFetch([{ status: 200, body: { messageId: 'x' } }]);
  await sendMessage(authedPost({ ...VALID_BODY, type: 'Email' }), mockRes());
  const sentBody = JSON.parse(calls[0].options.body);
  assert.ok(sentBody.subject, 'an Email send must always carry a subject');
});

test('a client-provided subject is used as-is, "Re:" or not', async () => {
  const calls = stubFetch([{ status: 200, body: { messageId: 'x' } }]);
  await sendMessage(authedPost({ ...VALID_BODY, type: 'Email', subject: 'Re: Your Joiner Tour Inquiry' }), mockRes());
  const sentBody = JSON.parse(calls[0].options.body);
  assert.equal(sentBody.subject, 'Re: Your Joiner Tour Inquiry');
});

test('a non-Email send carries no subject at all when none is given', async () => {
  const calls = stubFetch([{ status: 200, body: { messageId: 'x' } }]);
  await sendMessage(authedPost(VALID_BODY), mockRes());
  const sentBody = JSON.parse(calls[0].options.body);
  assert.ok(!('subject' in sentBody), 'SMS has no reason to carry a subject');
});

test('an oversized subject is capped rather than rejected', async () => {
  const calls = stubFetch([{ status: 200, body: { messageId: 'x' } }]);
  await sendMessage(authedPost({ ...VALID_BODY, type: 'Email', subject: 'x'.repeat(500) }), mockRes());
  const sentBody = JSON.parse(calls[0].options.body);
  assert.equal(sentBody.subject.length, 200);
});

test('never relays more than ok/messageId, even if GHL sends more back', async () => {
  stubFetch([{ status: 200, body: { messageId: 'sentmsg123456789', internalDebug: 'do-not-leak' } }]);
  const res = mockRes();
  await sendMessage(authedPost(VALID_BODY), res);
  assert.deepEqual(Object.keys(res.payload).sort(), ['messageId', 'ok']);
});

test('invalid conversation or contact ids are rejected with zero outbound calls', async () => {
  const calls = stubFetch([{ status: 200, body: {} }]);
  for (const bad of [
    { ...VALID_BODY, conversationId: '../../x' },
    { ...VALID_BODY, contactId: 'short' },
    { ...VALID_BODY, conversationId: '' },
  ]) {
    const res = mockRes();
    await sendMessage(authedPost(bad), res);
    assert.equal(res.code, 400, JSON.stringify(bad));
  }
  assert.equal(calls.length, 0, 'an unvalidated id reached the CRM');
});

test('an unsupported channel type is rejected with zero outbound calls', async () => {
  const calls = stubFetch([{ status: 200, body: {} }]);
  for (const type of ['Custom', 'TIKTOK', 'RCS', 'gmb', '']) {
    const res = mockRes();
    await sendMessage(authedPost({ ...VALID_BODY, type }), res);
    assert.equal(res.code, 400, `type=${type}`);
  }
  assert.equal(calls.length, 0);
});

test('empty and over-length messages are rejected with zero outbound calls', async () => {
  const calls = stubFetch([{ status: 200, body: {} }]);
  for (const message of ['', '   ', 'x'.repeat(4001)]) {
    const res = mockRes();
    await sendMessage(authedPost({ ...VALID_BODY, message }), res);
    assert.equal(res.code, 400, `length=${message.length}`);
  }
  assert.equal(calls.length, 0);
});

test('a message at exactly the length cap is accepted', async () => {
  stubFetch([{ status: 200, body: { messageId: 'x' } }]);
  const res = mockRes();
  await sendMessage(authedPost({ ...VALID_BODY, message: 'x'.repeat(4000) }), res);
  assert.equal(res.code, 200);
});

test('send is unreachable without a session, and makes no outbound call', async () => {
  const calls = stubFetch([{ status: 200, body: {} }]);
  const res = mockRes();
  await sendMessage({ method: 'POST', headers: HEADERS, body: VALID_BODY }, res);
  assert.equal(res.code, 401);
  assert.equal(calls.length, 0);
});

test('a GHL error is mapped, never relayed, and does not count against the send limit', async () => {
  stubFetch([{ status: 401, body: '{"message":"invalid token for location XYZ"}' }]);
  const res = mockRes();
  await sendMessage(authedPost(VALID_BODY), res);
  assert.equal(res.code, 502);
  assert.ok(!JSON.stringify(res.payload).includes('XYZ'));
});

// ------------------------------------------------------------- rate limiting

test('the 21st send to the same conversation within the window is blocked', async () => {
  for (let i = 0; i < 20; i++) {
    stubFetch([{ status: 200, body: { messageId: `m${i}` } }]);
    const res = mockRes();
    await sendMessage(authedPost(VALID_BODY), res);
    assert.equal(res.code, 200, `send ${i + 1}`);
  }
  const blocked = mockRes();
  const calls = stubFetch([]);
  await sendMessage(authedPost(VALID_BODY), blocked);
  assert.equal(blocked.code, 429);
  assert.equal(calls.length, 0, 'a rate-limited send must not still reach GHL');
});

test('the limit is scoped per conversation, not global', async () => {
  for (let i = 0; i < 20; i++) {
    stubFetch([{ status: 200, body: { messageId: `m${i}` } }]);
    await sendMessage(authedPost(VALID_BODY), mockRes());
  }
  stubFetch([{ status: 200, body: { messageId: 'other-convo' } }]);
  const res = mockRes();
  await sendMessage(authedPost({ ...VALID_BODY, conversationId: 'anotherconvoid123' }), res);
  assert.equal(res.code, 200, 'a different conversation must have its own allowance');
});

test('a rate-limit read failure fails OPEN, same as login rate limiting', async () => {
  store.__setClient({
    get: async () => { throw new Error('upstash is down'); },
    set: async () => { throw new Error('upstash is down'); },
    incr: async () => { throw new Error('upstash is down'); },
    expire: async () => { throw new Error('upstash is down'); },
  });
  stubFetch([{ status: 200, body: { messageId: 'ok-despite-outage' } }]);
  const res = mockRes();
  await sendMessage(authedPost(VALID_BODY), res);
  assert.equal(res.code, 200, 'an outage must not stop the owner from replying to a real guest');
});
