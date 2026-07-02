// Floating chat/contact widget — WhatsApp + Messenger + Book.
// Self-injecting; loaded on every page via main.js and funnel.js.
import './chat-widget.css';

const PHONE_INTL = '+63 962 240 3861';
const WA_NUMBER = '639622403861'; // wa.me format: country code, no +/spaces/leading 0
const WA_TEXT = encodeURIComponent("Hi Kamp Malaya! I'd like to ask about booking my Balabac trip.");

const LINKS = {
  whatsapp: `https://wa.me/${WA_NUMBER}?text=${WA_TEXT}`,
  messenger: 'https://m.me/kampmalaya',
  book: '/funnel.html',
};

const SVG = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2zm0 18.3c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.3 8.3 0 1 1 12 20.3z"/></svg>',
  messenger: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.4 2 2 6.1 2 11.7c0 2.9 1.2 5.4 3.1 7.1.2.1.3.3.3.5l.1 1.8c0 .5.6.9 1.1.7l2-.9c.2-.1.3-.1.5 0 .9.3 1.9.4 2.8.4 5.6 0 10-4.1 10-9.7S17.6 2 12 2zm6 7.5-2.9 4.7c-.5.7-1.5.9-2.2.4l-2.3-1.7c-.2-.2-.5-.2-.7 0l-3.1 2.4c-.4.3-.9-.2-.7-.6l2.9-4.7c.5-.7 1.5-.9 2.2-.4l2.3 1.7c.2.2.5.2.7 0l3.1-2.4c.4-.3.9.2.7.6z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
};

function build() {
  if (document.getElementById('kmChat')) return;

  const el = document.createElement('div');
  el.className = 'km-chat';
  el.id = 'kmChat';
  el.innerHTML = `
    <div class="km-chat__panel" id="kmChatPanel" role="dialog" aria-label="Contact Kamp Malaya">
      <div class="km-chat__head">
        <h4>Chat with Kamp Malaya</h4>
        <p>We usually reply within minutes</p>
      </div>
      <div class="km-chat__options">
        <a class="km-chat__option" href="${LINKS.whatsapp}" target="_blank" rel="noopener noreferrer">
          <span class="km-chat__badge km-chat__wa">${SVG.whatsapp}</span>
          <span class="km-chat__option-txt"><strong>WhatsApp</strong><span>Best for international guests</span></span>
        </a>
        <a class="km-chat__option" href="${LINKS.messenger}" target="_blank" rel="noopener noreferrer">
          <span class="km-chat__badge km-chat__msg">${SVG.messenger}</span>
          <span class="km-chat__option-txt"><strong>Messenger</strong><span>Chat with us on Facebook</span></span>
        </a>
        <a class="km-chat__option" href="${LINKS.book}">
          <span class="km-chat__badge km-chat__book">${SVG.calendar}</span>
          <span class="km-chat__option-txt"><strong>Book / Check availability</strong><span>Start your reservation</span></span>
        </a>
      </div>
      <div class="km-chat__foot">Balabac, Palawan &middot; ${PHONE_INTL}</div>
    </div>
    <button class="km-chat__fab" id="kmChatFab" type="button" aria-label="Open chat" aria-expanded="false" aria-controls="kmChatPanel">
      <span class="km-chat__open-icon">${SVG.chat}</span>
      <span class="km-chat__close-icon">${SVG.close}</span>
    </button>
  `;
  document.body.appendChild(el);

  const fab = el.querySelector('#kmChatFab');
  const open = () => {
    el.classList.add('km-open');
    fab.setAttribute('aria-expanded', 'true');
    fab.setAttribute('aria-label', 'Close chat');
  };
  const close = () => {
    el.classList.remove('km-open');
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-label', 'Open chat');
  };

  fab.addEventListener('click', (e) => {
    e.stopPropagation();
    el.classList.contains('km-open') ? close() : open();
  });
  document.addEventListener('click', (e) => {
    if (el.classList.contains('km-open') && !el.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  el.querySelectorAll('.km-chat__option').forEach((a) => a.addEventListener('click', close));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', build);
} else {
  build();
}
