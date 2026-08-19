import test from 'node:test';
import assert from 'node:assert/strict';
import {
  childMultiplier,
  childRateLabel,
  nightsBetween,
  formatPeso,
  findAccommodation,
  estimate,
} from '../src/pricing.mjs';

// ---------- CHILD POLICY: 0-3 free · 4-5 half · 6+ full ----------

test('childMultiplier applies the three age brackets', () => {
  assert.equal(childMultiplier(0), 0);
  assert.equal(childMultiplier(3), 0);
  assert.equal(childMultiplier(4), 0.5);
  assert.equal(childMultiplier(5), 0.5);
  assert.equal(childMultiplier(6), 1);
  assert.equal(childMultiplier(17), 1);
});

test('childMultiplier falls back to full rate on junk input', () => {
  assert.equal(childMultiplier(NaN), 1);
  assert.equal(childMultiplier(-1), 1);
  assert.equal(childMultiplier(undefined), 1);
});

test('childRateLabel names each bracket', () => {
  assert.equal(childRateLabel(2), 'free');
  assert.equal(childRateLabel(5), 'half rate');
  assert.equal(childRateLabel(9), 'full rate');
});

// ---------- NIGHTS ----------

test('nightsBetween counts nights, not days', () => {
  assert.equal(nightsBetween('2026-01-08', '2026-01-11'), 3); // standard 4D/3N
  assert.equal(nightsBetween('2027-05-27', '2027-05-31'), 4); // the off-rhythm 5-day tour
});

test('nightsBetween crosses month and year boundaries', () => {
  assert.equal(nightsBetween('2026-01-29', '2026-02-01'), 3);
  assert.equal(nightsBetween('2026-12-30', '2027-01-02'), 3);
});

test('nightsBetween is never negative and survives bad input', () => {
  assert.equal(nightsBetween('2026-01-11', '2026-01-08'), 0);
  assert.equal(nightsBetween('nope', '2026-01-08'), 0);
});

// ---------- FORMATTING ----------

test('formatPeso renders whole pesos with separators', () => {
  assert.equal(formatPeso(14799), '₱14,799');
  assert.equal(formatPeso(7399.5), '₱7,400');
  assert.equal(formatPeso(0), '₱0');
});

// ---------- ESTIMATE ----------

test('adults only, tent included', () => {
  const r = estimate({ ratePerHead: 14799, adults: 2, nights: 3 });
  assert.equal(r.quotable, true);
  assert.equal(r.total, 29598);
  assert.equal(r.lines.length, 1);
  assert.equal(r.payingHeads, 2);
});

test('children are billed by age bracket', () => {
  const r = estimate({ ratePerHead: 14799, adults: 2, childAges: [2, 5, 8], nights: 3 });
  // 2 adults + free infant + half-rate 5yo + full-rate 8yo
  assert.equal(r.total, 29598 + 0 + 7400 + 14799);
  assert.equal(r.freeGuests, 1);
  assert.equal(r.payingHeads, 4);
  assert.equal(r.totalGuests, 5);
});

test('free infants are excluded from per-head-per-night upgrades', () => {
  const r = estimate({
    ratePerHead: 14799,
    adults: 2,
    childAges: [1],
    nights: 3,
    accommodationId: 'kubo',
  });
  const upgrade = r.lines.find(l => l.key === 'accommodation');
  assert.equal(upgrade.amount, 200 * 2 * 3); // infant not counted
});

test('the included tent adds no upgrade line', () => {
  const r = estimate({ ratePerHead: 14799, adults: 4, nights: 3, accommodationId: 'tent' });
  assert.equal(r.lines.find(l => l.key === 'accommodation'), undefined);
});

test('villa and kubo both carry the same per-head-per-night upgrade', () => {
  const kubo = estimate({ ratePerHead: 13500, adults: 3, nights: 3, accommodationId: 'kubo' });
  const villa = estimate({ ratePerHead: 13500, adults: 3, nights: 3, accommodationId: 'villa' });
  assert.equal(kubo.total, villa.total);
  assert.equal(kubo.total, 13500 * 3 + 200 * 3 * 3);
});

test('an unknown accommodation id falls back to the included tent', () => {
  assert.equal(findAccommodation('bogus').id, 'tent');
  const r = estimate({ ratePerHead: 13500, adults: 2, nights: 3, accommodationId: 'bogus' });
  assert.equal(r.total, 27000);
});

test('a null rate is not quotable and totals zero', () => {
  const r = estimate({ ratePerHead: null, adults: 4, childAges: [5], nights: 3 });
  assert.equal(r.quotable, false);
  assert.equal(r.total, 0);
  assert.deepEqual(r.lines, []);
  assert.equal(r.payingHeads, 5); // headcount still resolves for the quote request
});

test('unknown add-on ids are ignored rather than throwing', () => {
  const r = estimate({ ratePerHead: 14799, adults: 1, nights: 3, addonIds: ['does-not-exist'] });
  assert.equal(r.total, 14799);
});

test('a party of only children still prices correctly', () => {
  const r = estimate({ ratePerHead: 14799, adults: 0, childAges: [7], nights: 3 });
  assert.equal(r.total, 14799);
  assert.equal(r.lines.find(l => l.key === 'adults'), undefined);
});
