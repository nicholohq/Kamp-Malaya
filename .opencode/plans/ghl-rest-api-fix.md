# GHL REST API Fix Plan

## Root Cause

The webhook handler POSTs to `https://api.leadconnectorhq.com/widget/form/SQTfOzAK45gQEoeaKGYz` which is a **GHL widget/embed URL** — it returns an HTML page (the form widget itself), not JSON API data. When `response.json()` tries to parse HTML as JSON, it throws a SyntaxError.

## Fix

Replace the widget URL with GHL's **Contacts REST API** endpoint, passing the API key via `Authorization: Bearer` header.

---

## File Changes

### `api/ghl-webhook.js` — Full rewrite

Replace the entire file content with:

```js
// /api/ghl-webhook.js
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

    // Build contact payload for GHL Contacts API
    const contactPayload = {
      locationId: 'YBLbWASoQgsSEqY0V5KV',
      contactName: data.full_name || '',
      email: data.email || '',
      phone: data.phone || '',
      customFields: [
        { id: 'Hypk6o0YeW0d0Q7y1EPH', value: data.booking_type || '' },
        { id: 'cMUayvSNtZ1d80VvmySy', value: data.pax_count || '' },
        { id: 'UUYJjY2Yo1A2c0v3lh', value: data.accommodation || '' },
        { id: 'qkTonvqTT73KgTARRoP1', value: data.check_in || '' },
        { id: '7uXW4exTH1YEFKiW0ykX', value: data.check_out || '' },
        { id: 'XgOt9Jk9F26KuGbWjKNp', value: data.tour_date || '' },
        { id: 'ZqB9bwF0eYDSy8XrA1t2', value: data.special_requests || '' },
        { id: 'Vtrtrxab6IBSSvWhbTkP', value: data.dietary_restrictions || '' },
        { id: 'PC38bar67FIYRsioCIOS', value: data.source || '' },
      ]
    };

    // Send to GHL Contacts API with 8-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch('https://rest.gohighlevel.com/v1/contacts/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GHL_API_KEY}`
      },
      body: JSON.stringify(contactPayload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || `GHL API returned ${response.status}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Booking submitted successfully',
      contactId: result.contact?.id || result.id
    });

  } catch (error) {
    console.error('Webhook error:', error);

    if (error.name === 'AbortError') {
      return res.status(504).json({
        success: false,
        error: 'GHL API timed out — please try again later'
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
```

### Key Changes

| Before | After |
|--------|-------|
| POST to `api.leadconnectorhq.com/widget/form/...` | POST to `rest.gohighlevel.com/v1/contacts/` |
| No auth header | `Authorization: Bearer ${process.env.GHL_API_KEY}` |
| Wraps data in `formData`, `eventData` | Direct contact payload with `customFields` array |
| Ignores GHL API key (not needed) | Requires `GHL_API_KEY` env var |
| `response.json()` crashes on HTML | `response.json()` parses valid JSON API response |
| Returns `data: result` (GHL raw response) | Returns `contactId` from GHL response |

### No changes needed to:
- `src/funnel.js` — WEBHOOK_URL already points to `www.kampmalaya.tours/api/ghl-webhook`
- `vercel.json` — rewrites already removed
- `funnel.html` — no changes needed

## Testing Steps

1. **Verify env var is set** — deploy and check the handler doesn't return "GHL API key not configured"
2. **Submit the form** — fill out the form on `www.kampmalaya.tours/funnel.html` and submit
3. **Check GHL dashboard** — verify the contact was created with all custom field values
4. **Check browser console** — verify the success message appears
