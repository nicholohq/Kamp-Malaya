// /api/block-dates.js
//
// Called by a GHL workflow's Webhook action when a booking is CONFIRMED (e.g. a
// "Confirmed" tag is added). Creates a block-slot on the "Kamp Malaya Bookings"
// calendar for the guest's check-in..check-out dates, which /api/availability
// then reads to grey out those dates on the booking form.
//
// Needs GHL_API_KEY with calendars/events.write (already granted).
//
// Configure the GHL workflow webhook to POST JSON like:
//   { "room": "{{contact.accommodation}}", "checkIn": "{{contact.check_in}}",
//     "checkOut": "{{contact.check_out}}", "name": "{{contact.name}}" }

const GHL_BASE = 'https://services.leadconnectorhq.com';
const LOCATION_ID = 'YBLbWASoQgsSEqY0V5KV';
const CALENDAR_ID = 'huSkwv30oSbfpaVwzMyT'; // "Kamp Malaya Bookings"
const VALID_ROOMS = ['Kubo by the Shore', 'Canopy Tent', 'Malaya Villa'];

// Normalize the various date shapes GHL might send to YYYY-MM-DD.
function normalizeDate(v) {
  if (v == null) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // ISO / YYYY-MM-DD
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // MM/DD/YYYY
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const d = new Date(s); // epoch ms or other parseable string
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
}

// Pull a value by any of several possible keys, incl. common GHL nestings.
function pick(body, keys) {
  const sources = [body, body?.customData, body?.customFields, body?.contact];
  for (const src of sources) {
    if (!src) continue;
    for (const k of keys) {
      if (src[k] != null && String(src[k]).trim() !== '') return src[k];
    }
  }
  return undefined;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Shared-secret gate: once BLOCK_DATES_TOKEN is set in Vercel, the GHL workflow
  // must include the matching token (?token=... or X-Webhook-Token header) so
  // random actors can't POST fake blocks to grey out the calendar.
  const requiredToken = process.env.BLOCK_DATES_TOKEN;
  if (requiredToken) {
    const provided = req.query.token || req.headers['x-webhook-token'];
    if (provided !== requiredToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!process.env.GHL_API_KEY) return res.status(500).json({ error: 'GHL API key not configured' });

  const body = req.body || {};
  const room = String(pick(body, ['room', 'accommodation']) || '').trim();
  const checkIn = normalizeDate(pick(body, ['checkIn', 'check_in']));
  const checkOut = normalizeDate(pick(body, ['checkOut', 'check_out']));
  const name = String(pick(body, ['name', 'full_name', 'fullName']) || '').trim();

  // Only block for a real private room with a valid forward date range.
  if (!VALID_ROOMS.includes(room) || !checkIn || !checkOut || checkOut <= checkIn) {
    return res.status(200).json({
      blocked: false,
      reason: 'No valid room/date range — nothing to block',
      parsed: { room, checkIn, checkOut }, // echoed so we can verify the payload during testing
    });
  }

  const title = `[${room}] ${name || 'Booking'}`.slice(0, 120);

  try {
    const ghl = await fetch(`${GHL_BASE}/calendars/events/block-slots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GHL_API_KEY}`,
        Version: '2021-04-15',
      },
      body: JSON.stringify({
        locationId: LOCATION_ID,
        calendarId: CALENDAR_ID,
        title,
        startTime: `${checkIn}T00:00:00+08:00`,
        endTime: `${checkOut}T00:00:00+08:00`,
      }),
    });

    const data = await ghl.json().catch(() => ({}));
    if (!ghl.ok) {
      console.error('block-slots create failed:', ghl.status, data);
      return res.status(502).json({ blocked: false, error: data.message || `GHL ${ghl.status}`, parsed: { room, checkIn, checkOut } });
    }

    return res.status(200).json({ blocked: true, eventId: data.id, title, checkIn, checkOut });
  } catch (error) {
    console.error('block-dates error:', error);
    return res.status(500).json({ blocked: false, error: error.message });
  }
}
