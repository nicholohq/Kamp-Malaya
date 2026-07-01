// /api/availability.js
//
// Returns the list of booked/blocked dates for a given accommodation by reading
// events from that room's GoHighLevel calendar. The front-end greys these out in
// the check-in/check-out pickers.
//
// Requires GHL_API_KEY to have the calendars/events.readonly scope, plus a GHL
// calendar per room whose ID is set as an env var in Vercel:
//   GHL_CAL_KUBO, GHL_CAL_CANOPY, GHL_CAL_VILLA
// Until those are set, the endpoint safely returns an empty list (no blocking),
// so the form keeps working as a normal date picker.

const GHL_BASE = 'https://services.leadconnectorhq.com';
const LOCATION_ID = 'YBLbWASoQgsSEqY0V5KV';

// Accommodation option value (from funnel.html) -> GHL calendar ID.
const ROOM_CALENDARS = {
  'Kubo by the Shore': process.env.GHL_CAL_KUBO   || '',
  'Canopy Tent':       process.env.GHL_CAL_CANOPY || '',
  'Malaya Villa':      process.env.GHL_CAL_VILLA  || '',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  // Cache at the Vercel CDN for 10 min so we don't hit GHL on every page view.
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');

  const room = req.query.room || '';
  const calendarId = ROOM_CALENDARS[room];

  // No calendar configured for this room -> nothing blocked (graceful default).
  if (!calendarId) {
    return res.status(200).json({ blockedDates: [], configured: false });
  }
  if (!process.env.GHL_API_KEY) {
    return res.status(500).json({ blockedDates: [], error: 'GHL API key not configured' });
  }

  // Window: today .. +12 months (GHL expects epoch milliseconds).
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = start + 365 * 86400000;

  try {
    const url = `${GHL_BASE}/calendars/events?locationId=${LOCATION_ID}`
      + `&calendarId=${encodeURIComponent(calendarId)}&startTime=${start}&endTime=${end}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    let ghl;
    try {
      ghl = await fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.GHL_API_KEY}`,
          Version: '2021-04-15',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await ghl.json().catch(() => ({}));
    if (!ghl.ok) {
      console.error('GHL calendar error:', ghl.status, data);
      return res.status(200).json({ blockedDates: [], error: data.message || `GHL ${ghl.status}` });
    }

    // Expand each booked event to every date it covers (YYYY-MM-DD).
    const blocked = new Set();
    for (const ev of data.events || []) {
      const from = new Date(ev.startTime);
      const to = new Date(ev.endTime);
      for (let d = new Date(from); d < to; d = new Date(d.getTime() + 86400000)) {
        blocked.add(d.toISOString().slice(0, 10));
      }
    }

    return res.status(200).json({ blockedDates: [...blocked].sort(), configured: true });
  } catch (error) {
    console.error('Availability error:', error);
    return res.status(200).json({ blockedDates: [], error: error.message });
  }
}
