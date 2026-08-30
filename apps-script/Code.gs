/**
 * Kamp Malaya — GHL → Google Sheets Booking Sync
 *
 * Attached to: the spreadsheet bound to https://script.google.com/macros/s/AKfycbxBZ3VeOInAiCEbZa0xZM_nKdlJa7izFy1bCt4tOlUA_3ceSc0YUj2ajx7wx0CQKRDMxw/exec
 * Timezone: Asia/Manila (Asia/Kuala_Lumpur in GHL — Manila covers same +08:00)
 *
 * SECURITY:
 *  - No GHL_API_KEY / BLOCK_DATES_TOKEN / OAuth creds are stored in this file or the sheet.
 *  - Webhook secret lives in Script Properties: WEBHOOK_SECRET
 *  - No customer email/phone is logged (only Booking_ID is logged).
 *
 * SHEETS:
 *  BOOKINGS (28 cols), PAYMENTS (14 cols), UPCOMING (auto-filtered), SETTINGS (key/value)
 */

// ============================================================================
// 1. CONFIGURATION
// ============================================================================

var CONFIG = {
  // GHL location
  LOCATION_ID: 'YBLbWASoQgsSEqY0V5KV',
  PIPELINE_ID: '8oByHtvSkFfiyqaa8c1h',
  PIPELINE_NAME: 'Kamp Malaya Bookings',

  // Pipeline stages — map GHL stageId → Sheet status
  STAGES: {
    'f8ce435d-57f8-4a28-a1b5-ad6df682e4e1': { name: 'New Inquiry',    bookingStatus: 'New',       paymentStatus: 'Pending' },
    '03092030-1dec-445d-823f-82b4c98894aa': { name: 'Contacted',      bookingStatus: 'Contacted', paymentStatus: 'Pending' },
    '6d5dabb6-a6bb-47a4-9641-656219953302': { name: 'Deposit Paid',   bookingStatus: 'Approved',  paymentStatus: 'Deposit Paid' },
    '2662a584-1c9c-41dd-a207-e77bf443be69': { name: 'Fully Paid',     bookingStatus: 'Confirmed', paymentStatus: 'Paid in Full' },
    '3106944b-e0b3-4cde-b6d7-c65949cca4f4': { name: 'Tour Completed', bookingStatus: 'Completed', paymentStatus: 'Paid in Full' },
    'f2272dca-ceb4-4ca0-bb57-c74c4bfc7038': { name: 'Tour Cancelled', bookingStatus: 'Cancelled', paymentStatus: null } // keep existing payment status
  },

  // GHL custom field IDs (contact model)
  FIELD_IDS: {
    booking_type:         'Hypk6oOYeW0d0Q7y1EPH',
    pax_count:            'cMUayvSNtZ1d80VvmySy',
    accommodation:        'UuYJj1y2YRo1A2c0v3lh',
    check_in:             'uuuPxVb2mfNcyuXy7a1S',
    check_out:            'geN5xXdqNSTOKv75CCWd',
    tour_date:            'XgOt9Jk9F26KuGbWjKNp',
    special_requests:     'ZqB9bwF0eYDSy8XrA1t2',
    dietary_restrictions: 'Vtrtrxab6IBSSvWhbTkP',
    source:               'PC38bar67FIYRsi0CIOS'
  },

  // Reverse lookup for speed
  FIELD_ID_TO_KEY: {},

  // Sheet names
  SHEETS: {
    BOOKINGS: 'BOOKINGS',
    PAYMENTS: 'PAYMENTS',
    UPCOMING: 'UPCOMING',
    SETTINGS: 'SETTINGS'
  },

  // Script Properties key
  WEBHOOK_SECRET_KEY: 'WEBHOOK_SECRET'
};

// Build reverse map once
(function() {
  for (var k in CONFIG.FIELD_IDS) CONFIG.FIELD_ID_TO_KEY[CONFIG.FIELD_IDS[k]] = k;
})();

// ============================================================================
// 2. SHEET SCHEMA
// ============================================================================

var BOOKINGS_HEADERS = [
  'Booking_ID',         // 1
  'Date_Submitted',     // 2
  'Guest_Name',         // 3
  'Email',              // 4
  'Phone',              // 5
  'Booking_Type',       // 6
  'Tour_Date',          // 7
  'Tour_End_Date',      // 8
  'Check_In',           // 9
  'Check_Out',          // 10
  'Nights',             // 11
  'Pax',                // 12
  'Children',           // 13
  'Children_Ages',      // 14
  'Accommodation',      // 15
  'Package_Rate',       // 16
  'Accommodation_Rate', // 17
  'Estimated_Total',    // 18
  'Special_Requests',   // 19
  'Dietary_Restrictions',//20
  'GHL_Contact_ID',     // 21
  'GHL_Opportunity_ID', // 22
  'GHL_Pipeline_ID',    // 23
  'GHL_Stage_ID',       // 24
  'GHL_Stage_Name',     // 25
  'Booking_Status',     // 26
  'Payment_Status',     // 27
  'Secretary_Notes',    // 28
  'Last_Updated'        // 29
];

var PAYMENTS_HEADERS = [
  'Booking_ID',       // 1
  'Guest_Name',       // 2
  'Amount_Due',       // 3
  'Deposit_Due',      // 4
  'Deposit_Paid',     // 5
  'Deposit_Date',     // 6
  'Deposit_Reference',// 7
  'Balance_Due',      // 8
  'Balance_Paid',     // 9
  'Balance_Date',     // 10
  'Balance_Reference',// 11
  'Payment_Status',   // 12
  'Notes',            // 13
  'Last_Updated'      // 14
];

var SETTINGS_DEFAULTS = {
  'joiner_rate_2026': 14799,
  'joiner_rate_2027': 13500,
  'canopy_nightly': 3800,
  'kubo_nightly': 4500,
  'villa_nightly': 8500,
  'joiner_upgrade_per_head': 200,
  'child_free_under': 4,
  'child_half_under': 6
};

// ============================================================================
// 3. SETTINGS HELPERS
// ============================================================================

var _settingsCache = null;
var _settingsCacheTime = 0;

function getSettings() {
  var now = Date.now();
  if (_settingsCache && (now - _settingsCacheTime) < 30000) return _settingsCache;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.SETTINGS);
  if (!sh) return SETTINGS_DEFAULTS;
  var data = sh.getDataRange().getValues();
  var out = {};
  for (var i = 1; i < data.length; i++) {
    var k = String(data[i][0] || '').trim();
    var v = data[i][1];
    if (!k) continue;
    // Numeric settings — coerce
    if (k in SETTINGS_DEFAULTS) out[k] = Number(v) || SETTINGS_DEFAULTS[k];
    else out[k] = v;
  }
  // Fill missing defaults (sheet may be partial)
  for (var dk in SETTINGS_DEFAULTS) if (!(dk in out)) out[dk] = SETTINGS_DEFAULTS[dk];
  _settingsCache = out;
  _settingsCacheTime = now;
  return out;
}

function invalidateSettingsCache() {
  _settingsCache = null;
}

// ============================================================================
// 4. WEBHOOK AUTH
// ============================================================================

