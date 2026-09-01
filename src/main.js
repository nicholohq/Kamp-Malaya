// ---------- CURATED REVIEWS (renders cards + injects review schema) ----------
import './reviews.js';

// ---------- FLOATING CHAT WIDGET (WhatsApp + Messenger + Book) ----------
import './chat-widget.js';

// ---------- ITINERARY: upcoming departures ----------
import { JOINER_SCHEDULE, todayISO, upcomingTours, formatTourLabel } from './joiner-schedule.mjs';

// ---------- FUNNEL URL ----------
const FUNNEL_URL = 'funnel.html';

// ---------- HERO: a playlist of clips played as one seamless loop ----------
// hero-vid runs, then hero-trim1/2/3, then round again. Only two <video>
// elements exist and they ping-pong: while one is visible and playing, the
// other is off-screen loading the next clip. Swapping .src resets the decoder
// and paints a black frame, so that only ever happens on the hidden element.
(() => {
  const PLAYLIST = [
    '/hero-video/hero-vid.mp4',
    '/hero-video/hero-trim1.mp4',
    '/hero-video/hero-trim2.mp4',
    '/hero-video/hero-trim3.mp4',
  ];

  const a = document.getElementById('heroVidA');
  const b = document.getElementById('heroVidB');
  if (!a || !b) return;

  // Reduced motion: leave the poster frame up. The loop runs well past five
  // seconds and the hero offers no pause control (WCAG 2.2.2).
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    a.removeAttribute('autoplay');
    a.pause();
    return;
  }

  const FADE_S = 0.9;          // matches the CSS transition
  let active = a, idle = b;
  let idx = 0;                 // index in PLAYLIST of the clip now playing
  let swapping = false;

  // Point the hidden element at whatever comes next and start fetching it.
  // A is already loading PLAYLIST[0] from its <source>, so it is never armed
  // with that same URL — re-assigning .src would refetch a clip we have.
  function arm() {
    const next = PLAYLIST[(idx + 1) % PLAYLIST.length];
    if (idle.getAttribute('src') === next) return;
    idle.setAttribute('src', next);
    idle.preload = 'auto';
    idle.load();
    // A carries the autoplay attribute for the no-JS/first-paint case. Once we
    // start reassigning its src, load() would let autoplay start it playing
    // invisibly and out of sync, so two clips run at once and the playlist
    // jumps. Keep the armed element parked until its handoff.
    idle.pause();
  }

  // Hold each fetch until its predecessor is genuinely playing, so the visible
  // clip never shares bandwidth with a download nobody can see yet.
  a.addEventListener('playing', () => {
    a.removeAttribute('autoplay');   // playback is ours to drive from here on
    a.removeAttribute('poster');     // else re-loading A for a later clip
                                     // re-displays the poster mid-loop
    arm();
  }, { once: true });

  function handoff() {
    const from = active, to = idle;   // already playing with a painted frame

    // Fade the incoming clip in ON TOP of the outgoing one, which stays fully
    // opaque underneath. Fading both simultaneously leaves the stack ~75%
    // opaque at the midpoint and the white page background flashes through.
    to.classList.remove('is-active');   // start from 0 so there is a value to animate from
    to.classList.add('is-incoming');    // lift above and enable the transition
    void to.offsetWidth;                // reflow: without it the browser coalesces
                                        // both class changes and skips the fade
    to.classList.add('is-active');      // now animates 0 -> 1 over the old clip

    active = to; idle = from;
    idx = (idx + 1) % PLAYLIST.length;

    setTimeout(() => {
      to.classList.remove('is-incoming');  // settle back down a layer, still opaque
      from.classList.remove('is-active');  // instant, and invisible: it is behind
      from.pause();
      from.currentTime = 0;
      swapping = false;
      arm();                   // the freed element now loads the clip after this
    }, FADE_S * 1000 + 200);   // +200ms: the class flip and the transition do not
                               // start on the same frame, so cutting at exactly
                               // FADE_S clips the tail of the fade.
  }

  // Get the clip to the point where it has actually PAINTED a frame, then call
  // back. readyState alone is not enough: a seek drops it back to HAVE_METADATA,
  // and fading in an element that has no presented frame shows a stale or blank
  // one for a beat — which reads as a flicker at every switch.
  // Waiting on a bare 'canplay' is also a trap: if the clip became ready before
  // the listener was attached the event has already fired and never fires again,
  // so the handoff would hang and the current clip loop instead of advancing.
  function prepare(v, cb) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cb();
    };
    const afterSeek = () => {
      // Start it rolling first: a frame is only presented once playback begins.
      v.play().catch(() => {});
      if (typeof v.requestVideoFrameCallback === 'function') {
        v.requestVideoFrameCallback(() => finish());   // fires on a real painted frame
      } else if (v.readyState >= 3) {
        finish();
      } else {
        v.addEventListener('canplay', finish, { once: true });
      }
    };
    if (v.currentTime === 0 && v.readyState >= 2) afterSeek();
    else { v.currentTime = 0; v.addEventListener('seeked', afterSeek, { once: true }); }
    const timer = setTimeout(finish, 2500);   // never stall the loop outright
  }

  function tick(e) {
    if (swapping || e.target !== active) return;
    const { duration, currentTime } = e.target;
    if (!duration || duration - currentTime > FADE_S) return;
    swapping = true;
    arm();
    prepare(idle, handoff);
  }

  // If the next clip never becomes playable, the current one loops on its own
  // rather than freezing on its last frame.
  function onEnded(e) {
    if (e.target !== active) return;
    e.target.currentTime = 0;
    e.target.play().catch(() => {});
    swapping = false;
  }

  [a, b].forEach(v => {
    v.addEventListener('timeupdate', tick);
    v.addEventListener('ended', onEnded);
  });
})();

