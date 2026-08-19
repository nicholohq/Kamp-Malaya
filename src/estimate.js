// Trip estimator — step-by-step onboarding flow for estimate.html.
// All arithmetic and every peso amount lives in pricing.mjs; this file only
// walks the guest through the questions and paints the result.

import './chat-widget.js';
import {
  ACCOMMODATIONS,
  ADDONS,
  CHILD_MAX_AGE,
  PRIVATE_BASE_PER_HEAD,
  estimate,
  formatPeso,
  nightsBetween,
} from './pricing.mjs';
import {
  JOINER_SCHEDULE,
  todayISO,
  upcomingTours,
  formatTourLabel,
  groupByMonth,
} from './joiner-schedule.mjs';

const TOTAL_STEPS = 5;
const STORAGE_KEY = 'km-estimate-progress';

const el = {
  progressFill: document.getElementById('wiz-progress-fill'),
  progressBar: document.querySelector('.wiz-progress'),
  stepLabel: document.getElementById('wiz-step-label'),
  steps: Array.from(document.querySelectorAll('.wiz-step')),
  choices: Array.from(document.querySelectorAll('.wiz-choice')),
  joinerFrom: document.getElementById('wiz-joiner-from'),
  departures: document.getElementById('wiz-departures'),
  departuresSub: document.getElementById('wiz-departures-sub'),
  departuresEmpty: document.getElementById('wiz-departures-empty'),
  months: document.getElementById('wiz-months'),
  dates: document.getElementById('wiz-dates'),
  chosen: document.getElementById('wiz-chosen'),
  nightsBlock: document.getElementById('wiz-nights'),
  nights: document.getElementById('est-nights'),
  nightsUnit: document.getElementById('wiz-nights-unit'),
  adults: document.getElementById('est-adults'),
  children: document.getElementById('est-children'),
  slots: document.getElementById('wiz-slots'),
  agesPanel: document.getElementById('wiz-ages-panel'),
  ages: document.getElementById('est-ages'),
  rooms: document.getElementById('est-rooms'),
  addonsField: document.getElementById('est-addons-field'),
  addons: document.getElementById('est-addons'),
  recap: document.getElementById('wiz-recap'),
  lines: document.getElementById('est-lines'),
  total: document.getElementById('est-total'),
  perHead: document.getElementById('est-perhead'),
  cta: document.getElementById('est-cta'),
  nav: document.getElementById('wiz-nav'),
  back: document.getElementById('wiz-back'),
  next: document.getElementById('wiz-next'),
  running: document.getElementById('wiz-running'),
  runningValue: document.getElementById('wiz-running-value'),
  status: document.getElementById('wiz-status'),
};

const tours = upcomingTours(JOINER_SCHEDULE, todayISO());
const monthGroups = groupByMonth(tours);
const hasDepartures = tours.length > 0;

const state = {
  step: 1,
  tripType: null,
  tourStart: hasDepartures ? tours[0].start : null,
  accommodationId: ACCOMMODATIONS[0].id,
};

// Guards the clamp-then-render cycle from re-entering itself.
let enforcing = false;
// True while replaying a history entry, so the render it triggers doesn't
// replaceState back over the entry we just navigated to.
let restoring = false;

// ============================================================
// BUILD THE DATA-DRIVEN CONTROLS
// ============================================================

if (hasDepartures) {
  const cheapest = Math.min(...tours.map(t => t.price));
  el.joinerFrom.textContent = `From ${formatPeso(cheapest)} per head`;
} else {
  el.joinerFrom.textContent = 'Dates coming soon';
}

monthGroups.forEach((group, i) => {
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'wiz-month' + (i === 0 ? ' active' : '');
  pill.textContent = group.label;
  pill.dataset.month = group.label;
  pill.setAttribute('aria-pressed', String(i === 0));
  pill.tabIndex = i === 0 ? 0 : -1; // roving tabindex — one tab stop for the row
  pill.addEventListener('click', () => showMonth(group.label));
  el.months.appendChild(pill);
});

