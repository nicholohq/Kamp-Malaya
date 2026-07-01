// /api/availability.js
//
// Returns booked/blocked dates for a room by reading block-slots from the single
// "Kamp Malaya Bookings" GHL calendar. Each block's title is prefixed with the
// room name in brackets, e.g. "[Malaya Villa] Jane Doe", so one calendar serves
// all rooms. Blocks are created by /api/block-dates (fired from a GHL workflow
// when a booking is confirmed), or added by hand in GHL's calendar view.
//
// Reads need GHL_API_KEY with calendars/events.readonly (already granted).

const GHL_BASE = 'https://services.leadconnectorhq.com';
const LOCATION_ID = 'YBLbWASoQgsSEqY0V5KV';
const CALENDAR_ID = 'huSkwv30oSbfpaVwzMyT'; // "Kamp Malaya Bookings" (not a secret)
const VALID_ROOMS = ['Kubo by the Shore', 'Canopy Tent', 'Malaya Villa'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

  const room = req.query.room || '';
  if (!VALID_ROOMS.includes(room)) {
    return res.status(200).json({ blockedDates: [], configured: false });
  }
  if (!process.env.GHL_API_KEY) {
    return res.status(500).json({ blockedDates: [], error: 'GHL API key not configured' });
  }

  // Window: today .. +12 months (GHL expects epoch milliseconds).
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = start + 366 * 86400000;

  try {
    const url = `${GHL_BASE}/calendars/blocked-slots?locationId=${LOCATION_ID}`
      + `&calendarId=${CALENDAR_ID}&startTime=${start}&endTime=${end}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    let ghl;
    try {
      ghl = await fetch(url, {
        headers: { Authorization: `Bearer ${process.env.GHL_API_KEY}`, Version: '2021-04-15' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await ghl.json().catch(() => ({}));
    if (!ghl.ok) {
      console.error('GHL blocked-slots error:', ghl.status, data);
      return res.status(200).json({ blockedDates: [], error: data.message || `GHL ${ghl.status}` });
    }

    // Keep only this room's blocks (title starts with "[Room]") and expand each
    // to its nights (check-in inclusive, check-out exclusive).
    const prefix = `[${room}]`;
    const set = new Set();
    for (const ev of data.events || []) {
      if (!ev.title || !ev.title.startsWith(prefix)) continue;
      const from = String(ev.startTime).slice(0, 10); // "YYYY-MM-DD" in local +08:00
      const to = String(ev.endTime).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) continue;
      for (let d = new Date(from + 'T00:00:00Z'); d < new Date(to + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
        set.add(d.toISOString().slice(0, 10));
      }
    }

    return res.status(200).json({ blockedDates: [...set].sort(), configured: true });
  } catch (error) {
    console.error('Availability error:', error);
    return res.status(200).json({ blockedDates: [], error: error.message });
  }
}
