// Admin dashboard — contacts from GoHighLevel, behind a password.
//
// Read-only: nothing here can change CRM data. Every /api/admin/* call is
// server-side; the GHL key never reaches this file.
//
// XSS, stated plainly because this file is the sink: funnel.html is a PUBLIC
// form, and api/ghl-webhook.js writes whatever it receives into the CRM
// verbatim. Anyone on the internet can submit a contact name of
// `<img src=x onerror=...>` and it will land in the list below. The httpOnly
// cookie would not save us — injected script does not need to read the cookie,
// the browser attaches it to same-origin fetch automatically, so the payload
// could read every contact.
//
//   => There is NO innerHTML in this file. Not for icons, not once.
//      textContent and createElement only. `npm run verify:admin` greps for it.
//
// Local dev: /api/* does not run under `vite dev`. Use `vercel dev`.

import {
  contactDisplayName, filterContacts, sortContacts,
  formatTimestamp, parseNote, normalisePhone, initials, previewText,
  conversationDisplayName, filterConversations,
} from './admin-format.mjs';

// Font Awesome glyph per trip-detail field, purely decorative. Keyed on the
// label strings FIELD_LABELS produces in api/_lib/ghl.js — a renamed or new
// label just falls back to the generic icon below, nothing breaks.
const FIELD_ICONS = {
  'Booking type': 'fa-suitcase',
  'Party size': 'fa-users',
  'Accommodation': 'fa-bed',
  'Check in': 'fa-calendar-check',
  'Check out': 'fa-calendar-xmark',
  'Tour date': 'fa-calendar-day',
  'Special requests': 'fa-comment-dots',
  'Dietary restrictions': 'fa-utensils',
  'Source': 'fa-share-nodes',
};
const DEFAULT_FIELD_ICON = 'fa-circle-info';

// ghl-webhook.js's formatPeso() always renders an amount as "PHP N,NNN" — the
// one line in a note worth reading before any other, since it's what the
// guest was actually quoted.
const PESO_VALUE = /^PHP\s/i;

// ---------------------------------------------------------------- DOM handles

const el = {
  boot: document.getElementById('adm-boot'),
  lock: document.getElementById('adm-lock'),
  app: document.getElementById('adm-app'),

  loginForm: document.getElementById('adm-login-form'),
  password: document.getElementById('adm-password'),
  loginBtn: document.getElementById('adm-login-btn'),
  loginError: document.getElementById('adm-login-error'),

  back: document.getElementById('adm-back'),
  refresh: document.getElementById('adm-refresh'),
  tabContacts: document.getElementById('adm-tab-contacts'),
  tabMessages: document.getElementById('adm-tab-messages'),
  settingsBtn: document.getElementById('adm-settings-btn'),
  settingsMenu: document.getElementById('adm-settings-menu'),
  themeToggle: document.getElementById('adm-theme-toggle'),
  changePw: document.getElementById('adm-change-pw'),
  logout: document.getElementById('adm-logout'),

  search: document.getElementById('adm-search'),
  listCount: document.getElementById('adm-list-count'),
  rows: document.getElementById('adm-rows'),
  detail: document.getElementById('adm-detail'),

  pwDialog: document.getElementById('adm-pw-dialog'),
  pwForm: document.getElementById('adm-pw-form'),
  pwCurrent: document.getElementById('adm-pw-current'),
  pwNew: document.getElementById('adm-pw-new'),
  pwConfirm: document.getElementById('adm-pw-confirm'),
  pwError: document.getElementById('adm-pw-error'),
  pwCancel: document.getElementById('adm-pw-cancel'),
  pwSave: document.getElementById('adm-pw-save'),

  status: document.getElementById('adm-status'),
  offline: document.getElementById('adm-offline'),
};

// ---------------------------------------------------------------------- state

const state = {
  screen: 'boot',            // 'boot' | 'locked' | 'app'
  auth: { busy: false, error: '' },
  section: 'contacts',       // 'contacts' | 'messages'
  contacts: { status: 'idle', items: [], error: '' },
  query: '',
  selectedId: null,
  details: new Map(),        // contactId -> { status, contact, notes, error }
  conversations: { status: 'idle', items: [], error: '' },
  convoQuery: '',
  selectedConvoId: null,
  threads: new Map(),        // conversationId -> { status, messages, nextPage, lastMessageId, error }
  composer: { busy: false, error: '', value: '' },
  pw: { busy: false, error: '' },
  status: '',
};

let rendering = false;       // re-entrancy guard
let focusAfterRender = null; // consumed as the last act of render()

// Nothing is persisted. The estimator keeps progress in sessionStorage, but
// this page's cache is customer PII and logging out has to actually clear it.

// ------------------------------------------------------------------ api layer

class SessionExpired extends Error {}

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    // Cross-origin JS cannot set a custom header without a preflight the server
    // never grants; the server requires this on every state-changing request.
    headers['X-Admin-Request'] = '1';
  }

  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // One choke point for expiry: a 401 from ANY endpoint at ANY moment lands
  // here, so there is no per-call handling to forget. This is also what makes
  // the server's revocation lever take effect in the UI immediately.
  if (res.status === 401) {
    lockOut('Your session expired. Sign in again.');
    throw new SessionExpired();
  }

  // A 200 carrying something other than JSON is not a success. Under `vite dev`
  // this path returns the handler's own source as text/javascript; a
  // misconfigured deploy could return an HTML error page. Either would
  // otherwise parse to {} and render as "no contacts" — a silent lie.
  // ghl-webhook.js guards the same way against GHL's HTML error pages.
  const type = res.headers.get('content-type') || '';
  const isJson = type.includes('application/json');
  if (res.status !== 204 && !isJson) {
    const err = new Error('The dashboard API did not respond correctly. Is it deployed?');
    err.status = res.status;
    throw err;
  }

  let data = {};
  try { data = await res.json(); } catch { /* 204s and empty bodies */ }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function lockOut(message) {
  // Wipe the cache before showing the lock screen. Leaving customer data in
  // memory behind a login form is the kind of thing that is technically fine
  // until someone screenshots it.
  state.contacts = { status: 'idle', items: [], error: '' };
  state.details.clear();
  state.selectedId = null;
  state.query = '';
  state.conversations = { status: 'idle', items: [], error: '' };
  state.threads.clear();
  state.selectedConvoId = null;
  state.convoQuery = '';
  state.composer = { busy: false, error: '', value: '' };
  state.screen = 'locked';
  state.auth = { busy: false, error: message || '' };
  if (el.search) el.search.value = '';
  focusAfterRender = el.password;
  render();
}

