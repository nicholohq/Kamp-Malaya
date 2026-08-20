// ---------- CURATED REVIEWS (renders cards + injects review schema) ----------
import './reviews.js';

// ---------- FLOATING CHAT WIDGET (WhatsApp + Messenger + Book) ----------
import './chat-widget.js';

// ---------- ITINERARY: upcoming departures ----------
import { JOINER_SCHEDULE, todayISO, upcomingTours, formatTourLabel } from './joiner-schedule.mjs';

// ---------- FUNNEL URL ----------
const FUNNEL_URL = 'funnel.html';

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
      if (Number.isInteger(slide)) {
        goTo(slide);
        stopAutoplay();   // the visitor has taken over; stop moving under them
      }
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

function nextSlide() { goTo((current + 1) % slides.length); resetTimer(); }

// No keyboard handler here any more. The overlay arrows and dots are gone, so
// the carousel holds nothing focusable and a keydown scoped to it could never
// fire. The tour list beside it is the keyboard path to every slide.

// Pause on hover
const carouselEl = document.querySelector('#adventures .carousel-track')?.closest('.relative');
if (carouselEl) {
  carouselEl.addEventListener('mouseenter', () => { if (carouselTimer) clearInterval(carouselTimer); });
  carouselEl.addEventListener('mouseleave', resetTimer);
}

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

let carouselTimer;
function resetTimer() {
  if (carouselTimer) clearInterval(carouselTimer);
  carouselTimer = setInterval(nextSlide, 4500);
}
/** Ends autoplay for good — used when the visitor picks a tour themselves. */
function stopAutoplay() {
  if (carouselTimer) clearInterval(carouselTimer);
  carouselTimer = null;
}
resetTimer();
goTo(0);   // paints the initial current-row highlight

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