// Trip estimator — step-by-step onboarding flow for estimate.html.
// All arithmetic and every peso amount lives in pricing.mjs; this file only
// walks the guest through the questions and paints the result.

// No chat widget on this page. Its fixed FAB sits at bottom-right with
// z-index 9999 and covered ~31% of the Continue button in the wizard's own
// action bar; that corner already belongs to Back/Continue here. The home page
// and funnel still load it.
import {
  ACCOMMODATIONS,
  ADDONS,
  CHILD_MAX_AGE,
  PRIVATE_BASE_PER_HEAD,
  estimate,
  formatPeso,
  nightsBetween,
} from './pricing.mjs';
import { serializeTrip } from './trip-params.mjs';
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
  privateStart: document.getElementById('private_start'),
  privateEnd: document.getElementById('private_end'),
  dateError: document.getElementById('wiz-date-error'),
  heading5: document.getElementById('wiz-h5'),
  fineprint: document.getElementById('wiz-fineprint'),
  adults: document.getElementById('est-adults'),
  children: document.getElementById('est-children'),
  slots: document.getElementById('wiz-slots'),
  agesPanel: document.getElementById('wiz-ages-panel'),
  ages: document.getElementById('est-ages'),
  rooms: document.getElementById('est-rooms'),
  lightbox: document.getElementById('wiz-lightbox'),
  lightboxImg: document.getElementById('wiz-lightbox-img'),
  lightboxCaption: document.getElementById('wiz-lightbox-caption'),
  lightboxClose: document.getElementById('wiz-lightbox-close'),
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

// Drives every private-path label. Setting PRIVATE_BASE_PER_HEAD in pricing.mjs
// flips the whole flow from "send us your details" to a real itemised estimate
// with no further changes here.
const CAN_QUOTE_PRIVATE = PRIVATE_BASE_PER_HEAD != null;

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

// Say up front that private is priced by hand, rather than after four steps.
if (!CAN_QUOTE_PRIVATE) {
  const tag = document.querySelector('.wiz-choice[data-type="private"] .wiz-choice-tag');
  if (tag) tag.textContent = 'Priced by hand · we reply the same day';
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
    card.setAttribute('aria-label', departureAriaLabel(tour, nights));
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

/**
 * Explicit accessible name for a departure card. The three spans otherwise run
 * together as "Aug 20 - 234D/3N ...", where the range's "23" and the duration's
 * "4D" merge into "234D" and the date becomes unrecoverable. Leads with the
 * visible range so Label in Name (WCAG 2.5.3) holds.
 */
function departureAriaLabel(tour, nights) {
  const price = tour.price.toLocaleString('en-PH');
  const slots = `${tour.slots} slot${tour.slots === 1 ? '' : 's'} left`;
  return `${formatTourLabel(tour)}. ${nights + 1} days, ${nights} nights. `
    + `${price} pesos per head. ${slots}.`;
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

  // Where you sleep is the most sensory choice in the flow and the repo already
  // has the photographs; three lines of text was the wrong medium for it.
  const figure = document.createElement('span');
  figure.className = 'wiz-room-figure';
  const img = document.createElement('img');
  img.className = 'wiz-room-img';
  img.src = room.image;
  img.width = 640;
  img.height = 427;
  img.loading = i === 0 ? 'eager' : 'lazy';
  img.decoding = 'async';
  // Decorative here: the button's aria-label already names and describes the
  // room, so alt text would just repeat it to a screen reader.
  img.alt = '';
  figure.appendChild(img);

  const body = document.createElement('span');
  body.className = 'wiz-room-body';

  const head = document.createElement('span');
  head.className = 'wiz-room-head';

  const name = document.createElement('span');
  name.className = 'wiz-room-name';
  name.textContent = room.label;

  const price = document.createElement('span');
  price.className = 'wiz-room-price';
  price.textContent = roomPriceText(room);

  head.append(name, price);

  const note = document.createElement('span');
  note.className = 'wiz-room-note';
  note.textContent = room.note;

  const sleeps = document.createElement('span');
  sleeps.className = 'wiz-room-sleeps';
  sleeps.textContent = room.sleeps;

  body.append(head, note, sleeps);
  card.append(figure, body);
  card.setAttribute('aria-label', roomAriaLabel(room));
  card.addEventListener('click', () => {
    state.accommodationId = room.id;
    syncRoomSelection();
    render();
  });

  // The card is a <button>, so the spotlight cannot live inside it — nested
  // buttons are invalid and browsers drop the inner one. It sits alongside in a
  // wrapper and is positioned over the image instead.
  const wrap = document.createElement('div');
  wrap.className = 'wiz-room-wrap';

  const zoom = document.createElement('button');
  zoom.type = 'button';
  zoom.className = 'wiz-room-zoom';
  zoom.innerHTML = '<i class="fa-solid fa-expand" aria-hidden="true"></i>';
  zoom.setAttribute('aria-label', `See a larger photo of ${room.label}`);
  zoom.addEventListener('click', event => {
    event.stopPropagation();   // spotlight only; do not also pick the room
    openLightbox(room);
  });

  wrap.append(card, zoom);
  el.rooms.appendChild(wrap);
});

