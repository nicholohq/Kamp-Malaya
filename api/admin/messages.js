// /api/admin/messages.js
//
// One conversation's message thread. GET /conversations/{conversationId}/messages,
// scope conversations/message.readonly. The conversation's contact info (name,
// email, phone, channel) already lives in the list the client loaded via
// conversations.js — this endpoint returns only the thread itself.

import { withAdmin } from '../_lib/auth.js';
import { sessionNotRevoked } from '../_lib/store.js';
import { ghlFetch, isGhlId, GHL_CONVO_VERSION, projectMessage, isConversationalMessage, GhlError } from '../_lib/ghl.js';

export default withAdmin(async function handler(req, res) {
  const id = String(req.query?.id ?? '');
  if (!isGhlId(id)) {
    // Rejected before the id can reach a URL — the same guard contact.js uses
    // against a traversal-shaped id.
    return res.status(400).json({ error: 'Invalid conversation id' });
  }

  const rawCursor = String(req.query?.lastMessageId ?? '');
  const lastMessageId = isGhlId(rawCursor) ? rawCursor : undefined;

  try {
    const data = await ghlFetch(`/conversations/${encodeURIComponent(id)}/messages`, {
      version: GHL_CONVO_VERSION,
      searchParams: { limit: 20, lastMessageId },
    });

    // GHL nests the actual payload one level deeper than its own published
    // schema documents — {messages: {lastMessageId, nextPage, messages: [...]}}
    // rather than a flat object. Confirmed against the live API, not assumed.
    const payload = data?.messages ?? {};
    const messages = (Array.isArray(payload?.messages) ? payload.messages : [])
      .filter(m => isConversationalMessage(m?.messageType))
      .map(projectMessage)
      .filter(m => m.id);

    return res.status(200).json({
      messages,
      nextPage: Boolean(payload?.nextPage),
      lastMessageId: payload?.lastMessageId ?? null,
    });
  } catch (err) {
    if (err instanceof GhlError) {
      return res.status(err.status).json({ error: err.message, ref: err.ref });
    }
    throw err;
  }
}, { methods: ['GET'], verifyRevocation: sessionNotRevoked });
