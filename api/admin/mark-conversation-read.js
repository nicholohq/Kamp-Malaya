// /api/admin/mark-conversation-read.js
//
// Clears a conversation's unread count. PUT /conversations/{conversationId},
// scope conversations.write — a new scope beyond what the rest of the
// Messages tab needs (everything else is read-only). Not a security-relevant
// action: worst case is a wrong unread count.

import { withAdmin } from '../_lib/auth.js';
import { sessionNotRevoked } from '../_lib/store.js';
import { ghlFetch, isGhlId, LOCATION_ID, GHL_CONVO_VERSION, GhlError } from '../_lib/ghl.js';

export default withAdmin(async function handler(req, res) {
  const conversationId = String(req.body?.conversationId ?? '');
  if (!isGhlId(conversationId)) {
    return res.status(400).json({ error: 'Invalid conversation id' });
  }

  try {
    await ghlFetch(`/conversations/${encodeURIComponent(conversationId)}`, {
      version: GHL_CONVO_VERSION,
      method: 'PUT',
      body: { locationId: LOCATION_ID, unreadCount: 0 },
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof GhlError) {
      return res.status(err.status).json({ error: err.message, ref: err.ref });
    }
    throw err;
  }
}, { methods: ['POST'], verifyRevocation: sessionNotRevoked });