// role="toolbar" promises arrow-key navigation, so provide it.
el.months.addEventListener('keydown', event => {
  const pills = Array.from(el.months.querySelectorAll('.wiz-month'));
  const current = pills.indexOf(document.activeElement);
  if (current === -1) return;

  let target = null;
  if (event.key === 'ArrowRight') target = (current + 1) % pills.length;
  else if (event.key === 'ArrowLeft') target = (current - 1 + pills.length) % pills.length;
  else if (event.key === 'Home') target = 0;
  else if (event.key === 'End') target = pills.length - 1;
  if (target === null) return;

  event.preventDefault();
  pills.forEach((p, i) => { p.tabIndex = i === target ? 0 : -1; });
  pills[target].focus();
  pills[target].scrollIntoView({ block: 'nearest', inline: 'nearest' });
});

function showMonth(label) {
  const pills = Array.from(el.months.querySelectorAll('.wiz-month'));
  pills.forEach(p => {
    const on = p.dataset.month === label;
    p.classList.toggle('active', on);
    p.setAttribute('aria-pressed', String(on));
    p.tabIndex = on ? 0 : -1;
  });

  const group = monthGroups.find(g => g.label === label);
  el.dates.replaceChildren();
  if (!group) return;

  group.tours.forEach(tour => {
    const nights = nightsBetween(tour.start, tour.end);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'wiz-date' + (tour.start === state.tourStart ? ' selected' : '');
    card.dataset.date = tour.start;
    card.setAttribute('aria-pressed', String(tour.start === state.tourStart));

    const range = document.createElement('span');
    range.className = 'wiz-date-range';
    range.textContent = formatTourLabel(tour);

    const meta = document.createElement('span');
    meta.className = 'wiz-date-meta';
    meta.textContent = `${nights + 1}D/${nights}N · ${formatPeso(tour.price)}/head`;

    const slots = document.createElement('span');
    slots.className = 'wiz-date-slots' + (tour.slots <= 5 ? ' low' : '');
    slots.textContent = `${tour.slots} slot${tour.slots === 1 ? '' : 's'} left`;

    card.append(range, meta, slots);
    card.addEventListener('click', () => {
      state.tourStart = tour.start;
      el.dates.querySelectorAll('.wiz-date').forEach(c => {
        const on = c === card;
        c.classList.toggle('selected', on);
        c.setAttribute('aria-pressed', String(on));
      });
      render();
    });
    el.dates.appendChild(card);
  });

  markMonthHoldingSelection();
}

/** Dots the month pill that contains the chosen departure, so it stays findable. */
function markMonthHoldingSelection() {
  const owner = monthGroups.find(g => g.tours.some(t => t.start === state.tourStart));
  el.months.querySelectorAll('.wiz-month').forEach(p => {
    p.classList.toggle('has-selection', !!owner && p.dataset.month === owner.label);
  });
}

ACCOMMODATIONS.forEach((room, i) => {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'wiz-room' + (i === 0 ? ' selected' : '');
  card.dataset.room = room.id;
  card.setAttribute('aria-pressed', String(i === 0));

  const name = document.createElement('span');
  name.className = 'wiz-room-name';
  name.textContent = room.label;

  const note = document.createElement('span');
  note.className = 'wiz-room-note';
  note.textContent = room.note;

  const price = document.createElement('span');
  price.className = 'wiz-room-price';
  price.textContent =
    room.perHeadPerNight > 0 ? `+${formatPeso(room.perHeadPerNight)}/head/night` : 'Included';

  card.append(name, note, price);
  card.addEventListener('click', () => {
    state.accommodationId = room.id;
    syncRoomSelection();
    render();
  });
  el.rooms.appendChild(card);
});

function syncRoomSelection() {
  el.rooms.querySelectorAll('.wiz-room').forEach(c => {
    const on = c.dataset.room === state.accommodationId;
    c.classList.toggle('selected', on);
    c.setAttribute('aria-pressed', String(on));
  });
}

