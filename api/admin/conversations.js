// /api/admin/conversations.js
//
// The conversation list. GET /conversations/search with locationId, scope
// conversations.readonly. Sorted server-side by last message time: unlike
// contacts, GHL's conversation summary carries no timestamp field, so there is
// nothing to sort by on the client.

import { withAdmin } from '../_lib/auth.js';
import { sessionNotRevoked } from '../_lib/store.js';
import { ghlFetch, LOCATION_ID, GHL_CONVO_VERSION, projectConversationSummary, GhlError } from '../_lib/ghl.js';

const MAX_LIMIT = 50;
const MAX_QUERY = 100;

// Control characters are stripped before anything reaches a query string:
// a newline in a search term is header-injection shaped, and never legitimate.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export default withAdmin(async function handler(req, res) {
  const rawLimit = Number(req.query?.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT)
    : 25;

  const query = String(req.query?.query ?? '')
    .replace(CONTROL_CHARS, '')
    .trim()
    .slice(0, MAX_QUERY);

  try {
    const data = await ghlFetch('/conversations/search', {
      version: GHL_CONVO_VERSION,
      searchParams: {
        locationId: LOCATION_ID,
        limit,
        query: query || undefined,
        sortBy: 'last_message_date',
        sort: 'desc',
      },
    });

    const conversations = (Array.isArray(data?.conversations) ? data.conversations : [])
      .map(projectConversationSummary)
      .filter(c => c.id);

    return res.status(200).json({
      conversations,
      total: Number(data?.total) || conversations.length,
    });
  } catch (err) {
    if (err instanceof GhlError) {
      return res.status(err.status).json({ error: err.message, ref: err.ref });
    }
    throw err;
  }
}, { methods: ['GET'], verifyRevocation: sessionNotRevoked });