// -------------------------------------------------------------- settings menu
//
// Lives outside the state/render system entirely, the same way the password
// dialog does (it is opened with a direct .showModal() + .focus(), not through
// state) — this is transient UI chrome, not app state worth reconciling on
// every render().

function closeSettingsMenu({ restoreFocus = false } = {}) {
  if (el.settingsMenu.hidden) return;
  el.settingsMenu.hidden = true;
  el.settingsBtn.setAttribute('aria-expanded', 'false');
  if (restoreFocus) el.settingsBtn.focus();
}

function openSettingsMenu() {
  el.settingsMenu.hidden = false;
  el.settingsBtn.setAttribute('aria-expanded', 'true');
  el.changePw.focus();
}

// ------------------------------------------------------------------- helpers

/** <i class="fa-solid fa-x [extraClass]" aria-hidden="true">, built without innerHTML. */
function icon(name, extraClass) {
  const i = document.createElement('i');
  i.className = extraClass ? `fa-solid ${name} ${extraClass}` : `fa-solid ${name}`;
  i.setAttribute('aria-hidden', 'true');
  return i;
}

function elem(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function avatar(displayName, { large = false } = {}) {
  return elem('span', `adm-avatar${large ? ' adm-avatar--lg' : ''}`, initials(displayName));
}

function renderEmpty(container, iconName, text, retry) {
  const wrap = elem('div', 'adm-empty');
  wrap.appendChild(icon(iconName));
  wrap.appendChild(elem('p', null, text));
  if (retry) {
    const btn = elem('button', 'adm-retry', 'Try again');
    btn.type = 'button';
    btn.addEventListener('click', retry);
    wrap.appendChild(btn);
  }
  container.replaceChildren(wrap);
}

function skeletons(count) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const row = elem('div', 'adm-skeleton');
    row.appendChild(elem('div', 'adm-skeleton-bar'));
    row.appendChild(elem('div', 'adm-skeleton-bar'));
    frag.appendChild(row);
  }
  return frag;
}

const visibleContacts = () =>
  sortContacts(filterContacts(state.contacts.items, state.query));

// No sort here: unlike contacts, GHL's conversation summary carries no
// timestamp — the list is already newest-first because conversations.js asks
// GHL to sort it that way, so this only narrows, never reorders.
const visibleConversations = () =>
  filterConversations(state.conversations.items, state.convoQuery);

const activeSelectedId = () =>
  state.section === 'contacts' ? state.selectedId : state.selectedConvoId;

// -------------------------------------------------------------------- render

function render() {
  if (rendering) return;
  rendering = true;

  el.boot.hidden = state.screen !== 'boot';
  el.lock.hidden = state.screen !== 'locked';
  el.app.hidden = state.screen !== 'app';

  const signedIn = state.screen === 'app';
  el.refresh.hidden = !signedIn;
  el.settingsBtn.hidden = !signedIn;
  el.tabContacts.hidden = !signedIn;
  el.tabMessages.hidden = !signedIn;
  el.back.hidden = !(signedIn && activeSelectedId());
  // Defensive: if a 401 arrives mid-browse and drops us back to the lock
  // screen while the menu happens to be open, it must not be left dangling
  // open behind the login form.
  if (!signedIn) closeSettingsMenu();

  if (state.screen === 'locked') {
    el.loginError.textContent = state.auth.error;
    el.loginBtn.disabled = state.auth.busy;
    el.loginBtn.textContent = state.auth.busy ? 'Signing in…' : 'Sign in';
  }

  if (signedIn) {
    const onContacts = state.section === 'contacts';
    if (onContacts) el.tabContacts.setAttribute('aria-current', 'page');
    else el.tabContacts.removeAttribute('aria-current');
    if (!onContacts) el.tabMessages.setAttribute('aria-current', 'page');
    else el.tabMessages.removeAttribute('aria-current');

    el.search.placeholder = onContacts
      ? 'Search name, email or phone'
      : 'Search name, email or message';
    el.search.value = onContacts ? state.query : state.convoQuery;

    el.app.dataset.pane = activeSelectedId() ? 'detail' : 'list';
    renderList();
    renderDetail();
  }

  el.status.textContent = state.status;

  rendering = false;
  if (focusAfterRender) {
    const target = focusAfterRender;
    focusAfterRender = null;
    // After the DOM settles, so focus never lands on a node about to be replaced.
    requestAnimationFrame(() => target.focus());
  }
}

function renderList() {
  if (state.section === 'messages') return renderConvoList();
  return renderContactList();
}

function renderContactList() {
  const { status, error } = state.contacts;

  if (status === 'loading') {
    el.rows.replaceChildren(skeletons(6));
    el.rows.setAttribute('aria-busy', 'true');
    el.listCount.textContent = '';
    return;
  }
  el.rows.setAttribute('aria-busy', 'false');

  if (status === 'error') {
    el.listCount.textContent = '';
    renderEmpty(el.rows, 'fa-triangle-exclamation', error || 'Could not load contacts.', loadContacts);
    return;
  }

  const items = visibleContacts();
  const total = state.contacts.items.length;

  if (total === 0) {
    el.listCount.textContent = '';
    renderEmpty(el.rows, 'fa-inbox', 'No contacts yet. Enquiries from the booking form appear here.');
    return;
  }
  if (items.length === 0) {
    el.listCount.textContent = '';
    // The query is user input; textContent is what makes interpolating it safe.
    renderEmpty(el.rows, 'fa-magnifying-glass', `No contacts match “${state.query}”.`);
    return;
  }

  el.listCount.textContent = state.query
    ? `${items.length} of ${total} contacts`
    : `${total} contact${total === 1 ? '' : 's'}`;

  const frag = document.createDocumentFragment();
  for (const contact of items) frag.appendChild(renderRow(contact));
  el.rows.replaceChildren(frag);
}