/** Opens the full, uncropped photo. The card image is a 3:2 crop of it. */
function openLightbox(room) {
  if (!el.lightbox) return;
  el.lightboxImg.src = room.photo;
  el.lightboxImg.alt = room.alt;
  el.lightboxCaption.textContent = `${room.label} — ${room.sleeps}`;
  el.lightbox.showModal();
}

if (el.lightbox) {
  el.lightboxClose.addEventListener('click', () => el.lightbox.close());
  // Clicking the backdrop closes it. The dialog element itself is the backdrop
  // target, so a click landing on it rather than on its contents means outside.
  el.lightbox.addEventListener('click', event => {
    if (event.target === el.lightbox) el.lightbox.close();
  });
  // Escape should close a modal <dialog> without any help, but it did not fire
  // `cancel` here even with a trusted keydown reaching the page, so closing is
  // handled explicitly rather than left to the UA. Where the native behaviour
  // does work this is a harmless no-op — close() on a closing dialog does
  // nothing.
  el.lightbox.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    el.lightbox.close();
  });
  // Drop the src on close so a reopen of another room never flashes the last one.
  el.lightbox.addEventListener('close', () => { el.lightboxImg.src = ''; });
}

/**
 * What this room costs on the product currently being priced. A joiner tour
 * includes the tent and charges a per-head upgrade for a hut; a private stay
 * books the room outright per night. Until private is quotable it shows neither.
 */
function roomPriceText(room) {
  if (state.tripType === 'private') {
    return CAN_QUOTE_PRIVATE ? `${formatPeso(room.privateNightlyRate)}/night` : 'Preference';
  }
  return room.joinerUpgradePerHeadPerNight > 0
    ? `+${formatPeso(room.joinerUpgradePerHeadPerNight)}/head/night`
    : 'Included';
}

/**
 * Explicit accessible name for a room card. The three child spans otherwise
 * concatenate into a run-on string ("Canopy TentIncluded - tent with complete
 * beddingsIncluded"), and the price repeats a word the note already used.
 * Starts with the visible label so Label in Name (WCAG 2.5.3) still holds, and
 * spells the rate out rather than leaving "+P200/head/night" to a screen reader.
 */
function roomAriaLabel(room) {
  const note = room.note.replace(/\s*[\u00b7\u2014]\s*/g, ', ');
  const sleeps = `Sleeps ${room.sleeps.replace(/\u2013/g, ' to ')}.`;
  const head = `${room.label}. ${note}. ${sleeps}`;

  if (state.tripType === 'private') {
    // Nothing is bundled on a private stay — the room is the purchase. Saying
    // "included" here would be the same conflation that made the pages disagree.
    return CAN_QUOTE_PRIVATE
      ? `${head} ${room.privateNightlyRate} pesos per night.`
      : `${head} Priced with your quote.`;
  }
  return room.joinerUpgradePerHeadPerNight > 0
    ? `${head} Plus ${room.joinerUpgradePerHeadPerNight} pesos per guest per night.`
    : `${head} Included in the joiner package.`;
}

