import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JOINER_SCHEDULE,
  todayISO,
  upcomingTours,
  formatTourLabel,
  groupByMonth,
} from '../src/joiner-schedule.mjs';

test('todayISO formats a Date as local YYYY-MM-DD', () => {
  assert.equal(todayISO(new Date(2026, 7, 6)), '2026-08-06'); // Aug 6 2026
  assert.equal(todayISO(new Date(2027, 0, 2)), '2027-01-02');
});

test('upcomingTours drops tours that started before today', () => {
  const schedule = [
    { start: '2026-08-05', end: '2026-08-08' },
    { start: '2026-08-06', end: '2026-08-09' },
    { start: '2026-08-13', end: '2026-08-16' },
  ];
  const result = upcomingTours(schedule, '2026-08-06');
  assert.deepEqual(result.map(t => t.start), ['2026-08-06', '2026-08-13']);
});

test('a tour starting today is still shown', () => {
  const result = upcomingTours([{ start: '2026-08-06', end: '2026-08-09' }], '2026-08-06');
  assert.equal(result.length, 1);
});

test('formatTourLabel renders same-month and cross-month ranges', () => {
  assert.equal(formatTourLabel({ start: '2026-08-06', end: '2026-08-09' }), 'Aug 6 – 9');
  assert.equal(formatTourLabel({ start: '2027-09-30', end: '2027-10-03' }), 'Sep 30 – Oct 3');
  assert.equal(formatTourLabel({ start: '2027-04-28', end: '2027-05-01' }), 'Apr 28 – May 1');
});

test('groupByMonth groups by start month with "Month YYYY" labels, preserving order', () => {
  const groups = groupByMonth([
    { start: '2026-08-06', end: '2026-08-09' },
    { start: '2026-08-13', end: '2026-08-16' },
    { start: '2026-09-03', end: '2026-09-06' },
  ]);
  assert.deepEqual(groups.map(g => g.label), ['August 2026', 'September 2026']);
  assert.equal(groups[0].tours.length, 2);
  assert.equal(groups[1].tours.length, 1);
});

test('schedule contains the full 2027 season (53 trips)', () => {
  const trips2027 = JOINER_SCHEDULE.filter(t => t.start.startsWith('2027'));
  assert.equal(trips2027.length, 53);
  // spot-checks straight off the poster, including the two odd ones
  const has = (start, end) => trips2027.some(t => t.start === start && t.end === end);
  assert.ok(has('2027-01-02', '2027-01-05'), 'Jan 2-5');
  assert.ok(has('2027-04-28', '2027-05-01'), 'Apr 28 - May 1');
  assert.ok(has('2027-05-27', '2027-05-31'), 'May 27-31 (5-day, poster-confirmed)');
  assert.ok(has('2027-07-29', '2027-08-01'), 'Jul 29 - Aug 1');
  assert.ok(has('2027-09-30', '2027-10-03'), 'Sep 30 - Oct 3');
  assert.ok(has('2027-12-21', '2027-12-24'), 'Dec 21-24 (poster-confirmed)');
  assert.ok(has('2027-12-27', '2027-12-30'), 'Dec 27-30');
});

test('schedule is chronologically sorted', () => {
  const starts = JOINER_SCHEDULE.map(t => t.start);
  assert.deepEqual(starts, [...starts].sort());
});
