import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.ADMIN_ORIGIN = 'https://www.kampmalaya.tours';
process.env.GHL_API_KEY = 'super-secret-ghl-token';

const { signSession, COOKIE_NAME } = await import('../api/_lib/auth.js');
const store = await import('../api/_lib/store.js');
const { default: contacts } = await import('../api/admin/contacts.js');
const { default: contact } = await import('../api/admin/contact.js');

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

const CONTACT_ID = 'abcdefghij123456';

// ------------------------------------------------------------------ the list

test('the list projects an exact whitelist, not GHL objects', async () => {
  stubFetch([{ status: 200, body: { contacts: [{
    id: CONTACT_ID, firstName: 'Ana', lastName: 'Reyes',
    email: 'a@example.com', phone: '+639170000000',
    dateAdded: '2026-08-01T00:00:00Z', tags: ['Booking Inquiry'],
    // Everything below must NOT survive the projection.
    ssn: 'nope', internalScore: 42, customFields: [{ id: 'x', value: 'secret' }],
  }] } }]);

  const res = mockRes();
  await contacts(authedGet(), res);
  assert.equal(res.code, 200);

  const keys = Object.keys(res.payload.contacts[0]).sort();
  assert.deepEqual(keys, ['dateAdded', 'email', 'id', 'name', 'phone', 'tags'],
    'pass-through would leak fields nobody reviewed');
  assert.equal(res.payload.contacts[0].name, 'Ana Reyes');
});

test('limit is clamped and query is truncated in the OUTBOUND url', async () => {
  const calls = stubFetch([{ status: 200, body: { contacts: [] } }]);
  await contacts(authedGet({ limit: '9999', query: 'x'.repeat(500) }), mockRes());

  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get('limit'), '50');
  assert.equal(url.searchParams.get('query').length, 100);
  assert.equal(url.searchParams.get('locationId'), 'YBLbWASoQgsSEqY0V5KV');
});

test('the outbound call carries the key and version, and the key never comes back', async () => {
  const calls = stubFetch([{ status: 200, body: { contacts: [] } }]);
  const res = mockRes();
  await contacts(authedGet(), res);

  assert.equal(calls[0].options.headers.Authorization, 'Bearer super-secret-ghl-token');
  assert.equal(calls[0].options.headers.Version, '2021-07-28');

  const dump = JSON.stringify(res.payload) + JSON.stringify(res.headers);
  assert.ok(!dump.includes('super-secret-ghl-token'), 'the API key reached the client');
});

test('a GHL 401 becomes a 502 and its body is not relayed', async () => {
  stubFetch([{ status: 401, body: '{"message":"invalid token for location XYZ"}' }]);
  const res = mockRes();
  await contacts(authedGet(), res);
  assert.equal(res.code, 502);
  assert.equal(res.payload.error, 'CRM authentication failed');
  assert.ok(!JSON.stringify(res.payload).includes('XYZ'),
    "GHL's body can contain other contacts' data; it must never be echoed");
  assert.match(res.payload.ref, /^[0-9a-f]{8}$/);
});

test('a GHL rate limit becomes a 503, and a timeout a 504', async () => {
  stubFetch([{ status: 429, body: 'slow down' }]);
  const limited = mockRes();
  await contacts(authedGet(), limited);
  assert.equal(limited.code, 503);

  const abort = new Error('aborted'); abort.name = 'AbortError';
  stubFetch([{ throw: abort }]);
  const timedOut = mockRes();
  await contacts(authedGet(), timedOut);
  assert.equal(timedOut.code, 504);
});

test('the list is unreachable without a session, and makes no outbound call', async () => {
  const calls = stubFetch([{ status: 200, body: { contacts: [] } }]);
  const res = mockRes();
  await contacts({ method: 'GET', headers: {}, query: {} }, res);
  assert.equal(res.code, 401);
  assert.equal(calls.length, 0, 'an unauthenticated request reached the CRM');
});

// ---------------------------------------------------------------- one contact

test('a traversal-shaped id is rejected with zero outbound calls', async () => {
  const calls = stubFetch([{ status: 200, body: {} }]);
  for (const id of ['../../contacts', '../conversations', 'short', '', 'has space', 'a'.repeat(40)]) {
    const res = mockRes();
    await contact(authedGet({ id }), res);
    assert.equal(res.code, 400, `id=${id}`);
  }
  assert.equal(calls.length, 0, 'an unvalidated id reached the CRM');
});

test('a contact comes back with labelled fields and newest-first notes', async () => {
  stubFetch([
    { status: 200, body: { contact: {
      id: CONTACT_ID, firstName: 'Ana', lastName: 'Reyes', email: 'a@example.com',
      customFields: [
        { id: 'Hypk6oOYeW0d0Q7y1EPH', value: 'Joiner Tour' },
        { id: 'uuuPxVb2mfNcyuXy7a1S', value: '2026-09-03' },
        { id: 'unknown-field-id', value: 'kept under a generic label' },
        { id: 'cMUayvSNtZ1d80VvmySy', value: '   ' },   // blank, dropped
      ],
    } } },
    { status: 200, body: { notes: [
      { id: 'n1', body: 'older', dateAdded: '2026-08-01T00:00:00Z' },
      { id: 'n2', body: 'newer', dateAdded: '2026-08-09T00:00:00Z' },
      { id: 'n3', body: '   ', dateAdded: '2026-08-10T00:00:00Z' },  // empty, dropped
    ] } },
  ]);

  const res = mockRes();
  await contact(authedGet({ id: CONTACT_ID }), res);
  assert.equal(res.code, 200);

  const labels = res.payload.contact.fields.map(f => f.label);
  assert.deepEqual(labels, ['Booking type', 'Check in', 'Other']);
  assert.equal(res.payload.contact.fields[0].value, 'Joiner Tour');
  assert.deepEqual(res.payload.notes.map(n => n.body), ['newer', 'older']);
});

test('notes failing does not fail the contact', async () => {
  stubFetch([
    { status: 200, body: { contact: { id: CONTACT_ID, firstName: 'Ana' } } },
    { status: 500, body: 'notes exploded' },
  ]);
  const res = mockRes();
  await contact(authedGet({ id: CONTACT_ID }), res);
  assert.equal(res.code, 200, 'the contact is still worth showing');
  assert.deepEqual(res.payload.notes, []);
  assert.equal(res.payload.notesUnavailable, true);
});

test('a missing contact is a 404', async () => {
  stubFetch([{ status: 200, body: { contact: null } }, { status: 200, body: { notes: [] } }]);
  const res = mockRes();
  await contact(authedGet({ id: CONTACT_ID }), res);
  assert.equal(res.code, 404);
});