// Add-ons stay hidden until real ones are configured in pricing.mjs.
if (ADDONS.length) {
  el.addonsField.hidden = false;
  ADDONS.forEach(addon => {
    const label = document.createElement('label');
    label.className = 'wiz-addon';

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = addon.id;
    box.addEventListener('change', render);

    const text = document.createElement('span');
    text.className = 'wiz-addon-text';
    const name = document.createElement('span');
    name.className = 'wiz-addon-name';
    name.textContent = addon.label;
    text.appendChild(name);
    if (addon.note) {
      const note = document.createElement('span');
      note.className = 'wiz-addon-note';
      note.textContent = addon.note;
      text.appendChild(note);
    }

    const price = document.createElement('span');
    price.className = 'wiz-addon-price';
    price.textContent = formatPeso(addon.amount) + perSuffix(addon.per);

    label.append(box, text, price);
    el.addons.appendChild(label);
  });
}

function perSuffix(per) {
  if (per === 'head') return '/head';
  if (per === 'head-night') return '/head/night';
  return '';
}

// ============================================================
// SESSION STATE + BROWSER HISTORY
// A wizard that loses everything to a swipe-back is worse than a long form,
// so each step is a history entry and the answers survive a refresh.
// ============================================================

function snapshot() {
  return {
    step: state.step,
    tripType: state.tripType,
    tourStart: state.tourStart,
    accommodationId: state.accommodationId,
    adults: readInt(el.adults),
    children: readInt(el.children),
    nights: readInt(el.nights),
    ages: readAges(),
    addons: Array.from(el.addons.querySelectorAll('input:checked'), i => i.value),
  };
}

function persist() {
  const snap = snapshot();
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch {
    // Private browsing can refuse writes; progress just won't survive a refresh.
  }
  if (!restoring) history.replaceState({ wiz: snap }, '');
}

function applySnapshot(snap, { fromHistory = false } = {}) {
  if (!snap) return;
  restoring = fromHistory;

  state.tripType = snap.tripType;
  state.tourStart = snap.tourStart;
  state.accommodationId = snap.accommodationId || ACCOMMODATIONS[0].id;

  el.adults.value = snap.adults;
  el.nights.value = snap.nights;
  el.children.value = snap.children;
  syncAgePickers();
  Array.from(el.ages.querySelectorAll('.wiz-age-select')).forEach((select, i) => {
    if (snap.ages && snap.ages[i] != null) select.value = String(snap.ages[i]);
  });

  el.addons.querySelectorAll('input').forEach(box => {
    box.checked = (snap.addons || []).includes(box.value);
  });

  syncRoomSelection();
  syncTripType();
  goTo(snap.step, { push: false });
  restoring = false;
}

/** Reflects state.tripType across the step-1 cards and the step-2 branch. */
function syncTripType() {
  const isJoiner = state.tripType === 'joiner';
  el.choices.forEach(c => {
    const on = c.dataset.type === state.tripType;
    c.classList.toggle('selected', on);
    c.setAttribute('aria-pressed', String(on));
  });
  if (!state.tripType) return;

  el.departures.hidden = !isJoiner;
  el.nightsBlock.hidden = isJoiner;

  if (isJoiner) {
    el.departuresSub.hidden = !hasDepartures;
    el.months.hidden = !hasDepartures;
    el.dates.hidden = !hasDepartures;
    el.departuresEmpty.hidden = hasDepartures;
    if (hasDepartures) {
      const owner = monthGroups.find(g => g.tours.some(t => t.start === state.tourStart));
      showMonth((owner || monthGroups[0]).label);
    }
  }
}

window.addEventListener('popstate', event => {
  if (event.state && event.state.wiz) applySnapshot(event.state.wiz, { fromHistory: true });
});

// ============================================================
// STEP NAVIGATION
// ============================================================