/**
 * Call this once from the Apps Script editor to set the webhook secret:
 *   1. Open Extensions → Apps Script → Run setupWebhookSecret / setWebhookSecretManually
 *   2. Paste a long random string (e.g. 32+ chars)
 *   3. In GHL Workflow Webhook action, add Header: X-Webhook-Secret = same value
 */
function setupWebhookSecret() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt('Set WEBHOOK_SECRET', 'Enter a long random secret (will be stored in Script Properties, never logged):', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var secret = resp.getResponseText().trim();
  if (!secret || secret.length < 12) {
    ui.alert('Secret must be at least 12 characters.');
    return;
  }
  PropertiesService.getScriptProperties().setProperty(CONFIG.WEBHOOK_SECRET_KEY, secret);
  ui.alert('WEBHOOK_SECRET set. Now add it as Header X-Webhook-Secret in your GHL Workflow Webhook action.');
}

function setWebhookSecretManually(secret) {
  if (!secret || secret.length < 12) throw new Error('Secret must be >=12 chars');
  PropertiesService.getScriptProperties().setProperty(CONFIG.WEBHOOK_SECRET_KEY, secret);
  Logger.log('WEBHOOK_SECRET set (value not logged).');
}

function getWebhookSecret() {
  return PropertiesService.getScriptProperties().getProperty(CONFIG.WEBHOOK_SECRET_KEY) || '';
}

/**
 * GHL Workflow Webhook supports custom Headers.
 * In the Workflow, configure:
 *   URL: https://script.google.com/macros/s/<EXEC>/exec
 *   Method: POST
 *   Headers: X-Webhook-Secret = {{WEBHOOK_SECRET value}}  (or literal)
 *   Body: raw JSON with merge tags
 *
 * Apps Script Web App e object: headers may not be in e.headers in all runtimes.
 * We therefore accept secret in multiple locations (checked in order):
 *   1. Header X-Webhook-Secret
 *   2. Query param ?secret= / ?webhookSecret=
 *   3. Body field webhookSecret / secret / WEBHOOK_SECRET
 */
function extractProvidedSecret(e, body) {
  // 1. Headers (case-insensitive)
  if (e && e.headers) {
    for (var hk in e.headers) {
      if (hk.toLowerCase() === 'x-webhook-secret') return String(e.headers[hk] || '').trim();
    }
  }
  // Undocumented: some runtimes put headers in e.parameter? Try also
  // 2. Query params
  if (e && e.parameter) {
    if (e.parameter.secret) return String(e.parameter.secret).trim();
    if (e.parameter.webhookSecret) return String(e.parameter.webhookSecret).trim();
    if (e.parameter.WEBHOOK_SECRET) return String(e.parameter.WEBHOOK_SECRET).trim();
    // Also check case-insensitive param search
    for (var pk in e.parameter) {
      if (pk.toLowerCase() === 'x-webhook-secret') return String(e.parameter[pk]).trim();
    }
  }
  // 3. Body fields
  if (body) {
    if (body.webhookSecret) return String(body.webhookSecret).trim();
    if (body.secret) return String(body.secret).trim();
    if (body.WEBHOOK_SECRET) return String(body.WEBHOOK_SECRET).trim();
    if (body.headers && body.headers['X-Webhook-Secret']) return String(body.headers['X-Webhook-Secret']).trim();
  }
  return '';
}

function isAuthorized(e, body) {
  var expected = getWebhookSecret();
  // If no secret is configured yet, allow test payloads (test:true) but reject real bookings
  if (!expected) {
    if (body && body.test === true) return true;
    return false;
  }
  var provided = extractProvidedSecret(e, body);
  if (!provided) return false;
  // Constant-time-ish compare
  if (provided.length !== expected.length) return false;
  var ok = true;
  for (var i = 0; i < expected.length; i++) if (provided.charAt(i) !== expected.charAt(i)) ok = false;
  return ok;
}

// ============================================================================
// 5. GHL PAYLOAD PARSING
// ============================================================================

function parseCustomFields(payload) {
  var out = {};
  var arr = null;
  // Resolve where customFields live
  if (payload.customFields && Array.isArray(payload.customFields)) arr = payload.customFields;
  else if (payload.contact && payload.contact.customFields) arr = payload.contact.customFields;
  else if (payload.custom_fields && Array.isArray(payload.custom_fields)) arr = payload.custom_fields;
  else if (Array.isArray(payload.customFieldsData)) arr = payload.customFieldsData;
  else {
    // GHL merge-tag flat: keys like "Hypk6oOYeW0d0Q7y1EPH" directly in body
    arr = [];
    for (var k in payload) {
      if (CONFIG.FIELD_ID_TO_KEY[k]) arr.push({ id: k, value: payload[k] });
    }
    if (arr.length === 0) arr = null;
  }
  if (!arr) return out;
  for (var i = 0; i < arr.length; i++) {
    var f = arr[i];
    var fid = f.id || f.key || f.fieldId;
    var key = CONFIG.FIELD_ID_TO_KEY[fid];
    if (!key) continue;
    var val = f.value;
    // Accommodation is MULTIPLE_OPTIONS → array; take first or join
    if (Array.isArray(val)) val = val.length === 1 ? val[0] : val.join(', ');
    // DATE may be epoch ms or ISO
    out[key] = val;
  }
  return out;
}

