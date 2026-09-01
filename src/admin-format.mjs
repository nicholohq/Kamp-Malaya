// Formatting and filtering for the admin dashboard.
//
// Pure ESM, no imports, no DOM — unit-tested with `npm test` (node:test), same
// contract as pricing.mjs, trip-params.mjs and joiner-schedule.mjs.
//
// This module NORMALISES; it never sanitises. Escaping happens exactly once, in
// admin.js, by virtue of textContent. A half-written escaper here would be
// worse than none, because it would look like protection.
//
// `now` is always a parameter, never Date.now() — date code that reads the
// clock itself cannot be tested.

/** Digits only. */
export function normalisePhone(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Reduces a number to its national form so the way the owner writes it down
 * matches the way the CRM stores it: "0917 000 0001" and "+63 917 000 0001"
 * are the same number, but share no digit substring — one has a trunk 0 the
 * other replaces with a country code.
 *
 * PH mobile numbers start with 9 nationally, so a leading 63 is always the
 * country code and never part of the number itself.
 */
export function phoneKey(value) {
  let d = normalisePhone(value);
  if (d.startsWith('63')) d = d.slice(2);
  else if (d.startsWith('0')) d = d.replace(/^0+/, '');
  return d;
}

/**
 * Best available label for a contact. The CRM will happily hold a contact with
 * no name at all — created from a phone number, say — and a blank row is
 * unclickable in practice.
 */
export function contactDisplayName(contact) {
  const name = String(contact?.name ?? '').replace(/\s+/g, ' ').trim();
  if (name) return name;
  const email = String(contact?.email ?? '').trim();
  if (email) return email;
  const phone = String(contact?.phone ?? '').trim();
  if (phone) return phone;
  return 'Unknown contact';
}

/** Collapses to a single line for the list row preview. */
export function previewText(body, max = 80) {
  const flat = String(body ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Absolute time for anything older than yesterday: on a page used to answer
 * "who enquired and when", "3 days ago" is worse than a date.
 * Falls back to the raw string — the value comes from the CRM and may be
 * anything at all.
 */
export function formatTimestamp(value, now = new Date()) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const then = new Date(raw);
  if (Number.isNaN(then.getTime())) return raw;

  const time = then.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const dayDiff = Math.round((startOfToday - startOfThen) / 86400000);

  if (dayDiff === 0) return time;
  if (dayDiff === 1) return `Yesterday ${time}`;
  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString('en-PH', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/**
 * Case-insensitive search across name, email and phone. Phone matching runs on
 * digits alone, so "0917" finds "+63 917 …" — which is how the owner will
 * actually have the number written down.
 */
export function filterContacts(items, query) {
  const list = Array.isArray(items) ? items : [];
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return list;

  const qDigits = phoneKey(q);
  // A query of punctuation only ("+", "-") has no digits and no letters worth
  // matching; treat it as no filter rather than matching everything by accident.
  const digitsMeaningful = qDigits.length >= 3;

  return list.filter((c) => {
    if (String(c?.name ?? '').toLowerCase().includes(q)) return true;
    if (String(c?.email ?? '').toLowerCase().includes(q)) return true;
    if (digitsMeaningful && phoneKey(c?.phone).includes(qDigits)) return true;
    return false;
  });
}

/**
 * Newest first, undated last. Stable, so contacts sharing a timestamp keep the
 * order the CRM returned rather than shuffling between renders.
 */
export function sortContacts(items) {
  const list = Array.isArray(items) ? items.slice() : [];
  return list
    .map((item, index) => ({ item, index, at: Date.parse(item?.dateAdded ?? '') }))
    .sort((a, b) => {
      const aBad = Number.isNaN(a.at);
      const bBad = Number.isNaN(b.at);
      if (aBad && bBad) return a.index - b.index;
      if (aBad) return 1;
      if (bBad) return -1;
      if (a.at !== b.at) return b.at - a.at;
      return a.index - b.index;
    })
    .map(entry => entry.item);
}

/**
 * Splits the webhook's note body into label/value rows.
 *
 * ghl-webhook.js writes "Trip estimator details" followed by "Label: value"
 * lines. Anything that does not match is kept as a plain line, so a
 * hand-written note added in GHL still renders in full.
 */
export function parseNote(body) {
  const lines = String(body ?? '').split('\n').map(l => l.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const sep = line.indexOf(':');
    // A label is short AND few words. Length alone is not enough: "Called the
    // guest and they said this" is only 35 characters, but it is a clause and
    // its colon is punctuation, not a field separator.
    const candidate = line.slice(0, sep).trim();
    const looksLikeLabel = sep > 0
      && sep <= 40
      && sep < line.length - 1
      && candidate.split(/\s+/).length <= 4;
    if (looksLikeLabel) {
      rows.push({ label: candidate, value: line.slice(sep + 1).trim() });
    } else {
      rows.push({ label: '', value: line });
    }
  }
  return rows;
}
