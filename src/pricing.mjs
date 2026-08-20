// Pricing rules for the trip estimator.
// Pure ESM, no imports, no DOM — unit-tested with `npm test` (node:test),
// same contract as joiner-schedule.mjs. Every rate a guest can see is defined
// here and nowhere else, so there is exactly one place to edit when rates move.

// ============================================================
// CHILD POLICY  (confirmed by owner)
//   ages 0–3  → free
//   ages 4–5  → half the adult rate
//   ages 6+   → full adult rate
// ============================================================
export const CHILD_FREE_UNDER = 4;
export const CHILD_HALF_UNDER = 6;
export const CHILD_MAX_AGE = 17;

/** Fraction of the adult rate a guest of `age` pays. */
export function childMultiplier(age) {
  if (!Number.isFinite(age) || age < 0) return 1;
  if (age < CHILD_FREE_UNDER) return 0;
  if (age < CHILD_HALF_UNDER) return 0.5;
  return 1;
}

/** Human-readable reason for a child's rate, used as the line-item detail. */
export function childRateLabel(age) {
  const m = childMultiplier(age);
  if (m === 0) return 'free';
  if (m === 0.5) return 'half rate';
  return 'full rate';
}

// ============================================================
// ACCOMMODATION
// Rates mirror the room cards on the home page: the Sicsican basecamp tent is
// included in the package, and a hut is a per-head, per-night upgrade.
// ============================================================
export const ACCOMMODATIONS = [
  {
    id: 'tent',
    label: 'Canopy Tent',
    note: 'Tent with complete beddings at the Sicsican basecamp',
    // Included in the joiner package; on a private stay it is booked outright.
    joinerUpgradePerHeadPerNight: 0,
    privateNightlyRate: 3800,
    sleeps: '1\u20132 guests',
    image: '/gallery/rooms/cards/canopy.webp',
    alt: 'An elevated jungle canopy tent wrapped in green foliage',
  },
  {
    id: 'kubo',
    label: 'Kubo by the Shore',
    note: 'Beachfront native hut of bamboo and nipa, steps from the water',
    joinerUpgradePerHeadPerNight: 200,
    privateNightlyRate: 4500,
    sleeps: '2\u20133 guests',
    image: '/gallery/rooms/cards/kubo.webp',
    alt: 'Beachfront native kubo hut with a thatched roof at the shoreline',
  },
  {
    id: 'villa',
    label: 'Malaya Villa',
    note: 'Private beach villa with an open deck facing the ocean',
    joinerUpgradePerHeadPerNight: 200,
    privateNightlyRate: 8500,
    sleeps: '8\u201310 guests',
    image: '/gallery/rooms/cards/villa.webp',
    alt: 'Private Malaya beach villa with an open deck facing the ocean',
  },
];

/**
 * What this room adds to a total, which depends on the product being bought.
 *
 * A joiner tour already includes the basecamp tent, so a hut is a per-head,
 * per-night upgrade. A private stay books the room outright at its nightly
 * rate. These are two different products, not two prices for one thing — and
 * conflating them is what made the home page and the funnel disagree.
 *
 * @returns {{amount: number, per: 'head-night'|'night', total: number}}
 */
export function accommodationCharge(room, { tripType, payingHeads, nights }) {
  if (tripType === 'private') {
    const amount = room.privateNightlyRate || 0;
    return { amount, per: 'night', total: amount * Math.max(0, nights) };
  }
  const amount = room.joinerUpgradePerHeadPerNight || 0;
  return {
    amount,
    per: 'head-night',
    total: amount * Math.max(0, payingHeads) * Math.max(0, nights),
  };
}

export function findAccommodation(id) {
  return ACCOMMODATIONS.find(a => a.id === id) || ACCOMMODATIONS[0];
}

// ============================================================
// OPTIONAL ADD-ONS
// Empty until real prices are confirmed — the estimator hides the whole
// add-ons block while this list is empty, so nothing unpriced ever renders.
//
// To add one, append an object in this shape:
//   { id: 'transfer', label: 'Private airport transfer',
//     note: 'Puerto Princesa hotel pickup', amount: 2500,
//     per: 'booking' | 'head' | 'head-night' }
// ============================================================
export const ADDONS = [];

export function findAddon(id) {
  return ADDONS.find(a => a.id === id);
}