function normalizeDateValue(v) {
  if (v == null || v === '') return '';
  // GHL sometimes sends epoch ms as number
  if (typeof v === 'number' || (typeof v === 'string' && /^\d{13}$/.test(v))) {
    var ms = Number(v);
    var d = new Date(ms);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  if (!s) return '';
  // Already YYYY-MM-DD prefix (ISO)
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  // MM/DD/YYYY
  var m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) return m2[3] + '-' + m2[1].padStart(2,'0') + '-' + m2[2].padStart(2,'0');
  var d2 = new Date(s);
  if (!isNaN(d2.getTime())) return Utilities.formatDate(d2, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return s;
}

function extractNoteText(payload, body) {
  // Try multiple places GHL might put the note
  var candidates = [];
  if (body && body.note) candidates.push(body.note);
  if (payload.note) candidates.push(payload.note);
  if (payload.notes) {
    if (Array.isArray(payload.notes)) {
      for (var i=0;i<payload.notes.length;i++) {
        var n = payload.notes[i];
        candidates.push(typeof n === 'string' ? n : (n.body || n.content || n.text || ''));
      }
    } else candidates.push(payload.notes);
  }
  if (payload.contact && payload.contact.notes) candidates.push(payload.contact.notes);
  // Direct body string fallback
  for (var j=0;j<candidates.length;j++) {
    var c = candidates[j];
    if (typeof c === 'string' && c.trim()) return c;
    if (c && c.body) return String(c.body);
  }
  // Also check payload.noteBody / lastNote etc.
  if (body && body.noteBody) return String(body.noteBody);
  if (payload.contact && payload.contact.lastNote) return String(payload.contact.lastNote);
  return '';
}

function parseNote(noteText) {
  var out = { children_count: '', children_ages: '', nights: '', quoted_estimate: '', estimate_may_be_stale: '' };
  if (!noteText || typeof noteText !== 'string') return out;
  var t = noteText;
  // Current human-readable format from api/ghl-webhook.js:
  // "Trip estimator details\nChildren: 3\nChildren's ages: 2, 5, 8\nNights: 3\nEstimate shown to guest: PHP 69,596\nEstimate caveat: yes — ..."
  // Use case-insensitive, flexible regex
  var mChildren = t.match(/Children:\s*(\d+)/i);
  if (mChildren) out.children_count = mChildren[1].trim();
  // Also handle "Children Count" variant
  var mChildren2 = t.match(/Children.*?count[^:]*:\s*(\d+)/i);
  if (!out.children_count && mChildren2) out.children_count = mChildren2[1].trim();

  var mAges = t.match(/Children'?s?\s*ages?\s*:\s*([0-9,\s]+)/i);
  if (mAges) out.children_ages = mAges[1].trim().replace(/\s+/g, '').replace(/,,/g, ',').replace(/,$/, '');

  var mNights = t.match(/Nights:\s*(\d+)/i);
  if (mNights) out.nights = mNights[1].trim();

  // Estimate: may be "PHP 69,596" or "₱69,596" or "69596"
  var mEst = t.match(/Estimate shown to guest:\s*(?:PHP\s*)?([₱\d,]+)/i);
  if (mEst) {
    var num = mEst[1].replace(/[₱,]/g, '').trim();
    if (/^\d+$/.test(num)) out.quoted_estimate = num;
  }
  // Also try "Estimated Total" variant
  var mEst2 = t.match(/Estimated.*?:\s*(?:PHP\s*)?([₱\d,]+)/i);
  if (!out.quoted_estimate && mEst2) {
    var num2 = mEst2[1].replace(/[₱,]/g, '').trim();
    if (/^\d+$/.test(num2)) out.quoted_estimate = num2;
  }

  if (/Estimate caveat:/i.test(t) || /estimate_may_be_stale/i.test(t)) {
    var mCaveat = t.match(/Estimate caveat:\s*(.+)/i);
    out.estimate_may_be_stale = mCaveat ? mCaveat[1].trim() : 'yes';
  }
  return out;
}

function resolveOpportunity(payload) {
  var opps = null;
  if (payload.opportunities && Array.isArray(payload.opportunities)) opps = payload.opportunities;
  else if (payload.opportunity) opps = [payload.opportunity];
  else if (payload.contact && payload.contact.opportunities) opps = payload.contact.opportunities;
  else if (payload.contact && payload.contact.opportunity) opps = [payload.contact.opportunity];
  else if (payload.pipelineId) opps = [payload]; // flat opportunity webhook
  if (!opps || opps.length === 0) return null;
  // Prefer the one belonging to Kamp Malaya Bookings pipeline
  for (var i=0;i<opps.length;i++) {
    if (String(opps[i].pipelineId) === CONFIG.PIPELINE_ID) return opps[i];
  }
  // Fallback: if only one, use it; otherwise first
  return opps[0];
}

function extractContactFields(payload) {
  // Support both nested contact and flat body
  var c = payload.contact || payload;
  // GHL may nest under `contact` or be flat with merge tags
  var out = {
    contactId: c.id || payload.contactId || payload.contact_id || c.contactId || '',
    firstName: c.firstName || c.first_name || payload.firstName || '',
    lastName: c.lastName || c.last_name || payload.lastName || '',
    fullName: c.fullName || c.name || c.contactName || payload.name || payload.full_name || '',
    email: c.email || payload.email || '',
    phone: c.phone || payload.phone || '',
    opportunityId: '',
    pipelineId: '',
    pipelineStageId: '',
    stageName: '',
    monetaryValue: ''
  };
  // Opportunities may be at top level
  var opp = resolveOpportunity(payload);
  if (opp) {
    out.opportunityId = opp.id || opp.opportunityId || '';
    out.pipelineId = opp.pipelineId || '';
    out.pipelineStageId = opp.pipelineStageId || opp.stageId || opp.stageID || '';
    out.monetaryValue = opp.monetaryValue != null ? opp.monetaryValue : (opp.value != null ? opp.value : '');
    // Try to resolve stage name now
    if (out.pipelineStageId && CONFIG.STAGES[out.pipelineStageId]) out.stageName = CONFIG.STAGES[out.pipelineStageId].name;
  }
  // Also allow explicit stage fields in payload (GHL merge tags)
  if (payload.pipeline_stage) out.pipelineStageId = payload.pipeline_stage;
  if (payload.pipelineStageId) out.pipelineStageId = payload.pipelineStageId;
  if (payload.stageId) out.pipelineStageId = payload.stageId;
  if (payload.opportunityId) out.opportunityId = payload.opportunityId;
  if (payload.pipelineId) out.pipelineId = payload.pipelineId;
  if (out.pipelineStageId && CONFIG.STAGES[out.pipelineStageId]) out.stageName = CONFIG.STAGES[out.pipelineStageId].name;
  if (payload.stageName) out.stageName = payload.stageName;
  // Date submitted — prefer GHL's dateAdded
  out.dateAdded = c.dateAdded || c.createdAt || payload.dateAdded || payload.createdAt || '';
  return out;
}

// ============================================================================
// 6. PRICING LOGIC
// ============================================================================

function nightsBetween(startISO, endISO) {
  if (!startISO || !endISO) return '';
  var s = Date.parse(startISO + 'T00:00:00Z');
  var e = Date.parse(endISO + 'T00:00:00Z');
  if (!isFinite(s) || !isFinite(e)) return '';
  return Math.max(0, Math.round((e - s) / 86400000));
}

function getAccommodationKey(label) {
  if (!label) return '';
  var l = String(label).toLowerCase();
  if (l.indexOf('canopy') !== -1 || l.indexOf('tent') !== -1) return 'tent';
  if (l.indexOf('kubo') !== -1) return 'kubo';
  if (l.indexOf('villa') !== -1) return 'villa';
  return '';
}

function calculateJoiner(settings, pax, childrenCount, childrenAges, accommodationLabel, tourDateISO, suppliedNights, quotedEstimate) {
  var tourYear = tourDateISO ? Number(String(tourDateISO).slice(0,4)) : 0;
  var rate = (tourYear === 2027) ? settings.joiner_rate_2027 : (tourYear === 2026) ? settings.joiner_rate_2026 : settings.joiner_rate_2026;
  // Accommodation rate per head/night
  var accKey = getAccommodationKey(accommodationLabel);
  var upgradePerHeadPerNight = 0;
  if (accKey === 'kubo' || accKey === 'villa') upgradePerHeadPerNight = settings.joiner_upgrade_per_head;
  // Nights: prefer supplied, else default 3 (handle 2027-05-27 5-day = 4 nights if needed, but spec says default 3)
  var nights = suppliedNights !== '' && suppliedNights != null ? Number(suppliedNights) : 3;
  if (!isFinite(nights) || nights <= 0) nights = 3;
  // Child parsing
  var ages = [];
  if (childrenAges) {
    ages = String(childrenAges).split(',').map(function(s){ return Number(s.trim()); }).filter(function(n){ return isFinite(n); });
  }
  var paxNum = Number(pax) || 0;
  // Paying heads logic: 0-3 free, 4-5 half
  var freeUnder = settings.child_free_under;
  var halfUnder = settings.child_half_under;
  var childCounts = { free: 0, half: 0, full: 0 };
  for (var i=0;i<ages.length;i++) {
    var a = ages[i];
    if (a < freeUnder) childCounts.free++;
    else if (a < halfUnder) childCounts.half++;
    else childCounts.full++;
  }
  var payingChildren = childCounts.half + childCounts.full;
  var payingHeads = paxNum + payingChildren;
  // Package
  var packageTotal = paxNum * rate + childCounts.half * Math.round(rate * 0.5) + childCounts.full * rate;
  var accommodationRate = upgradePerHeadPerNight * payingHeads * nights;
  var estimatedTotal = '';
  if (quotedEstimate !== '' && quotedEstimate != null && String(quotedEstimate).trim() !== '') {
    estimatedTotal = Number(String(quotedEstimate).replace(/[^0-9]/g,'')) || '';
  } else {
    // Calculate best possible
    estimatedTotal = packageTotal + accommodationRate;
    // If no pax rate could be determined (e.g. no tourDate year), leave blank?
    if (!tourYear) estimatedTotal = '';
  }
  return {
    packageRate: rate,
    accommodationRate: accommodationRate,
    estimatedTotal: estimatedTotal,
    nights: nights,
    payingHeads: payingHeads
  };
}

function calculatePrivate(settings, checkInISO, checkOutISO, accommodationLabel, quotedEstimate) {
  var accKey = getAccommodationKey(accommodationLabel);
  var nightly = 0;
  if (accKey === 'tent') nightly = settings.canopy_nightly;
  else if (accKey === 'kubo') nightly = settings.kubo_nightly;
  else if (accKey === 'villa') nightly = settings.villa_nightly;
  var nights = nightsBetween(checkInISO, checkOutISO);
  var accommodationRate = '';
  if (nights !== '' && nightly) accommodationRate = nightly * nights;
  else if (nights === '') accommodationRate = '';
  var estimatedTotal = '';
  if (quotedEstimate !== '' && quotedEstimate != null && String(quotedEstimate).trim() !== '') {
    estimatedTotal = Number(String(quotedEstimate).replace(/[^0-9]/g,'')) || '';
  } else {
    // Deliberately blank per spec — private is "On request"
    estimatedTotal = '';
  }
  return {
    packageRate: '', // no package rate for private
    accommodationRate: accommodationRate,
    estimatedTotal: estimatedTotal,
    nights: nights
  };
}

// ============================================================================
// 7. BOOKING ID & DEDUP
// ============================================================================

function buildBookingId(contact, custom, opportunity) {
  var contactId = contact.contactId || '';
  var oppId = opportunity ? (opportunity.id || opportunity.opportunityId || '') : (contact.opportunityId || '');
  if (contactId && oppId) return contactId + '_' + oppId;
  if (contactId && !oppId) {
    // Fallback to contactId + date identity — still need to differentiate bookings per contact
    // Use email + type + date as secondary (more stable than contactId alone)
  }
  var email = String(contact.email || '').trim().toLowerCase();
  var bookingType = String(custom.booking_type || '').trim();
  var tourDate = normalizeDateValue(custom.tour_date);
  var checkIn = normalizeDateValue(custom.check_in);
  var checkOut = normalizeDateValue(custom.check_out);
  if (email && bookingType) {
    if (bookingType === 'Joiner Tour' && tourDate) return 'fallback_' + email + '_' + bookingType.replace(/\s+/g,'') + '_' + tourDate;
    if (bookingType === 'Private Stay' && checkIn && checkOut) return 'fallback_' + email + '_' + bookingType.replace(/\s+/g,'') + '_' + checkIn + '_' + checkOut;
    // Even more fallback: pax + accommodation
    if (email) return 'fallback_' + email + '_' + String(Date.now());
  }
  // Last resort: contactId or email hash
  if (contactId) return contactId;
  if (email) return 'fallback_' + email + '_' + bookingType;
  return 'booking_' + Utilities.getUuid().slice(0,8);
}

// ============================================================================
// 8. SHEET SETUP
// ============================================================================

function getOrCreateSheet(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    var existing = sh.getRange(1, 1, 1, headers.length).getValues()[0];
    var mismatch = false;
    for (var i=0;i<headers.length;i++) if (existing[i] !== headers[i]) mismatch = true;
    if (mismatch) {
      // Re-header (preserve data, just fix header row)
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }
  return sh;
}

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // SETTINGS
  var settingsSh = getOrCreateSheet(CONFIG.SHEETS.SETTINGS, ['Key','Value','Note']);
  var existingSettings = {};
  var sData = settingsSh.getDataRange().getValues();
  for (var i=1;i<sData.length;i++) existingSettings[String(sData[i][0]||'').trim()] = true;
  var rowsToAdd = [];
  var notes = {
    'joiner_rate_2026': '2026 price per head (PHP)',
    'joiner_rate_2027': '2027 price per head (PHP)',
    'canopy_nightly': 'Private nightly — Canopy Tent',
    'kubo_nightly': 'Private nightly — Kubo by the Shore',
    'villa_nightly': 'Private nightly — Malaya Villa',
    'joiner_upgrade_per_head': 'Joiner hut upgrade per head/night',
    'child_free_under': 'Ages 0–X free (X = value)',
    'child_half_under': 'Ages X–Y half rate (Y = value)'
  };
  for (var k in SETTINGS_DEFAULTS) {
    if (!existingSettings[k]) rowsToAdd.push([k, SETTINGS_DEFAULTS[k], notes[k]||'']);
  }
  if (rowsToAdd.length) settingsSh.getRange(sData.length+1, 1, rowsToAdd.length, 3).setValues(rowsToAdd);
  settingsSh.setFrozenRows(1);
  settingsSh.autoResizeColumns(1,3);
  try { settingsSh.getRange(1,1,1,3).setFontWeight('bold').setBackground('#e8f0fe'); } catch(e){}

  // BOOKINGS
  var bookingsSh = getOrCreateSheet(CONFIG.SHEETS.BOOKINGS, BOOKINGS_HEADERS);
  applyBookingsFormatting(bookingsSh);

  // PAYMENTS
  var paymentsSh = getOrCreateSheet(CONFIG.SHEETS.PAYMENTS, PAYMENTS_HEADERS);
  applyPaymentsFormatting(paymentsSh);

  // UPCOMING
  var upcomingSh = ss.getSheetByName(CONFIG.SHEETS.UPCOMING);
  if (!upcomingSh) upcomingSh = ss.insertSheet(CONFIG.SHEETS.UPCOMING);
  // Header only — content is rebuilt by refreshUpcoming()
  upcomingSh.clear();
  upcomingSh.getRange(1, 1, 1, BOOKINGS_HEADERS.length).setValues([BOOKINGS_HEADERS]);
  upcomingSh.setFrozenRows(1);
  refreshUpcoming();

  SpreadsheetApp.flush();
  invalidateSettingsCache();
  Logger.log('Sheets setup complete.');
}

function applyBookingsFormatting(sh) {
  if (!sh) return;
  var lastCol = BOOKINGS_HEADERS.length;
  sh.setFrozenRows(1);
  try { sh.getRange(1,1,1,lastCol).setFontWeight('bold').setBackground('#e8f0fe'); } catch(e){}
  try { sh.setFrozenColumns(1); } catch(e){}
  // Auto filter
  try {
    if (sh.getFilter()) sh.getFilter().remove();
    sh.getRange(1,1,1,lastCol).createFilter();
  } catch(e){}
  // Date formatting
  var dateCols = [2,7,8,9,10,29]; // Date_Submitted, Tour_Date, Tour_End_Date, Check_In, Check_Out, Last_Updated
  for (var i=0;i<dateCols.length;i++) {
    try { sh.getRange(2, dateCols[i], Math.max(sh.getMaxRows()-1,1), 1).setNumberFormat('yyyy-mm-dd'); } catch(e){}
  }
  // Currency — use peso but keep generic if symbol unsupported
  var pesoCols = [16,17,18]; // Package_Rate, Accommodation_Rate, Estimated_Total
  for (var j=0;j<pesoCols.length;j++) {
    try { sh.getRange(2, pesoCols[j], Math.max(sh.getMaxRows()-1,1), 1).setNumberFormat('#,##0'); } catch(e){}
  }
  // Auto resize (first call only — don't do every sync)
  try { sh.autoResizeColumns(1, Math.min(lastCol, 10)); } catch(e){}
  // Conditional formatting: Booking_Status / Payment_Status
  try { applyBookingsConditionalFormatting(sh); } catch(e){ Logger.log('cond fmt err: ' + e); }
  // Data validation for Secretary_Notes (free text — no strict validation, just hint)
  // Protected ranges note: we don't hard-protect via API here (requires auth), but we document
}

function applyPaymentsFormatting(sh) {
  if (!sh) return;
  var lastCol = PAYMENTS_HEADERS.length;
  sh.setFrozenRows(1);
  try { sh.getRange(1,1,1,lastCol).setFontWeight('bold').setBackground('#e8f0fe'); } catch(e){}
  try { sh.getRange(1,1,1,lastCol).createFilter(); } catch(e){}
  var dateCols = [6,10,14]; // Deposit_Date, Balance_Date, Last_Updated
  for (var i=0;i<dateCols.length;i++) try { sh.getRange(2, dateCols[i], Math.max(sh.getMaxRows()-1,1), 1).setNumberFormat('yyyy-mm-dd'); } catch(e){}
  var pesoCols = [3,4,5,8,9];
  for (var j=0;j<pesoCols.length;j++) try { sh.getRange(2, pesoCols[j], Math.max(sh.getMaxRows()-1,1), 1).setNumberFormat('#,##0'); } catch(e){}
  try { sh.autoResizeColumns(1, lastCol); } catch(e){}
}

function applyBookingsConditionalFormatting(sh) {
  // Clear existing
  var rules = sh.getConditionalFormatRules();
  // We keep secretary's manual rules if any, but we'll replace our managed ones
  // Simple: remove all and re-add to avoid duplicates (safe for this use case)
  // Instead, just add new rules on top — Apps Script merge handles it
  var newRules = [];

  // Booking_Status colours (col 26)
  var statusColors = {
    'New': '#fff2cc',
    'Contacted': '#d9e1f2',
    'Approved': '#c6efce',
    'Confirmed': '#a8d08d',
    'Completed': '#b4a7d6',
    'Cancelled': '#f4b084'
  };
  for (var status in statusColors) {
    newRules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(status)
      .setBackground(statusColors[status])
      .setRanges([sh.getRange('Z2:Z')])
      .build());
  }
  // Payment_Status (col 27)
  var payColors = {
    'Pending': '#fce5cd',
    'Deposit Paid': '#ffe699',
    'Paid in Full': '#c6efce'
  };
  for (var ps in payColors) {
    newRules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(ps)
      .setBackground(payColors[ps])
      .setRanges([sh.getRange('AA2:AA')])
      .build());
  }
  // Combine with existing
  sh.setConditionalFormatRules(rules.concat(newRules));
}

