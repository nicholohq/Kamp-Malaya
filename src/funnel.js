import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';

// ============================================================
// 1. JOINER DATES (2026 Schedule)
// ============================================================
const JOINER_SCHEDULE = [
  // January
  { start: '2026-01-08', end: '2026-01-11', label: 'Jan 8-11' },
  { start: '2026-01-15', end: '2026-01-18', label: 'Jan 15-18' },
  { start: '2026-01-22', end: '2026-01-25', label: 'Jan 22-25' },
  { start: '2026-01-29', end: '2026-02-01', label: 'Jan 29 - Feb 1' },
  // February
  { start: '2026-02-05', end: '2026-02-08', label: 'Feb 5-8' },
  { start: '2026-02-12', end: '2026-02-15', label: 'Feb 12-15' },
  { start: '2026-02-14', end: '2026-02-17', label: 'Feb 14-17' },
  { start: '2026-02-17', end: '2026-02-20', label: 'Feb 17-20' },
  { start: '2026-02-19', end: '2026-02-22', label: 'Feb 19-22' },
  { start: '2026-02-22', end: '2026-02-25', label: 'Feb 22-25' },
  { start: '2026-02-25', end: '2026-02-28', label: 'Feb 25-28' },
  { start: '2026-02-26', end: '2026-03-01', label: 'Feb 26 - Mar 1' },
  // March
  { start: '2026-03-05', end: '2026-03-08', label: 'Mar 5-8' },
  { start: '2026-03-12', end: '2026-03-15', label: 'Mar 12-15' },
  { start: '2026-03-19', end: '2026-03-22', label: 'Mar 19-22' },
  { start: '2026-03-26', end: '2026-03-29', label: 'Mar 26-29' },
  { start: '2026-03-28', end: '2026-03-31', label: 'Mar 28-31' },
  // April
  { start: '2026-04-01', end: '2026-04-04', label: 'Apr 1-4' },
  { start: '2026-04-02', end: '2026-04-05', label: 'Apr 2-5' },
  { start: '2026-04-09', end: '2026-04-12', label: 'Apr 9-12' },
  { start: '2026-04-16', end: '2026-04-19', label: 'Apr 16-19' },
  { start: '2026-04-23', end: '2026-04-26', label: 'Apr 23-26' },
  { start: '2026-04-30', end: '2026-05-03', label: 'Apr 30 - May 3' },
  // May
  { start: '2026-05-01', end: '2026-05-04', label: 'May 1-4' },
  { start: '2026-05-07', end: '2026-05-10', label: 'May 7-10' },
  { start: '2026-05-14', end: '2026-05-17', label: 'May 14-17' },
  { start: '2026-05-21', end: '2026-05-24', label: 'May 21-24' },
  { start: '2026-05-23', end: '2026-05-26', label: 'May 23-26' },
  { start: '2026-05-24', end: '2026-05-27', label: 'May 24-27' },
  { start: '2026-05-27', end: '2026-05-30', label: 'May 27-30' },
  { start: '2026-05-28', end: '2026-05-31', label: 'May 28-31' },
  // July
  { start: '2026-07-02', end: '2026-07-05', label: 'Jul 2-5' },
  { start: '2026-07-09', end: '2026-07-12', label: 'Jul 9-12' },
  { start: '2026-07-16', end: '2026-07-19', label: 'Jul 16-19' },
  { start: '2026-07-23', end: '2026-07-26', label: 'Jul 23-26' },
  { start: '2026-07-30', end: '2026-08-02', label: 'Jul 30 - Aug 2' },
  // August
  { start: '2026-08-06', end: '2026-08-09', label: 'Aug 6-9' },
  { start: '2026-08-13', end: '2026-08-16', label: 'Aug 13-16' },
  { start: '2026-08-20', end: '2026-08-23', label: 'Aug 20-23' },
  { start: '2026-08-27', end: '2026-08-30', label: 'Aug 27-30' },
  { start: '2026-08-28', end: '2026-08-31', label: 'Aug 28-31' },
  // September
  { start: '2026-09-03', end: '2026-09-06', label: 'Sep 3-6' },
  { start: '2026-09-10', end: '2026-09-13', label: 'Sep 10-13' },
  { start: '2026-09-17', end: '2026-09-20', label: 'Sep 17-20' },
  { start: '2026-09-24', end: '2026-09-27', label: 'Sep 24-27' },
  { start: '2026-09-27', end: '2026-09-30', label: 'Sep 27-30' },
  // October
  { start: '2026-10-01', end: '2026-10-04', label: 'Oct 1-4' },
  { start: '2026-10-08', end: '2026-10-11', label: 'Oct 8-11' },
  { start: '2026-10-15', end: '2026-10-18', label: 'Oct 15-18' },
  { start: '2026-10-22', end: '2026-10-25', label: 'Oct 22-25' },
  { start: '2026-10-29', end: '2026-11-01', label: 'Oct 29 - Nov 1' },
  // November
  { start: '2026-11-01', end: '2026-11-04', label: 'Nov 1-4' },
  { start: '2026-11-05', end: '2026-11-08', label: 'Nov 5-8' },
  { start: '2026-11-12', end: '2026-11-15', label: 'Nov 12-15' },
  { start: '2026-11-19', end: '2026-11-22', label: 'Nov 19-22' },
  { start: '2026-11-26', end: '2026-11-29', label: 'Nov 26-29' },
  { start: '2026-11-27', end: '2026-11-30', label: 'Nov 27-30' },
  { start: '2026-11-29', end: '2026-12-02', label: 'Nov 29 - Dec 2' },
  // December
  { start: '2026-12-03', end: '2026-12-06', label: 'Dec 3-6' },
  { start: '2026-12-05', end: '2026-12-08', label: 'Dec 5-8' },
  { start: '2026-12-08', end: '2026-12-11', label: 'Dec 8-11' },
  { start: '2026-12-10', end: '2026-12-13', label: 'Dec 10-13' },
  { start: '2026-12-17', end: '2026-12-20', label: 'Dec 17-20' },
  { start: '2026-12-20', end: '2026-12-23', label: 'Dec 20-23' },
  { start: '2026-12-27', end: '2026-12-30', label: 'Dec 27-30' }
];