function renderConvoList() {
  const { status, error } = state.conversations;

  if (status === 'loading' || status === 'idle') {
    el.rows.replaceChildren(skeletons(6));
    el.rows.setAttribute('aria-busy', 'true');
    el.listCount.textContent = '';
    return;
  }
  el.rows.setAttribute('aria-busy', 'false');

  if (status === 'error') {
    el.listCount.textContent = '';
    renderEmpty(el.rows, 'fa-triangle-exclamation', error || 'Could not load messages.', loadConversations);
    return;
  }

  const items = visibleConversations();
  const total = state.conversations.items.length;

  if (total === 0) {
    el.listCount.textContent = '';
    renderEmpty(el.rows, 'fa-comments', 'No conversations yet.');
    return;
  }
  if (items.length === 0) {
    el.listCount.textContent = '';
    renderEmpty(el.rows, 'fa-magnifying-glass', `No conversations match “${state.convoQuery}”.`);
    return;
  }

  el.listCount.textContent = state.convoQuery
    ? `${items.length} of ${total} conversations`
    : `${total} conversation${total === 1 ? '' : 's'}`;

  const frag = document.createDocumentFragment();
  for (const convo of items) frag.appendChild(renderConvoRow(convo));
  el.rows.replaceChildren(frag);
}

function renderRow(contact) {
  const li = document.createElement('li');
  const btn = elem('button', 'adm-row');
  btn.type = 'button';
  btn.dataset.id = contact.id;
  btn.setAttribute('aria-controls', 'adm-detail');
  if (contact.id === state.selectedId) btn.setAttribute('aria-current', 'true');

  const name = contactDisplayName(contact);
  const layout = elem('div', 'adm-row-layout');
  layout.appendChild(avatar(name));

  const body = elem('div', 'adm-row-body');
  const top = elem('div', 'adm-row-top');
  top.appendChild(elem('span', 'adm-row-name', name));
  const when = formatTimestamp(contact.dateAdded);
  if (when) top.appendChild(elem('span', 'adm-row-when', when));
  body.appendChild(top);

  const sub = [contact.email, contact.phone].filter(Boolean).join(' · ');
  if (sub) body.appendChild(elem('p', 'adm-row-sub', sub));

  if (contact.tags?.length) {
    const tags = elem('div', 'adm-row-tags');
    for (const tag of contact.tags.slice(0, 3)) tags.appendChild(elem('span', 'adm-tag', tag));
    body.appendChild(tags);
  }
  layout.appendChild(body);

  btn.appendChild(layout);
  btn.addEventListener('click', () => selectContact(contact.id));
  li.appendChild(btn);
  return li;
}

function renderConvoRow(convo) {
  const li = document.createElement('li');
  const btn = elem('button', 'adm-row');
  btn.type = 'button';
  btn.dataset.id = convo.id;
  btn.setAttribute('aria-controls', 'adm-detail');
  if (convo.id === state.selectedConvoId) btn.setAttribute('aria-current', 'true');

  const name = conversationDisplayName(convo);
  const layout = elem('div', 'adm-row-layout');
  layout.appendChild(avatar(name));

  const body = elem('div', 'adm-row-body');
  const top = elem('div', 'adm-row-top');
  top.appendChild(elem('span', 'adm-row-name', name));
  if (convo.unreadCount > 0) {
    top.appendChild(elem('span', 'adm-unread-badge', String(convo.unreadCount)));
  }
  body.appendChild(top);

  if (convo.preview) body.appendChild(elem('p', 'adm-row-sub', previewText(convo.preview)));

  const tags = elem('div', 'adm-row-tags');
  tags.appendChild(elem('span', 'adm-tag', convo.channel));
  body.appendChild(tags);

  layout.appendChild(body);
  btn.appendChild(layout);
  btn.addEventListener('click', () => selectConversation(convo.id));
  li.appendChild(btn);
  return li;
}

function renderDetail() {
  if (state.section === 'messages') return renderThreadDetail();
  return renderContactDetail();
}