// ---------- Navbar scroll state ----------
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
});

// ---------- Mobile menu ----------
const menuBtn = document.getElementById('menuBtn');
const mobileMenu = document.getElementById('mobileMenu');
let menuOpen = false;
function toggleMenu(open) {
  menuOpen = open;
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  mobileMenu.classList.toggle('opacity-0', !open);
  mobileMenu.classList.toggle('-translate-y-4', !open);
  mobileMenu.classList.toggle('pointer-events-none', !open);
}
menuBtn.addEventListener('click', () => toggleMenu(!menuOpen));
document.querySelectorAll('.mobile-link').forEach(l => l.addEventListener('click', () => toggleMenu(false)));

// ---------- Intersection Observer reveals ----------
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ---------- ITINERARY: day carousel (hero + island thumbnails) ----------
// The day-by-day itinerary is a timeline now, not a carousel — every day is on
// the page at once, so there is no panel switching, thumbnail swapping or
// counter left to drive.

const itinDates = document.getElementById('itinDates');
if (itinDates) {
  const upcoming = upcomingTours(JOINER_SCHEDULE, todayISO()).slice(0, 6);
  itinDates.innerHTML = upcoming.length
    ? upcoming.map(t => `<span class="inline-block bg-offwhite border border-line text-charcoal text-xs sm:text-sm rounded-full px-4 py-2">${formatTourLabel(t)}</span>`).join('')
    : '<span class="text-graytext text-sm">New dates announced soon — inquire to reserve.</span>';
}

// ---------- BOOK NOW BUTTONS - REDIRECT ----------
const bookBtns = document.querySelectorAll('.book-btn');
bookBtns.forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    const room = this.dataset.room;
    window.location.href = FUNNEL_URL + '?room=' + encodeURIComponent(room);
  });
});

// ---------- TOUR DETAIL DISCLOSURES ----------
// The detail used to arrive in a native alert(): unstyleable, page-blocking,
// and on some mobile browsers it offers to suppress further dialogs. It is the
// copy that sells the tour, so it belongs on the page.
document.querySelectorAll('.tour-toggle').forEach(toggle => {
  const detail = document.getElementById(toggle.getAttribute('aria-controls'));
  if (!detail) return;

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';

    // One at a time: four open panels turn the list back into a wall of text.
    if (!open) {
      document.querySelectorAll('.tour-toggle[aria-expanded="true"]').forEach(other => {
        other.setAttribute('aria-expanded', 'false');
        other.closest('.tour-entry')?.classList.remove('is-open');
      });
    }

    toggle.setAttribute('aria-expanded', String(!open));
    toggle.closest('.tour-entry')?.classList.toggle('is-open', !open);

    // Opening a tour drives the carousel to its slide. The two halves sat side
    // by side implying a relationship they did not have, while the slide
    // changed on its own and contradicted whatever was being read.
    if (!open) {
      const slide = Number(toggle.dataset.slide);
      if (Number.isInteger(slide)) goTo(slide);
    }
  });
});

// ---------- CAROUSEL ----------
const slides = [
  { img: '/gallery/aerial_view.jpg', caption: 'Island Hopping' },
  { img: '/gallery/reefsanctuary.webp', caption: 'Reef Sanctuary Snorkeling' },
  { img: '/gallery/sicsican.webp', caption: 'Sicsican Island Camp' },
  { img: '/gallery/localvillage-2.webp', caption: 'Local Village Visit' },
];
const carouselImg = document.getElementById('carouselImg');
const carouselCaption = document.getElementById('carouselCaption');
let current = 0;