// ============================================================
// 2. POPULATE JOINER DATES
// ============================================================
function populateJoinerDates() {
  const select = document.getElementById('tour_date');
  if (!select) return;
  
  while (select.options.length > 1) {
    select.remove(1);
  }
  
  JOINER_SCHEDULE.forEach(tour => {
    const option = document.createElement('option');
    option.value = tour.start;
    option.textContent = `${tour.label} (${tour.start} to ${tour.end})`;
    select.appendChild(option);
  });
}

// ============================================================
// 3. BOOKING TYPE TOGGLE
// ============================================================
function selectBookingType(type) {
  // Set the hidden field value to match GHL's expected values
  document.getElementById('booking_type').value = type === 'private' ? 'Private Stay' : 'Joiner Tour';
  
  document.getElementById('private-toggle').classList.toggle('active', type === 'private');
  document.getElementById('joiner-toggle').classList.toggle('active', type === 'joiner');
  
  const privateFields = document.getElementById('private-fields');
  const joinerFields = document.getElementById('joiner-fields');
  
  if (type === 'private') {
    privateFields.classList.remove('hidden');
    joinerFields.classList.add('hidden');
    document.querySelectorAll('#private-fields [required]').forEach(el => el.disabled = false);
    document.querySelectorAll('#joiner-fields [required]').forEach(el => el.disabled = true);
    document.getElementById('submitBtn').innerHTML = 'Check Availability &rarr;';
    
    // Show large group note if 5+ selected
    const pax = document.getElementById('pax_count');
    if (pax && pax.value === '5+') {
      document.getElementById('private-large-group-note').classList.remove('hidden');
    } else {
      document.getElementById('private-large-group-note').classList.add('hidden');
    }
  } else {
    joinerFields.classList.remove('hidden');
    privateFields.classList.add('hidden');
    document.querySelectorAll('#joiner-fields [required]').forEach(el => el.disabled = false);
    document.querySelectorAll('#private-fields [required]').forEach(el => el.disabled = true);
    document.getElementById('submitBtn').innerHTML = 'Submit Joiner Inquiry &rarr;';
    
    // Sync pax value to joiner select if needed
    const paxMain = document.getElementById('pax_count');
    const paxJoiner = document.getElementById('pax_count_joiner');
    if (paxMain && paxJoiner && paxMain.value) {
      paxJoiner.value = paxMain.value;
    }
  }
  
  handlePaxChange();
}