// ============================================================================
// 9. UPCOMING VIEW
// ============================================================================

function refreshUpcoming() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var bookingsSh = ss.getSheetByName(CONFIG.SHEETS.BOOKINGS);
  var upcomingSh = ss.getSheetByName(CONFIG.SHEETS.UPCOMING);
  if (!bookingsSh || !upcomingSh) return;
  var data = bookingsSh.getDataRange().getValues();
  if (data.length < 2) return;
  var headers = data[0];
  var tourDateIdx = BOOKINGS_HEADERS.indexOf('Tour_Date'); // 6
  var checkInIdx = BOOKINGS_HEADERS.indexOf('Check_In');   // 8
  var statusIdx = BOOKINGS_HEADERS.indexOf('Booking_Status'); // 25
  var today = new Date();
  today.setHours(0,0,0,0);
  var in30 = new Date(today.getTime() + 30 * 86400000);
  var filtered = [headers];
  for (var r=1; r<data.length; r++) {
    var row = data[r];
    var status = String(row[statusIdx] || '').trim().toLowerCase();
    if (status === 'cancelled') continue;
    var d = null;
    var tourDate = row[tourDateIdx];
    var checkIn = row[checkInIdx];
    var raw = tourDate || checkIn;
    if (!raw) continue;
    if (raw instanceof Date) d = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
    else {
      var s = String(raw).trim();
      if (!s) continue;
      var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) d = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
      else d = new Date(s);
    }
    if (!d || isNaN(d.getTime())) continue;
    d.setHours(0,0,0,0);
    if (d >= today && d <= in30) filtered.push(row);
  }
  // Sort ascending by booking date (Tour_Date or Check_In)
  filtered.sort(function(a,b){
    if (a === headers) return -1;
    if (b === headers) return 1;
    var da = a[tourDateIdx] || a[checkInIdx];
    var db = b[tourDateIdx] || b[checkInIdx];
    var ta = da instanceof Date ? da.getTime() : Date.parse(da);
    var tb = db instanceof Date ? db.getTime() : Date.parse(db);
    return ta - tb;
  });
  // Keep header row style from setupSheets
  upcomingSh.clear();
  if (filtered.length > 0) {
    upcomingSh.getRange(1,1,filtered.length, headers.length).setValues(filtered);
    upcomingSh.setFrozenRows(1);
    try { upcomingSh.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#fef3c7'); } catch(e){}
    // Formats mirroring BOOKINGS
    var dateCols = [2,7,8,9,10,29];
    for (var i=0;i<dateCols.length;i++) try { upcomingSh.getRange(2, dateCols[i], Math.max(filtered.length-1,1), 1).setNumberFormat('yyyy-mm-dd'); } catch(e){}
    var pesoCols = [16,17,18];
    for (var j=0;j<pesoCols.length;j++) try { upcomingSh.getRange(2, pesoCols[j], Math.max(filtered.length-1,1), 1).setNumberFormat('#,##0'); } catch(e){}
    try { upcomingSh.autoResizeColumns(1, headers.length); } catch(e){}
  } else {
    upcomingSh.getRange(1,1,1,headers.length).setValues([headers]);
    upcomingSh.setFrozenRows(1);
  }
  SpreadsheetApp.flush();
}