function goTo(i) {
  current = i;
  // Mark the matching tour so the two halves read as one component rather than
  // a list and an unrelated slideshow that happen to sit side by side.
  document.querySelectorAll('.tour-entry').forEach((entry, ei) => {
    entry.classList.toggle('is-current', ei === i);
  });
  carouselImg.style.opacity = 0;
  setTimeout(() => {
    const next = new Image();
    next.src = slides[i].img;
    const show = () => {
      carouselImg.src = slides[i].img;
      carouselImg.alt = slides[i].caption;
      carouselCaption.textContent = slides[i].caption;
      carouselImg.style.opacity = 1;
    };
    (next.decode ? next.decode().then(show).catch(show) : show());
  }, 300);
}

// No keyboard handler here any more. The overlay arrows and dots are gone, so
// the carousel holds nothing focusable and a keydown scoped to it could never
// fire. The tour list beside it is the keyboard path to every slide.

const carouselEl = document.querySelector('#adventures .carousel-track')?.closest('.relative');

// Warm the cache for the non-initial slides so switching is instant instead of
// lingering on the first (Island Hopping) image while the others download.
let slidesPreloaded = false;
function preloadSlides() {
  if (slidesPreloaded) return;
  slidesPreloaded = true;
  slides.forEach(s => { const im = new Image(); im.src = s.img; });
}
if (carouselEl) {
  const pobs = new IntersectionObserver((entries, obs) => {
    if (entries.some(e => e.isIntersecting)) { preloadSlides(); obs.disconnect(); }
  }, { rootMargin: '600px' });
  pobs.observe(carouselEl);
}
window.addEventListener('load', preloadSlides);

// No autoplay. The tour list is the control, so a slide advancing on its own
// moved the row highlight while the visitor was reading and contradicted
// whatever tour they had open. It also left moving content with no pause
// mechanism once the overlay arrows and dots were removed (WCAG 2.2.2).
goTo(0);   // first slide, and paints the initial current-row highlight

// ---------- ACCOMMODATION CARD SLIDESHOWS ----------
// Extra slides per room, filenames in /gallery/rooms/ (built by `npm run photos`).
// The cover (first) photo is the static <img> already in the HTML markup;
// these arrays hold the ADDITIONAL slides. Empty array = static card.
const ROOM_SLIDES = {
  canopy: ['canopy-2.webp'],
  kubo: ['kubo-2.webp', 'kubo-3.webp', 'kubo-4.webp', 'kubo-5.webp', 'kubo-6.webp', 'kubo-7.webp'],
  villa: ['villa-2.webp', 'villa-3.webp', 'villa-4.webp', 'villa-5.webp', 'villa-6.webp', 'villa-7.webp', 'villa-8.webp', 'villa-9.webp', 'villa-10.webp'],
};
const ROOM_ALTS = {
  canopy: 'Canopy Tent at Kamp Malaya',
  kubo: 'Kubo by the Shore at Kamp Malaya',
  villa: 'Malaya Villa at Kamp Malaya',
};
const SLIDE_INTERVAL_MS = 1200;

const canHover = window.matchMedia('(hover: hover)').matches;

document.querySelectorAll('[data-slides-key]').forEach(wrap => {
  const key = wrap.dataset.slidesKey;
  const files = ROOM_SLIDES[key] || [];
  if (files.length === 0) return;

  const overlays = files.map((file, i) => {
    const img = document.createElement('img');
    img.src = '/gallery/rooms/' + file;
    img.alt = (ROOM_ALTS[key] || key) + ' – view ' + (i + 2);
    img.loading = 'lazy';
    img.decoding = 'async';
    img.className = 'room-slide';
    wrap.appendChild(img);
    return img;
  });

  let idx = 0; // 0 = cover image, 1..n = overlays
  let timer = null;

  function render() {
    overlays.forEach((img, i) => img.classList.toggle('show', i === idx - 1));
  }
  function start() {
    if (timer) return;
    timer = setInterval(() => {
      idx = (idx + 1) % (overlays.length + 1);
      render();
    }, SLIDE_INTERVAL_MS);
  }
  function stop() {
    clearInterval(timer);
    timer = null;
    idx = 0;
    render();
  }

  const card = wrap.closest('article') || wrap;
  if (canHover) {
    card.addEventListener('mouseenter', start);
    card.addEventListener('mouseleave', stop);
  } else {
    new IntersectionObserver(entries => {
      entries.forEach(e => (e.isIntersecting ? start() : stop()));
    }, { threshold: 0.5 }).observe(card);
  }
});