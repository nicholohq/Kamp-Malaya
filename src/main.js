// ---------- CURATED REVIEWS (renders cards + injects review schema) ----------
import './reviews.js';

// ---------- FLOATING CHAT WIDGET (WhatsApp + Messenger + Book) ----------
import './chat-widget.js';

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

// ---------- BOOK NOW BUTTONS - REDIRECT ----------
const bookBtns = document.querySelectorAll('.book-btn');
bookBtns.forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    const room = this.dataset.room;
    window.location.href = FUNNEL_URL + '?room=' + encodeURIComponent(room);
  });
});

// ---------- TOUR LEARN MORE - ALERT (KEEP THIS) ----------
const learnMoreBtns = document.querySelectorAll('.learn-more');
learnMoreBtns.forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    alert(this.dataset.tour + '\n\n' + this.dataset.detail);
  });
});

// ---------- CAROUSEL ----------
const slides = [
  { img: '/gallery/aerial_view.jpg', caption: 'Island Hopping' },
  { img: '/gallery/reefsanctuary.webp', caption: 'Reef Sanctuary Snorkeling' },
  { img: '/gallery/fireflylagoon.webp', caption: 'Firefly Lagoon Night Tour' },
  { img: '/gallery/villagevisit.webp', caption: 'Local Village Visit' },
];
const carouselImg = document.getElementById('carouselImg');
const carouselCaption = document.getElementById('carouselCaption');
const dots = document.querySelectorAll('.dot');
let current = 0;

function goTo(i) {
  current = i;
  carouselImg.style.opacity = 0;
  setTimeout(() => {
    carouselImg.src = slides[i].img;
    carouselImg.alt = slides[i].caption;
    carouselCaption.textContent = slides[i].caption;
    carouselImg.style.opacity = 1;
  }, 300);
  dots.forEach((d, di) => d.classList.toggle('active', di === i));
}

if (dots.length > 0) {
  dots.forEach(d => d.addEventListener('click', () => { goTo(+d.dataset.i); resetTimer(); }));
}

function prevSlide() { goTo((current - 1 + slides.length) % slides.length); resetTimer(); }
function nextSlide() { goTo((current + 1) % slides.length); resetTimer(); }

document.getElementById('carouselPrev')?.addEventListener('click', prevSlide);
document.getElementById('carouselNext')?.addEventListener('click', nextSlide);

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') prevSlide();
  if (e.key === 'ArrowRight') nextSlide();
});

// Pause on hover
const carouselEl = document.querySelector('#adventures .carousel-track')?.closest('.relative');
if (carouselEl) {
  carouselEl.addEventListener('mouseenter', () => { if (carouselTimer) clearInterval(carouselTimer); });
  carouselEl.addEventListener('mouseleave', resetTimer);
}

let carouselTimer;
function resetTimer() {
  if (carouselTimer) clearInterval(carouselTimer);
  carouselTimer = setInterval(nextSlide, 4500);
}
resetTimer();

// ---------- ACCOMMODATION CARD SLIDESHOWS ----------
// Extra slides per room, filenames in /gallery/rooms/ (built by `npm run photos`).
// The cover (first) photo is the static <img> already in the HTML markup;
// these arrays hold the ADDITIONAL slides. Empty array = static card.
const ROOM_SLIDES = {
  canopy: [],
  kubo: [],
  villa: [],
};
const ROOM_ALTS = {
  canopy: 'Canopy Tent at Kamp Malaya',
  kubo: 'Kubo by the Shore at Kamp Malaya',
  villa: 'Malaya Villa at Kamp Malaya',
};
const SLIDE_INTERVAL_MS = 2000;

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