import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import './chat-widget.js';
import { JOINER_SCHEDULE, todayISO, upcomingTours, formatTourLabel, groupByMonth } from './joiner-schedule.mjs';
import { parseTrip, isCompleteHandoff, serializeTrip } from './trip-params.mjs';
import { ACCOMMODATIONS } from './pricing.mjs';

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
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-pressed', 'false');
    card.setAttribute('aria-label', `Tour ${formatTourLabel(tour)}, ${tour.price.toLocaleString()} pesos per head, ${tour.slots} slots left`);
    const slotsClass = tour.slots <= 5 ? ' low' : '';
    card.innerHTML = `
      <div class="tour-card-date">${formatTourLabel(tour)}</div>
      <div class="tour-card-price">&#8369;${tour.price.toLocaleString()}/head</div>
      <div class="tour-card-slots${slotsClass}">${tour.slots} slot${tour.slots !== 1 ? 's' : ''} left</div>
    `;
    function selectCard() {
      gridContainer.querySelectorAll('.tour-card').forEach(c => {
        c.classList.remove('selected');
        c.setAttribute('aria-pressed', 'false');
      });
      card.classList.add('selected');
      card.setAttribute('aria-pressed', 'true');
      hiddenInput.value = tour.start;
      selectedTourDate = tour.start;
      const joinerPax = document.getElementById('pax-stepper-joiner');
      if (joinerPax) joinerPax.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    card.addEventListener('click', selectCard);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectCard();
      }
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
  const max = Number.isFinite(Number(input.max)) ? Number(input.max) : 10;
  const min = Number.isFinite(Number(input.min)) ? Number(input.min) : 1;

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
  if (!toggle || !wrap) return () => {};

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
  checkToggle();
  return checkToggle;
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
const PESO = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 });

/** Human date for the summary; the form fields keep their ISO values. */
function summaryDate(iso) {
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, m, d] = String(iso).split('-').map(Number);
  return (y && m && d) ? `${d} ${M[m - 1]} ${y}` : iso;
}

/**
 * Swap the trip questions for a summary of what the estimator already captured.
 * Every field stays in the DOM and still submits — only the asking is hidden —
 * so nothing about the payload changes, and "Change" restores the full form.
 */
function collapseTripQuestions(trip) {
  const summary = document.getElementById('trip-summary');
  const rows = document.getElementById('trip-summary-rows');
  const toggle = document.getElementById('booking-type-toggle');
  const priv = document.getElementById('private-fields');
  const joiner = document.getElementById('joiner-fields');
  if (!summary || !rows) return;

  const kids = trip.childAges.length;
  const entries = [];

  entries.push(['Trip', trip.tripType === 'joiner' ? 'Joiner tour' : 'Private stay']);
  if (trip.tripType === 'joiner' && trip.departure) {
    entries.push(['Departure', summaryDate(trip.departure)]);
  } else if (trip.checkIn && trip.checkOut) {
    entries.push(['Dates', `${summaryDate(trip.checkIn)} – ${summaryDate(trip.checkOut)}`]);
  }
  entries.push(['Nights', String(trip.nights)]);
  entries.push(['Party', `${trip.adults} adult${trip.adults === 1 ? '' : 's'}`
    + (kids ? ` · ${kids} child${kids === 1 ? '' : 'ren'}` : '')]);
  if (kids) entries.push(['Children\u2019s ages', trip.childAges.join(', ')]);

  const room = ACCOMMODATIONS.find(a => a.id === trip.room);
  if (room) entries.push(['Accommodation', room.label]);
  if (trip.estimate) entries.push(['Estimate', `\u20b1${PESO.format(trip.estimate)}`, true]);

  rows.replaceChildren();
  entries.forEach(([label, value, isTotal]) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (isTotal) { dt.classList.add('is-total'); dd.classList.add('is-total'); }
    rows.append(dt, dd);
  });

  summary.hidden = false;
  if (toggle) toggle.hidden = true;
  if (priv) priv.hidden = true;
  if (joiner) joiner.hidden = true;

  document.getElementById('trip-summary-edit')?.addEventListener('click', () => {
    // Reveal the real questions rather than navigating away: the values are
    // already correct, so the guest edits in place and nothing is re-entered.
    // Flag the quote as possibly stale — once the trip is editable, the figure
    // the guest was shown may no longer describe what they submit, and a wrong
    // number in the CRM is worse than an annotated one.
    const form = document.getElementById('inquiryForm');
    if (form && trip.estimate) {
      let flag = form.querySelector('input[name="estimate_may_be_stale"]');
      if (!flag) {
        flag = document.createElement('input');
        flag.type = 'hidden';
        flag.name = 'estimate_may_be_stale';
        form.appendChild(flag);
      }
      flag.value = 'yes — guest reopened the trip details after the estimate';
    }
    summary.hidden = true;
    if (toggle) toggle.hidden = false;
    if (priv) priv.hidden = false;
    if (joiner) joiner.hidden = false;
    (trip.tripType === 'joiner' ? joiner : priv)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Focus the visible toggle, not #booking_type — that is a hidden input and
    // cannot take focus, which would strand a keyboard user mid-form.
    const active = document.getElementById(
      trip.tripType === 'joiner' ? 'joiner-toggle' : 'private-toggle');
    active?.focus();
  });
}

