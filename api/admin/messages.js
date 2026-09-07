// /api/admin/messages.js
//
// One conversation's message thread. GET /conversations/{conversationId}/messages,
// scope conversations/message.readonly. The conversation's contact info (name,
// email, phone, channel) already lives in the list the client loaded via
// conversations.js — this endpoint returns only the thread itself.

import { withAdmin } from '../_lib/auth.js';
import { sessionNotRevoked } from '../_lib/store.js';
import {
  ghlFetch, isGhlId, GHL_CONVO_VERSION,
  projectMessage, projectEmailDetail, isConversationalMessage, GhlError,
} from '../_lib/ghl.js';

// GHL rolls an email reply chain up into one messages-list entry whose body
// is a flattened plain-text summary — Mathias's actual reply text lived only
// in the conversation's own lastMessageBody, not in this endpoint, until this
// was traced to meta.email.messageIds and resolved individually below.
// Each resolve gets a tighter budget than the initial list call: Vercel Hobby
// caps a function at 10s total, this handler already spends up to 7s on the
// list call before any of these run, and they run after it (not alongside),
// so 7s + 7s would blow the budget even though these run in PARALLEL with
// EACH OTHER.
const EMAIL_DETAIL_TIMEOUT_MS = 2500;
// Defensive cap on total per-email fetches in one request — real threads seen
// so far carry 1-3 ids per grouped message, this just bounds a pathological one.
const MAX_EMAIL_DETAILS = 20;

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
    const rawMessages = (Array.isArray(payload?.messages) ? payload.messages : [])
      .filter(m => isConversationalMessage(m?.messageType));

    let emailFetchBudget = MAX_EMAIL_DETAILS;
    const expanded = await Promise.all(rawMessages.map(async (m) => {
      const emailIds = m?.messageType === 'TYPE_EMAIL'
        ? (Array.isArray(m?.meta?.email?.messageIds) ? m.meta.email.messageIds : [])
        : [];
      if (!emailIds.length || emailFetchBudget <= 0) return [projectMessage(m)];

      const idsToFetch = emailIds.slice(0, emailFetchBudget);
      emailFetchBudget -= idsToFetch.length;

      const details = await Promise.all(idsToFetch.map(emailId =>
        ghlFetch(`/conversations/messages/email/${encodeURIComponent(emailId)}`, {
          version: GHL_CONVO_VERSION,
          timeoutMs: EMAIL_DETAIL_TIMEOUT_MS,
        })
          .then(projectEmailDetail)
          .catch((err) => {
            console.error('[admin] email detail fetch failed', err?.ref || err?.message);
            return null;
          }),
      ));

      // If every individual email failed to resolve, fall back to the rolled-up
      // summary rather than silently dropping the message from the thread.
      const resolved = details.filter(Boolean);
      return resolved.length ? resolved : [projectMessage(m)];
    }));

    const messages = expanded.flat().filter(m => m.id);

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