function renderContactDetail() {
  if (!state.selectedId) {
    renderEmpty(el.detail, 'fa-hand-pointer', 'Pick a contact to see their enquiry.');
    return;
  }

  const entry = state.details.get(state.selectedId);
  if (!entry || entry.status === 'loading') {
    el.detail.setAttribute('aria-busy', 'true');
    el.detail.replaceChildren(skeletons(4));
    return;
  }
  el.detail.setAttribute('aria-busy', 'false');

  if (entry.status === 'error') {
    renderEmpty(el.detail, 'fa-triangle-exclamation', entry.error || 'Could not load this contact.',
      () => loadDetail(state.selectedId, { force: true }));
    return;
  }

  const { contact, notes, notesUnavailable } = entry;
  const frag = document.createDocumentFragment();

  const name = contactDisplayName(contact);
  const head = elem('div', 'adm-detail-head');
  head.appendChild(avatar(name, { large: true }));
  const heading = elem('div');
  heading.appendChild(elem('h1', 'adm-detail-name font-display', name));
  const added = formatTimestamp(contact.dateAdded);
  if (added) heading.appendChild(elem('p', 'adm-detail-when', `Added ${added}`));
  head.appendChild(heading);
  frag.appendChild(head);

  // Contact links are built from validated values only. An href assembled from
  // untrusted text is an execution sink (javascript:), unlike textContent.
  const links = elem('div', 'adm-contact-links');
  const digits = normalisePhone(contact.phone);
  if (digits.length >= 7) {
    const a = elem('a', 'adm-contact-link');
    a.href = `tel:+${digits}`;
    a.appendChild(icon('fa-phone'));
    a.appendChild(elem('span', null, contact.phone));
    links.appendChild(a);
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email || '')) {
    const a = elem('a', 'adm-contact-link');
    a.href = `mailto:${contact.email}`;
    a.appendChild(icon('fa-envelope'));
    a.appendChild(elem('span', null, contact.email));
    links.appendChild(a);
  }
  if (links.childElementCount) frag.appendChild(links);

  if (contact.tags?.length) {
    frag.appendChild(elem('h2', 'adm-section-title', 'Tags'));
    const tags = elem('div', 'adm-row-tags');
    for (const tag of contact.tags) tags.appendChild(elem('span', 'adm-tag', tag));
    frag.appendChild(tags);
  }

  if (contact.fields?.length) {
    frag.appendChild(elem('h2', 'adm-section-title', 'Trip details'));
    const dl = elem('div', 'adm-fields');
    for (const field of contact.fields) {
      const row = elem('div', 'adm-field-row');
      row.appendChild(icon(FIELD_ICONS[field.label] || DEFAULT_FIELD_ICON, 'adm-field-icon'));
      const fieldBody = elem('div', 'adm-field-body');
      fieldBody.appendChild(elem('span', 'adm-field-label', field.label));
      fieldBody.appendChild(elem('span', 'adm-field-value', field.value));
      row.appendChild(fieldBody);
      dl.appendChild(row);
    }
    frag.appendChild(dl);
  }

  frag.appendChild(elem('h2', 'adm-section-title', 'Notes'));
  if (notesUnavailable) {
    frag.appendChild(elem('p', 'adm-muted', 'Notes could not be loaded.'));
  } else if (!notes.length) {
    frag.appendChild(elem('p', 'adm-muted', 'No notes.'));
  } else {
    for (const note of notes) {
      const card = elem('div', 'adm-note');
      const when = formatTimestamp(note.createdAt);
      if (when) card.appendChild(elem('p', 'adm-note-when', when));
      // The first line of a note is often a free-text opener (the webhook
      // always writes "Trip estimator details"; a hand-added GHL note might
      // open with a sentence instead) — weighted so it reads as the note's
      // subject rather than blending into the label:value rows beneath it.
      // Only line 0 gets this; a later unlabelled line (mid-note prose) stays
      // plain body text.
      parseNote(note.body).forEach((line, i) => {
        // The quoted total (ghl-webhook.js's formatPeso always writes
        // "PHP N,NNN") is the one number on this card worth reading before
        // any other — what the guest was actually told they would pay.
        const isTotal = Boolean(line.label) && PESO_VALUE.test(line.value);
        const p = elem('p', isTotal ? 'adm-note-line adm-note-total' : 'adm-note-line');
        if (line.label) {
          p.appendChild(elem('span', 'adm-note-label', `${line.label}: `));
          p.appendChild(elem('span', 'adm-note-value', line.value));
        } else if (i === 0) {
          p.classList.add('adm-note-kicker');
          p.textContent = line.value;
        } else {
          p.textContent = line.value;
        }
        card.appendChild(p);
      });
      frag.appendChild(card);
    }
  }

  el.detail.replaceChildren(frag);
}

function renderThreadDetail() {
  if (!state.selectedConvoId) {
    renderEmpty(el.detail, 'fa-hand-pointer', 'Pick a conversation to see the thread.');
    return;
  }

  const convo = state.conversations.items.find(c => c.id === state.selectedConvoId);
  const entry = state.threads.get(state.selectedConvoId);
  if (!entry || entry.status === 'loading') {
    el.detail.setAttribute('aria-busy', 'true');
    el.detail.replaceChildren(skeletons(4));
    return;
  }
  el.detail.setAttribute('aria-busy', 'false');

  if (entry.status === 'error') {
    renderEmpty(el.detail, 'fa-triangle-exclamation', entry.error || 'Could not load this conversation.',
      () => loadThread(state.selectedConvoId, { force: true }));
    return;
  }

  const frag = document.createDocumentFragment();
  const name = convo ? conversationDisplayName(convo) : 'Conversation';

  const head = elem('div', 'adm-detail-head');
  head.appendChild(avatar(name, { large: true }));
  const heading = elem('div');
  heading.appendChild(elem('h1', 'adm-detail-name font-display', name));
  if (convo) heading.appendChild(elem('p', 'adm-detail-when', convo.channel));
  head.appendChild(heading);
  frag.appendChild(head);

  const thread = elem('div', 'adm-thread');
  thread.setAttribute('role', 'log');
  thread.setAttribute('aria-label', 'Messages');

  if (entry.nextPage) {
    const more = elem('button', 'adm-retry adm-thread-more',
      entry.loadingMore ? 'Loading…' : 'Load earlier messages');
    more.type = 'button';
    more.disabled = Boolean(entry.loadingMore);
    more.addEventListener('click', () => loadThread(state.selectedConvoId, { before: entry.lastMessageId }));
    thread.appendChild(more);
  }

  // Rendered oldest-first regardless of fetch/merge order — a chat thread
  // reads top-to-bottom, unlike the newest-first contact list.
  const ordered = entry.messages.slice().sort((a, b) => a.dateAdded.localeCompare(b.dateAdded));
  // Every reply after the first quotes what it's replying to — GHL includes a
  // full copy of the prior email inside each new one. Rather than pattern-match
  // a mail client's own quote markup (Gmail's blockquote, Outlook's divRplyFwdMsg,
  // ...), which vary and would miss some, renderEmailBody() below cuts each
  // later message off as soon as its own text starts matching the FIRST
  // message's text — the one thing every quote in this thread actually
  // traces back to, however the client chose to mark it up.
  const quoteText = ordered.length > 1 ? messagePlainText(ordered[0]) : null;
  ordered.forEach((msg, i) => thread.appendChild(renderMessageBubble(msg, i === 0 ? null : quoteText)));
  frag.appendChild(thread);

  el.detail.replaceChildren(frag);

  if (convo?.sendType) {
    el.detail.appendChild(buildComposer(convo, replyContext(ordered)));
  } else if (convo) {
    el.detail.appendChild(elem('p', 'adm-composer-unavailable', 'This conversation can’t be replied to from here.'));
  }
}