(function prefillFromURL() {
  // Param names live in trip-params.mjs, shared with the estimator. Reading them
  // by hand here is what let the two pages drift: the estimator sent `adults`,
  // `start`/`end` and `ages` while this file read `pax`, `checkin`/`checkout`
  // and nothing, so party size, children and the quoted total were dropped.
  const trip = parseTrip(window.location.search);
  if (!trip) return;                      // cold arrival — leave the form alone

  const setPax = (id, value) => {
    const input = document.getElementById(id);
    if (!input || !value) return;
    const max = Number(input.max) || 10;
    input.value = Math.max(1, Math.min(max, value));
  };
  const setChildren = (id, wrapId, value) => {
    const input = document.getElementById(id);
    if (!input) return;
    const max = Number(input.max) || 10;
    input.value = Math.max(0, Math.min(max, value));
    // The stepper is collapsed by default. A prefilled count that stays hidden
    // still submits, so the guest would be booking children they cannot see.
    const wrap = document.getElementById(wrapId);
    if (wrap && value > 0) wrap.classList.remove('hidden');
  };

  if (trip.tripType === 'joiner') {
    selectBookingType('joiner');
    renderTourCards();
    if (trip.departure) {
      const group = tourGroups.find(g => g.tours.some(t => t.start === trip.departure));
      if (group) {
        filterByMonth(group.label);
        setTimeout(() => {
          const card = document.querySelector(`.tour-card[data-date="${trip.departure}"]`);
          if (card) card.click();
        }, 50);
      }
    }
    setPax('pax_count_joiner', trip.adults);
    setChildren('children_count_joiner', 'children-stepper-wrap-joiner', trip.children);
  } else {
    selectBookingType('private');
    if (trip.checkIn) document.getElementById('check_in').value = trip.checkIn;
    if (trip.checkOut) document.getElementById('check_out').value = trip.checkOut;
    setPax('pax_count', trip.adults);
    setChildren('children_count', 'children-stepper-wrap', trip.children);
  }

  // The estimator sends an accommodation id; this form's <option> values are
  // display labels. Resolve through the shared list rather than string-matching.
  if (trip.room) {
    const select = document.getElementById('accommodation');
    const room = ACCOMMODATIONS.find(a => a.id === trip.room);
    if (select && room) {
      const match = [...select.options].find(o => o.value.toLowerCase() === room.label.toLowerCase());
      if (match) select.value = match.value;
    }
  }

  // A complete handoff means every trip question on this page has already been
  // answered next door. Asking them again is the duplication between the two
  // pages; collapse them into something the guest confirms instead.
  if (isCompleteHandoff(trip)) collapseTripQuestions(trip);

  // Carry the quoted figure and the ages into the submission so the team sees
  // the same number the guest saw. Hidden fields ride along with the FormData.
  const form = document.getElementById('inquiryForm');
  if (form) {
    const hidden = (name, value) => {
      if (value === null || value === undefined || value === '') return;
      let field = form.querySelector(`input[name="${name}"]`);
      if (!field) {
        field = document.createElement('input');
        field.type = 'hidden';
        field.name = name;
        form.appendChild(field);
      }
      field.value = String(value);
    };
    hidden('quoted_estimate', trip.estimate);
    hidden('children_ages', trip.childAges.join(', '));
    hidden('nights', trip.nights);
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
  // Same contract as the prefill above. A substring test on the query string
  // would also match things like ?utm_type=joiner.
  const arrival = parseTrip(window.location.search);
  if (arrival && arrival.tripType === 'joiner') {
    // renderTourCards already ran in prefill for the joiner path
  } else {
    renderTourCards();
  }

  // Private Stay stepper
  const checkPrivateToggle = initChildrenToggle('children-toggle', 'children-stepper-wrap', 'pax_count', 'children_count');
  initStepper('pax_count', { onChange: checkPrivateToggle });
  initStepper('children_count');

  // Joiner Tour stepper
  const checkJoinerToggle = initChildrenToggle('children-toggle-joiner', 'children-stepper-wrap-joiner', 'pax_count_joiner', 'children_count_joiner');
  initStepper('pax_count_joiner', { onChange: checkJoinerToggle });
  initStepper('children_count_joiner');

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
