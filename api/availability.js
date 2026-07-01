// /api/availability.js
//
// Returns the list of booked/blocked dates for a given room so the booking form
// can grey them out in the check-in / check-out pickers.
//
// Source of truth: src/blocked-dates.json (edit that file to add bookings).
// No external accounts or API keys — the JSON is bundled at deploy time, so
// updating availability = edit the JSON + redeploy (a git push).

import blocked from '../src/blocked-dates.json';

const ROOMS = blocked.rooms || {};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  // Cache at the Vercel CDN; a redeploy (after editing the JSON) busts it anyway.
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const room = req.query.room || '';
  const ranges = ROOMS[room];

  // Unknown room -> nothing blocked (form still works as a normal picker).
  if (!Array.isArray(ranges)) {
    return res.status(200).json({ blockedDates: [], configured: false });
  }

  // Expand each {start, end} range to every blocked night (start inclusive,
  // end exclusive) as YYYY-MM-DD.
  const set = new Set();
  for (const r of ranges) {
    if (!r || !r.start || !r.end) continue;
    const from = new Date(r.start);
    const to = new Date(r.end);
    if (isNaN(from) || isNaN(to)) continue;
    for (let d = new Date(from); d < to; d = new Date(d.getTime() + 86400000)) {
      set.add(d.toISOString().slice(0, 10));
    }
  }

  return res.status(200).json({ blockedDates: [...set].sort(), configured: true });
}