function goTo(step, { push = true } = {}) {
  state.step = Math.max(1, Math.min(TOTAL_STEPS, step));

  el.steps.forEach(section => {
    const on = Number(section.dataset.step) === state.step;
    section.hidden = !on;
    section.classList.toggle('is-active', on);
  });

  const pct = ((state.step - 1) / (TOTAL_STEPS - 1)) * 100;
  el.progressFill.style.width = `${pct}%`;
  el.progressBar.setAttribute('aria-valuenow', String(state.step));
  el.stepLabel.textContent = `Step ${state.step} of ${TOTAL_STEPS}`;

  // With no departures to choose from, step 2 is a dead end — its own CTA takes over.
  const strandedOnDates =
    state.step === 2 && state.tripType === 'joiner' && !hasDepartures;

  el.back.hidden = state.step === 1;
  el.next.hidden = state.step === 1 || state.step === TOTAL_STEPS || strandedOnDates;
  el.nav.hidden = state.step === 1;
  el.next.innerHTML =
    state.step === TOTAL_STEPS - 1
      ? 'See my estimate <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>'
      : 'Continue <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';

  // Move focus to the new question so keyboard and screen-reader users follow along.
  const heading = el.steps.find(s => Number(s.dataset.step) === state.step)
    ?.querySelector('.wiz-question');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Push before rendering: render() calls persist(), which replaceStates the
  // *current* entry. Pushing first means it stamps the new entry, not the old
  // one — otherwise going back lands on a duplicate of the step you left.
  if (push) history.pushState({ wiz: snapshot() }, '');
  render();
}

el.choices.forEach(choice => {
  choice.addEventListener('click', () => {
    state.tripType = choice.dataset.type;
    syncTripType();
    goTo(2);
  });
});

el.back.addEventListener('click', () => history.back());
el.next.addEventListener('click', () => goTo(state.step + 1));

// ============================================================
// COUNTERS
// ============================================================

document.querySelectorAll('.wiz-counter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    setCounter(input, readInt(input) + Number(btn.dataset.step));
  });
});

[el.adults, el.children, el.nights].forEach(input => {
  input.addEventListener('change', () => setCounter(input, readInt(input)));
  input.addEventListener('focus', () => input.select());
});

function readInt(input) {
  const n = parseInt(input.value, 10);
  return Number.isFinite(n) ? n : Number(input.min) || 0;
}

function setCounter(input, value) {
  const min = Number(input.min);
  const max = Number(input.max);
  input.value = Math.max(min, Math.min(max, value));

  if (input === el.children) syncAgePickers();
  if (input === el.nights) {
    el.nightsUnit.textContent = Number(input.value) === 1 ? 'night' : 'nights';
  }
  render();
}

/** Remaining seats on the chosen departure; private trips are uncapped here. */
function slotLimit() {
  if (state.tripType !== 'joiner') return Infinity;
  const tour = currentTour();
  return tour ? tour.slots : Infinity;
}

/**
 * Keeps the party within the departure's remaining slots. Advertising
 * "9 slots left" and then quoting 20 guests is a promise we can't keep.
 */
function enforceSlots() {
  const limit = slotLimit();
  const plus = input => input.closest('.wiz-counter').querySelector('[data-step="1"]');
  const minus = input => input.closest('.wiz-counter').querySelector('[data-step="-1"]');

  let adults = readInt(el.adults);
  let children = readInt(el.children);

  if (Number.isFinite(limit)) {
    if (adults > limit) {
      adults = Math.max(Number(el.adults.min), limit);
      el.adults.value = adults;
    }
    if (adults + children > limit) {
      children = Math.max(0, limit - adults);
      el.children.value = children;
      syncAgePickers();
    }
  }

  const atCap = Number.isFinite(limit) && adults + children >= limit;
  plus(el.adults).disabled = atCap || adults >= Number(el.adults.max);
  plus(el.children).disabled = atCap || children >= Number(el.children.max);
  minus(el.adults).disabled = adults <= Number(el.adults.min);
  minus(el.children).disabled = children <= Number(el.children.min);
  plus(el.nights).disabled = readInt(el.nights) >= Number(el.nights.max);
  minus(el.nights).disabled = readInt(el.nights) <= Number(el.nights.min);

  const tour = currentTour();
  if (Number.isFinite(limit) && tour) {
    el.slots.hidden = false;
    el.slots.classList.toggle('is-full', atCap);
    el.slots.textContent = atCap
      ? `That's all ${limit} remaining slot${limit === 1 ? '' : 's'} on ${formatTourLabel(tour)}. Pick another departure for a larger party.`
      : `${formatTourLabel(tour)} has ${limit} slot${limit === 1 ? '' : 's'} left.`;
  } else {
    el.slots.hidden = true;
  }
}