function renderMessageBubble(msg, quoteText) {
  const wrap = elem('div', msg.direction === 'outbound' ? 'adm-msg adm-msg--out' : 'adm-msg adm-msg--in');
  if (msg.contentType === 'text/html') {
    wrap.appendChild(renderEmailBody(msg.body, quoteText));
  } else {
    wrap.appendChild(elem('p', 'adm-msg-text', msg.body));
  }
  appendAttachments(wrap, msg);
  appendMessageMeta(wrap, msg);
  return wrap;
}

function normalizeWs(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/** Plain text of a message, regardless of channel — used only for the
 * quote-matching probe below, never rendered. */
function messagePlainText(msg) {
  if (msg.contentType !== 'text/html') return normalizeWs(msg.body);
  return normalizeWs(new DOMParser().parseFromString(msg.body, 'text/html').body.textContent);
}

/** "Re: X", without doubling up an already-"Re:"-prefixed subject. */
function replySubject(priorSubject) {
  const trimmed = normalizeWs(priorSubject);
  if (!trimmed) return 'Re: Your enquiry – Kamp Malaya';
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

/**
 * Everything a reply needs to land in the same GHL email thread, sent from
 * the business's own address rather than whichever GHL user's account made
 * the API call — confirmed live: a bare send with none of this either 422s
 * or (via GHL's own UI, and via this dashboard before this fix) goes out
 * under a personal name instead of "Kamp Malaya". threadId/replyMessageId
 * come from the LAST message in the thread — every email in it reports the
 * same threadId, confirmed live, so the most recent one is as good a source
 * as the first.
 *
 * emailFrom is read from the FIRST outbound message specifically, not the
 * most recent one — confirmed live that the first is reliably the
 * workflow-triggered auto-reply, whose `from` is genuinely
 * "Kamp Malaya <bookings@mail.kampmalaya.tours>" (the display NAME, not just
 * the address — GHL fills in whichever GHL user's own name sent it if only
 * the bare address is given, which is exactly the bug this works around).
 * A later reply sent before this fix carries the wrong name in its own
 * `from`; sourcing from the first message keeps that from contaminating
 * future sends.
 */
function replyContext(ordered) {
  const last = ordered[ordered.length - 1];
  const priorSubject = [...ordered].reverse().find(m => m.subject)?.subject;
  const firstOutboundFrom = ordered.find(m => m.direction === 'outbound' && m.from)?.from;
  return {
    subject: replySubject(priorSubject),
    threadId: last?.threadId || undefined,
    replyMessageId: last?.id || undefined,
    emailFrom: firstOutboundFrom ? normalizeWs(firstOutboundFrom) : undefined,
  };
}

// href schemes an emailed link is allowed to keep — the same defensive
// principle as the tel:/mailto: contact links above: an href built from
// untrusted text is an execution sink (javascript:, data:) unless checked.
const SAFE_LINK_SCHEMES = /^(https?:|tel:|mailto:)/i;

/**
 * Parses a real email's HTML — content from a public, unauthenticated
 * source, since anyone can email the business or reply to its auto-reply —
 * into a small allowlisted set of elements (bold/italic/underline, links,
 * paragraphs, line breaks, lists, simple two-column tables), built entirely
 * with createElement/textContent. This is the ONE place in this file
 * untrusted markup could become markup rather than text, and it deliberately
 * never does: DOMParser.parseFromString() never executes anything in the
 * string it's given, and nothing parsed out of it is ever assigned via
 * innerHTML — every node in the result is one this function chose to create.
 * Anything not on the allowlist (a <script> DOMParser already refused to run,
 * a <style>, a tracking-pixel <img>, an inline style attribute) is dropped or
 * unwrapped, never trusted.
 *
 * Quote removal happens in the same pass: `quoteText` is the plain text of
 * the message this one replies to (see messagePlainText() above) — GHL
 * includes a full copy of it inside every later message in the thread. Once
 * the accumulated text of the nodes walked so far starts matching it, the
 * rest is the quoted copy and is dropped, root and all — this only reads the
 * page's OWN prior message, not any particular mail client's quote markup.
 */
function renderEmailBody(html, quoteText) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const probe = quoteText && quoteText.length >= 30 ? quoteText.slice(0, 60) : null;

  const frag = document.createDocumentFragment();
  let buffer = '';
  let stopped = false;
  // Every node commit()ted (see below) is logged here with the buffer length
  // at that moment, so that once a match fires, the handful of nodes that
  // fed the FINAL run leading into it — which had already been committed
  // before enough of the probe had accumulated to detect it — can be
  // retroactively un-committed instead of leaking through. matchRunStart is
  // the buffer length at which the current unbroken overlap with probe's
  // prefix began; it resets to null whenever a run turns out to be a false
  // start, so only the run that actually won is ever rolled back.
  const history = [];
  let matchRunStart = null;

  function overlapLen(buf) {
    const maxL = Math.min(buf.length, probe.length - 1);
    for (let l = maxL; l > 0; l--) {
      if (buf.endsWith(probe.slice(0, l))) return l;
    }
    return 0;
  }

  function sawText(text) {
    if (!probe || stopped) return;
    // No separator inserted between accumulated text and this node's text:
    // messagePlainText()'s probe comes from raw .textContent, which adds no
    // whitespace of its own between adjacent tags either — GHL's HTML often
    // has zero whitespace between them (confirmed live), so inserting one
    // here would desync this buffer from the probe and the match would
    // never fire.
    buffer = normalizeWs(`${buffer}${text}`);
    if (buffer.includes(probe)) { stopped = true; return; }
    const l = overlapLen(buffer);
    matchRunStart = l > 0 ? (matchRunStart ?? buffer.length - l) : null;
  }

  function commit(out, el) {
    out.appendChild(el);
    history.push({ out, el, bufferLen: buffer.length });
  }

  function rollback() {
    if (matchRunStart === null) return;
    for (const entry of history) {
      if (entry.bufferLen > matchRunStart && entry.el.parentNode === entry.out) {
        entry.out.removeChild(entry.el);
      }
    }
  }

  function walkChildren(parent, out) {
    for (const node of Array.from(parent.childNodes)) {
      if (stopped) return;
      walkNode(node, out);
    }
  }

  function walkNode(node, out) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (!text) return;
      sawText(text);
      if (!stopped) commit(out, document.createTextNode(text));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    switch (node.tagName) {
      case 'SCRIPT': case 'STYLE': case 'IMG':
        return; // inline images dropped too — real attachments render separately
      case 'BR':
        commit(out, document.createElement('br'));
        return;
      case 'B': case 'STRONG': {
        const el = document.createElement('strong');
        walkChildren(node, el);
        if (el.childNodes.length) commit(out, el);
        return;
      }
      case 'I': case 'EM': {
        const el = document.createElement('em');
        walkChildren(node, el);
        if (el.childNodes.length) commit(out, el);
        return;
      }
      case 'U': {
        const el = document.createElement('u');
        walkChildren(node, el);
        if (el.childNodes.length) commit(out, el);
        return;
      }
      case 'A': {
        const href = node.getAttribute('href') || '';
        const el = SAFE_LINK_SCHEMES.test(href) ? document.createElement('a') : document.createElement('span');
        if (el.tagName === 'A') {
          el.href = href;
          el.target = '_blank';
          el.rel = 'noopener noreferrer';
          el.className = 'adm-msg-link';
        }
        walkChildren(node, el);
        if (el.childNodes.length) commit(out, el);
        return;
      }
      case 'UL': case 'OL': {
        const el = document.createElement(node.tagName.toLowerCase());
        walkChildren(node, el);
        if (el.childNodes.length) commit(out, el);
        return;
      }
      case 'LI': {
        const el = document.createElement('li');
        walkChildren(node, el);
        commit(out, el);
        return;
      }
      case 'TABLE':
        if (node.querySelector('table')) {
          // A table containing another table is (almost) never real tabular
          // data — it's table-based email layout, a table used purely to
          // position content for old email clients. Confirmed live: GHL's
          // own auto-reply nests 4-5 tables deep purely for layout, with
          // exactly one real 2-column (label/value) table inside all of
          // that. Treating every <table> as data made querySelectorAll('tr')
          // in appendSimpleTable() below sweep up the SAME rows at every
          // nesting depth — the actual bug behind the duplicated, run-together
          // text reported from the deployed site. Unwrapping here — walking
          // through exactly like any other container (TR/TD/TBODY have no
          // case of their own, so they fall through to the same default
          // unwrap) — lets the walk reach the real content once, and the
          // genuinely simple table nested inside (no further nesting) then
          // correctly qualifies for the branch below on its own.
          walkChildren(node, out);
        } else {
          appendSimpleTable(node, out, sawText, commit, walkChildren, () => stopped);
        }
        return;
      case 'P': case 'DIV': case 'H1': case 'H2': case 'H3': case 'BLOCKQUOTE': {
        // Block-level: a paragraph in the bubble, recursing into children.
        // BLOCKQUOTE gets no special treatment — the content-based probe
        // above is what removes a quote, regardless of how any given mail
        // client happened to mark one up.
        const el = elem('p', 'adm-msg-p');
        walkChildren(node, el);
        if (el.childNodes.length) commit(out, el);
        return;
      }
      default:
        // Anything else (a styling span, a table-layout wrapper div, ...):
        // unwrap rather than drop, so its text isn't lost just because the
        // wrapper itself isn't one we render specially.
        walkChildren(node, out);
    }
  }

  walkChildren(doc.body, frag);
  rollback();
  return frag;
}

