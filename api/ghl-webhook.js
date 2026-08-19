// /api/ghl-webhook.js
//
// Proxies the Kamp Malaya booking form to the GoHighLevel v2 (LeadConnector) API.
// Endpoint:  POST https://services.leadconnectorhq.com/contacts/upsert
// Auth:      Bearer <Private Integration Token>  (Settings -> Private Integrations)
// Header:    Version: 2021-07-28  (required by the v2 API)
// Upsert de-duplicates on email/phone, so repeat inquiries update the same contact.

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_API = `${GHL_BASE}/contacts/upsert`;
const GHL_VERSION = '2021-07-28';
const LOCATION_ID = 'YBLbWASoQgsSEqY0V5KV';

// Tags added (additively) per booking type so a GHL workflow can trigger on
// "Contact Tag". Additive tagging fires reliably for BOTH new and returning
// contacts (unlike "Contact Created", which upsert skips for existing ones).
const BOOKING_TAGS = {
  'Private Stay': ['Booking Inquiry', 'Private Stay Inquiry'],
  'Joiner Tour':  ['Booking Inquiry', 'Joiner Tour Inquiry'],
};

// GHL custom-field IDs (verified against the live location's custom fields).
const CUSTOM_FIELDS = {
  booking_type:         'Hypk6oOYeW0d0Q7y1EPH',
  pax_count:            'cMUayvSNtZ1d80VvmySy',
  accommodation:        'UuYJj1y2YRo1A2c0v3lh',
  check_in:             'uuuPxVb2mfNcyuXy7a1S',
  check_out:            'geN5xXdqNSTOKv75CCWd',
  tour_date:            'XgOt9Jk9F26KuGbWjKNp',
  special_requests:     'ZqB9bwF0eYDSy8XrA1t2',
  dietary_restrictions: 'Vtrtrxab6IBSSvWhbTkP',
  source:               'PC38bar67FIYRsi0CIOS',
};

// Fields the form now sends that have no GHL custom field yet. Anything not in
// CUSTOM_FIELDS above is silently dropped, which is why the children count has
// never reached the CRM even though the form has always collected it.
//
// To promote one: create the custom field in GHL (Settings -> Custom Fields),
// copy its id, and move the entry into CUSTOM_FIELDS. Until then these travel
// as a note on the contact instead, so nothing is lost.
const UNMAPPED_FIELDS = {
  children_count:         'Children',
  children_ages:          "Children's ages",
  nights:                 'Nights',
  quoted_estimate:        'Estimate shown to guest',
  estimate_may_be_stale:  'Estimate caveat',
};

// fetch with an abort timeout (Vercel Hobby caps functions at 10s total).
async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.GHL_API_KEY) {
    return res.status(500).json({ success: false, error: 'GHL API key not configured' });
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
    'Version': GHL_VERSION,
  };

  try {
    if (!req.body || typeof req.body !== 'object' || Object.keys(req.body).length === 0) {
      return res.status(400).json({ success: false, error: 'Request body is empty or invalid' });
    }

    const data = req.body;

    // Split "Full Name" into first / last for the standard GHL name fields.
    const fullName = (data.full_name || '').trim();
    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts.shift() || '';
    const lastName = nameParts.join(' ');

    // Build the custom-field array, skipping empties so DATE / OPTION fields
    // never receive an empty value.
    const customFields = [];
    for (const [key, id] of Object.entries(CUSTOM_FIELDS)) {
      const value = data[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        customFields.push({ id, value });
      }
    }

    const contactPayload = {
      locationId: LOCATION_ID,
      firstName,
      lastName,
      name: fullName,
      email: data.email || '',
      phone: data.phone || '',
      source: data.source || 'Kamp Malaya Funnel',
      customFields,
      // NOTE: tags are intentionally NOT sent here — the upsert endpoint
      // OVERWRITES a contact's tags. They're added additively below instead.
    };

    // 1) Upsert the contact (6s of the 10s budget).
    const response = await fetchWithTimeout(GHL_API, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(contactPayload),
    }, 6000);

    // GHL should return JSON, but guard against an HTML error page.
    const raw = await response.text();
    let result;
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch {
      console.error('GHL non-JSON response:', response.status, raw.slice(0, 500));
      return res.status(502).json({
        success: false,
        error: `GHL returned a non-JSON response (status ${response.status})`,
      });
    }

    if (!response.ok) {
      console.error('GHL API error:', response.status, result);
      const msg = Array.isArray(result.message) ? result.message.join(', ') : result.message;
      return res.status(response.status === 401 ? 401 : 502).json({
        success: false,
        error: msg || `GHL API returned ${response.status}`,
      });
    }

    const contactId = result.contact?.id || null;

    // 2) Tag the contact and attach the estimator context, concurrently.
    //    Both are additive follow-ups to a contact that is already saved, so
    //    neither may fail the booking — and running them in sequence would
    //    exceed the 10s function budget (6s upsert + 3s + 3s).
    let tagsAdded = [];
    let noteAdded = false;

    const tags = BOOKING_TAGS[data.booking_type];

    const addTags = async () => {
      if (!contactId || !tags) return;
      const tagRes = await fetchWithTimeout(`${GHL_BASE}/contacts/${contactId}/tags`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ tags }),
      }, 3000);
      if (tagRes.ok) {
        const tagJson = await tagRes.json().catch(() => ({}));
        tagsAdded = tagJson.tags || tags;
      } else {
        console.error('GHL tag error:', tagRes.status, await tagRes.text().catch(() => ''));
      }
    };

    // Everything the form collects that has no custom field yet lands here, so
    // the team still sees the figure the guest was quoted.
    const addNote = async () => {
      const lines = [];
      for (const [key, label] of Object.entries(UNMAPPED_FIELDS)) {
        const value = data[key];
        if (value === undefined || value === null || String(value).trim() === '') continue;
        const shown = key === 'quoted_estimate'
          ? `PHP ${Number(value).toLocaleString('en-PH')}`
          : String(value);
        lines.push(`${label}: ${shown}`);
      }
      if (!contactId || !lines.length) return;

      const noteRes = await fetchWithTimeout(`${GHL_BASE}/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ body: `Trip estimator details\n${lines.join('\n')}` }),
      }, 3000);
      if (noteRes.ok) {
        noteAdded = true;
      } else {
        console.error('GHL note error:', noteRes.status, await noteRes.text().catch(() => ''));
      }
    };

    const settled = await Promise.allSettled([addTags(), addNote()]);
    settled.forEach(r => {
      if (r.status === 'rejected') {
        console.error('GHL follow-up failed:', r.reason?.name || r.reason?.message || r.reason);
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Booking submitted successfully',
      contactId,
      tagsAdded,
      noteAdded,
    });

  } catch (error) {
    console.error('Webhook error:', error);

    if (error.name === 'AbortError') {
      return res.status(504).json({
        success: false,
        error: 'GHL API timed out — please try again later',
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