/** Add or remove age pickers to match the child count, keeping ages already chosen. */
function syncAgePickers() {
  const want = readInt(el.children);
  const have = el.ages.querySelectorAll('.wiz-age').length;

  for (let i = have; i < want; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'wiz-age';

    const label = document.createElement('label');
    label.className = 'wiz-age-label';
    label.textContent = `Child ${i + 1}`;
    label.htmlFor = `est-age-${i}`;

    const select = document.createElement('select');
    select.className = 'wiz-age-select';
    select.id = `est-age-${i}`;
    for (let age = 0; age <= CHILD_MAX_AGE; age++) {
      const opt = document.createElement('option');
      opt.value = String(age);
      opt.textContent = age === 0 ? 'Under 1' : `${age} yr${age === 1 ? '' : 's'}`;
      select.appendChild(opt);
    }
    select.value = '6'; // full-rate default — never understates the total
    select.addEventListener('change', render);

    wrap.append(label, select);
    el.ages.appendChild(wrap);
  }

  for (let i = have; i > want; i--) el.ages.lastElementChild.remove();

  el.agesPanel.hidden = want === 0;
}

// ============================================================
// RENDER
// ============================================================

function currentTour() {
  return tours.find(t => t.start === state.tourStart) || null;
}

function readAges() {
  return Array.from(el.ages.querySelectorAll('.wiz-age-select'), s => parseInt(s.value, 10));
}

function currentEstimate() {
  const isJoiner = state.tripType === 'joiner';
  // A departure only applies to a joiner trip. Resolving it unconditionally would
  // leak the last-picked date into a private recap and into the funnel URL.
  const tour = isJoiner ? currentTour() : null;
  const nights = isJoiner
    ? (tour ? nightsBetween(tour.start, tour.end) : 3)
    : readInt(el.nights);

  const result = estimate({
    ratePerHead: isJoiner ? (tour ? tour.price : null) : PRIVATE_BASE_PER_HEAD,
    adults: readInt(el.adults),
    childAges: readAges(),
    nights,
    accommodationId: state.accommodationId,
    addonIds: Array.from(el.addons.querySelectorAll('input:checked'), i => i.value),
  });

  return { result, tour, nights };
}