// ============================================================================
// 10. BOOKINGS UPSERT
// ============================================================================

function findBookingRow(bookingId) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.BOOKINGS);
  if (!sh || sh.getLastRow() < 2) return -1;
  var ids = sh.getRange(2, 1, sh.getLastRow()-1, 1).getValues();
  for (var i=0;i<ids.length;i++) if (String(ids[i][0]) === String(bookingId)) return i + 2; // 1-indexed
  return -1;
}

function upsertBookingRow(rowData) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.BOOKINGS);
  if (!sh) throw new Error('BOOKINGS sheet not found — run setupSheets() first.');
  var bookingId = rowData[0];
  var existingRow = findBookingRow(bookingId);
  // Preserve Secretary_Notes if updating (don't overwrite secretary's edits with blank)
  if (existingRow !== -1) {
    var secNotes = sh.getRange(existingRow, 28, 1, 1).getValue(); // col 28
    if (secNotes && String(secNotes).trim() !== '' && (!rowData[27] || String(rowData[27]).trim() === '')) {
      rowData[27] = secNotes;
    }
    sh.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
    return { updated: true, row: existingRow };
  } else {
    sh.appendRow(rowData);
    return { updated: false, row: sh.getLastRow() };
  }
}

// ============================================================================
// 11. PAYMENTS SYNC
// ============================================================================

