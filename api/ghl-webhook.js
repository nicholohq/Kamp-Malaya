// /api/ghl-webhook.js
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!req.body || typeof req.body !== 'object' || Object.keys(req.body).length === 0) {
      return res.status(400).json({ success: false, error: 'Request body is empty or invalid' });
    }

    const data = req.body;

    const GHL_FIELD_IDS = {
      'booking_type': 'Hypk6o0YeW0d0Q7y1EPH',
      'full_name': 'full_name',
      'email': 'email',
      'phone': 'phone',
      'pax_count': 'cMUayvSNtZ1d80VvmySy',
      'accommodation': 'UUYJjY2Yo1A2c0v3lh',
      'check_in': 'qkTonvqTT73KgTARRoP1',
      'check_out': '7uXW4exTH1YEFKiW0ykX',
      'tour_date': 'XgOt9Jk9F26KuGbWjKNp',
      'special_requests': 'ZqB9bwF0eYDSy8XrA1t2',
      'dietary_restrictions': 'Vtrtrxab6IBSSvWhbTkP',
      'source': 'PC38bar67FIYRsioCIOS'
    };

    // Build GHL payload
    const payload = {};
    
    Object.keys(data).forEach(key => {
      if (data[key] && data[key].trim() !== '') {
        const fieldId = GHL_FIELD_IDS[key];
        if (fieldId) {
          payload[fieldId] = data[key];
        }
      }
    });

    // Add required GHL metadata
    const ghlPayload = {
      formData: JSON.stringify(payload),
      locationId: 'YBLbWASoQgsSEqY0V5KV',
      formId: 'SQTfOzAK45gQEoeaKGYz',
      eventData: JSON.stringify({
        type: 'page-visit',
        pageVisitType: 'form',
        page: {
          url: req.headers.referer || 'https://kampmalaya.tours/funnel.html',
          title: 'Kamp Malaya Booking'
        }
      })
    };

    // Send to GHL with 8-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch('https://api.leadconnectorhq.com/widget/form/SQTfOzAK45gQEoeaKGYz', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ghlPayload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`GHL API returned ${response.status}`);
    }

    const result = await response.json();

    return res.status(200).json({
      success: true,
      message: 'Booking submitted successfully',
      data: result
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