function render() {
  if (!enforcing) {
    enforcing = true;
    enforceSlots();
    enforcing = false;
  }

  const { result, tour, nights } = currentEstimate();

  // Keep the chosen departure visible even while browsing a different month.
  if (state.tripType === 'joiner' && tour) {
    el.chosen.hidden = false;
    el.chosen.textContent = `Selected: ${formatTourLabel(tour)} · ${formatPeso(tour.price)}/head`;
    markMonthHoldingSelection();
  } else {
    el.chosen.hidden = true;
  }

  // Running total: only once there is something real to show.
  const showRunning = state.step >= 3 && state.step < TOTAL_STEPS && result.quotable;
  el.running.hidden = !showRunning;
  if (showRunning) el.runningValue.textContent = formatPeso(result.total);

  persist();

  if (state.step !== TOTAL_STEPS) return;

  el.recap.textContent = buildRecap(result, tour, nights);
  el.lines.replaceChildren();

  if (!result.quotable) {
    // Two different reasons land here: a private stay we price by hand, or a
    // joiner with no published departures left. They need different copy.
    const strandedJoiner = state.tripType === 'joiner';
    const note = document.createElement('p');
    note.className = 'wiz-quote-note';
    note.textContent = strandedJoiner
      ? 'We haven\'t published the next season\'s departure dates yet, so there\'s no rate to quote. Tell us roughly when you\'d like to travel and we\'ll come back to you as soon as they\'re confirmed.'
      : 'Private stays are quoted per group, so we price them by hand. Send us your dates and party and we\'ll come back with a full breakdown — usually the same day.';
    el.lines.appendChild(note);

    el.total.textContent = strandedJoiner ? 'Not yet set' : 'On request';
    el.perHead.textContent = '';
    el.cta.textContent = strandedJoiner ? 'Register your interest' : 'Request my quote';
    el.cta.href = buildFunnelUrl(result, null, nights);
    el.status.textContent = strandedJoiner
      ? `No departures published yet for ${result.totalGuests} guests.`
      : `Private stay for ${result.totalGuests} guests — priced on request.`;
    return;
  }

  result.lines.forEach(line => {
    const row = document.createElement('div');
    row.className = 'wiz-line' + (line.free ? ' is-free' : '');

    const label = document.createElement('span');
    label.className = 'wiz-line-label';
    label.textContent = line.label;

    const detail = document.createElement('span');
    detail.className = 'wiz-line-detail';
    detail.textContent = line.detail;
    label.appendChild(detail);

    const amount = document.createElement('span');
    amount.className = 'wiz-line-amount';
    amount.textContent = line.free ? 'Free' : formatPeso(line.amount);

    row.append(label, amount);
    el.lines.appendChild(row);
  });

  el.total.textContent = formatPeso(result.total);
  el.perHead.textContent = result.payingHeads > 0
    ? `≈ ${formatPeso(result.total / result.payingHeads)} per paying guest` +
      (result.freeGuests > 0
        ? ` · ${result.freeGuests} child${result.freeGuests === 1 ? '' : 'ren'} travelling free`
        : '')
    : '';
  el.cta.textContent = 'Reserve your spot';
  el.cta.href = buildFunnelUrl(result, tour, nights);
  el.status.textContent =
    `Estimated total ${formatPeso(result.total)} for ${result.totalGuests} guest${result.totalGuests === 1 ? '' : 's'}.`;
}

function buildRecap(result, tour, nights) {
  const parts = [];
  parts.push(state.tripType === 'joiner' ? `${nights + 1}D/${nights}N joiner tour` : 'Private stay');
  if (tour) parts.push(formatTourLabel(tour));
  else if (state.tripType === 'private') parts.push(`${nights} night${nights === 1 ? '' : 's'}`);

  const adults = readInt(el.adults);
  const kids = readAges().length;
  parts.push(
    `${adults} adult${adults === 1 ? '' : 's'}` +
    (kids ? ` · ${kids} child${kids === 1 ? '' : 'ren'}` : '')
  );

  const room = ACCOMMODATIONS.find(a => a.id === state.accommodationId);
  if (room) parts.push(room.label);

  return parts.join(' · ');
}

/** Carry the estimate into the funnel so the enquiry arrives with context. */
function buildFunnelUrl(result, tour, nights) {
  const params = new URLSearchParams({
    type: state.tripType || 'joiner',
    adults: String(readInt(el.adults)),
    guests: String(result.totalGuests),
    room: state.accommodationId,
    nights: String(nights),
  });
  const ages = readAges();
  if (ages.length) params.set('ages', ages.join(','));
  if (tour) params.set('date', tour.start);
  if (result.quotable) params.set('estimate', String(result.total));
  return `funnel.html?${params}`;
}

// ============================================================
// FIRST PAINT
// ============================================================

let saved = null;
try {
  saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
} catch {
  saved = null;
}

if (saved && saved.tripType) {
  // Resume where they left off after a refresh or an accidental navigation away.
  applySnapshot(saved);
} else {
  syncAgePickers();
  goTo(1, { push: false });
}
