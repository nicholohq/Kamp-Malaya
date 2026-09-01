# Kamp Malaya — Balabac's Hidden Sanctuary

A modern, responsive tourism and booking website for Kamp Malaya, a luxury eco-sanctuary in Balabac, Palawan, Philippines.

**Live Site:** https://kampmalaya.tours/

---

## 🌟 Features

### 🏖️ User-Facing
- **Immersive Hero** — Full‑screen video background with glass overlay
- **Private Stay Booking** — Flexible dates with room selection (Kubo, Canopy, Villa)
- **Joiner Tour Booking** — 4D/3N all‑in package with fixed departure dates
- **Accommodation Cards** — Three sanctuary options with dynamic pricing & book buttons
- **Tour Carousel** — Auto‑rotating carousel with destination highlights
- **Gallery Grid** — Masonry‑style image gallery with zoom effects
- **Google Maps Card** — Clickable location card for Sicsican Island area
- **Responsive Design** — Mobile‑first, works across all devices
- **Contact Footer** — Social links (FB, IG) with icons

### ⚙️ Technical
- **Vite + Tailwind CSS v4** — Modern build tool with utility-first CSS
- **GoHighLevel Integration** — Form submission creates contacts in GHL
- **Conditional Booking Flow** — Private Stay vs Joiner Tour with dynamic fields
- **SEO Ready** — Open Graph, Twitter Cards, JSON‑LD structured data
- **Accessibility** — ARIA labels, keyboard navigation, semantic HTML
- **Image Optimization** — Lazy loading, WebP conversion ready
- **robots.txt + sitemap.xml** — Search engine indexing ready

---

## 📁 Project Structure

```
kamp-malaya/
├── index.html                      # Main landing page
├── funnel.html                     # Booking/inquiry form
├── package.json                    # Dependencies & scripts
├── package-lock.json
├── vite.config.js                  # Vite configuration
├── README.md
│
├── public/                         # Static assets (copied as-is)
│   ├── robots.txt                  # Search engine crawler instructions
│   ├── sitemap.xml                 # XML sitemap for SEO
│   ├── gallery/                    # All images (20 referenced files)
│   │   ├── aerial_view.jpg
│   │   ├── beachside_house.jpg
│   │   ├── beachside_hut.jpg
│   │   ├── beachside.jpg
│   │   ├── booknow.jpg
│   │   ├── coralreef.png
│   │   ├── drone-portrait-placeholder.jpg
│   │   ├── fireflylagoon.png
│   │   ├── night_stay.jpg
│   │   ├── onok_island.jpg
│   │   ├── panorama.png
│   │   ├── photo-landscape-1.jpg
│   │   ├── reefsanctuary.png
│   │   ├── seasidefeast.png
│   │   ├── sunset_boat.jpg
│   │   ├── tallportrait2.jpg
│   │   ├── tour_boat.jpg
│   │   ├── villagevisit.png
│   │   └── starfish-sandbar.webp
│   ├── hero-video/
│   │   ├── hero-vid.mp4            # 3.5 MB (2160x3840, plays first)
│   │   ├── hero-trim1.mp4          # then these three, in order
│   │   ├── hero-trim2.mp4
│   │   └── hero-trim3.mp4
│   └── icons/
│       └── kampmalaya.png
│
├── src/
│   ├── main.js                     # Index page JavaScript
│   ├── funnel.js                   # Funnel page JavaScript
│   ├── style.css                   # Index page styles (Tailwind v4)
│   └── funnel.css                  # Funnel page styles (Tailwind v4)
│
├── scripts/
│   └── convert-images.mjs          # Image optimization script (sharp)
│
├── originals-backup/               # Backup of original unused assets
│   ├── gallery-unused/             # 23 unreferenced images (recoverable)
│   ├── hero-video-original.mp4     # Original 48 MB video backup
│   └── png-originals/              # Six large PNG originals
│
├── dist/                           # Production build (generated)
│   ├── assets/
│   └── ...
│
└── .gitignore
```

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| **Build Tool** | Vite 8.1.0 |
| **CSS Framework** | Tailwind CSS 4.3.1 |
| **Language** | Vanilla JavaScript |
| **CRM Integration** | GoHighLevel (GHL) |
| **Deployment** | Vercel |
| **Version Control** | Git + GitHub |
| **Domain** | kampmalaya.tours |

---

## 📦 Dependencies

```json
{
  "devDependencies": {
    "vite": "^8.1.0"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.3.1",
    "tailwindcss": "^4.3.1"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

---

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/kamp-malaya.git
cd kamp-malaya
```

### 2. Install dependencies
```bash
npm install
```

### 3. Run development server
```bash
npm run dev
```

### 4. Build for production
```bash
npm run build
```

### 5. Preview production build
```bash
npm run preview
```

---

## 🔐 Admin Dashboard

`/admin.html` — a password-gated page listing CRM contacts, so the owner can see
who enquired without logging into GoHighLevel. **Read-only**: nothing on it can
change CRM data. It is `noindex,nofollow` and `Disallow`ed in `robots.txt`.

### Environment variables

See `.env.example` for the full list. The admin area needs:

| Variable | Purpose |
| --- | --- |
| `ADMIN_PASSWORD_HASH` | scrypt hash — the seed and the recovery path |
| `ADMIN_SESSION_SECRET` | HMAC key for session cookies, 32+ random bytes |
| `ADMIN_SESSION_TTL_HOURS` | login lifetime, default `12` |
| `ADMIN_ORIGIN` | the only origin allowed to call `/api/admin/*` |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | injected by the Vercel Marketplace integration |

`GHL_API_KEY` needs the `contacts.readonly` scope added.

### First-time setup

