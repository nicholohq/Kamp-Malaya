// /api/ghl-webhook.js
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body;

    // Map your form fields to GHL custom field IDs
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
    
    // Standard fields (these use the field name as-is)
    const standardFields = ['full_name', 'email', 'phone'];
    
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

    // Send to GHL
    const response = await fetch('https://api.leadconnectorhq.com/widget/form/SQTfOzAK45gQEoeaKGYz', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ghlPayload)
    });

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
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}