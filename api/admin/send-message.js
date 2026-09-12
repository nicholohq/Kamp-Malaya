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
const MAX_SUBJECT_LENGTH = 200;
const MAX_EMAIL_LENGTH = 254; // RFC 5321
const EMAIL_ADDR_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// GHL's own OpenAPI schema doesn't list it as required, but a real Email-type
// send with no subject comes back as a 422 — confirmed against GHL's own
// published guidance, not assumed. Every real conversation in this account is
// Email, so this is the actual cause of "The CRM rejected this request."
const DEFAULT_EMAIL_SUBJECT = 'Re: Your enquiry – Kamp Malaya';

/** The owner's own plain-text reply, converted to the minimum HTML GHL wants
 * for an Email send. Escaped even though the author is trusted — it becomes
 * part of a real outbound email, not admin.js's own rendering, so nothing
 * about that trust boundary should change what gets escaped. */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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

  // Defaulted here too, not just sent by the client — an Email send with no
  // subject fails at GHL regardless of why the client didn't provide one.
  let subject = String(req.body?.subject ?? '').trim().slice(0, MAX_SUBJECT_LENGTH);
  if (!subject && type === 'Email') subject = DEFAULT_EMAIL_SUBJECT;

  // Both optional, both silently dropped rather than rejecting the whole send
  // if malformed — a best-effort improvement, not a requirement to reply at
  // all. threadId/replyMessageId tie the reply into the existing GHL email
  // thread (confirmed live: a send with neither is what a 422 resembles, and
  // it's what GHL's own "Reply" UI always sets when replying to a specific
  // message — its plain "type a message" box behaves differently).
  const rawThreadId = String(req.body?.threadId ?? '');
  const threadId = isGhlId(rawThreadId) ? rawThreadId : undefined;
  const rawReplyMessageId = String(req.body?.replyMessageId ?? '');
  const replyMessageId = isGhlId(rawReplyMessageId) ? rawReplyMessageId : undefined;

  // The identity this reply sends FROM — the FULL "Kamp Malaya
  // <bookings@...>" form, not just the bare address. Read from GHL's own
  // stored data: sending just the address, with no display name, made GHL
  // fill in whichever GHL user's own account name made the API call instead
  // of "Kamp Malaya" — confirmed by inspecting the actual delivered message
  // afterward, not assumed. The client sources this from the thread's own
  // FIRST outbound message (reliably the workflow-sent auto-reply, so
  // reliably carrying the right name); still validated here rather than
  // trusted blindly, since it crossed the wire. Accepts either a bare
  // address or a "Name <address>" string, but forwards whichever was given
  // as-is — collapsing it to just the address is exactly what caused this.
  const rawEmailFrom = String(req.body?.emailFrom ?? '').trim().slice(0, MAX_EMAIL_LENGTH);
  const emailFromAddr = (rawEmailFrom.match(/<([^<>]+)>\s*$/)?.[1] ?? rawEmailFrom).trim();
  const emailFrom = EMAIL_ADDR_SHAPE.test(emailFromAddr) ? rawEmailFrom : undefined;

  const rate = await checkSendRateLimit(conversationId);
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Too many messages sent to this conversation. Try again shortly.' });
  }

  try {
    // GHL's real rejection reason, read from its own logs (never guessed):
    // "There is no message or attachments for this message. Skip sending."
    // (CONVERSATIONS_MSG_NO_CONTENT) — for an Email send, GHL doesn't treat
    // plain `message` as real content; it wants `html`. `message` is still
    // sent alongside as the plain-text part (harmless, and is what non-email
    // channels actually use).
    const html = type === 'Email' ? `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>` : undefined;

    const data = await ghlFetch('/conversations/messages', {
      version: GHL_CONVO_VERSION,
      method: 'POST',
      body: {
        type, contactId, conversationId, message, html,
        subject: subject || undefined, threadId, replyMessageId, emailFrom,
      },
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
