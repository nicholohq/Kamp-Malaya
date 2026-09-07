import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.ADMIN_ORIGIN = 'https://www.kampmalaya.tours';
process.env.GHL_API_KEY = 'super-secret-ghl-token';

const { signSession, COOKIE_NAME } = await import('../api/_lib/auth.js');
const store = await import('../api/_lib/store.js');
const { default: conversations } = await import('../api/admin/conversations.js');
const { default: messages } = await import('../api/admin/messages.js');

function mockRes() {
  return {
    headers: {}, code: 0, payload: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.payload = o; return this; },
    end() { return this; },
  };
}

/** Records outbound calls and replies with a queue of canned responses. */
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
test.afterEach(() => { globalThis.fetch = realFetch; store.__setClient(null); });

function authedGet(query = {}) {
  const { token } = signSession();
  return { method: 'GET', headers: { cookie: `${COOKIE_NAME}=${token}` }, query };
}

const CONVO_ID = 'convoabcdefghij12';

// -------------------------------------------------------------------- list

test('the list projects an exact whitelist, not GHL objects', async () => {
  stubFetch([{ status: 200, body: { total: 1, conversations: [{
    id: CONVO_ID, contactId: 'contactabcdefghij1', fullName: 'Ana Reyes',
    contactName: 'Ana R.', email: 'a@example.com', phone: '+639170000000',
    lastMessageBody: 'What time is check-in?', lastMessageType: 'TYPE_SMS',
    type: 'TYPE_PHONE', unreadCount: 2,
    // Everything below must NOT survive the projection.
    assignedTo: 'agent-x', locationId: 'nope', internalScore: 42,
  }] } }]);

  const res = mockRes();
  await conversations(authedGet(), res);
  assert.equal(res.code, 200);

  const keys = Object.keys(res.payload.conversations[0]).sort();
  assert.deepEqual(keys,
    ['channel', 'contactId', 'email', 'id', 'name', 'phone', 'preview', 'sendType', 'unreadCount'],
    'pass-through would leak fields nobody reviewed');
  assert.equal(res.payload.conversations[0].name, 'Ana Reyes');
  assert.equal(res.payload.conversations[0].channel, 'SMS');
  assert.equal(res.payload.conversations[0].sendType, 'SMS');
});

test('a channel with no send mapping is read-only', async () => {
  stubFetch([{ status: 200, body: { conversations: [{
    id: CONVO_ID, contactId: 'contactabcdefghij1', fullName: 'Ben Cruz',
    lastMessageBody: 'left a voicemail', lastMessageType: 'TYPE_CALL',
    type: 'TYPE_PHONE', unreadCount: 0,
  }] } }]);
  const res = mockRes();
  await conversations(authedGet(), res);
  assert.equal(res.payload.conversations[0].channel, 'Message');
  assert.equal(res.payload.conversations[0].sendType, null);
});

test('limit and query are clamped, and the sort is fixed to newest-first', async () => {
  const calls = stubFetch([{ status: 200, body: { conversations: [] } }]);
  await conversations(authedGet({ limit: '9999', query: 'x'.repeat(500) }), mockRes());

  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get('limit'), '50');
  assert.equal(url.searchParams.get('query').length, 100);
  assert.equal(url.searchParams.get('locationId'), 'YBLbWASoQgsSEqY0V5KV');
  assert.equal(url.searchParams.get('sortBy'), 'last_message_date');
  assert.equal(url.searchParams.get('sort'), 'desc');
  assert.equal(calls[0].options.headers.Version, '2021-04-15');
});

test('the list is unreachable without a session, and makes no outbound call', async () => {
  const calls = stubFetch([{ status: 200, body: { conversations: [] } }]);
  const res = mockRes();
  await conversations({ method: 'GET', headers: {}, query: {} }, res);
  assert.equal(res.code, 401);
  assert.equal(calls.length, 0, 'an unauthenticated request reached the CRM');
});

