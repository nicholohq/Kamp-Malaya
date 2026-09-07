// /api/_lib/ghl.js
//
// The only place the admin endpoints touch GoHighLevel. Everything the browser
// receives is projected through an explicit whitelist here, so GHL's schema
// never reaches the client and neither does the API key.
//
// Scope required on GHL_API_KEY: contacts.readonly. All three calls are reads;
// nothing in the admin area can change CRM data.

import crypto from 'node:crypto';

export const GHL_BASE = 'https://services.leadconnectorhq.com';
export const GHL_VERSION = '2021-07-28';
// Conversations/messages are a different GHL resource family with their own
// API version — contacts calls must not pass this one, and vice versa.
export const GHL_CONVO_VERSION = '2021-04-15';
export const LOCATION_ID = 'YBLbWASoQgsSEqY0V5KV';

// Vercel Hobby caps a function at 10s total. One outbound call at 7s leaves
// room for cold start and overhead; never chain two of these in one handler.
const TIMEOUT_MS = 7000;

// Reverse of the CUSTOM_FIELDS map in ghl-webhook.js — same ids, so the detail
// view can show "Check in" instead of an opaque identifier. If a field is added
// there, add it here too or it renders under its raw id.
export const FIELD_LABELS = {
  Hypk6oOYeW0d0Q7y1EPH: 'Booking type',
  cMUayvSNtZ1d80VvmySy: 'Party size',
  UuYJj1y2YRo1A2c0v3lh: 'Accommodation',
  uuuPxVb2mfNcyuXy7a1S: 'Check in',
  geN5xXdqNSTOKv75CCWd: 'Check out',
  XgOt9Jk9F26KuGbWjKNp: 'Tour date',
  ZqB9bwF0eYDSy8XrA1t2: 'Special requests',
  Vtrtrxab6IBSSvWhbTkP: 'Dietary restrictions',
  PC38bar67FIYRsi0CIOS: 'Source',
};

/**
 * GHL ids are opaque alphanumerics. Validating before the id reaches a URL is
 * what stops `contactId=../../conversations` from walking an authenticated,
 * API-keyed request to a different endpoint entirely.
 */
export function isGhlId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9]{15,32}$/.test(value);
}

/** Thrown by ghlFetch; carries the status the client should see. */
export class GhlError extends Error {
  constructor(status, message, ref) {
    super(message);
    this.status = status;
    this.ref = ref;
  }
}

/**
 * Maps a GHL failure onto a fixed set of strings.
 *
 * GHL's own body is never relayed: it can contain another contact's data or
 * internal API detail, and an error message is a terrible place to discover a
 * leak. The full detail is logged under a ref the owner can quote instead.
 * (ghl-webhook.js does echo `result.message` — that is the pattern to break
 * from, not to follow.)
 */
export function mapGhlError(status, detail) {
  const ref = crypto.randomBytes(4).toString('hex');
  console.error(`[ghl ${ref}] status=${status}`, typeof detail === 'string' ? detail.slice(0, 500) : detail);

  if (status === 401 || status === 403) return new GhlError(502, 'CRM authentication failed', ref);
  if (status === 404) return new GhlError(404, 'Not found', ref);
  if (status === 422) return new GhlError(422, 'The CRM rejected this request', ref);
  if (status === 429) return new GhlError(503, 'CRM rate limit — try again shortly', ref);
  return new GhlError(502, 'CRM error', ref);
}

/**
 * The only function that reads GHL_API_KEY. Returns parsed JSON, or throws a
 * GhlError whose message is already safe to show a browser.
 *
 * GET-only until the messages feature needed to POST a reply; `method`/`body`
 * default away to nothing, so every existing GET call site is unaffected.
 * `timeoutMs` defaults to the module budget but can be tightened for a call
 * that runs alongside others — see messages.js's per-email expansion, which
 * has to leave room under this call's own 7s inside Vercel's 10s cap.
 */