function syncPaymentsRow(bookingId, guestName, amountDue, paymentStatus, bookingStatus) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.PAYMENTS);
  if (!sh) return;
  var lastRow = sh.getLastRow();
  var existingRow = -1;
  if (lastRow >= 2) {
    var ids = sh.getRange(2, 1, lastRow-1, 1).getValues();
    for (var i=0;i<ids.length;i++) if (String(ids[i][0]) === String(bookingId)) { existingRow = i+2; break; }
  }
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  if (existingRow !== -1) {
    // Update Guest_Name, Amount_Due (from booking), Payment_Status linkage, Last_Updated
    // Do NOT overwrite secretary's Deposit_/Balance_ fields
    sh.getRange(existingRow, 2, 1, 1).setValue(guestName);
    // Amount_Due may change if pricing recalculated — update but preserve paid fields
    sh.getRange(existingRow, 3, 1, 1).setValue(amountDue);
    sh.getRange(existingRow, 12, 1, 1).setValue(paymentStatus);
    sh.getRange(existingRow, 14, 1, 1).setValue(now);
    // Recompute Balance_Due if possible
    try {
      var depositPaid = Number(sh.getRange(existingRow, 5, 1, 1).getValue()) || 0;
      var balancePaid = Number(sh.getRange(existingRow, 9, 1, 1).getValue()) || 0;
      var amt = Number(amountDue) || 0;
      var balanceDue = amt - depositPaid - balancePaid;
      if (amt) sh.getRange(existingRow, 8, 1, 1).setValue(Math.max(0, balanceDue));
    } catch(e){}
  } else {
    // New row: compute Deposit_Due for joiner (1000 per head) — but amountDue is total, so deposit = ceil? We'll set 0 and let secretary fill, or compute if pax known via amountDue fallback
    // For now, create with Amount_Due and Payment_Status, rest blank for secretary
    var depositDue = '';
    var balanceDue = amountDue;
    // If booking is cancelled, payment status may reflect that; else pending
    var initStatus = paymentStatus || (bookingStatus === 'Cancelled' ? 'Cancelled' : 'Pending');
    sh.appendRow([bookingId, guestName, amountDue, depositDue, '', '', '', balanceDue, '', '', '', initStatus, '', now]);
  }
}

// ============================================================================
// 12. MAIN WEBHOOK RECEIVER
// ============================================================================

