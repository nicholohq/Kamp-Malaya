import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIP_PARAMS,
  serializeTrip,
  parseTrip,
  isCompleteHandoff,
  MAX_ADULTS,
  MAX_CHILDREN,
} from '../src/trip-params.mjs';

// ---------- ROUND TRIP: the whole point of the module ----------

test('a joiner handoff survives a round trip intact', () => {
  const trip = {
    tripType: 'joiner',
    departure: '2026-08-20',
    nights: 3,
    adults: 3,
    childAges: [2, 5, 8],
    room: 'kubo',
    estimate: 69596,
  };
  const back = parseTrip(serializeTrip(trip));
  assert.equal(back.tripType, 'joiner');
  assert.equal(back.departure, '2026-08-20');
  assert.equal(back.adults, 3);
  assert.deepEqual(back.childAges, [2, 5, 8]);
  assert.equal(back.children, 3);
  assert.equal(back.room, 'kubo');
  assert.equal(back.estimate, 69596);
});

test('a private handoff survives a round trip intact', () => {
  const trip = {
    tripType: 'private',
    checkIn: '2026-10-05',
    checkOut: '2026-10-11',
    nights: 6,
    adults: 4,
    childAges: [1],
    room: 'villa',
    estimate: null,
  };
  const back = parseTrip(serializeTrip(trip));
  assert.equal(back.tripType, 'private');
  assert.equal(back.checkIn, '2026-10-05');
  assert.equal(back.checkOut, '2026-10-11');
  assert.equal(back.nights, 6);
  assert.equal(back.estimate, null); // not quotable never becomes a price
});

// ---------- THE REGRESSION THIS MODULE EXISTS TO PREVENT ----------

test('party size, ages, room and total all cross the boundary', () => {
  // Before the shared contract these four were dropped between the pages.
  const q = serializeTrip({
    tripType: 'joiner', departure: '2026-08-20', adults: 3,
    childAges: [2, 5, 8], room: 'kubo', estimate: 69596, nights: 3,
  });
  const s = q.toString();
  assert.match(s, /adults=3/);
  assert.match(s, /ages=2%2C5%2C8/);
  assert.match(s, /room=kubo/);
  assert.match(s, /estimate=69596/);
});

// ---------- LEGACY LINKS ----------

test('legacy pax, start and end are still understood', () => {
  const back = parseTrip('?type=private&pax=5&start=2026-10-05&end=2026-10-11');
  assert.equal(back.adults, 5);
  assert.equal(back.checkIn, '2026-10-05');
  assert.equal(back.checkOut, '2026-10-11');
});

test('canonical names win when both are present', () => {
  const back = parseTrip('?type=joiner&adults=4&pax=9');
  assert.equal(back.adults, 4);
});

test('legacy names are never emitted', () => {
  const s = serializeTrip({ tripType: 'private', adults: 2, checkIn: '2026-10-05' }).toString();
  assert.doesNotMatch(s, /pax=/);
  assert.doesNotMatch(s, /start=/);
});

// ---------- COLD VS WARM ----------

test('a URL with no trip returns null so callers can tell cold from warm', () => {
  assert.equal(parseTrip(''), null);
  assert.equal(parseTrip('?utm_source=fb'), null);
  assert.equal(parseTrip('?type=nonsense'), null);
});

test('isCompleteHandoff needs the dates that define each trip type', () => {
  assert.equal(isCompleteHandoff(parseTrip('?type=joiner&date=2026-08-20')), true);
  assert.equal(isCompleteHandoff(parseTrip('?type=joiner')), false);
  assert.equal(isCompleteHandoff(parseTrip('?type=private&checkin=2026-10-05&checkout=2026-10-11')), true);
  assert.equal(isCompleteHandoff(parseTrip('?type=private&checkin=2026-10-05')), false);
  assert.equal(isCompleteHandoff(null), false);
});

// ---------- UNTRUSTED INPUT ----------

// Two distinct rules, worth separating: input that is not a number falls back
// to the default, while a real number outside the range is clamped into it.
test('non-numeric values fall back to the default', () => {
  const back = parseTrip('?type=joiner&adults=abc&nights=lots&estimate=NaN&date=20th+August');
  assert.equal(back.adults, 2);
  assert.equal(back.nights, 3);
  assert.equal(back.estimate, null);
  assert.equal(back.departure, null);
});

test('numeric but out-of-range values clamp rather than fall back', () => {
  const back = parseTrip('?type=joiner&nights=-4');
  assert.equal(back.nights, 1, 'clamps to the minimum, not the 3-night default');
});

test('out-of-range numbers are clamped, not rejected', () => {
  const big = parseTrip('?type=joiner&adults=9999&nights=9999');
  assert.equal(big.adults, MAX_ADULTS);
  assert.equal(big.nights, 30);
  const small = parseTrip('?type=joiner&adults=0');
  assert.equal(small.adults, 1);
});

test('malformed and out-of-range ages are dropped individually', () => {
  const back = parseTrip('?type=joiner&ages=2,abc,5,99,-1,8');
  assert.deepEqual(back.childAges, [2, 5, 8]);
  assert.equal(back.children, 3);
});

test('the child list cannot exceed the stepper maximum', () => {
  const many = Array.from({ length: 40 }, () => 6).join(',');
  assert.equal(parseTrip(`?type=joiner&ages=${many}`).childAges.length, MAX_CHILDREN);
});

test('a rejected date does not leak into the wrong trip type', () => {
  // Joiner params on a private trip and vice versa must not cross over.
  const priv = parseTrip('?type=private&date=2026-08-20');
  assert.equal(priv.checkIn, null);
  assert.equal(priv.departure, null);
  const join = parseTrip('?type=joiner&checkin=2026-10-05');
  assert.equal(join.checkIn, null);
});

test('room is normalised to a lowercase id, never a display label', () => {
  assert.equal(parseTrip('?type=joiner&room=KUBO').room, 'kubo');
  assert.equal(parseTrip('?type=joiner&room=  villa  ').room, 'villa');
  assert.equal(parseTrip('?type=joiner').room, null);
});

test('a zero or negative estimate is not a price', () => {
  assert.equal(parseTrip('?type=joiner&estimate=0').estimate, null);
  assert.equal(parseTrip('?type=joiner&estimate=-500').estimate, null);
  assert.equal(serializeTrip({ tripType: 'joiner', estimate: 0 }).has(TRIP_PARAMS.estimate), false);
});

test('parseTrip accepts a URLSearchParams as well as a string', () => {
  const p = new URLSearchParams('type=joiner&adults=3');
  assert.equal(parseTrip(p).adults, 3);
  assert.equal(parseTrip('type=joiner&adults=3').adults, 3);
  assert.equal(parseTrip('?type=joiner&adults=3').adults, 3);
});
