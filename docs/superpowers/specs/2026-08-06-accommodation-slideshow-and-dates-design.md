# Accommodation Slideshows, Photo Pipeline & Joiner Date Updates

**Date:** 2026-08-06
**Status:** Approved by Jamie

## Goal

Three changes to the Kamp Malaya site:

1. Replace each accommodation card's static photo with a hover/auto-play slideshow using the new inside/outside photos.
2. Convert the new HEIC photo originals (accommodations, boats, comfort rooms) into optimized web images.
3. Fix the funnel's joiner tour dropdown: hide past dates, add the 2027 schedule, and group the options by month.

Out of scope (noted for future work): a new itinerary section using the boat photos, and a new Sicsican Island camp section using the comfort room (CR) photos. This design only prepares their images.

## 1. Photo pipeline & naming convention

**Source folders** (local only — gitignored): `originals-backup/Accommodations/`, `originals-backup/Boats/`, `originals-backup/CR/` — iPhone HEIC files plus a few `.jfif`.

**Convert first, rename after** (Jamie can't view HEIC files on Windows, so renaming happens on the converted WebPs):

1. `npm run photos` converts everything to viewable WebP (done 2026-08-06).
2. Accommodation photos land in `photos-to-rename/` (project root, gitignored). Jamie views them there and renames each to `canopy-1.webp`, `canopy-2.webp`, `kubo-1.webp`, `villa-1.webp`, etc. Any count per room; `-1` is the cover image (shown before any interaction).
3. The renamed files then get moved into `public/gallery/rooms/` (implementation Task 5) — no re-conversion needed.
4. Boat and CR photos need no renaming and convert straight to `public/gallery/boats/` and `public/gallery/cr/`.

**Conversion script:** `scripts/convert-photos.mjs`, run manually via `npm run photos` (already implemented and run).

- Dev dependencies: `heic-convert` (HEIC decode — sharp's prebuilt libvips cannot read HEIC) and `sharp` (resize/encode).
- Reads HEIC/JFIF/JPG/PNG from the three source folders; slugifies names (lowercase, hyphens).
- Outputs WebP, max width 1200px, quality ~80, to:
  - `photos-to-rename/` (accommodations — staging for manual renaming)
  - `public/gallery/boats/`
  - `public/gallery/cr/`
- Idempotent: skips outputs that already exist and are newer than the source.

## 2. Accommodation hover slideshow

**Cards:** the three articles in the Sanctuaries section of `index.html` (Canopy Tent, Kubo by the Shore, Malaya Villa). Layout, gold-frame styling, pricing, and Book Now buttons are unchanged.

**Markup:** each card's first slide stays as a real `<img>` in the HTML (SEO, alt text, and no-JS visitors keep working; the current `beachside_*.jpg` images are replaced by the new `-1` cover WebPs with updated width/height attributes). The card's image wrapper gets `data-slides-key="canopy" | "kubo" | "villa"`.

**Manifest:** a `ROOM_SLIDES` constant in `src/main.js` maps each key to its slide filenames (updated by hand when photos change; the person converting photos also updates this list).

**Behavior (vanilla JS in `main.js`, matching the existing carousel code style):**

- On init, JS appends the remaining slides as absolutely-positioned, `loading="lazy"` images stacked in the wrapper, opacity 0.
- Crossfade = toggling an opacity class; CSS transition (~0.6s) in `src/style.css`.
- Desktop (`hover: hover` media query): `mouseenter` starts a ~2s interval cycling slides; `mouseleave` stops it and resets to the cover.
- Mobile / touch (no hover): an `IntersectionObserver` starts the same cycle while the card is ≥50% in view and stops it when out of view.
- A room with only one photo simply never cycles. If JS fails, the cover image still shows.

## 3. Funnel joiner dates

All changes in `src/funnel.js`.

**Past-date filtering:** `populateJoinerDates()` renders only tours whose `start` is **today or later** (device-local date, compared as `YYYY-MM-DD` strings). A tour starting today still shows; from the next day it disappears. Chosen rule: "once its start date passes" — no extra lead-time buffer.

**2027 schedule** (transcribed from `originals-backup/tour dates 2027.jfif`, appended to `JOINER_SCHEDULE`):

- Jan: 2–5, 7–10, 14–17, 21–24, 28–31
- Feb: 4–7, 11–14, 18–21, 25–28
- Mar: 4–7, 11–14, 18–21, 25–28
- Apr: 1–4, 8–11, 15–18, 22–25, 28–May 1
- May: 6–9, 13–16, 20–23, 27–31
- Jun: 3–6, 10–13, 17–20, 24–27
- Jul: 1–4, 8–11, 15–18, 22–25, 29–Aug 1
- Aug: 5–8, 12–15, 19–22, 26–29
- Sep: 2–5, 9–12, 16–19, 23–26, 30–Oct 3
- Oct: 7–10, 14–17, 21–24, 28–31
- Nov: 4–7, 11–14, 18–21, 25–28
- Dec: 2–5, 9–12, 16–19, 21–24, 27–30

May 27–31 (5 days) and Dec 21–24 (off the weekly rhythm) are exactly as printed on the poster; Jamie confirmed the poster is correct.

**Grouped dropdown:** options are grouped under `<optgroup label="August 2026">`-style month headers (label = month + year of the tour's start date), generated from the filtered schedule. Option labels become clean ranges — `Aug 6 – 9`, cross-month as `Sep 30 – Oct 3`. The option `value` remains the ISO start date, so the existing GHL form submission, `?date=` deep-link preselection, and validation keep working unchanged. Existing 2026 `label` fields in the array stay but are no longer displayed; labels are derived from `start`/`end`.

## Error handling

- Conversion script: a file that fails to decode logs a warning and is skipped; the script continues.
- Slideshow: missing manifest entry or wrapper → that card silently stays a static image.
- Dates: if every date is somehow in the past, the dropdown shows only the disabled placeholder (same as today's empty state).

## Testing

- `npm run photos` twice → second run reports all skips (idempotency).
- `npm run dev`: hover each card on desktop (cycle + reset), emulate touch/mobile (auto-play in view), check a one-photo room stays static.
- Funnel: verify past 2026 dates are gone, groups render per month on desktop and mobile, 2027 entries present and selectable, form still submits the ISO date to GHL, `?date=` preselect still works.
- `npm run build` passes.

## Future work (parked)

- Itinerary section → boat photos (`public/gallery/boats/`, includes `speedboat(10-12pax)` and `katig(25pax)` shots).
- Sicsican Island camp section → CR photos (`public/gallery/cr/`).