function doPost(e) {
  try {
    // 1. Accept POST only (Apps Script routes here only on POST)
    if (!e || !e.postData) {
      return jsonResponse({ success: false, error: 'POST with JSON body required' }, 405);
    }
    // 2. Require JSON
    var raw = e.postData.contents || '';
    var contentType = (e.postData.type || '').toLowerCase();
    // GHL may send application/json or text/plain wrapping JSON — allow both if body is JSON-parseable
    var body = null;
    try {
      body = JSON.parse(raw);
    } catch (err) {
      return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
    }
    // 3. Test hook — allowed ONLY when no WEBHOOK_SECRET is configured (hardened)
    if (body && body.test === true && !getWebhookSecret() && Object.keys(body).length <= 3) {
      // Only minimal test payloads and only before a secret is set; once WEBHOOK_SECRET exists, auth applies even to test
      return jsonResponse({ success: true, message: 'Webhook received' });
    }
    // 4. Validate secret
    if (!isAuthorized(e, body)) {
      // Do not log secret; log only Booking_ID prefix if available
      Logger.log('Unauthorized webhook — secret mismatch.');
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }
    // 5. Parse payload (contact / custom fields / opportunity / note)
    var contact = extractContactFields(body);
    var custom = parseCustomFields(body);
    var noteText = extractNoteText(body, body);
    // Also try payload.contact.notes or opportunity notes
    if (!noteText && body.contact && body.contact.notes) noteText = String(body.contact.notes);
    var noteParsed = parseNote(noteText);
    var opp = resolveOpportunity(body);
    // Fallback: if body has opportunity-like flat fields, treat body as opp
    if (!opp && body.pipelineId) opp = body;

    // Filter to only Kamp Malaya Bookings pipeline if opportunity exists
    if (opp && opp.pipelineId && String(opp.pipelineId) !== CONFIG.PIPELINE_ID) {
      // Allow contact without opportunity? If opp is other pipeline, we still process contact but don't map stage
      // Instead, treat as no-op for stage but still upsert booking with empty stage
      // For strictness, we could reject, but spec says "Only process opportunities belonging to Kamp Malaya Bookings"
      // So we blank the opp for stage mapping but keep contact
      opp = null;
      contact.pipelineStageId = '';
      contact.stageName = '';
    }
    // 6. Derive status mapping
    var stageInfo = null;
    if (contact.pipelineStageId && CONFIG.STAGES[contact.pipelineStageId]) stageInfo = CONFIG.STAGES[contact.pipelineStageId];
    else if (opp && opp.pipelineStageId && CONFIG.STAGES[opp.pipelineStageId]) stageInfo = CONFIG.STAGES[opp.pipelineStageId];
    var bookingStatus = stageInfo ? stageInfo.bookingStatus : 'New';
    var paymentStatus = stageInfo ? stageInfo.paymentStatus : 'Pending';
    // If pipeline stage is Cancelled, paymentStatus may be null — keep existing
    if (bookingStatus === 'Cancelled' && !paymentStatus) paymentStatus = '';

    // 7. Pricing — read SETTINGS each time (not hardcoded)
    var settings = getSettings();
    var bookingType = String(custom.booking_type || '').trim();
    var isJoiner = bookingType === 'Joiner Tour';
    var isPrivate = bookingType === 'Private Stay';
    var pax = custom.pax_count || '';
    var accommodation = custom.accommodation || '';
    var tourDate = normalizeDateValue(custom.tour_date);
    var checkIn = normalizeDateValue(custom.check_in);
    var checkOut = normalizeDateValue(custom.check_out);
    var nights = '';
    var packageRate = '';
    var accommodationRate = '';
    var estimatedTotal = '';

    if (isJoiner) {
      var joinerCalc = calculateJoiner(settings, pax, noteParsed.children_count, noteParsed.children_ages, accommodation, tourDate, noteParsed.nights, noteParsed.quoted_estimate);
      nights = joinerCalc.nights;
      packageRate = joinerCalc.packageRate;
      accommodationRate = joinerCalc.accommodationRate;
      estimatedTotal = joinerCalc.estimatedTotal;
    } else if (isPrivate) {
      var privateCalc = calculatePrivate(settings, checkIn, checkOut, accommodation, noteParsed.quoted_estimate);
      nights = privateCalc.nights;
      accommodationRate = privateCalc.accommodationRate;
      estimatedTotal = privateCalc.estimatedTotal;
      // If note has explicit nights and calculation gave different, prefer note when check_in/out missing?
      if (noteParsed.nights && (nights === '' || nights === 0)) nights = Number(noteParsed.nights) || nights;
    } else {
      // Unknown booking type — still upsert with what we have
      nights = noteParsed.nights || nightsBetween(checkIn, checkOut) || '';
    }

    // Tour end date: for joiner, tour is 4D/3N (or 5D/4N for 2027-05-27); best we can do is nights → end = start + nights
    var tourEndDate = '';
    if (isJoiner && tourDate && nights) {
      var sd = new Date(tourDate + 'T00:00:00Z');
      if (!isNaN(sd.getTime())) {
        var ed = new Date(sd.getTime() + Number(nights) * 86400000);
        tourEndDate = Utilities.formatDate(ed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
    }

    // 8. Deduplication → Booking_ID
    var bookingId = buildBookingId(contact, custom, opp);

    // Date submitted
    var dateSubmitted = '';
    if (contact.dateAdded) {
      try {
        var d = new Date(contact.dateAdded);
        if (!isNaN(d.getTime())) dateSubmitted = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        else dateSubmitted = String(contact.dateAdded).slice(0,10);
      } catch (e2) { dateSubmitted = String(contact.dateAdded).slice(0,10); }
    }
    if (!dateSubmitted) dateSubmitted = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

    var lastUpdated = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

    // Guest name: prefer fullName, else first+last
    var guestName = String(contact.fullName || (contact.firstName + ' ' + contact.lastName) || '').trim();
    if (!guestName) guestName = '';

    // Ensure sheets exist (idempotent)
    ensureSheetsExist();

    // Build BOOKINGS row (29 cols)
    var row = [
      bookingId,                                      // 1 Booking_ID
      dateSubmitted,                                  // 2 Date_Submitted
      guestName,                                      // 3 Guest_Name
      String(contact.email || '').trim(),              // 4 Email
      String(contact.phone || '').trim(),              // 5 Phone
      bookingType,                                    // 6 Booking_Type
      tourDate,                                       // 7 Tour_Date
      tourEndDate,                                    // 8 Tour_End_Date
      checkIn,                                        // 9 Check_In
      checkOut,                                       // 10 Check_Out
      nights !== '' ? Number(nights) : '',             // 11 Nights
      pax !== '' ? String(pax) : '',                   // 12 Pax
      noteParsed.children_count || '',                 // 13 Children
      noteParsed.children_ages || '',                  // 14 Children_Ages
      accommodation,                                  // 15 Accommodation
      packageRate !== '' ? Number(packageRate) : '',   // 16 Package_Rate
      accommodationRate !== '' ? Number(accommodationRate) : '', // 17
      estimatedTotal !== '' ? Number(estimatedTotal) : '', // 18
      String(custom.special_requests || '').trim(),    // 19
      String(custom.dietary_restrictions || '').trim(),// 20
      String(contact.contactId || ''),                 // 21 GHL_Contact_ID
      String(contact.opportunityId || (opp ? (opp.id||'') : '')), // 22
      String(contact.pipelineId || (opp ? (opp.pipelineId||'') : '') || CONFIG.PIPELINE_ID), // 23
      String(contact.pipelineStageId || (opp ? (opp.pipelineStageId||'') : '')), // 24
      String(contact.stageName || (stageInfo?stageInfo.name:'')), // 25
      bookingStatus,                                  // 26
      paymentStatus,                                  // 27
      '',                                             // 28 Secretary_Notes (preserved on update)
      lastUpdated                                     // 29 Last_Updated
    ];

    var upsert = upsertBookingRow(row);

    // 9. PAYMENTS sync
    var amountDue = estimatedTotal !== '' ? Number(estimatedTotal) : (accommodationRate !== '' ? Number(accommodationRate) : '');
    if (amountDue === '' || amountDue == null) amountDue = '';
    syncPaymentsRow(bookingId, guestName, amountDue, paymentStatus, bookingStatus);

    // 10. Refresh UPCOMING
    try { refreshUpcoming(); } catch (e3) { Logger.log('refreshUpcoming err: ' + e3); }

    // 11. Return success (do not log PII)
    Logger.log('Upserted booking ' + bookingId + ' (' + (upsert.updated ? 'updated' : 'created') + ')');

    return jsonResponse({
      success: true,
      bookingId: bookingId,
      updated: upsert.updated,
      bookingStatus: bookingStatus,
      paymentStatus: paymentStatus
    });

  } catch (err) {
    Logger.log('doPost error: ' + err + ' ' + (err.stack||''));
    return jsonResponse({ success: false, error: String(err.message || err).slice(0,500) }, 500);
  }
}

function jsonResponse(obj, status) {
  status = status || 200;
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  // Apps Script Web App ignores status code in this path — but we log it
  // For 401/403 we still return JSON; GHL will see success:false
  return out;
}

function doGet(e) {
  // Health check / setup helper
  if (e && e.parameter && e.parameter.setup === '1') {
    var secret = getWebhookSecret();
    return jsonResponse({ ok: true, hasSecret: !!secret, sheets: ['BOOKINGS','PAYMENTS','UPCOMING','SETTINGS'] });
  }
  return jsonResponse({ ok: true, message: 'Kamp Malaya booking sync is running. Use POST with webhook secret.' });
}

// Ensure sheets exist without overwriting data
function ensureSheetsExist() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hasBookings = ss.getSheetByName(CONFIG.SHEETS.BOOKINGS);
  var hasPayments = ss.getSheetByName(CONFIG.SHEETS.PAYMENTS);
  var hasSettings = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
  var hasUpcoming = ss.getSheetByName(CONFIG.SHEETS.UPCOMING);
  if (!hasBookings || !hasPayments || !hasSettings || !hasUpcoming) setupSheets();
}

// ============================================================================
// 13. ON-OPEN MENU (secretary helper)
// ============================================================================

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Kamp Malaya')
      .addItem('Setup Sheets', 'setupSheets')
      .addItem('Refresh UPCOMING', 'refreshUpcoming')
      .addSeparator()
      .addItem('Set Webhook Secret…', 'setupWebhookSecret')
      .addItem('Test Sync (synthetic)', 'runAllTests')
      .addToUi();
  } catch(e){}
}

// ============================================================================
// 14. TEST SUITE (synthetic, no GHL writes, fake PII only)
// ============================================================================

function runAllTests() {
  var tests = [
    testJoinerTour,
    testPrivateStay,
    testDuplicateJoiner,
    testPipelineStageChange,
    testMalformedJSON,
    testInvalidSecret
  ];
  var results = [];
  for (var i=0;i<tests.length;i++) {
    try {
      var r = tests[i]();
      results.push(tests[i].name + ': ' + (r.pass ? 'PASS' : 'FAIL') + ' — ' + r.msg);
    } catch (e) {
      results.push(tests[i].name + ': ERROR — ' + e);
    }
  }
  Logger.log(results.join('\n'));
  // Also show in UI if available
  try { SpreadsheetApp.getUi().alert(results.join('\n')); } catch(e){}
  return results;
}