/**
 * GHL's own templates are simple label/value tables (Tour Date | Feb 18,
 * 2027) — rendered as flex rows reusing this file's own styling rather than
 * any layout from the source table, which is never trusted anyway.
 */
function appendSimpleTable(table, out, sawText, commit, walkChildren, isStopped) {
  const el = elem('div', 'adm-msg-table');
  for (const row of table.querySelectorAll('tr')) {
    if (isStopped()) break;
    const cells = Array.from(row.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
    if (!cells.some(c => normalizeWs(c.textContent))) continue;

    const rowEl = elem('div', 'adm-msg-table-row');
    if (cells.length >= 2) {
      // The label (e.g. "Check-in") stays plain text — .adm-msg-table-label
      // is already bold via CSS, and a label is never anything richer than
      // that in practice. Only the label needs its own sawText() call: the
      // value cell(s) get their text from walkChildren() below, which calls
      // sawText() itself for every text node it visits.
      const label = normalizeWs(cells[0].textContent);
      sawText(label);
      if (isStopped()) break;
      rowEl.appendChild(elem('span', 'adm-msg-table-label', label));

      // The value cell(s) go through the SAME safe-tag walk as everything
      // else, not raw textContent — a "value" can be a real link, like the
      // phone-call button's own single-cell table below, which would
      // otherwise lose its tel: href and become inert text.
      const valueEl = elem('span', 'adm-msg-table-value');
      for (const cell of cells.slice(1)) {
        if (isStopped()) break;
        walkChildren(cell, valueEl);
      }
      if (valueEl.childNodes.length) rowEl.appendChild(valueEl);
    } else {
      const cellEl = elem('span', null);
      walkChildren(cells[0], cellEl);
      if (cellEl.childNodes.length) rowEl.appendChild(cellEl);
    }

    if (rowEl.childNodes.length) el.appendChild(rowEl);
  }
  if (el.childNodes.length) commit(out, el);
}

function appendAttachments(container, msg) {
  for (const url of msg.attachments) {
    const a = elem('a', 'adm-msg-attachment');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.appendChild(icon('fa-paperclip'));
    a.appendChild(elem('span', null, 'View attachment'));
    container.appendChild(a);
  }
}

function appendMessageMeta(container, msg) {
  const meta = elem('div', 'adm-msg-meta');
  const when = formatTimestamp(msg.dateAdded);
  if (when) meta.appendChild(elem('span', null, when));
  if (msg.status === 'failed' || msg.status === 'undelivered') {
    meta.appendChild(elem('span', 'adm-msg-status', 'Not delivered'));
  }
  if (meta.childElementCount) container.appendChild(meta);
}

/**
 * Lives outside the render() reconciliation the rest of the detail pane uses:
 * the draft text is mirrored into state.composer.value on every keystroke
 * (without triggering a render — that would fight the caret) specifically so
 * an unrelated render elsewhere (e.g. toggling dark mode from the settings
 * menu) rebuilds this textarea WITHOUT losing whatever the owner was typing.
 */
function buildComposer(convo, ctx) {
  const form = elem('form', 'adm-composer');
  const textarea = document.createElement('textarea');
  textarea.className = 'adm-composer-input';
  textarea.placeholder = `Reply by ${convo.channel}…`;
  textarea.rows = 1;
  textarea.value = state.composer.value;
  textarea.disabled = state.composer.busy;
  textarea.setAttribute('aria-label', 'Reply message');
  textarea.addEventListener('input', () => { state.composer.value = textarea.value; });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });

  const send = elem('button');
  send.type = 'submit';
  send.className = 'adm-composer-send';
  send.disabled = state.composer.busy;
  send.setAttribute('aria-label', 'Send');
  send.appendChild(icon('fa-paper-plane'));

  form.appendChild(textarea);
  form.appendChild(send);

  if (state.composer.error) {
    const err = elem('p', 'adm-error', state.composer.error);
    form.appendChild(err);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    sendReply(convo, textarea.value, ctx);
  });

  return form;
}

