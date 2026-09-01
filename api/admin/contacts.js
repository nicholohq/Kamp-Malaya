// /api/admin/contacts.js
//
// The contact list. GET /contacts/ with locationId, scope contacts.readonly.

import { withAdmin } from '../_lib/auth.js';
import { sessionNotRevoked } from '../_lib/store.js';
import { ghlFetch, LOCATION_ID, projectContactSummary, GhlError } from '../_lib/ghl.js';

const MAX_LIMIT = 50;
const MAX_QUERY = 100;

// Control characters are stripped before anything reaches a query string:
// a newline in a search term is header-injection shaped, and never legitimate.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export default withAdmin(async function handler(req, res) {
  // Built from an allowlist, never by forwarding req.query: an unbounded limit
  // is both a PII-exposure and a timeout risk, and a forwarded parameter is a
  // parameter nobody reviewed.
  const rawLimit = Number(req.query?.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT)
    : 25;

  const query = String(req.query?.query ?? '')
    .replace(CONTROL_CHARS, '')
    .trim()
    .slice(0, MAX_QUERY);

  const startAfterId = String(req.query?.startAfterId ?? '')
    .replace(CONTROL_CHARS, '').trim().slice(0, 64) || undefined;
  const startAfter = Number(req.query?.startAfter);

  try {
    const data = await ghlFetch('/contacts/', {
      searchParams: {
        locationId: LOCATION_ID,
        limit,
        query: query || undefined,
        startAfterId,
        startAfter: Number.isFinite(startAfter) ? startAfter : undefined,
      },
    });

    const contacts = (Array.isArray(data?.contacts) ? data.contacts : [])
      .map(projectContactSummary)
      .filter(c => c.id);

    return res.status(200).json({
      contacts,
      // The cursor is handed straight back so the client can page without
      // knowing anything about GHL's pagination shape.
      nextStartAfterId: data?.meta?.startAfterId ?? null,
      nextStartAfter: data?.meta?.startAfter ?? null,
      total: Number(data?.meta?.total) || contacts.length,
    });
  } catch (err) {
    if (err instanceof GhlError) {
      return res.status(err.status).json({ error: err.message, ref: err.ref });
    }
    throw err;
  }
}, { methods: ['GET'], verifyRevocation: sessionNotRevoked });