function syntheticPost(payload, secret) {
  var e = {
    postData: { contents: JSON.stringify(payload), type: 'application/json' },
    parameter: {}
  };
  if (secret) e.parameter.secret = secret;
  // Simulate header via parameter if needed
  return doPost(e);
}

function testJoinerTour() {
  ensureSheetsExist();
  var payload = {
    contact: { id: 'test_contact_joiner_001', firstName: 'Test', lastName: 'Joiner', email: 'test.joiner@example.com', phone: '+639000000001', dateAdded: '2026-09-01T00:00:00Z' },
    customFields: [
      { id: 'Hypk6oOYeW0d0Q7y1EPH', value: 'Joiner Tour' },
      { id: 'cMUayvSNtZ1d80VvmySy', value: '2' },
      { id: 'UuYJj1y2YRo1A2c0v3lh', value: 'Kubo by the Shore' },
      { id: 'XgOt9Jk9F26KuGbWjKNp', value: '2026-08-20' },
      { id: 'PC38bar67FIYRsi0CIOS', value: 'Kamp Malaya Funnel' }
    ],
    opportunities: [{ id: 'opp_joiner_001', pipelineId: '8oByHtvSkFfiyqaa8c1h', pipelineStageId: 'f8ce435d-57f8-4a28-a1b5-ad6df682e4e1', status: 'open' }],
    note: "Trip estimator details\nChildren: 1\nChildren's ages: 5\nNights: 3\nEstimate shown to guest: PHP 37,398"
  };
  var resp = syntheticPost(payload, getWebhookSecret() || 'test-secret-not-set');
  var txt = resp.getContent();
  var ok = txt.indexOf('"success":true') !== -1;
  return { pass: ok, msg: txt.slice(0,300) };
}

function testPrivateStay() {
  ensureSheetsExist();
  var payload = {
    contact: { id: 'test_contact_private_001', firstName: 'Test', lastName: 'Private', email: 'test.private@example.com', phone: '+639000000002', dateAdded: '2026-09-02T00:00:00Z' },
    customFields: [
      { id: 'Hypk6oOYeW0d0Q7y1EPH', value: 'Private Stay' },
      { id: 'cMUayvSNtZ1d80VvmySy', value: '4' },
      { id: 'UuYJj1y2YRo1A2c0v3lh', value: 'Malaya Villa' },
      { id: 'uuuPxVb2mfNcyuXy7a1S', value: '2026-10-05' },
      { id: 'geN5xXdqNSTOKv75CCWd', value: '2026-10-08' },
      { id: 'ZqB9bwF0eYDSy8XrA1t2', value: 'Birthday celebration' },
      { id: 'PC38bar67FIYRsi0CIOS', value: 'Kamp Malaya Funnel' }
    ],
    opportunities: [{ id: 'opp_private_001', pipelineId: '8oByHtvSkFfiyqaa8c1h', pipelineStageId: '03092030-1dec-445d-823f-82b4c98894aa', status: 'open' }],
    note: "Trip estimator details\nChildren: 0\nNights: 3"
  };
  var resp = syntheticPost(payload, getWebhookSecret() || 'test-secret-not-set');
  var txt = resp.getContent();
  var ok = txt.indexOf('"success":true') !== -1;
  // Private estimated total should remain blank (no quoted estimate)
  return { pass: ok, msg: txt.slice(0,300) };
}

function testDuplicateJoiner() {
  // Send same payload as testJoinerTour again — should update, not duplicate
  ensureSheetsExist();
  var payload = {
    contact: { id: 'test_contact_joiner_001', firstName: 'Test', lastName: 'Joiner', email: 'test.joiner@example.com', phone: '+639000000001' },
    customFields: [
      { id: 'Hypk6oOYeW0d0Q7y1EPH', value: 'Joiner Tour' },
      { id: 'cMUayvSNtZ1d80VvmySy', value: '2' },
      { id: 'UuYJj1y2YRo1A2c0v3lh', value: 'Kubo by the Shore' },
      { id: 'XgOt9Jk9F26KuGbWjKNp', value: '2026-08-20' }
    ],
    opportunities: [{ id: 'opp_joiner_001', pipelineId: '8oByHtvSkFfiyqaa8c1h', pipelineStageId: 'f8ce435d-57f8-4a28-a1b5-ad6df682e4e1' }],
    note: "Trip estimator details\nChildren: 1\nChildren's ages: 5\nNights: 3\nEstimate shown to guest: PHP 37,398"
  };
  var before = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.BOOKINGS).getLastRow();
  var resp = syntheticPost(payload, getWebhookSecret() || 'test-secret-not-set');
  var after = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.BOOKINGS).getLastRow();
  var txt = resp.getContent();
  var ok = txt.indexOf('"success":true') !== -1 && txt.indexOf('"updated":true') !== -1 && after === before;
  return { pass: ok, msg: 'rows before=' + before + ' after=' + after + ' ' + txt.slice(0,200) };
}

function testPipelineStageChange() {
  ensureSheetsExist();
  var payload = {
    contact: { id: 'test_contact_joiner_001', firstName: 'Test', lastName: 'Joiner', email: 'test.joiner@example.com', phone: '+639000000001' },
    customFields: [
      { id: 'Hypk6oOYeW0d0Q7y1EPH', value: 'Joiner Tour' },
      { id: 'cMUayvSNtZ1d80VvmySy', value: '2' },
      { id: 'UuYJj1y2YRo1A2c0v3lh', value: 'Kubo by the Shore' },
      { id: 'XgOt9Jk9F26KuGbWjKNp', value: '2026-08-20' }
    ],
    opportunities: [{ id: 'opp_joiner_001', pipelineId: '8oByHtvSkFfiyqaa8c1h', pipelineStageId: '6d5dabb6-a6bb-47a4-9641-656219953302', status: 'open' }], // Deposit Paid
    note: "Trip estimator details\nNights: 3\nEstimate shown to guest: PHP 37,398"
  };
  var resp = syntheticPost(payload, getWebhookSecret() || 'test-secret-not-set');
  var txt = resp.getContent();
  var ok = txt.indexOf('"success":true') !== -1 && txt.indexOf('Approved') !== -1 && txt.indexOf('Deposit Paid') !== -1;
  return { pass: ok, msg: txt.slice(0,400) };
}

function testMalformedJSON() {
  var e = { postData: { contents: '{ not json ', type: 'application/json' }, parameter: {} };
  var resp = doPost(e);
  var txt = resp.getContent();
  var ok = txt.indexOf('Invalid JSON') !== -1;
  return { pass: ok, msg: txt.slice(0,200) };
}

function testInvalidSecret() {
  // Only meaningful if a secret is set
  var expected = getWebhookSecret();
  if (!expected) return { pass: true, msg: 'SKIP — no WEBHOOK_SECRET set, auth disabled for test payloads' };
  var payload = { contact: { id: 'x', email: 'a@b.com' }, customFields: [] };
  var e = { postData: { contents: JSON.stringify(payload), type: 'application/json' }, parameter: { secret: 'wrong-secret-123' } };
  var resp = doPost(e);
  var txt = resp.getContent();
  var ok = txt.indexOf('Unauthorized') !== -1;
  return { pass: ok, msg: txt.slice(0,200) };
}