export async function ghlFetch(path, { searchParams, version = GHL_VERSION, method = 'GET', body, timeoutMs = TIMEOUT_MS } = {}) {
  const key = process.env.GHL_API_KEY;
  if (!key) {
    console.error('[ghl] GHL_API_KEY is not configured');
    throw new GhlError(500, 'CRM is not configured', null);
  }

  const url = new URL(GHL_BASE + path);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const headers = {
    Authorization: `Bearer ${key}`,
    Version: version,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new GhlError(504, 'The CRM took too long to respond', null);
    }
    throw mapGhlError(0, err?.message);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  if (!response.ok) throw mapGhlError(response.status, text);

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    // GHL has historically answered with an HTML error page; treat that as a
    // gateway failure rather than letting a parse error surface as a 500.
    throw mapGhlError(502, text);
  }
}

// --------------------------------------------------------------- projections

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** Contacts as the list needs them. Never pass GHL's object through. */
export function projectContactSummary(c) {
  const name = str(c?.contactName || c?.name
    || [c?.firstName, c?.lastName].filter(Boolean).join(' ')).trim();
  return {
    id: str(c?.id),
    name,
    email: str(c?.email),
    phone: str(c?.phone),
    dateAdded: str(c?.dateAdded || c?.dateUpdated),
    tags: Array.isArray(c?.tags) ? c.tags.map(str).filter(Boolean) : [],
  };
}

/** One contact, plus its custom fields resolved to readable labels. */
export function projectContactDetail(c) {
  const base = projectContactSummary(c);
  const fields = [];
  const raw = Array.isArray(c?.customFields) ? c.customFields : [];
  for (const f of raw) {
    const value = str(f?.value ?? f?.fieldValue);
    if (!value.trim()) continue;
    fields.push({ label: FIELD_LABELS[f?.id] || 'Other', value });
  }
  return {
    ...base,
    firstName: str(c?.firstName),
    lastName: str(c?.lastName),
    source: str(c?.source),
    dateUpdated: str(c?.dateUpdated),
    fields,
  };
}

/**
 * Notes carry the trip details GHL has no custom field for — children count,
 * quoted estimate, nights — written by ghl-webhook.js. Newest first.
 */
