import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GHL_API_KEY = 'test-key';
const { default: handler } = await import('../api/ghl-webhook.js');

function mockRes() {
  return {
    headers: {}, code: 0, payload: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.payload = o; return this; },
    end() { return this; },
  };
}

/** Records every outbound call and lets each URL be scripted. */
function stubFetch(script = {}) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const body = options?.body ? JSON.parse(options.body) : null;
    calls.push({ url, body });
    const key = Object.keys(script).find(k => String(url).includes(k));
    const reply = key ? script[key] : { ok: true, json: {} };
    return {
      ok: reply.ok !== false,
      status: reply.status || (reply.ok === false ? 500 : 200),
      text: async () => JSON.stringify(reply.json ?? {}),
      json: async () => reply.json ?? {},
    };
  };
  return calls;
}

const baseBody = {
  full_name: 'Ana Cruz', email: 'ana@example.com', phone: '+639171234567',
  booking_type: 'Joiner Tour', tour_date: '2026-08-20', pax_count: '3',
};
const upsertOk = { '/contacts/upsert': { ok: true, json: { contact: { id: 'c_123' } } } };

test('estimator context the CRM has no field for is attached as a note', async () => {
  const calls = stubFetch(upsertOk);
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, body: {
    ...baseBody, quoted_estimate: '69596', children_ages: '2, 5, 8',
    children_count: '3', nights: '3',
  } }, res);

  assert.equal(res.code, 200);
  assert.equal(res.payload.success, true);
  assert.equal(res.payload.noteAdded, true);

  const note = calls.find(c => c.url.includes('/notes'));
  assert.ok(note, 'a note request was made');
  assert.match(note.body.body, /Estimate shown to guest: PHP 69,596/);
  assert.match(note.body.body, /Children's ages: 2, 5, 8/);
  assert.match(note.body.body, /Nights: 3/);
});

test('no note is posted when there is nothing extra to say', async () => {
  const calls = stubFetch(upsertOk);
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, body: baseBody }, res);
  assert.equal(res.payload.noteAdded, false);
  assert.equal(calls.some(c => c.url.includes('/notes')), false);
});

test('a failed note never fails the booking', async () => {
  stubFetch({ ...upsertOk, '/notes': { ok: false, status: 422 } });
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, body: { ...baseBody, quoted_estimate: '69596' } }, res);
  assert.equal(res.code, 200, 'the contact is already saved, so this still succeeds');
  assert.equal(res.payload.success, true);
  assert.equal(res.payload.noteAdded, false);
});

test('a failed tag call never fails the booking, and the note still lands', async () => {
  stubFetch({ ...upsertOk, '/tags': { ok: false, status: 500 } });
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, body: { ...baseBody, quoted_estimate: '69596' } }, res);
  assert.equal(res.payload.success, true);
  assert.deepEqual(res.payload.tagsAdded, []);
  assert.equal(res.payload.noteAdded, true, 'tagging and the note are independent');
});

test('tags and note are issued concurrently, not one after the other', async () => {
  const order = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('upsert')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ contact: { id: 'c_1' } }) };
    }
    order.push(`start:${String(url).split('/').pop()}`);
    await new Promise(r => setTimeout(r, 20));
    order.push(`end:${String(url).split('/').pop()}`);
    return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
  };
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, body: { ...baseBody, quoted_estimate: '1' } }, res);
  // Interleaved starts prove parallelism; sequential would read start,end,start,end.
  assert.equal(order[0].startsWith('start:'), true);
  assert.equal(order[1].startsWith('start:'), true, `ran sequentially: ${order.join(' ')}`);
});

test('a failed upsert is still a hard failure — nothing to annotate', async () => {
  stubFetch({ '/contacts/upsert': { ok: false, status: 401, json: { message: 'bad token' } } });
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, body: baseBody }, res);
  assert.equal(res.code, 401);
  assert.equal(res.payload.success, false);
});

test('mapped fields still travel as custom fields, not as the note', async () => {
  const calls = stubFetch(upsertOk);
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, body: { ...baseBody, quoted_estimate: '500' } }, res);
  const upsert = calls.find(c => c.url.includes('upsert'));
  const ids = upsert.body.customFields.map(f => f.id);
  assert.ok(ids.includes('cMUayvSNtZ1d80VvmySy'), 'pax_count keeps its custom field');
  const note = calls.find(c => c.url.includes('/notes'));
  assert.doesNotMatch(note.body.body, /pax_count/, 'mapped fields are not duplicated into the note');
});