1. Install the **Upstash Redis** integration from the Vercel Marketplace
   (Vercel KV was retired in December 2024). Credentials are injected for you.
2. `node scripts/hash-admin-password.mjs` — prints a generated password, its
   hash, and a session secret. Save the password in a password manager; it is
   not stored anywhere.
3. Set `ADMIN_PASSWORD_HASH` and `ADMIN_SESSION_SECRET` in Vercel, then
   **redeploy** — env var changes only apply to new deployments.

### Changing the password

Sign in and use **Change password**. It takes effect immediately, with no
redeploy, and signs out every other session while keeping you signed in.

### If the password is forgotten

Delete the **`admin:password`** key in the Upstash console. The dashboard falls
back to `ADMIN_PASSWORD_HASH`, so a forgotten password can never lock you out.
No redeploy needed.

### Signing every session out

Set **`admin:sessions_valid_after`** in Upstash to the current unix time. Every
outstanding cookie dies on the next request.

### Local development

`/api/*` does not run under `vite dev` — use `vercel dev`. Under plain
`vite dev` the page correctly shows the login screen with an error, because
Vite serves the handler source instead of JSON and the client rejects any
non-JSON response.

## 📊 Booking System

### Private Stay
- Flexible check-in/out dates
- Room selection: Kubo, Canopy, Villa
- 2-night minimum
- Supports 1-5+ guests
- Custom rates displayed per room

### Joiner Tour — 4D/3N Balabac Island Tour
- **Price:** ₱14,799/head
- **Deposit:** ₱1,000/head (non-refundable, transferable)
- **Inclusions:**
  - Round trip AC van transfers (Puerto Princesa ↔ Buliluyan Port)
  - Round trip boat transfers (Buliluyan ↔ Balabac)
  - Full board meals (Breakfast, Lunch, Dinner)
  - All entrance fees
  - Onok Island day tour
  - Camping tent accommodation with complete beddings
  - Environmental fee & life vest
  - Local tour guide
- **Fixed departure dates** — see schedule in funnel

### GoHighLevel Integration
- Form submits to GHL API
- Creates contact with all booking details
- Auto-email confirmation sent to customer
- Conditional fields based on booking type:
  - **Private Stay:** Accommodation, Check-in, Check-out
  - **Joiner Tour:** Tour Date, Dietary Restrictions

---

## 🎨 Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Coral | `#E76F51` | Primary buttons, accents |
| Gold | `#D4AF37` | Premium accents, stars, dividers |
| Seagrass | `#2A9D8F` | Secondary nature accents |
| Ink | `#1A1A1A` | Headings, dark elements |
| Charcoal | `#2C2C2C` | Body text |
| Graytext | `#6B6B6B` | Secondary text |
| Offwhite | `#F8F9FA` | Section backgrounds |
| Warmgray | `#F1F0EB` | Testimonial backgrounds |
| Sand | `#F9F6F0` | Accent backgrounds |
| Line | `#E5E5E5` | Borders, dividers |

---

## 📍 Location

**Sicsican Island, Balabac, Palawan, Philippines**

> The exact camp coordinates are shared upon booking confirmation to preserve the exclusivity of the sanctuary.

### How to Get There:
1. Fly to **Puerto Princesa International Airport** (PPS)
2. 4‑hour drive to **Buliluyan Port**
3. 2‑hour boat transfer to **Kamp Malaya**
4. *Transfers can be arranged upon booking*

---

## 🔗 Links

| Platform | URL |
|----------|-----|
| Live Site | https://kampmalaya.tours/ |
| Facebook | https://facebook.com/kampmalaya |
| Instagram | https://www.instagram.com/kampmalayabalabac/ |
| Sitemap | https://kampmalaya.tours/sitemap.xml |
| Robots.txt | https://kampmalaya.tours/robots.txt |

---

## 📬 Contact

- **Email:** kampmalayabalabac@gmail.com
- **Phone:** +63 962 240 3861

---

## ✅ Completed Technical Audit (June 2025)

| Area | Before | After |
|------|--------|-------|
| **Hero Video** | 46.9 MB | 4.8 MB |
| **6 Hero PNGs** | 11.3 MB | ~1.06 MB WebP |
| **Brand Colors** | 0 CSS generated | Fully rendering |
| **Carousel/JS Images** | 404 in production | Resolve correctly |
| **Google Maps** | Broken everywhere | Working (Sicsican/Balabac) |
| **dist/ Total** | ~62 MB | ~8.6 MB |
| **SEO/JSON-LD/sitemap** | None | Live on kampmalaya.tours |

### Specific Fixes Applied:

| Area | Status |
|------|--------|
| Custom Tailwind Colors | ✅ Fixed — @theme block added |
| Asset Paths | ✅ Fixed — moved to public/ |
| Carousel Images | ✅ Fixed — all load correctly |
| Google Maps | ✅ Fixed — clickable card, Sicsican Island |
| SEO Meta Tags | ✅ Added — OG/Twitter/JSON-LD |
| Accessibility | ✅ Added — ARIA, keyboard nav |
| Image Pruning | ✅ Done — 23 unused images backed up |
| robots.txt | ✅ Added — crawler instructions |
| sitemap.xml | ✅ Added — XML sitemap |
| Domain | ✅ Connected — kampmalaya.tours |

---

## 🚧 Future Enhancements

- [ ] Real-time availability calendar
- [ ] Online payment integration (GCash, credit card)
- [ ] PNG → WebP conversion for remaining images
- [ ] Real Facebook testimonials in JSON-LD
- [ ] Interactive Google Maps embed (once exact pin is confirmed)
- [ ] Convert learn-more alerts to modals
- [ ] Add blog/content section

---

## 📄 License

All rights reserved — Kamp Malaya © 2025

---

*Built with ❤️ for Balabac's last frontier.*