export function projectNotes(payload) {
  const list = Array.isArray(payload?.notes) ? payload.notes : [];
  return list
    .map(n => ({
      id: str(n?.id),
      body: str(n?.body),
      createdAt: str(n?.dateAdded || n?.createdAt),
    }))
    .filter(n => n.body.trim())
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// ----------------------------------------------------------- conversations

/**
 * GHL's message "type" values, mapped to a readable label and — where we can
 * actually reply on that channel — the `type` string POST /conversations/messages
 * expects. A channel with no `sendType` (a call, a review, GMB — not in
 * SendMessageBodyDto's enum) renders read-only in the UI: no composer.
 */
export const CHANNEL_MAP = {
  TYPE_SMS: { label: 'SMS', sendType: 'SMS' },
  TYPE_EMAIL: { label: 'Email', sendType: 'Email' },
  TYPE_WHATSAPP: { label: 'WhatsApp', sendType: 'WhatsApp' },
  TYPE_INSTAGRAM: { label: 'Instagram', sendType: 'IG' },
  TYPE_FACEBOOK: { label: 'Facebook', sendType: 'FB' },
  TYPE_LIVE_CHAT: { label: 'Web chat', sendType: 'Live_Chat' },
  TYPE_WEBCHAT: { label: 'Web chat', sendType: 'Live_Chat' },
};
const DEFAULT_CHANNEL = { label: 'Message', sendType: null };

/** The exact set POST /conversations/messages accepts for `type`. */
export const REPLYABLE_SEND_TYPES = new Set(['SMS', 'Email', 'WhatsApp', 'IG', 'FB', 'Live_Chat']);

function channelFor(messageType) {
  return CHANNEL_MAP[messageType] || DEFAULT_CHANNEL;
}

// GHL's message thread carries CRM system-log entries alongside real guest
// communication — "Opportunity created", internal notes, form submissions —
// each with its own messageType. Confirmed live: TYPE_ACTIVITY_OPPORTUNITY
// showed up as a bare "Opportunity created" bubble, indistinguishable from an
// actual sent message. These three prefixes/values are the CRM's own
// unambiguous "this is a log entry, not a message" signal.
const SYSTEM_MESSAGE_TYPES = /^TYPE_ACTIVITY_|^TYPE_INTERNAL_COMMENT$|^TYPE_FORM_SUBMISSION$/;

/** True for anything that belongs in a guest-facing thread. */
export function isConversationalMessage(messageType) {
  return typeof messageType === 'string' && !SYSTEM_MESSAGE_TYPES.test(messageType);
}

/** Conversations as the list needs them. Never pass GHL's object through. */
export function projectConversationSummary(c) {
  const channel = channelFor(c?.lastMessageType);
  return {
    id: str(c?.id),
    contactId: str(c?.contactId),
    name: str(c?.fullName || c?.contactName).trim(),
    email: str(c?.email),
    phone: str(c?.phone),
    preview: str(c?.lastMessageBody),
    channel: channel.label,
    sendType: channel.sendType,
    unreadCount: Number.isFinite(c?.unreadCount) ? c.unreadCount : 0,
  };
}

/** https: only — an attachment url can never become a javascript: or data: sink. */
function safeAttachments(list) {
  return Array.isArray(list) ? list.filter(u => typeof u === 'string' && /^https:/.test(u)) : [];
}

/**
 * One message in a thread, as GHL's rolled-up messages-list endpoint returns
 * it. For an email this `body` is GHL's own flattened, plain-text extraction
 * of the thread group — never real HTML, whatever its own `contentType` field
 * claims — so this always reports 'text/plain'. Real per-email HTML comes
 * only from projectEmailDetail() below, via a separate, deliberate fetch.
 */
export function projectMessage(m) {
  const channel = channelFor(m?.messageType);
  return {
    id: str(m?.id),
    direction: m?.direction === 'outbound' ? 'outbound' : 'inbound',
    body: str(m?.body),
    dateAdded: str(m?.dateAdded),
    status: str(m?.status),
    channel: channel.label,
    contentType: 'text/plain',
    subject: '',
    attachments: safeAttachments(m?.attachments),
  };
}

// The documented schema for get-email-by-id lists `contentType` as a required
// field ('text/plain' | 'text/html'). Confirmed live: the real response never
// includes it at all — a real HTML email came back with no contentType key
// whatsoever. Sniffing the body itself is more reliable than trusting a field
// that doesn't exist: a genuine email body (this endpoint's only content)
// consistently opens with real markup; misreading either direction is
// cosmetic, not a security issue — see buildEmailFrame() in admin.js.
const HTML_TAG_PATTERN = /<[a-z][\s\S]*>/i;

/**
 * One real email, individually resolved via GET /conversations/messages/email/{id}.
 * Unlike the messages-list endpoint, this one actually carries the email's own
 * HTML — GHL wraps the payload in {emailMessage: {...}}, confirmed live (the
 * same one-level-deeper nesting quirk as the messages-list endpoint).
 *
 * `body` passes through RAW here — deliberately. This module never sanitises;
 * it projects. The browser is the only place untrusted HTML is either
 * rendered (inside a script-less sandboxed iframe) or it is not rendered at
 * all — see buildEmailFrame() in admin.js. Emailing the business is a public,
 * unauthenticated action, so this body is exactly the kind of content
 * admin.js's zero-innerHTML rule exists to guard against.
 */
export function projectEmailDetail(raw) {
  const email = raw?.emailMessage ?? raw ?? {};
  const body = str(email?.body);
  return {
    id: str(email?.id),
    direction: email?.direction === 'outbound' ? 'outbound' : 'inbound',
    body,
    dateAdded: str(email?.dateAdded),
    status: str(email?.status),
    channel: 'Email',
    contentType: HTML_TAG_PATTERN.test(body) ? 'text/html' : 'text/plain',
    subject: str(email?.subject),
    attachments: safeAttachments(email?.attachments),
  };
}