test('a GHL 401 becomes a 502 and its body is not relayed', async () => {
  stubFetch([{ status: 401, body: '{"message":"invalid token for location XYZ"}' }]);
  const res = mockRes();
  await conversations(authedGet(), res);
  assert.equal(res.code, 502);
  assert.equal(res.payload.error, 'CRM authentication failed');
  assert.ok(!JSON.stringify(res.payload).includes('XYZ'));
});

// ------------------------------------------------------------------ thread

test('a traversal-shaped conversation id is rejected with zero outbound calls', async () => {
  const calls = stubFetch([{ status: 200, body: {} }]);
  for (const id of ['../../contacts', '../conversations', 'short', '', 'has space', 'a'.repeat(40)]) {
    const res = mockRes();
    await messages(authedGet({ id }), res);
    assert.equal(res.code, 400, `id=${id}`);
  }
  assert.equal(calls.length, 0, 'an unvalidated id reached the CRM');
});

// GHL nests the real payload one level deeper than its own published schema
// ({messages: {lastMessageId, nextPage, messages: [...]}}), confirmed against
// the live API — every stub body below matches that actual shape, not the
// flatter one the docs describe.

test('the thread comes back with a pagination cursor', async () => {
  stubFetch([{ status: 200, body: { messages: {
    lastMessageId: 'msg1abcdefghij123',
    nextPage: true,
    messages: [
      { id: 'msg1abcdefghij123', direction: 'inbound', body: 'hi', dateAdded: '2026-08-01T00:00:00Z', messageType: 'TYPE_SMS', status: 'delivered', attachments: ['https://cdn.example/a.jpg', 'javascript:alert(1)'] },
    ],
  } } }]);
  const res = mockRes();
  await messages(authedGet({ id: CONVO_ID }), res);
  assert.equal(res.code, 200);
  assert.equal(res.payload.nextPage, true);
  assert.equal(res.payload.lastMessageId, 'msg1abcdefghij123');
  assert.deepEqual(res.payload.messages[0].attachments, ['https://cdn.example/a.jpg'],
    'a javascript: URL must never survive the projection');
});

test('CRM activity-log entries are dropped from the thread, not shown as messages', async () => {
  // Confirmed live: GHL mixes internal system entries (an opportunity being
  // created, a form submission, an internal note) into the same array as
  // real guest communication. A bare "Opportunity created" bubble would read
  // as something the business sent to the guest.
  stubFetch([{ status: 200, body: { messages: {
    lastMessageId: 'realmsgabcdefghij1', nextPage: false,
    messages: [
      { id: 'realmsgabcdefghij1', direction: 'outbound', body: 'See you at check-in!', dateAdded: '2026-08-01T00:00:00Z', messageType: 'TYPE_SMS' },
      { id: 'oppactivityabcdefg1', direction: 'outbound', body: 'Opportunity created', dateAdded: '2026-08-01T00:00:01Z', messageType: 'TYPE_ACTIVITY_OPPORTUNITY' },
      { id: 'internalnoteabcdef1', direction: 'outbound', body: 'called, no answer', dateAdded: '2026-08-01T00:00:02Z', messageType: 'TYPE_INTERNAL_COMMENT' },
      { id: 'formsubmitabcdefgh1', direction: 'inbound', body: 'form data', dateAdded: '2026-08-01T00:00:03Z', messageType: 'TYPE_FORM_SUBMISSION' },
    ],
  } } }]);
  const res = mockRes();
  await messages(authedGet({ id: CONVO_ID }), res);
  assert.equal(res.payload.messages.length, 1);
  assert.equal(res.payload.messages[0].id, 'realmsgabcdefghij1');
});

