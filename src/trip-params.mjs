// The single vocabulary the estimator and the funnel share.
//
// Both sides used to hand-write their own param names, and they drifted: the
// estimator sent `adults`, `start` and `end`; the funnel read `pax`, `checkin`
// and `checkout`, and only looked at `room` on its private branch. A complete
// estimate arrived at the funnel having lost the party size, the children's
// ages, the room and the quoted total.
//
// Pure ESM, no imports — unit-tested with `npm test` (node:test), same contract
// as joiner-schedule.mjs and pricing.mjs.

/** Canonical param names. Anything not listed here is not part of the contract. */
export const TRIP_PARAMS = {
  type: 'type',            // 'joiner' | 'private'
  departure: 'date',       // joiner: ISO date of the chosen departure
  checkIn: 'checkin',      // private: ISO arrival
  checkOut: 'checkout',    // private: ISO departure
  nights: 'nights',
  adults: 'adults',
  ages: 'ages',            // comma-separated child ages
  room: 'room',            // ACCOMMODATIONS[].id, never a display label
  estimate: 'estimate',    // total in whole pesos, omitted when not quotable
};

/**
 * Older links (ads, GHL campaigns, anything already in the wild) used these.
 * Read-only: we accept them so existing URLs keep working, and never emit them.
 */
const LEGACY_ALIASES = {
  pax: 'adults',
  start: 'checkin',
  end: 'checkout',
};

export const MAX_ADULTS = 20;
export const MAX_CHILDREN = 10;
export const MAX_NIGHTS = 30;
export const MAX_CHILD_AGE = 17;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isoOrNull(value) {
  if (!value || !ISO_DATE.test(value)) return null;
  return Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ? value : null;
}

function intInRange(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * Build the query string for a handoff. Empty and unknown values are omitted so
 * the URL carries only what was actually decided.
 *
 * @param {object} trip
 * @returns {URLSearchParams}
 */
export function serializeTrip(trip = {}) {
  const params = new URLSearchParams();
  const P = TRIP_PARAMS;

  const type = trip.tripType === 'private' ? 'private' : 'joiner';
  params.set(P.type, type);

  if (type === 'joiner') {
    const departure = isoOrNull(trip.departure);
    if (departure) params.set(P.departure, departure);
  } else {
    const checkIn = isoOrNull(trip.checkIn);
    const checkOut = isoOrNull(trip.checkOut);
    if (checkIn) params.set(P.checkIn, checkIn);
    if (checkOut) params.set(P.checkOut, checkOut);
  }

  if (Number.isFinite(trip.nights)) {
    params.set(P.nights, String(intInRange(trip.nights, 1, MAX_NIGHTS, 3)));
  }
  if (Number.isFinite(trip.adults)) {
    params.set(P.adults, String(intInRange(trip.adults, 0, MAX_ADULTS, 2)));
  }

  const ages = normaliseAges(trip.childAges);
  if (ages.length) params.set(P.ages, ages.join(','));

  if (trip.room) params.set(P.room, String(trip.room));

  // Only a real total travels. Null means "not quotable", which is not a price.
  if (Number.isFinite(trip.estimate) && trip.estimate > 0) {
    params.set(P.estimate, String(Math.round(trip.estimate)));
  }

  return params;
}

function normaliseAges(input) {
  const list = Array.isArray(input)
    ? input
    : String(input ?? '').split(',');
  return list
    .map(a => parseInt(a, 10))
    .filter(a => Number.isFinite(a) && a >= 0 && a <= MAX_CHILD_AGE)
    .slice(0, MAX_CHILDREN);
}

/**
 * Read a handoff back. Returns null when the URL carries no recognisable trip,
 * which is how a caller tells a cold arrival from a warm one.
 *
 * Every value is clamped and validated: this parses untrusted input from a URL
 * bar, not our own serialiser's output.
 *
 * @param {string|URLSearchParams} input
 * @returns {object|null}
 */
export function parseTrip(input) {
  const params = input instanceof URLSearchParams
    ? input
    : new URLSearchParams(String(input ?? '').replace(/^\?/, ''));

  const get = key => {
    const direct = params.get(key);
    if (direct !== null) return direct;
    for (const [alias, canonical] of Object.entries(LEGACY_ALIASES)) {
      if (canonical === key) {
        const legacy = params.get(alias);
        if (legacy !== null) return legacy;
      }
    }
    return null;
  };

  const rawType = (get(TRIP_PARAMS.type) || '').toLowerCase();
  if (rawType !== 'joiner' && rawType !== 'private') return null;

  const ages = normaliseAges(get(TRIP_PARAMS.ages) || '');

  return {
    tripType: rawType,
    departure: rawType === 'joiner' ? isoOrNull(get(TRIP_PARAMS.departure)) : null,
    checkIn: rawType === 'private' ? isoOrNull(get(TRIP_PARAMS.checkIn)) : null,
    checkOut: rawType === 'private' ? isoOrNull(get(TRIP_PARAMS.checkOut)) : null,
    nights: intInRange(get(TRIP_PARAMS.nights), 1, MAX_NIGHTS, 3),
    adults: intInRange(get(TRIP_PARAMS.adults), 1, MAX_ADULTS, 2),
    childAges: ages,
    children: ages.length,
    room: (get(TRIP_PARAMS.room) || '').trim().toLowerCase() || null,
    estimate: (() => {
      const n = parseInt(get(TRIP_PARAMS.estimate), 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    })(),
  };
}

/** True when the handoff carries enough to skip re-asking the trip questions. */
export function isCompleteHandoff(trip) {
  if (!trip) return false;
  if (trip.tripType === 'joiner') return Boolean(trip.departure);
  return Boolean(trip.checkIn && trip.checkOut);
}
