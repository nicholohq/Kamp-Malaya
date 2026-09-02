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
  formatTimestamp, parseNote, normalisePhone, initials,
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
  contacts: { status: 'idle', items: [], error: '' },
  query: '',
  selectedId: null,
  details: new Map(),        // contactId -> { status, contact, notes, error }
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
  el.back.hidden = !(signedIn && state.selectedId);
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
    el.app.dataset.pane = state.selectedId ? 'detail' : 'list';
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

function renderDetail() {
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
  const id = state.selectedId;
  state.selectedId = null;
  render();
  const row = id && el.rows.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (row) row.focus();
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
  state.query = el.search.value;
  render();
});

el.refresh.addEventListener('click', () => loadContacts());
el.back.addEventListener('click', goBackToList);

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
  if (state.screen === 'app' && state.selectedId
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