// ============================================================
// 4. PAX CHANGE HANDLER
// ============================================================
function handlePaxChange() {
  const paxSelect = document.getElementById('pax_count_joiner');
  const note = document.getElementById('large-group-note');
  if (paxSelect && note) {
    if (paxSelect.value === '5+') {
      note.classList.remove('hidden');
    } else {
      note.classList.add('hidden');
    }
  }
}

// ============================================================
// 5. PAX COUNT CHANGE HANDLER (Main)
// ============================================================
function handlePaxMainChange() {
  const pax = document.getElementById('pax_count');
  const note = document.getElementById('private-large-group-note');
  if (pax && note) {
    if (pax.value === '5+') {
      note.classList.remove('hidden');
    } else {
      note.classList.add('hidden');
    }
  }
}

// ============================================================
// 6. REVEAL ON SCROLL
// ============================================================
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ============================================================
// 7. URL PARAMETER PRE-FILLING
// ============================================================
(function prefillFromURL() {
  const params = new URLSearchParams(window.location.search);
  
  if (params.get('type') === 'joiner') {
    selectBookingType('joiner');
    const date = params.get('date');
    if (date) {
      const select = document.getElementById('tour_date');
      if (select) {
        const option = Array.from(select.options).find(opt => opt.value === date);
        if (option) select.value = date;
      }
    }
  } else {
    selectBookingType('private');
    const checkin  = params.get('checkin');
    const checkout = params.get('checkout');
    const pax      = params.get('pax');
    const room     = params.get('room');

    if (checkin)  document.getElementById('check_in').value  = checkin;
    if (checkout) document.getElementById('check_out').value = checkout;

    if (pax) {
      const p = document.getElementById('pax_count');
      if ([...p.options].some(o => o.value === pax)) p.value = pax;
      handlePaxMainChange();
    }
    if (room) {
      const a = document.getElementById('accommodation');
      const decoded = decodeURIComponent(room).trim();
      const match = [...a.options].find(o => o.value.toLowerCase() === decoded.toLowerCase());
      if (match) a.value = match.value;
    }
  }
})();

// ============================================================
// 8. GHL FORM SUBMISSION (Webhook Approach)
// ============================================================
const form = document.getElementById('inquiryForm');
const formWrap = document.getElementById('formWrap');
const successWrap = document.getElementById('successWrap');
const formError = document.getElementById('formError');
const submitBtn = document.getElementById('submitBtn');

const WEBHOOK_URL = 'https://www.kampmalaya.tours/api/ghl-webhook';