test('a TYPE_EMAIL message expands into one bubble per real email, with real HTML', async () => {
  // The rolled-up list entry (first response) only carries a flattened
  // plain-text summary; the two ids in meta.email.messageIds are what
  // resolve to the actual auto-reply and the guest's real HTML reply —
  // exactly the shape traced from Mathias's real conversation.
  // No `contentType` field in any of these bodies — confirmed live that GHL's
  // real response never includes one, whatever its documented schema says.
  // projectEmailDetail() has to sniff the body for markup instead.
  stubFetch([
    { status: 200, body: { messages: {
      lastMessageId: 'groupmsgabcdefghij1', nextPage: false,
      messages: [{
        id: 'groupmsgabcdefghij1', direction: 'inbound', body: 'flattened summary text',
        dateAdded: '2026-09-05T14:28:15.162Z', messageType: 'TYPE_EMAIL',
        meta: { email: { messageIds: ['autoreplyabcdefghij1', 'realreplyabcdefghij1'] } },
      }],
    } } },
    { status: 200, body: { emailMessage: {
      id: 'autoreplyabcdefghij1', direction: 'outbound',
      body: 'Thank you for your inquiry!', dateAdded: '2026-09-05T14:28:15.000Z',
    } } },
    { status: 200, body: { emailMessage: {
      id: 'realreplyabcdefghij1', direction: 'inbound',
      subject: 'Re: Your inquiry',
      body: '<div dir="ltr">What is the pickup service?</div>',
      dateAdded: '2026-09-05T16:07:00.000Z',
      attachments: ['https://cdn.example/photo.jpg', 'javascript:alert(1)'],
    } } },
  ]);
  const res = mockRes();
  await messages(authedGet({ id: CONVO_ID }), res);
  assert.equal(res.code, 200);
  assert.equal(res.payload.messages.length, 2, 'one grouped message became two real emails');
  assert.equal(res.payload.messages[0].contentType, 'text/plain');
  assert.equal(res.payload.messages[1].contentType, 'text/html');
  assert.equal(res.payload.messages[1].body, '<div dir="ltr">What is the pickup service?</div>');
  assert.equal(res.payload.messages[1].subject, 'Re: Your inquiry');
  assert.deepEqual(res.payload.messages[1].attachments, ['https://cdn.example/photo.jpg']);
});

test('when every per-email fetch fails, the rolled-up summary is kept rather than dropped', async () => {
  stubFetch([
    { status: 200, body: { messages: {
      lastMessageId: 'groupmsgabcdefghij1', nextPage: false,
      messages: [{
        id: 'groupmsgabcdefghij1', direction: 'inbound', body: 'flattened summary text',
        dateAdded: '2026-09-05T14:28:15.162Z', messageType: 'TYPE_EMAIL',
        meta: { email: { messageIds: ['brokenidabcdefghij123'] } },
      }],
    } } },
    { status: 500, body: 'email service exploded' },
  ]);
  const res = mockRes();
  await messages(authedGet({ id: CONVO_ID }), res);
  assert.equal(res.code, 200, 'a resolvable failure must not fail the whole thread');
  assert.equal(res.payload.messages.length, 1);
  assert.equal(res.payload.messages[0].id, 'groupmsgabcdefghij1');
  assert.equal(res.payload.messages[0].contentType, 'text/plain');
});

test('a non-email message is never sent through the per-email expansion', async () => {
  const calls = stubFetch([{ status: 200, body: { messages: {
    lastMessageId: 'smsmsgabcdefghij123', nextPage: false,
    messages: [{
      id: 'smsmsgabcdefghij123', direction: 'inbound', body: 'hey', messageType: 'TYPE_SMS',
      dateAdded: '2026-09-05T14:28:15.162Z',
    }],
  } } }]);
  const res = mockRes();
  await messages(authedGet({ id: CONVO_ID }), res);
  assert.equal(calls.length, 1, 'no extra outbound call for a channel with no email grouping');
  assert.equal(res.payload.messages[0].contentType, 'text/plain');
});

test('a non-id cursor is dropped rather than reaching the outbound url', async () => {
  const calls = stubFetch([{ status: 200, body: { messages: { messages: [] } } }]);
  await messages(authedGet({ id: CONVO_ID, lastMessageId: '../../x' }), mockRes());
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get('lastMessageId'), null);
});

test('the thread is unreachable without a session, and makes no outbound call', async () => {
  const calls = stubFetch([{ status: 200, body: { messages: { messages: [] } } }]);
  const res = mockRes();
  await messages({ method: 'GET', headers: {}, query: { id: CONVO_ID } }, res);
  assert.equal(res.code, 401);
  assert.equal(calls.length, 0);
});
