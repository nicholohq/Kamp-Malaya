// ---------- CURATED REVIEWS ----------
// Renders the testimonial cards from reviews.json (single source of truth) and
// injects aggregateRating + review data into the page's LocalBusiness JSON-LD so
// Google can show review rich results. Edit src/reviews.json to add reviews.
import reviewsData from './reviews.json';

const reviews = (reviewsData.items || []).filter(r => r && r.body && r.author);

function stars(rating) {
  const n = Math.max(0, Math.min(5, Math.round(rating || 5)));
  return '★★★★★☆☆☆☆☆'.slice(5 - n, 10 - n);
}

// 1) Render visible cards into #reviewGrid (falls back silently if absent).
function renderCards() {
  const grid = document.getElementById('reviewGrid');
  if (!grid || !reviews.length) return;

  grid.innerHTML = reviews.map((r, i) => {
    const delay = i % 3 === 1 ? ' reveal-delay-1' : i % 3 === 2 ? ' reveal-delay-2' : '';
    const meta = r.location ? r.location : '';
    return `
      <div class="reveal${delay} bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-gold/30 hover:border-gold transition-all">
        <div class="flex gap-1 text-gold mb-4" aria-label="${r.rating || 5} out of 5 stars">${stars(r.rating)}</div>
        <p class="font-quote text-charcoal text-xl leading-relaxed italic">&ldquo;${escapeHtml(r.body)}&rdquo;</p>
        <p class="mt-6 font-semibold text-charcoal">${escapeHtml(r.author)}</p>
        ${meta ? `<p class="text-graytext text-sm">${escapeHtml(meta)}</p>` : ''}
      </div>`;
  }).join('');

  // Re-observe the new cards for the scroll-reveal animation.
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, { threshold: 0.15 });
  grid.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// 2) Inject aggregateRating + review into the existing LocalBusiness JSON-LD.
function injectSchema() {
  if (!reviews.length) return;

  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    let data;
    try { data = JSON.parse(script.textContent); } catch { continue; }
    // Only augment the business object (skip breadcrumb/website/etc.).
    const type = Array.isArray(data['@type']) ? data['@type'].join(' ') : data['@type'] || '';
    if (!/business|resort|lodging|hotel|organization/i.test(type)) continue;

    const count = reviews.length;
    const avg = reviews.reduce((s, r) => s + (r.rating || 5), 0) / count;
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: avg.toFixed(1),
      reviewCount: String(count),
      bestRating: '5',
    };
    data.review = reviews.map(r => {
      const review = {
        '@type': 'Review',
        author: { '@type': 'Person', name: r.author },
        reviewRating: { '@type': 'Rating', ratingValue: String(r.rating || 5), bestRating: '5' },
        reviewBody: r.body,
      };
      if (r.date) review.datePublished = r.date;
      return review;
    });
    script.textContent = JSON.stringify(data);
    return; // only the business object
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

renderCards();
injectSchema();