form.addEventListener('submit', async function (e) {
  e.preventDefault();

  const data = Object.fromEntries(new FormData(form).entries());
  formError.classList.add('hidden');

  console.log('📝 Form Data:', data);

  const bookingType = document.getElementById('booking_type').value;
  let required = ['full_name', 'email', 'phone'];
  
  if (bookingType === 'Private Stay') {
    required.push('pax_count', 'accommodation', 'check_in', 'check_out');
  } else if (bookingType === 'Joiner Tour') {
    required.push('tour_date', 'pax_count');
  } else {
    required.push('pax_count', 'accommodation', 'check_in', 'check_out');
  }

  const missing = required.filter(k => !data[k] || data[k].trim() === '');
  if (missing.length) {
    formError.textContent = 'Please complete all required fields.';
    formError.classList.remove('hidden');
    return;
  }

  if (bookingType === 'Private Stay' && data.check_out <= data.check_in) {
    formError.textContent = 'Check-out must be after check-in.';
    formError.classList.remove('hidden');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    console.log('📤 Webhook response:', result);

    if (!result.success) {
      throw new Error(result.error || 'Submission failed');
    }

    // Show success
    const firstName = (data.full_name || '').trim().split(' ')[0] || 'there';
    
    document.getElementById('successHeading').textContent = 'Thank you, ' + firstName + '!';
    
    if (bookingType === 'Joiner Tour') {
      document.getElementById('successMsg').innerHTML = 
        `Your <strong>4D/3N Balabac Island Tour</strong> inquiry has been received. We'll send you payment instructions for the ₱1,000/head deposit within <strong>24 hours</strong>.`;
    } else {
      document.getElementById('successMsg').innerHTML = 
        `Your <strong>Private Stay Inquiry</strong> has been received. We'll get back to you within <strong>24 hours</strong> with room options.`;
    }
    
    document.getElementById('successEmail').textContent = 'A confirmation email has been sent to ' + data.email;

    formWrap.classList.add('hidden');
    successWrap.classList.remove('hidden');
    successWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });

    console.log('✅ Inquiry submitted via webhook ->', data);

  } catch (error) {
    console.error('❌ Submission error:', error);

    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      formError.textContent = 'Connection error — please check your internet and try again. If this persists, email us directly.';
    } else {
      formError.textContent = error.message || 'Something went wrong. Please try again or contact us directly.';
    }

    formError.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = bookingType === 'Joiner Tour' ? 'Submit Joiner Inquiry →' : 'Check Availability →';
  }
});

// ============================================================
// 9. INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  populateJoinerDates();
  document.getElementById('pax_count_joiner').addEventListener('change', handlePaxChange);
  document.getElementById('pax_count').addEventListener('change', handlePaxMainChange);
  
  // Add booking type toggle event listeners
  document.getElementById('private-toggle').addEventListener('click', function() {
    selectBookingType('private');
  });
  
  document.getElementById('joiner-toggle').addEventListener('click', function() {
    selectBookingType('joiner');
  });

  // ---- Flatpickr date pickers with availability blocking ----
  const checkOutFp = flatpickr('#check_out', {
    dateFormat: 'Y-m-d',
    minDate: 'today',
    disableMobile: true, // force flatpickr UI so blocked dates are honored on mobile
  });
  const checkInFp = flatpickr('#check_in', {
    dateFormat: 'Y-m-d',
    minDate: 'today',
    disableMobile: true,
    onChange: (sel, dateStr) => {
      // Check-out must be after check-in.
      checkOutFp.set('minDate', dateStr || 'today');
      if (checkOutFp.selectedDates[0] && checkOutFp.selectedDates[0] <= sel[0]) {
        checkOutFp.clear();
      }
    },
  });

  // Fetch booked dates for the chosen room and grey them out.
  async function refreshAvailability(room) {
    if (!room) return;
    let blocked = [];
    try {
      const r = await fetch(`/api/availability?room=${encodeURIComponent(room)}`);
      const data = await r.json();
      blocked = data.blockedDates || [];
    } catch {
      blocked = []; // degrade gracefully — dates just aren't blocked
    }
    checkInFp.set('disable', blocked);
    checkOutFp.set('disable', blocked);
  }

  const accEl = document.getElementById('accommodation');
  if (accEl) {
    accEl.addEventListener('change', () => refreshAvailability(accEl.value));
    if (accEl.value) refreshAvailability(accEl.value); // handle URL-prefilled room
  }
});

// ============================================================
// 10. EXPOSE FUNCTIONS GLOBALLY (for debugging and onclick)
// ============================================================
window.selectBookingType = selectBookingType;
window.handlePaxChange = handlePaxChange;
window.handlePaxMainChange = handlePaxMainChange;

console.log('✅ funnel.js loaded — functions exposed globally');