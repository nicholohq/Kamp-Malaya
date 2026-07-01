// /api/ghl-webhook.js
//
// Proxies the Kamp Malaya booking form to the GoHighLevel v2 (LeadConnector) API.
// Endpoint:  POST https://services.leadconnectorhq.com/contacts/upsert
// Auth:      Bearer <Private Integration Token>  (Settings -> Private Integrations)
// Header:    Version: 2021-07-28  (required by the v2 API)
// Upsert de-duplicates on email/phone, so repeat inquiries update the same contact.

const GHL_API = 'https://services.leadconnectorhq.com/contacts/upsert';
const GHL_VERSION = '2021-07-28';
const LOCATION_ID = 'YBLbWASoQgsSEqY0V5KV';

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
    };

    // Send to GHL with an 8s timeout (Vercel Hobby has a 10s function limit).
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let response;
    try {
      response = await fetch(GHL_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
          'Version': GHL_VERSION,
        },
        body: JSON.stringify(contactPayload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

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

    return res.status(200).json({
      success: true,
      message: 'Booking submitted successfully',
      contactId: result.contact?.id || null,
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
