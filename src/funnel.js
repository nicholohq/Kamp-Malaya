import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import './chat-widget.js';
import { JOINER_SCHEDULE, todayISO, upcomingTours, formatTourLabel, groupByMonth } from './joiner-schedule.mjs';

// ============================================================
// 2. POPULATE JOINER DATES
// ============================================================
function populateJoinerDates() {
  const select = document.getElementById('tour_date');
  if (!select) return;

  // keep only the disabled "Select departure date" placeholder (first child)
  while (select.children.length > 1) {
    select.lastChild.remove();
  }

  const groups = groupByMonth(upcomingTours(JOINER_SCHEDULE, todayISO()));
  groups.forEach(group => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    group.tours.forEach(tour => {
      const option = document.createElement('option');
      option.value = tour.start;
      option.textContent = formatTourLabel(tour);
      optgroup.appendChild(option);
    });
    select.appendChild(optgroup);
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