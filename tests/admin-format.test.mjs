import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalisePhone, contactDisplayName, previewText, formatTimestamp,
  filterContacts, sortContacts, parseNote,
} from '../src/admin-format.mjs';

// ---------------------------------------------------------------------- name

test('contactDisplayName falls back through email and phone', () => {
  assert.equal(contactDisplayName({ name: 'Ana Reyes' }), 'Ana Reyes');
  assert.equal(contactDisplayName({ name: '  Ana   Reyes  ' }), 'Ana Reyes');
  assert.equal(contactDisplayName({ name: '', email: 'a@example.com' }), 'a@example.com');
  assert.equal(contactDisplayName({ name: '', email: '', phone: '+639170000000' }), '+639170000000');
  assert.equal(contactDisplayName({}), 'Unknown contact');
  assert.equal(contactDisplayName(null), 'Unknown contact');
});

test('contactDisplayName does not escape HTML — that is the DOM layer’s job', () => {
  // Pinning the boundary on purpose. This module normalises; escaping happens
  // once, in admin.js, via textContent. An escaper here would look like
  // protection without being it.
  assert.equal(contactDisplayName({ name: '<img src=x onerror=alert(1)>' }),
    '<img src=x onerror=alert(1)>');
});

// ------------------------------------------------------------------- preview

test('previewText collapses whitespace and truncates with an ellipsis', () => {
  assert.equal(previewText('  hello\n\n  world '), 'hello world');
  assert.equal(previewText('x'.repeat(200)).length, 80);
  assert.ok(previewText('x'.repeat(200)).endsWith('…'));
  assert.equal(previewText(''), '');
  assert.equal(previewText(null), '');
  assert.equal(previewText('short', 80), 'short');
});

// ----------------------------------------------------------------- timestamp

test('formatTimestamp shows time today, "Yesterday" yesterday, a date beyond', () => {
  const now = new Date(2026, 8, 2, 15, 0);                     // 2 Sep 2026
  assert.match(formatTimestamp(new Date(2026, 8, 2, 9, 5).toISOString(), now), /9:05/);
  assert.match(formatTimestamp(new Date(2026, 8, 1, 9, 5).toISOString(), now), /^Yesterday /);
  assert.match(formatTimestamp(new Date(2026, 7, 18).toISOString(), now), /18/);
  // A different year keeps the year, so an old enquiry is never ambiguous.
  assert.match(formatTimestamp(new Date(2025, 7, 18).toISOString(), now), /2025/);
});

test('formatTimestamp falls back to the raw value rather than "Invalid Date"', () => {
  const now = new Date(2026, 8, 2);
  assert.equal(formatTimestamp('not a date', now), 'not a date');
  assert.equal(formatTimestamp('', now), '');
  assert.equal(formatTimestamp(null, now), '');
});

// -------------------------------------------------------------------- filter

test('filterContacts matches name and email case-insensitively', () => {
  const items = [
    { name: 'Ana Reyes', email: 'ana@example.com', phone: '+639170000001' },
    { name: 'Ben Cruz', email: 'ben@other.com', phone: '+639170000002' },
  ];
  assert.equal(filterContacts(items, 'ana').length, 1);
  assert.equal(filterContacts(items, 'ANA').length, 1);
  assert.equal(filterContacts(items, 'example.com').length, 1);
  assert.equal(filterContacts(items, '').length, 2);
  assert.equal(filterContacts(items, '   ').length, 2);
  assert.equal(filterContacts(null, 'x').length, 0);
});

test('a locally written phone number matches the stored international one', () => {
  const items = [{ name: 'Ana', email: '', phone: '+63 917 000 0001' }];
  // This is the case that matters: the owner has "0917 000 0001" written down.
  assert.equal(filterContacts(items, '0917').length, 1);
  assert.equal(filterContacts(items, '917 000').length, 1);
  assert.equal(filterContacts(items, '+63917').length, 1);
  assert.equal(filterContacts(items, '9995').length, 0);
});

test('a punctuation-only query does not match everything', () => {
  const items = [{ name: 'Ana', email: 'a@x.com', phone: '+639170000001' }];
  assert.equal(filterContacts(items, '+').length, 0);
  assert.equal(filterContacts(items, '-').length, 0);
});

// ---------------------------------------------------------------------- sort

test('sortContacts puts newest first and undated last', () => {
  const items = [
    { id: 'old', dateAdded: '2026-08-01T00:00:00Z' },
    { id: 'none' },
    { id: 'new', dateAdded: '2026-09-01T00:00:00Z' },
    { id: 'bad', dateAdded: 'whenever' },
  ];
  assert.deepEqual(sortContacts(items).map(c => c.id), ['new', 'old', 'none', 'bad']);
});

test('sortContacts is stable for equal timestamps', () => {
  const items = [
    { id: 'a', dateAdded: '2026-08-01T00:00:00Z' },
    { id: 'b', dateAdded: '2026-08-01T00:00:00Z' },
    { id: 'c', dateAdded: '2026-08-01T00:00:00Z' },
  ];
  assert.deepEqual(sortContacts(items).map(c => c.id), ['a', 'b', 'c'],
    'rows must not shuffle between renders');
});

test('sortContacts does not mutate its input', () => {
  const items = [{ id: 'a', dateAdded: '2026-08-01T00:00:00Z' }, { id: 'b' }];
  const copy = items.slice();
  sortContacts(items);
  assert.deepEqual(items, copy);
});

// ---------------------------------------------------------------------- note

test('parseNote splits the webhook’s "Label: value" lines', () => {
  const body = 'Trip estimator details\nChildren: 2\nEstimate shown to guest: PHP 29,598';
  assert.deepEqual(parseNote(body), [
    { label: '', value: 'Trip estimator details' },
    { label: 'Children', value: '2' },
    { label: 'Estimate shown to guest', value: 'PHP 29,598' },
  ]);
});

test('parseNote keeps prose intact rather than inventing a label', () => {
  // A colon deep inside a sentence is punctuation, not a field separator.
  const prose = 'Called the guest and they said this: they want a later flight';
  assert.deepEqual(parseNote(prose), [{ label: '', value: prose }]);
  assert.deepEqual(parseNote(''), []);
  assert.deepEqual(parseNote(null), []);
});