// ------------------------------------------------------------------- actions

async function loadContacts() {
  state.contacts.status = 'loading';
  render();
  try {
    const data = await api('/api/admin/contacts?limit=50');
    state.contacts = { status: 'ready', items: data.contacts || [], error: '' };
    state.screen = 'app';
    state.status = `${state.contacts.items.length} contacts loaded.`;
    render();
  } catch (err) {
    if (err instanceof SessionExpired) return;

    // A 5xx means the guard already let us through and the CRM is what failed,
    // so the session is good and the error belongs in the list pane. Anything
    // else on a cold boot — a 404, a network failure, the API not deployed —
    // tells us nothing about the session, and dropping someone into an app
    // shell they never signed into is worse than showing the login form.
    const authProven = state.screen === 'app' || (err.status >= 500 && err.status < 600);
    if (!authProven) {
      lockOut(err.message || 'Could not reach the dashboard. Check your connection.');
      return;
    }

    state.contacts = { status: 'error', items: [], error: err.message };
    state.screen = 'app';
    render();
  }
}

async function loadDetail(id, { force = false } = {}) {
  if (!force && state.details.get(id)?.status === 'ready') return;
  state.details.set(id, { status: 'loading' });
  render();
  try {
    const data = await api(`/api/admin/contact?id=${encodeURIComponent(id)}`);
    state.details.set(id, {
      status: 'ready',
      contact: data.contact,
      notes: data.notes || [],
      notesUnavailable: Boolean(data.notesUnavailable),
    });
  } catch (err) {
    if (err instanceof SessionExpired) return;
    state.details.set(id, { status: 'error', error: err.message });
  }
  render();
}

function selectContact(id) {
  state.selectedId = id;
  // Focus moves to the detail pane ONLY on narrow screens, where the list is
  // display:none and focus would otherwise be destroyed. On desktop both panes
  // are visible, so focus stays on the row and arrow-browsing keeps working.
  // This is the only place JS reads the breakpoint, and it reads it for focus,
  // never for layout.
  if (window.matchMedia('(max-width: 767px)').matches) focusAfterRender = el.detail;
  render();
  loadDetail(id);
}

function goBackToList() {
  const idField = state.section === 'contacts' ? 'selectedId' : 'selectedConvoId';
  const id = state[idField];
  state[idField] = null;
  render();
  const row = id && el.rows.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (row) row.focus();
}

function switchSection(section) {
  if (state.section === section) return;
  state.section = section;
  render();
  if (section === 'messages' && state.conversations.status === 'idle') loadConversations();
}

async function loadConversations() {
  state.conversations.status = 'loading';
  render();
  try {
    const data = await api('/api/admin/conversations?limit=50');
    state.conversations = { status: 'ready', items: data.conversations || [], error: '' };
    state.status = `${state.conversations.items.length} conversations loaded.`;
    render();
  } catch (err) {
    if (err instanceof SessionExpired) return;
    state.conversations = { status: 'error', items: [], error: err.message };
    render();
  }
}

async function loadThread(id, { force = false, before } = {}) {
  const existing = state.threads.get(id);
  if (!force && !before && existing?.status === 'ready') return;
  state.threads.set(id, before ? { ...existing, loadingMore: true } : { status: 'loading' });
  render();
  try {
    const qs = new URLSearchParams({ id });
    if (before) qs.set('lastMessageId', before);
    const data = await api(`/api/admin/messages?${qs}`);
    const messages = before && existing
      ? [...existing.messages, ...(data.messages || [])]
      : (data.messages || []);
    state.threads.set(id, {
      status: 'ready',
      messages,
      nextPage: Boolean(data.nextPage),
      lastMessageId: data.lastMessageId || null,
    });
  } catch (err) {
    if (err instanceof SessionExpired) return;
    state.threads.set(id, { status: 'error', error: err.message });
  }
  render();
}

function selectConversation(id) {
  state.selectedConvoId = id;
  state.composer = { busy: false, error: '', value: '' };
  if (window.matchMedia('(max-width: 767px)').matches) focusAfterRender = el.detail;
  render();
  loadThread(id);
  markConversationRead(id);
}

/**
 * Best-effort, not load-bearing: opening a conversation is what a human
 * reading it looks like, so its badge clears the same way any inbox's does.
 * Fails silently (console-only) rather than surfacing an error — a wrong
 * unread count is cosmetic, and the thread itself already loaded fine
 * regardless of whether this succeeds.
 */
async function markConversationRead(id) {
  const convo = state.conversations.items.find(c => c.id === id);
  if (!convo || !convo.unreadCount) return;
  try {
    await api('/api/admin/mark-conversation-read', { method: 'POST', body: { conversationId: id } });
    convo.unreadCount = 0;
    render();
  } catch (err) {
    if (err instanceof SessionExpired) return;
    console.error('[admin] mark-as-read failed', err.message);
  }
}

