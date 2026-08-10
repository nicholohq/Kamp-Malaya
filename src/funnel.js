import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import './chat-widget.js';
import { JOINER_SCHEDULE, todayISO, upcomingTours, formatTourLabel, groupByMonth } from './joiner-schedule.mjs';

// ============================================================
// 2. RENDER TOUR DATE CARDS + MONTH PILLS
// ============================================================
let selectedTourDate = null;
let tourGroups = [];

function renderTourCards() {
  const pillsContainer = document.getElementById('month-pills');
  const gridContainer = document.getElementById('tour-card-grid');
  if (!pillsContainer || !gridContainer) return;

  tourGroups = groupByMonth(upcomingTours(JOINER_SCHEDULE, todayISO()));
  const firstMonth = tourGroups.length > 0 ? tourGroups[0].label : null;

  pillsContainer.innerHTML = '';
  tourGroups.forEach(group => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'month-pill' + (group.label === firstMonth ? ' active' : '');
    pill.textContent = group.label;
    pill.dataset.month = group.label;
    pill.addEventListener('click', () => filterByMonth(group.label));
    pillsContainer.appendChild(pill);
  });

  if (firstMonth) filterByMonth(firstMonth);
}

function filterByMonth(monthLabel) {
  const pillsContainer = document.getElementById('month-pills');
  const gridContainer = document.getElementById('tour-card-grid');
  const hiddenInput = document.getElementById('tour_date');
  if (!gridContainer) return;

  pillsContainer.querySelectorAll('.month-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.month === monthLabel);
  });

  const group = tourGroups.find(g => g.label === monthLabel);
  gridContainer.innerHTML = '';
  if (!group) return;

  group.tours.forEach(tour => {
    const card = document.createElement('div');
    card.className = 'tour-card';
    card.dataset.date = tour.start;
    const slotsClass = tour.slots <= 5 ? ' low' : '';
    card.innerHTML = `
      <div class="tour-card-date">${formatTourLabel(tour)}</div>
      <div class="tour-card-price">&#8369;${tour.price.toLocaleString()}/head</div>
      <div class="tour-card-slots${slotsClass}">${tour.slots} slot${tour.slots !== 1 ? 's' : ''} left</div>
    `;
    card.addEventListener('click', () => {
      gridContainer.querySelectorAll('.tour-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      hiddenInput.value = tour.start;
      selectedTourDate = tour.start;
      const joinerPax = document.getElementById('pax-stepper-joiner');
      if (joinerPax) joinerPax.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    gridContainer.appendChild(card);
  });
}

// ============================================================
// 3. PAX STEPPER LOGIC
// ============================================================
function initStepper(inputId, options = {}) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const container = input.closest('.stepper');
  const minusBtn = container.querySelector('.stepper-minus');
  const plusBtn = container.querySelector('.stepper-plus');
  const max = parseInt(input.max, 10) || 10;
  const min = parseInt(input.min, 10) || 1;

  function update(val) {
    const clamped = Math.max(min, Math.min(max, val));
    input.value = clamped;
    minusBtn.disabled = clamped <= min;
    plusBtn.disabled = clamped >= max;
    if (options.onChange) options.onChange(clamped);
  }

  minusBtn.addEventListener('click', () => update((parseInt(input.value, 10) || min) - 1));
  plusBtn.addEventListener('click', () => update((parseInt(input.value, 10) || min) + 1));
  input.addEventListener('change', () => update(parseInt(input.value, 10) || min));
  input.addEventListener('focus', () => input.select());

  update(parseInt(input.value, 10) || min);
}

function initChildrenToggle(toggleId, wrapId, mainInputId, childInputId) {
  const toggle = document.getElementById(toggleId);
  const wrap = document.getElementById(wrapId);
  const mainInput = document.getElementById(mainInputId);
  const childInput = document.getElementById(childInputId);
  if (!toggle || !wrap) return;

  toggle.addEventListener('click', () => {
    wrap.classList.toggle('hidden');
    if (wrap.classList.contains('hidden')) childInput.value = 0;
  });

  function checkToggle() {
    const val = parseInt(mainInput.value, 10) || 0;
    if (val >= 3) {
      toggle.classList.remove('hidden');
    } else {
      toggle.classList.add('hidden');
      wrap.classList.add('hidden');
      childInput.value = 0;
    }
  }

  mainInput.addEventListener('change', checkToggle);
  const container = mainInput.closest('.stepper');
  container.querySelectorAll('.stepper-btn').forEach(btn => {
    btn.addEventListener('click', () => setTimeout(checkToggle, 0));
  });
  checkToggle();
}

// ============================================================
// 4. BOOKING TYPE TOGGLE
// ============================================================
function selectBookingType(type) {
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
  } else {
    joinerFields.classList.remove('hidden');
    privateFields.classList.add('hidden');
    document.querySelectorAll('#joiner-fields [required]').forEach(el => el.disabled = false);
    document.querySelectorAll('#private-fields [required]').forEach(el => el.disabled = true);
    document.getElementById('submitBtn').innerHTML = 'Submit Joiner Inquiry &rarr;';
  }
}

// ============================================================
// 5. REVEAL ON SCROLL
// ============================================================
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ============================================================
// 6. URL PARAMETER PRE-FILLING
// ============================================================
(function prefillFromURL() {
  const params = new URLSearchParams(window.location.search);

  if (params.get('type') === 'joiner') {
    selectBookingType('joiner');
    renderTourCards();
    const date = params.get('date');
    if (date) {
      const group = tourGroups.find(g => g.tours.some(t => t.start === date));
      if (group) {
        filterByMonth(group.label);
        setTimeout(() => {
          const card = document.querySelector(`.tour-card[data-date="${date}"]`);
          if (card) card.click();
        }, 50);
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
      const num = Math.max(1, Math.min(10, parseInt(pax, 10) || 2));
      p.value = num;
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
// 7. GHL FORM SUBMISSION (Webhook Approach)
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
// 8. INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  if (window.location.search && window.location.search.includes('type=joiner')) {
    // renderTourCards already ran in prefill for the joiner path
  } else {
    renderTourCards();
  }

  // Private Stay stepper
  initStepper('pax_count');
  initChildrenToggle('children-toggle', 'children-stepper-wrap', 'pax_count', 'children_count');

  // Joiner Tour stepper
  initStepper('pax_count_joiner');
  initChildrenToggle('children-toggle-joiner', 'children-stepper-wrap-joiner', 'pax_count_joiner', 'children_count_joiner');

  // Booking type toggles
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
// 9. EXPOSE FUNCTIONS GLOBALLY (for debugging and onclick)
// ============================================================
window.selectBookingType = selectBookingType;
window.renderTourCards = renderTourCards;

console.log('✅ funnel.js loaded — functions exposed globally');