// ============================================================
// PRIVATE STAY BASE RATE
// Per-head all-in package rate for a private (non-joiner) booking, on top of
// which the accommodation upgrade applies.
//
// Left null on purpose: the real rate has not been confirmed, and the estimator
// renders "Request a quote" instead of a number while it is null. Set it to a
// peso amount to switch private estimates on.
// ============================================================
export const PRIVATE_BASE_PER_HEAD = null;

// ============================================================
// HELPERS
// ============================================================

/** Nights between two ISO dates. Handles the off-rhythm 5-day tours in the schedule. */
export function nightsBetween(startISO, endISO) {
  const start = Date.parse(`${startISO}T00:00:00Z`);
  const end = Date.parse(`${endISO}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86400000));
}

export function formatPeso(amount) {
  return `₱${Math.round(amount).toLocaleString('en-PH')}`;
}

// ============================================================
// ESTIMATE
// ============================================================

/**
 * Build an itemised estimate.
 *
 * @param {object} opts
 * @param {number|null} opts.ratePerHead  Adult package rate. Null → not quotable.
 * @param {number} opts.adults            Adults at full rate (min 1).
 * @param {number[]} opts.childAges       One age per child.
 * @param {number} opts.nights            Nights on the island.
 * @param {string} opts.accommodationId   One of ACCOMMODATIONS[].id
 * @param {string[]} opts.addonIds        Selected ADDONS[].id
 * @returns {{quotable: boolean, lines: Array, total: number,
 *            payingHeads: number, freeGuests: number, totalGuests: number}}
 */
export function estimate({
  ratePerHead,
  adults = 1,
  childAges = [],
  nights = 3,
  accommodationId = 'tent',
  addonIds = [],
  tripType = 'joiner',
} = {}) {
  const adultCount = Math.max(0, Math.floor(adults));
  const ages = childAges.filter(a => Number.isFinite(a));
  const totalGuests = adultCount + ages.length;

  // Guests billed for per-head extras: everyone except the free-tier infants.
  const payingHeads = adultCount + ages.filter(a => childMultiplier(a) > 0).length;
  const freeGuests = ages.filter(a => childMultiplier(a) === 0).length;

  if (!Number.isFinite(ratePerHead) || ratePerHead === null) {
    return { quotable: false, lines: [], total: 0, payingHeads, freeGuests, totalGuests };
  }

  const lines = [];

  if (adultCount > 0) {
    lines.push({
      key: 'adults',
      label: `Package × ${adultCount} adult${adultCount === 1 ? '' : 's'}`,
      detail: `${formatPeso(ratePerHead)} per head`,
      amount: adultCount * ratePerHead,
    });
  }

  // One line per child so a guest can see exactly why each one is priced that way.
  ages.forEach((age, i) => {
    const multiplier = childMultiplier(age);
    lines.push({
      key: `child-${i}`,
      label: `Child, age ${age}`,
      detail: childRateLabel(age),
      amount: Math.round(ratePerHead * multiplier),
      free: multiplier === 0,
    });
  });

  const room = findAccommodation(accommodationId);
  const charge = accommodationCharge(room, { tripType, payingHeads, nights });
  if (charge.total > 0) {
    lines.push({
      key: 'accommodation',
      label: charge.per === 'night' ? room.label : `${room.label} upgrade`,
      detail: charge.per === 'night'
        ? `${formatPeso(charge.amount)}/night × ${nights} night${nights === 1 ? '' : 's'}`
        : `${formatPeso(charge.amount)}/head/night × ${payingHeads} guest${payingHeads === 1 ? '' : 's'} × ${nights} night${nights === 1 ? '' : 's'}`,
      amount: charge.total,
    });
  }

  addonIds.forEach(id => {
    const addon = findAddon(id);
    if (!addon) return;
    let amount = addon.amount;
    let detail = formatPeso(addon.amount);
    if (addon.per === 'head') {
      amount = addon.amount * payingHeads;
      detail = `${formatPeso(addon.amount)}/head × ${payingHeads}`;
    } else if (addon.per === 'head-night') {
      amount = addon.amount * payingHeads * nights;
      detail = `${formatPeso(addon.amount)}/head/night × ${payingHeads} × ${nights}`;
    }
    lines.push({ key: `addon-${id}`, label: addon.label, detail, amount });
  });

  const total = lines.reduce((sum, l) => sum + l.amount, 0);

  return { quotable: true, lines, total, payingHeads, freeGuests, totalGuests };
}
