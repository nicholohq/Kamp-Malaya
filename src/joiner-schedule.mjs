// Joiner tour schedule + pure helpers for the funnel date dropdown.
// Pure ESM, no imports — unit-tested with `npm test` (node:test).

export const JOINER_SCHEDULE = [
  // ===== 2026 ===== (moved verbatim from funnel.js)
  // January
  { start: '2026-01-08', end: '2026-01-11', label: 'Jan 8-11' },
  { start: '2026-01-15', end: '2026-01-18', label: 'Jan 15-18' },
  { start: '2026-01-22', end: '2026-01-25', label: 'Jan 22-25' },
  { start: '2026-01-29', end: '2026-02-01', label: 'Jan 29 - Feb 1' },
  // February
  { start: '2026-02-05', end: '2026-02-08', label: 'Feb 5-8' },
  { start: '2026-02-12', end: '2026-02-15', label: 'Feb 12-15' },
  { start: '2026-02-14', end: '2026-02-17', label: 'Feb 14-17' },
  { start: '2026-02-17', end: '2026-02-20', label: 'Feb 17-20' },
  { start: '2026-02-19', end: '2026-02-22', label: 'Feb 19-22' },
  { start: '2026-02-22', end: '2026-02-25', label: 'Feb 22-25' },
  { start: '2026-02-25', end: '2026-02-28', label: 'Feb 25-28' },
  { start: '2026-02-26', end: '2026-03-01', label: 'Feb 26 - Mar 1' },
  // March
  { start: '2026-03-05', end: '2026-03-08', label: 'Mar 5-8' },
  { start: '2026-03-12', end: '2026-03-15', label: 'Mar 12-15' },
  { start: '2026-03-19', end: '2026-03-22', label: 'Mar 19-22' },
  { start: '2026-03-26', end: '2026-03-29', label: 'Mar 26-29' },
  { start: '2026-03-28', end: '2026-03-31', label: 'Mar 28-31' },
  // April
  { start: '2026-04-01', end: '2026-04-04', label: 'Apr 1-4' },
  { start: '2026-04-02', end: '2026-04-05', label: 'Apr 2-5' },
  { start: '2026-04-09', end: '2026-04-12', label: 'Apr 9-12' },
  { start: '2026-04-16', end: '2026-04-19', label: 'Apr 16-19' },
  { start: '2026-04-23', end: '2026-04-26', label: 'Apr 23-26' },
  { start: '2026-04-30', end: '2026-05-03', label: 'Apr 30 - May 3' },
  // May
  { start: '2026-05-01', end: '2026-05-04', label: 'May 1-4' },
  { start: '2026-05-07', end: '2026-05-10', label: 'May 7-10' },
  { start: '2026-05-14', end: '2026-05-17', label: 'May 14-17' },
  { start: '2026-05-21', end: '2026-05-24', label: 'May 21-24' },
  { start: '2026-05-23', end: '2026-05-26', label: 'May 23-26' },
  { start: '2026-05-24', end: '2026-05-27', label: 'May 24-27' },
  { start: '2026-05-27', end: '2026-05-30', label: 'May 27-30' },
  { start: '2026-05-28', end: '2026-05-31', label: 'May 28-31' },
  // July
  { start: '2026-07-02', end: '2026-07-05', label: 'Jul 2-5' },
  { start: '2026-07-09', end: '2026-07-12', label: 'Jul 9-12' },
  { start: '2026-07-16', end: '2026-07-19', label: 'Jul 16-19' },
  { start: '2026-07-23', end: '2026-07-26', label: 'Jul 23-26' },
  { start: '2026-07-30', end: '2026-08-02', label: 'Jul 30 - Aug 2' },
  // August
  { start: '2026-08-06', end: '2026-08-09', label: 'Aug 6-9' },
  { start: '2026-08-13', end: '2026-08-16', label: 'Aug 13-16' },
  { start: '2026-08-20', end: '2026-08-23', label: 'Aug 20-23' },
  { start: '2026-08-27', end: '2026-08-30', label: 'Aug 27-30' },
  { start: '2026-08-28', end: '2026-08-31', label: 'Aug 28-31' },
  // September
  { start: '2026-09-03', end: '2026-09-06', label: 'Sep 3-6' },
  { start: '2026-09-10', end: '2026-09-13', label: 'Sep 10-13' },
  { start: '2026-09-17', end: '2026-09-20', label: 'Sep 17-20' },
  { start: '2026-09-24', end: '2026-09-27', label: 'Sep 24-27' },
  { start: '2026-09-27', end: '2026-09-30', label: 'Sep 27-30' },
  // October
  { start: '2026-10-01', end: '2026-10-04', label: 'Oct 1-4' },
  { start: '2026-10-08', end: '2026-10-11', label: 'Oct 8-11' },
  { start: '2026-10-15', end: '2026-10-18', label: 'Oct 15-18' },
  { start: '2026-10-22', end: '2026-10-25', label: 'Oct 22-25' },
  { start: '2026-10-29', end: '2026-11-01', label: 'Oct 29 - Nov 1' },
  // November
  { start: '2026-11-01', end: '2026-11-04', label: 'Nov 1-4' },
  { start: '2026-11-05', end: '2026-11-08', label: 'Nov 5-8' },
  { start: '2026-11-12', end: '2026-11-15', label: 'Nov 12-15' },
  { start: '2026-11-19', end: '2026-11-22', label: 'Nov 19-22' },
  { start: '2026-11-26', end: '2026-11-29', label: 'Nov 26-29' },
  { start: '2026-11-27', end: '2026-11-30', label: 'Nov 27-30' },
  { start: '2026-11-29', end: '2026-12-02', label: 'Nov 29 - Dec 2' },
  // December
  { start: '2026-12-03', end: '2026-12-06', label: 'Dec 3-6' },
  { start: '2026-12-05', end: '2026-12-08', label: 'Dec 5-8' },
  { start: '2026-12-08', end: '2026-12-11', label: 'Dec 8-11' },
  { start: '2026-12-10', end: '2026-12-13', label: 'Dec 10-13' },
  { start: '2026-12-17', end: '2026-12-20', label: 'Dec 17-20' },
  { start: '2026-12-20', end: '2026-12-23', label: 'Dec 20-23' },
  { start: '2026-12-27', end: '2026-12-30', label: 'Dec 27-30' },

  // ===== 2027 ===== (transcribed from originals-backup/"tour dates 2027.jfif")
  // January
  { start: '2027-01-02', end: '2027-01-05' },
  { start: '2027-01-07', end: '2027-01-10' },
  { start: '2027-01-14', end: '2027-01-17' },
  { start: '2027-01-21', end: '2027-01-24' },
  { start: '2027-01-28', end: '2027-01-31' },
  // February
  { start: '2027-02-04', end: '2027-02-07' },
  { start: '2027-02-11', end: '2027-02-14' },
  { start: '2027-02-18', end: '2027-02-21' },
  { start: '2027-02-25', end: '2027-02-28' },
  // March
  { start: '2027-03-04', end: '2027-03-07' },
  { start: '2027-03-11', end: '2027-03-14' },
  { start: '2027-03-18', end: '2027-03-21' },
  { start: '2027-03-25', end: '2027-03-28' },
  // April
  { start: '2027-04-01', end: '2027-04-04' },
  { start: '2027-04-08', end: '2027-04-11' },
  { start: '2027-04-15', end: '2027-04-18' },
  { start: '2027-04-22', end: '2027-04-25' },
  { start: '2027-04-28', end: '2027-05-01' },
  // May (27–31 is a 5-day trip, confirmed correct by owner)
  { start: '2027-05-06', end: '2027-05-09' },
  { start: '2027-05-13', end: '2027-05-16' },
  { start: '2027-05-20', end: '2027-05-23' },
  { start: '2027-05-27', end: '2027-05-31' },
  // June
  { start: '2027-06-03', end: '2027-06-06' },
  { start: '2027-06-10', end: '2027-06-13' },
  { start: '2027-06-17', end: '2027-06-20' },
  { start: '2027-06-24', end: '2027-06-27' },
  // July
  { start: '2027-07-01', end: '2027-07-04' },
  { start: '2027-07-08', end: '2027-07-11' },
  { start: '2027-07-15', end: '2027-07-18' },
  { start: '2027-07-22', end: '2027-07-25' },
  { start: '2027-07-29', end: '2027-08-01' },
  // August
  { start: '2027-08-05', end: '2027-08-08' },
  { start: '2027-08-12', end: '2027-08-15' },
  { start: '2027-08-19', end: '2027-08-22' },
  { start: '2027-08-26', end: '2027-08-29' },
  // September
  { start: '2027-09-02', end: '2027-09-05' },
  { start: '2027-09-09', end: '2027-09-12' },
  { start: '2027-09-16', end: '2027-09-19' },
  { start: '2027-09-23', end: '2027-09-26' },
  { start: '2027-09-30', end: '2027-10-03' },
  // October
  { start: '2027-10-07', end: '2027-10-10' },
  { start: '2027-10-14', end: '2027-10-17' },
  { start: '2027-10-21', end: '2027-10-24' },
  { start: '2027-10-28', end: '2027-10-31' },
  // November
  { start: '2027-11-04', end: '2027-11-07' },
  { start: '2027-11-11', end: '2027-11-14' },
  { start: '2027-11-18', end: '2027-11-21' },
  { start: '2027-11-25', end: '2027-11-28' },
  // December (21–24 is off the weekly rhythm, confirmed correct by owner)
  { start: '2027-12-02', end: '2027-12-05' },
  { start: '2027-12-09', end: '2027-12-12' },
  { start: '2027-12-16', end: '2027-12-19' },
  { start: '2027-12-21', end: '2027-12-24' },
  { start: '2027-12-27', end: '2027-12-30' },
];

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function todayISO(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function upcomingTours(schedule, today) {
  return schedule.filter(t => t.start >= today);
}

export function formatTourLabel(tour) {
  const [, sm, sd] = tour.start.split('-').map(Number);
  const [, em, ed] = tour.end.split('-').map(Number);
  const from = `${MONTHS_SHORT[sm - 1]} ${sd}`;
  const to = sm === em ? `${ed}` : `${MONTHS_SHORT[em - 1]} ${ed}`;
  return `${from} – ${to}`;
}

export function groupByMonth(tours) {
  const groups = [];
  for (const tour of tours) {
    const [y, m] = tour.start.split('-').map(Number);
    const label = `${MONTHS_LONG[m - 1]} ${y}`;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.tours.push(tour);
    else groups.push({ label, tours: [tour] });
  }
  return groups;
}