/** Repaints the price on each card when the trip type changes. */
function syncRoomPrices() {
  el.rooms.querySelectorAll('.wiz-room').forEach(card => {
    const room = ACCOMMODATIONS.find(a => a.id === card.dataset.room);
    const priceEl = card.querySelector('.wiz-room-price');
    if (!room || !priceEl) return;
    priceEl.textContent = roomPriceText(room);
    card.setAttribute('aria-label', roomAriaLabel(room));
  });
}

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
    privateStart: el.privateStart.value,
    privateEnd: el.privateEnd.value,
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
  if (!restoring) history.replaceState({ wiz: snap, idx: currentIdx() }, '');
}

function applySnapshot(snap, { fromHistory = false } = {}) {
  if (!snap) return;
  restoring = fromHistory;

  state.tripType = snap.tripType;
  state.tourStart = snap.tourStart;
  state.accommodationId = snap.accommodationId || ACCOMMODATIONS[0].id;

  el.adults.value = snap.adults;
  el.nights.value = snap.nights;
  if (snap.privateStart) el.privateStart.value = snap.privateStart;
  if (snap.privateEnd) el.privateEnd.value = snap.privateEnd;
  syncPrivateNights();
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
  syncRoomPrices();

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
  const finalLabel = quotableNow()
    ? 'See my estimate'
    : 'Review my request';
  el.next.innerHTML =
    state.step === TOTAL_STEPS - 1
      ? `${finalLabel} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>`
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
  if (push) history.pushState({ wiz: snapshot(), idx: currentIdx() + 1 }, '');
  render();
}

el.choices.forEach(choice => {
  choice.addEventListener('click', () => {
    state.tripType = choice.dataset.type;
    syncTripType();
    goTo(2);
  });
});

/** How many wizard entries THIS document pushed. 0 on a restored session. */
function currentIdx() {
  return history.state && typeof history.state.idx === 'number' ? history.state.idx : 0;
}

el.back.addEventListener('click', () => {
  // Only hand off to the browser when this document actually pushed an entry to
  // return to. A session restored from sessionStorage lands on step N having
  // pushed nothing, and history.back() would leave the site entirely — which is
  // how Back ended up going to the home page.
  if (currentIdx() > 0) history.back();
  else goTo(state.step - 1, { push: false });
});
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