async function sendReply(convo, rawMessage, ctx) {
  if (state.composer.busy) return;
  const message = rawMessage.trim();
  if (!message) return;

  state.composer.busy = true;
  state.composer.error = '';
  render();

  try {
    await api('/api/admin/send-message', {
      method: 'POST',
      body: { conversationId: convo.id, contactId: convo.contactId, type: convo.sendType, message, ...ctx },
    });
    state.composer = { busy: false, error: '', value: '' };
    state.status = 'Message sent.';
    // Reflects the true stored message (id, status) from GHL rather than
    // guessing what it would look like with a local echo.
    await loadThread(convo.id, { force: true });
  } catch (err) {
    if (err instanceof SessionExpired) return;
    state.composer.busy = false;
    state.composer.error = err.message;
    render();
  }
}

// --------------------------------------------------------------------- wiring

el.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.auth.busy) return;
  state.auth = { busy: true, error: '' };
  render();
  try {
    await api('/api/admin/login', { method: 'POST', body: { password: el.password.value } });
    el.password.value = '';
    state.auth = { busy: false, error: '' };
    state.status = 'Signed in.';
    await loadContacts();
    focusAfterRender = el.search;
    render();
  } catch (err) {
    if (err instanceof SessionExpired) return;
    state.auth = { busy: false, error: err.message };
    focusAfterRender = el.password;
    render();
  }
});

el.search.addEventListener('input', () => {
  if (state.section === 'contacts') state.query = el.search.value;
  else state.convoQuery = el.search.value;
  render();
});

el.refresh.addEventListener('click', () => {
  if (state.section === 'contacts') loadContacts();
  else loadConversations();
});
el.back.addEventListener('click', goBackToList);

el.tabContacts.addEventListener('click', () => switchSection('contacts'));
el.tabMessages.addEventListener('click', () => switchSection('messages'));

el.settingsBtn.addEventListener('click', () => {
  if (el.settingsMenu.hidden) openSettingsMenu();
  else closeSettingsMenu();
});

// Closes the menu on any click outside it. Checking containment (rather than
// e.g. a capture-phase stopPropagation dance) means the settings button's own
// click — which toggles the menu open — is correctly left alone: by the time
// this bubbles up to document, its containment check sees the click landed
// inside the button and no-ops.
document.addEventListener('click', (e) => {
  if (el.settingsMenu.hidden) return;
  if (el.settingsBtn.contains(e.target) || el.settingsMenu.contains(e.target)) return;
  closeSettingsMenu();
});

el.logout.addEventListener('click', async () => {
  closeSettingsMenu();
  try { await api('/api/admin/logout', { method: 'POST', body: {} }); }
  catch { /* clearing local state matters more than the round trip */ }
  lockOut('');
});

el.themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('km-admin-theme', next); } catch { /* private browsing */ }
  el.themeToggle.setAttribute('aria-checked', String(next === 'dark'));
  state.status = next === 'dark' ? 'Dark mode on.' : 'Dark mode off.';
  render();
  closeSettingsMenu({ restoreFocus: true });
});

// Escape backs out of the detail pane on mobile, matching the Back button —
// and closes the settings menu, matching the password dialog it defers to.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (el.pwDialog.open) return;                         // the dialog owns Escape
  if (!el.settingsMenu.hidden) { closeSettingsMenu({ restoreFocus: true }); return; }
  if (state.screen === 'app' && activeSelectedId()
      && window.matchMedia('(max-width: 767px)').matches) {
    goBackToList();
  }
});

// Arrow keys move between rows. Deliberately NOT role="listbox": that would
// promise a full selection model we do not implement.
el.rows.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
  const rows = [...el.rows.querySelectorAll('.adm-row')];
  if (!rows.length) return;
  const at = rows.indexOf(document.activeElement);
  let next;
  if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = rows.length - 1;
  else if (at === -1) next = 0;
  else next = e.key === 'ArrowDown' ? Math.min(at + 1, rows.length - 1) : Math.max(at - 1, 0);
  e.preventDefault();
  rows[next].focus();
});

// ------------------------------------------------------------ change password

el.changePw.addEventListener('click', () => {
  closeSettingsMenu();
  state.pw = { busy: false, error: '' };
  el.pwError.textContent = '';
  el.pwForm.reset();
  el.pwDialog.showModal();
  el.pwCurrent.focus();
});

el.pwCancel.addEventListener('click', () => el.pwDialog.close());

el.pwForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.pw.busy) return;

  const current = el.pwCurrent.value;
  const next = el.pwNew.value;
  if (next !== el.pwConfirm.value) {
    el.pwError.textContent = 'The two new passwords do not match.';
    el.pwNew.focus();
    return;
  }

  state.pw = { busy: true, error: '' };
  el.pwSave.disabled = true;
  el.pwSave.textContent = 'Saving…';
  el.pwError.textContent = '';

  try {
    await api('/api/admin/change-password', {
      method: 'POST',
      body: { currentPassword: current, newPassword: next },
    });
    el.pwForm.reset();
    el.pwDialog.close();
    state.status = 'Password changed. Everyone else has been signed out.';
    render();
  } catch (err) {
    if (err instanceof SessionExpired) return;
    el.pwError.textContent = err.message;
    el.pwCurrent.focus();
  } finally {
    state.pw.busy = false;
    el.pwSave.disabled = false;
    el.pwSave.textContent = 'Save';
  }
});

// ------------------------------------------------------------------ lifecycle

window.addEventListener('offline', () => { el.offline.hidden = false; });
window.addEventListener('online', () => { el.offline.hidden = true; });

// The inline boot script in admin.html sets data-theme before this module
// even runs (avoiding a flash of the wrong theme); sync the toggle's visual
// state to whatever it decided, so it doesn't default to "off" on a return
// visit where dark mode is actually already active.
el.themeToggle.setAttribute('aria-checked', String(document.documentElement.dataset.theme === 'dark'));

// The contacts call doubles as the session probe: a 401 flips boot -> locked,
// a success flips it to app. No separate /api/admin/session endpoint needed.
loadContacts();
