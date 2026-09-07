// /api/admin/send-message.js
//
// Sends a reply on an existing conversation. POST /conversations/messages,
// scope conversations/message.write.
//
// This is the one endpoint in the admin area that reaches a real guest, so it
// gets more guardrails than a read: the channel must be one GHL actually lets
// us send on, the message is length-capped before it leaves this function, and
// a per-conversation rate limit exists as a safety net against a UI bug
// looping sends — not as an attacker defense, since a valid session already
// means it's the owner.

import { withAdmin } from '../_lib/auth.js';
import { sessionNotRevoked, checkSendRateLimit, recordSend } from '../_lib/store.js';
import { ghlFetch, isGhlId, GHL_CONVO_VERSION, REPLYABLE_SEND_TYPES, GhlError } from '../_lib/ghl.js';

const MAX_MESSAGE_LENGTH = 4000;

export default withAdmin(async function handler(req, res) {
  const conversationId = String(req.body?.conversationId ?? '');
  const contactId = String(req.body?.contactId ?? '');
  if (!isGhlId(conversationId) || !isGhlId(contactId)) {
    return res.status(400).json({ error: 'Invalid conversation or contact id' });
  }

  const type = String(req.body?.type ?? '');
  if (!REPLYABLE_SEND_TYPES.has(type)) {
    return res.status(400).json({ error: 'This conversation cannot be replied to from here' });
  }

  const message = String(req.body?.message ?? '').trim();
  if (!message) return res.status(400).json({ error: 'Message cannot be empty' });
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)` });
  }

  const rate = await checkSendRateLimit(conversationId);
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Too many messages sent to this conversation. Try again shortly.' });
  }

  try {
    const data = await ghlFetch('/conversations/messages', {
      version: GHL_CONVO_VERSION,
      method: 'POST',
      body: { type, contactId, conversationId, message },
    });

    await recordSend(conversationId);

    return res.status(200).json({ ok: true, messageId: data?.messageId ?? null });
  } catch (err) {
    if (err instanceof GhlError) {
      return res.status(err.status).json({ error: err.message, ref: err.ref });
    }
    throw err;
  }
}, { methods: ['POST'], verifyRevocation: sessionNotRevoked });