[el.adults, el.children].forEach(input => {
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
  render();
}

/** Default the private range to a month out, three nights, so nothing is blank. */
function seedPrivateDates() {
  const today = new Date(`${todayISO()}T00:00:00Z`);
  const iso = d => d.toISOString().slice(0, 10);
  const start = new Date(today.getTime() + 30 * 86400000);
  const end = new Date(start.getTime() + 3 * 86400000);
  el.privateStart.min = todayISO();
  el.privateEnd.min = todayISO();
  if (!el.privateStart.value) el.privateStart.value = iso(start);
  if (!el.privateEnd.value) el.privateEnd.value = iso(end);
}

/**
 * Derives nights from the private date range and validates it. Nights feed the
 * estimate, so they are computed rather than asked for separately.
 */
function syncPrivateNights() {
  const start = el.privateStart.value;
  const end = el.privateEnd.value;
  el.privateEnd.min = start || todayISO();

  const nights = start && end ? nightsBetween(start, end) : 0;
  const valid = nights > 0;

  el.dateError.hidden = valid || !start || !end;
  if (!el.dateError.hidden) {
    el.dateError.textContent = 'Your leaving date needs to be after your arrival date.';
  }
  el.nightsUnit.textContent = valid
    ? `${nights} night${nights === 1 ? '' : 's'} on the island`
    : '';

  // Fall back to 3 so a half-filled range never produces a nonsense estimate.
  el.nights.value = valid ? nights : 3;
  return valid;
}

[el.privateStart, el.privateEnd].forEach(input => {
  input.addEventListener('change', () => { syncPrivateNights(); render(); });
});

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

/** Whether the current trip type can produce a real total. */
function quotableNow() {
  return state.tripType === 'private' ? CAN_QUOTE_PRIVATE : hasDepartures;
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
    tripType: isJoiner ? 'joiner' : 'private',
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
    // joiner with no published departures left. Neither can show a number, so
    // the screen stops calling itself an estimate and shows back exactly what
    // was collected — otherwise four steps of questions return two words.
    const strandedJoiner = state.tripType === 'joiner';

    el.heading5.textContent = "Here's your request";

    const note = document.createElement('p');
    note.className = 'wiz-quote-note';
    note.textContent = strandedJoiner
      ? 'We haven\'t published the next season\'s departure dates yet, so there\'s no rate to quote. Send this over and we\'ll come back to you the moment they\'re confirmed.'
      : 'Private trips are priced by hand, so the total below stays open until we\'ve seen your dates. Send this over and we\'ll come back with a full breakdown — usually the same day.';
    el.lines.appendChild(note);

    summaryRows(nights).forEach(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'wiz-line';
      const l = document.createElement('span');
      l.className = 'wiz-line-label';
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'wiz-line-amount';
      v.textContent = value;
      row.append(l, v);
      el.lines.appendChild(row);
    });

    el.total.textContent = strandedJoiner ? 'Not yet set' : 'On request';
    el.perHead.textContent = '';
    el.cta.textContent = strandedJoiner ? 'Register my interest' : 'Send my details';
    el.cta.href = buildFunnelUrl(result, null, nights);
    el.fineprint.textContent = strandedJoiner
      ? 'Nothing is booked yet. We\'ll email you as soon as the next season\'s departures are confirmed.'
      : 'Nothing is booked yet. We\'ll confirm pricing, inclusions and availability by email before anything is committed.';
    el.status.textContent = strandedJoiner
      ? `Request ready to send for ${result.totalGuests} guests. No departures published yet.`
      : `Request ready to send. Private stay for ${result.totalGuests} guests, priced on request.`;
    return;
  }

  el.heading5.textContent = "Here's your estimate";
  el.fineprint.textContent =
    'An estimate, not an invoice — final pricing is confirmed when you book. '
    + 'Excludes airfare, Puerto Princesa hotel, Day 1 breakfast, and Day 4 lunch & dinner.';

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

const MONTHS_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO date to something a guest reads, not a database key. */
function formatDateLong(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_ABBR[m - 1]} ${y}`;
}

/** What the visitor told us, echoed back when we cannot price it yet. */
function summaryRows(nights) {
  const rows = [];
  if (state.tripType === 'private') {
    const start = el.privateStart.value;
    const end = el.privateEnd.value;
    if (start && end) rows.push(['Dates', `${formatDateLong(start)} \u2013 ${formatDateLong(end)}`]);
    rows.push(['Length of stay', `${nights} night${nights === 1 ? '' : 's'}`]);
  } else {
    rows.push(['Trip', '4D/3N joiner tour']);
  }

  const adults = readInt(el.adults);
  const ages = readAges();
  rows.push(['Party', `${adults} adult${adults === 1 ? '' : 's'}`
    + (ages.length ? ` · ${ages.length} child${ages.length === 1 ? '' : 'ren'}` : '')]);
  if (ages.length) rows.push(['Children\u2019s ages', ages.join(', ')]);

  const room = ACCOMMODATIONS.find(a => a.id === state.accommodationId);
  if (room) rows.push(['Accommodation', room.label]);
  return rows;
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

/**
 * Carry the estimate into the funnel. The param vocabulary lives in
 * trip-params.mjs so the two pages cannot drift apart again.
 */
function buildFunnelUrl(result, tour, nights) {
  const params = serializeTrip({
    tripType: state.tripType || 'joiner',
    departure: tour ? tour.start : null,
    checkIn: state.tripType === 'private' ? el.privateStart.value : null,
    checkOut: state.tripType === 'private' ? el.privateEnd.value : null,
    nights,
    adults: readInt(el.adults),
    childAges: readAges(),
    room: state.accommodationId,
    estimate: result.quotable ? result.total : null,
  });
  return `funnel.html?${params}`;
}

// ============================================================
// FIRST PAINT
// ============================================================

// Seed and validate the private range before any render reads it.
seedPrivateDates();
syncPrivateNights();

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
