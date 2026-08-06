# Accommodation Slideshows, Photo Pipeline & Joiner Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hover/auto-play photo slideshows on the three accommodation cards, a HEIC→WebP photo conversion script, and a funnel joiner-date dropdown that hides past dates, includes the 2027 schedule, and groups options by month.

**Architecture:** Static Vite site (plain HTML + vanilla JS, Tailwind 4). Slideshow is a small vanilla-JS module in `src/main.js` driven by a filename manifest; schedule logic moves to a pure ESM module (`src/joiner-schedule.mjs`) tested with Node's built-in test runner; photo conversion is a standalone Node script using `sharp` + `heic-convert` (dev-only deps).

**Tech Stack:** Vite 8, vanilla JS (no framework), Tailwind CSS 4, flatpickr (already present, untouched), Node built-in `node:test`, `sharp` + `heic-convert` (devDependencies).

**Spec:** `docs/superpowers/specs/2026-08-06-accommodation-slideshow-and-dates-design.md`

## Global Constraints

- No new **runtime** dependencies. `sharp` and `heic-convert` are devDependencies only (used by a script, never bundled).
- Vanilla JS only — no carousel/slider libraries.
- Commit messages must NOT include any "Co-Authored-By: Claude" trailer (owner requirement).
- Do not change: pricing copy, Book Now buttons, GHL form field names/values, the flatpickr private-stay pickers, or the `?date=` deep-link behavior (`tour_date` option `value` stays the ISO start date, e.g. `2027-03-04`).
- `package.json` has no `"type": "module"` — any file Node imports directly as ESM must use the `.mjs` extension.
- The repo runs on Windows; commands below work in both PowerShell and Git Bash unless noted.
- Task 5 is blocked until the site owner renames the converted accommodation WebPs in `photos-to-rename/` (see Task 5 preamble). Task 1 is already done; Tasks 2–4 have no dependency on the renaming.

---

### Task 1: Photo conversion script (`npm run photos`) — ✅ ALREADY DONE (2026-08-06)

**This task was completed ahead of plan execution** (the owner needed viewable images to rename, since Windows can't display HEIC). Differences from the original draft:

- Accommodation photos output to **`photos-to-rename/`** (project root, gitignored) instead of `public/gallery/rooms/` — the owner renames the WebPs there while viewing them, and Task 5 **moves** the renamed files into `public/gallery/rooms/` (no re-conversion).
- The script exists at `scripts/convert-photos.mjs`; `npm run photos` is wired; `sharp` + `heic-convert` are installed as devDependencies; boats (16 files) and CR (9 files) WebPs are converted into `public/gallery/boats/` and `public/gallery/cr/`; all 65 conversions succeeded, idempotency verified.

**Skip to Task 2.** The steps below are retained only as a record of what the script does.

**Files:**
- Create: `scripts/convert-photos.mjs`
- Modify: `package.json` (add devDependencies + `photos` script)

**Interfaces:**
- Consumes: image originals in `originals-backup/Accommodations/`, `originals-backup/Boats/`, `originals-backup/CR/` (HEIC, JFIF, JPG, PNG).
- Produces: WebP files (max width 1200, quality 80, slugified lowercase names) in `photos-to-rename/`, `public/gallery/boats/`, `public/gallery/cr/`. Task 5 relies on the owner renaming `photos-to-rename/*.webp` to `canopy-N.webp` / `kubo-N.webp` / `villa-N.webp`.

- [ ] **Step 1: Install dev dependencies**

Run: `npm i -D sharp heic-convert`
Expected: both packages appear under `devDependencies` in `package.json`.

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `"scripts"`:

```json
"photos": "node scripts/convert-photos.mjs"
```

- [ ] **Step 3: Write the script**

Create `scripts/convert-photos.mjs`:

```js
// Converts photo originals (HEIC/JFIF/JPG/PNG) to optimized WebP for the site.
// Idempotent: skips outputs that are newer than their source. Run: npm run photos
import { readdir, mkdir, stat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import heicConvert from 'heic-convert';

const JOBS = [
  { src: 'originals-backup/Accommodations', out: 'public/gallery/rooms' },
  { src: 'originals-backup/Boats',          out: 'public/gallery/boats' },
  { src: 'originals-backup/CR',             out: 'public/gallery/cr' },
];
const EXTS = new Set(['.heic', '.jfif', '.jpg', '.jpeg', '.png']);
const MAX_WIDTH = 1200;
const QUALITY = 80;

const slugify = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function isUpToDate(src, out) {
  try {
    const [s, o] = await Promise.all([stat(src), stat(out)]);
    return o.mtimeMs >= s.mtimeMs;
  } catch {
    return false; // output missing
  }
}

async function convertOne(srcPath, outPath) {
  let input = await readFile(srcPath);
  if (path.extname(srcPath).toLowerCase() === '.heic') {
    input = Buffer.from(await heicConvert({ buffer: input, format: 'JPEG', quality: 0.92 }));
  }
  const webp = await sharp(input)
    .rotate() // respect EXIF orientation
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();
  await writeFile(outPath, webp);
}

let converted = 0, skipped = 0, failed = 0;
for (const job of JOBS) {
  let files;
  try {
    files = await readdir(job.src);
  } catch {
    console.warn(`missing folder, skipping: ${job.src}`);
    continue;
  }
  await mkdir(job.out, { recursive: true });
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (!EXTS.has(ext)) continue;
    const srcPath = path.join(job.src, f);
    const outPath = path.join(job.out, slugify(path.basename(f, ext)) + '.webp');
    if (await isUpToDate(srcPath, outPath)) {
      skipped++;
      continue;
    }
    try {
      await convertOne(srcPath, outPath);
      converted++;
      console.log(`ok   ${outPath}`);
    } catch (err) {
      failed++;
      console.warn(`FAIL ${srcPath}: ${err.message}`);
    }
  }
}
console.log(`done: ${converted} converted, ${skipped} skipped, ${failed} failed`);
```

- [ ] **Step 4: Run it and verify output**

Run: `npm run photos`
Expected: `public/gallery/boats/` and `public/gallery/cr/` fill with `.webp` files (e.g. `img-4990.webp`, `speedboat-10-12pax.webp`, `katig-25pax.webp`); `public/gallery/rooms/` gets whatever exists in `Accommodations/` (mostly `img-50xx.webp` until the owner renames; `tent-area.webp`, `tent-inside.webp`). Final line like `done: 60 converted, 0 skipped, 0 failed`. A small number of `FAIL` lines is acceptable only if the source file is genuinely corrupt — investigate any failure before proceeding.

Note: `originals-backup/tour dates 2027.jfif` sits at the top level of `originals-backup/`, not inside a JOBS folder, so it is correctly ignored.

- [ ] **Step 5: Verify idempotency**

Run: `npm run photos` again.
Expected: `done: 0 converted, N skipped, 0 failed` (N = number converted in Step 4).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/convert-photos.mjs public/gallery/boats public/gallery/cr public/gallery/rooms
git commit -m "Add HEIC->WebP photo conversion script (npm run photos)"
```

(If `public/gallery/rooms/` only contains un-renamed `img-50xx.webp` files, still commit them — Task 5 re-runs the script after renaming and Step 2 of Task 5 cleans these up.)

---

### Task 2: Joiner schedule module with tests (past-date filter, 2027 dates, month grouping)

**Files:**
- Create: `src/joiner-schedule.mjs`
- Create: `tests/joiner-schedule.test.mjs`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Consumes: nothing (pure module, no imports).
- Produces (used by Task 3):
  - `JOINER_SCHEDULE: Array<{start: string, end: string, label?: string}>` — ISO `YYYY-MM-DD` dates, chronological, 2026 + 2027.
  - `todayISO(d?: Date): string` — device-local date as `YYYY-MM-DD`.
  - `upcomingTours(schedule, today: string): Array<tour>` — tours with `start >= today`.
  - `formatTourLabel(tour): string` — `"Aug 6 – 9"`, cross-month `"Sep 30 – Oct 3"` (en dash, spaces around it).
  - `groupByMonth(tours): Array<{label: string, tours: Array<tour>}>` — label like `"August 2026"`, groups in input order.

- [ ] **Step 1: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "node --test tests/"
```

- [ ] **Step 2: Write the failing tests**

Create `tests/joiner-schedule.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JOINER_SCHEDULE,
  todayISO,
  upcomingTours,
  formatTourLabel,
  groupByMonth,
} from '../src/joiner-schedule.mjs';

test('todayISO formats a Date as local YYYY-MM-DD', () => {
  assert.equal(todayISO(new Date(2026, 7, 6)), '2026-08-06'); // Aug 6 2026
  assert.equal(todayISO(new Date(2027, 0, 2)), '2027-01-02');
});

test('upcomingTours drops tours that started before today', () => {
  const schedule = [
    { start: '2026-08-05', end: '2026-08-08' },
    { start: '2026-08-06', end: '2026-08-09' },
    { start: '2026-08-13', end: '2026-08-16' },
  ];
  const result = upcomingTours(schedule, '2026-08-06');
  assert.deepEqual(result.map(t => t.start), ['2026-08-06', '2026-08-13']);
});

test('a tour starting today is still shown', () => {
  const result = upcomingTours([{ start: '2026-08-06', end: '2026-08-09' }], '2026-08-06');
  assert.equal(result.length, 1);
});

test('formatTourLabel renders same-month and cross-month ranges', () => {
  assert.equal(formatTourLabel({ start: '2026-08-06', end: '2026-08-09' }), 'Aug 6 – 9');
  assert.equal(formatTourLabel({ start: '2027-09-30', end: '2027-10-03' }), 'Sep 30 – Oct 3');
  assert.equal(formatTourLabel({ start: '2027-04-28', end: '2027-05-01' }), 'Apr 28 – May 1');
});

test('groupByMonth groups by start month with "Month YYYY" labels, preserving order', () => {
  const groups = groupByMonth([
    { start: '2026-08-06', end: '2026-08-09' },
    { start: '2026-08-13', end: '2026-08-16' },
    { start: '2026-09-03', end: '2026-09-06' },
  ]);
  assert.deepEqual(groups.map(g => g.label), ['August 2026', 'September 2026']);
  assert.equal(groups[0].tours.length, 2);
  assert.equal(groups[1].tours.length, 1);
});

test('schedule contains the full 2027 season (53 trips)', () => {
  const trips2027 = JOINER_SCHEDULE.filter(t => t.start.startsWith('2027'));
  assert.equal(trips2027.length, 53);
  // spot-checks straight off the poster, including the two odd ones
  const has = (start, end) => trips2027.some(t => t.start === start && t.end === end);
  assert.ok(has('2027-01-02', '2027-01-05'), 'Jan 2-5');
  assert.ok(has('2027-04-28', '2027-05-01'), 'Apr 28 - May 1');
  assert.ok(has('2027-05-27', '2027-05-31'), 'May 27-31 (5-day, poster-confirmed)');
  assert.ok(has('2027-07-29', '2027-08-01'), 'Jul 29 - Aug 1');
  assert.ok(has('2027-09-30', '2027-10-03'), 'Sep 30 - Oct 3');
  assert.ok(has('2027-12-21', '2027-12-24'), 'Dec 21-24 (poster-confirmed)');
  assert.ok(has('2027-12-27', '2027-12-30'), 'Dec 27-30');
});

test('schedule is chronologically sorted', () => {
  const starts = JOINER_SCHEDULE.map(t => t.start);
  assert.deepEqual(starts, [...starts].sort());
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module ... src/joiner-schedule.mjs`.

- [ ] **Step 4: Write the module**

Create `src/joiner-schedule.mjs`. **The 2026 entries are moved verbatim from `src/funnel.js` lines 8–85** (the `JOINER_SCHEDULE` const — copy the existing array contents exactly, keeping their `label` fields; labels are no longer displayed but are harmless). Then append the 2027 entries below.

```js
// Joiner tour schedule + pure helpers for the funnel date dropdown.
// Pure ESM, no imports — unit-tested with `npm test` (node:test).

export const JOINER_SCHEDULE = [
  // ===== 2026 ===== (moved verbatim from funnel.js — all entries from
  // { start: '2026-01-08', ... } through { start: '2026-12-27', ... })
  /* PASTE THE 65 EXISTING 2026 ENTRIES HERE, UNCHANGED */

  // ===== 2027 ===== (transcribed from originals-backup/"tour dates 2027.jfif")
  // January
  { start: '2027-01-02', end: '2027-01-05' },
  { start: '2027-01-07', end: '2027-01-10' },
  { start: '2027-01-14', end: '2027-01-17' },
  { start: '2027-01-21', end: '2027-01-24' },
  { start: '2027-01-28', end: '2027-01-31' },
  // February
  { start: '2027-02-04', end: '2027-02-07' },
  { start: '2027-02-11', end: '2027-02-14' },
  { start: '2027-02-18', end: '2027-02-21' },
  { start: '2027-02-25', end: '2027-02-28' },
  // March
  { start: '2027-03-04', end: '2027-03-07' },
  { start: '2027-03-11', end: '2027-03-14' },
  { start: '2027-03-18', end: '2027-03-21' },
  { start: '2027-03-25', end: '2027-03-28' },
  // April
  { start: '2027-04-01', end: '2027-04-04' },
  { start: '2027-04-08', end: '2027-04-11' },
  { start: '2027-04-15', end: '2027-04-18' },
  { start: '2027-04-22', end: '2027-04-25' },
  { start: '2027-04-28', end: '2027-05-01' },
  // May (27–31 is a 5-day trip, confirmed correct by owner)
  { start: '2027-05-06', end: '2027-05-09' },
  { start: '2027-05-13', end: '2027-05-16' },
  { start: '2027-05-20', end: '2027-05-23' },
  { start: '2027-05-27', end: '2027-05-31' },
  // June
  { start: '2027-06-03', end: '2027-06-06' },
  { start: '2027-06-10', end: '2027-06-13' },
  { start: '2027-06-17', end: '2027-06-20' },
  { start: '2027-06-24', end: '2027-06-27' },
  // July
  { start: '2027-07-01', end: '2027-07-04' },
  { start: '2027-07-08', end: '2027-07-11' },
  { start: '2027-07-15', end: '2027-07-18' },
  { start: '2027-07-22', end: '2027-07-25' },
  { start: '2027-07-29', end: '2027-08-01' },
  // August
  { start: '2027-08-05', end: '2027-08-08' },
  { start: '2027-08-12', end: '2027-08-15' },
  { start: '2027-08-19', end: '2027-08-22' },
  { start: '2027-08-26', end: '2027-08-29' },
  // September
  { start: '2027-09-02', end: '2027-09-05' },
  { start: '2027-09-09', end: '2027-09-12' },
  { start: '2027-09-16', end: '2027-09-19' },
  { start: '2027-09-23', end: '2027-09-26' },
  { start: '2027-09-30', end: '2027-10-03' },
  // October
  { start: '2027-10-07', end: '2027-10-10' },
  { start: '2027-10-14', end: '2027-10-17' },
  { start: '2027-10-21', end: '2027-10-24' },
  { start: '2027-10-28', end: '2027-10-31' },
  // November
  { start: '2027-11-04', end: '2027-11-07' },
  { start: '2027-11-11', end: '2027-11-14' },
  { start: '2027-11-18', end: '2027-11-21' },
  { start: '2027-11-25', end: '2027-11-28' },
  // December (21–24 is off the weekly rhythm, confirmed correct by owner)
  { start: '2027-12-02', end: '2027-12-05' },
  { start: '2027-12-09', end: '2027-12-12' },
  { start: '2027-12-16', end: '2027-12-19' },
  { start: '2027-12-21', end: '2027-12-24' },
  { start: '2027-12-27', end: '2027-12-30' },
];

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function todayISO(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function upcomingTours(schedule, today) {
  return schedule.filter(t => t.start >= today);
}

export function formatTourLabel(tour) {
  const [, sm, sd] = tour.start.split('-').map(Number);
  const [, em, ed] = tour.end.split('-').map(Number);
  const from = `${MONTHS_SHORT[sm - 1]} ${sd}`;
  const to = sm === em ? `${ed}` : `${MONTHS_SHORT[em - 1]} ${ed}`;
  return `${from} – ${to}`;
}

export function groupByMonth(tours) {
  const groups = [];
  for (const tour of tours) {
    const [y, m] = tour.start.split('-').map(Number);
    const label = `${MONTHS_LONG[m - 1]} ${y}`;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.tours.push(tour);
    else groups.push({ label, tours: [tour] });
  }
  return groups;
}
```

**Important:** replace the `/* PASTE ... */` comment with the actual 2026 entries copied from `src/funnel.js` (do not retype them — copy the 65 `{ start: '2026-…' }` lines between the array's `[` on line 8 and its `];` on line 85 exactly, comment lines included). Leave `funnel.js` untouched in this task; Task 3 removes its copy.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all 7 tests PASS. If the chronological-sort test fails, the 2026 block was pasted incorrectly — the 2026 array in funnel.js is already sorted; 2027 entries above are sorted; concatenated they remain sorted.

- [ ] **Step 6: Commit**

```bash
git add package.json src/joiner-schedule.mjs tests/joiner-schedule.test.mjs
git commit -m "Add joiner schedule module: 2027 dates, past-date filter, month grouping"
```

---

### Task 3: Wire the grouped dropdown into the funnel

**Files:**
- Modify: `src/funnel.js` (lines 1–104 region: imports, `JOINER_SCHEDULE`, `populateJoinerDates`)

**Interfaces:**
- Consumes: everything exported by `src/joiner-schedule.mjs` (Task 2).
- Produces: `#tour_date` `<select>` populated with `<optgroup label="August 2026">` groups; option `value` = ISO start date (unchanged contract for GHL submission and `?date=` prefill at `funnel.js` `prefillFromURL`).

- [ ] **Step 1: Replace the schedule constant with an import**

In `src/funnel.js`, delete the entire `JOINER_SCHEDULE` const (the block from `// ============================================================` / `// 1. JOINER DATES (2026 Schedule)` down to the closing `];` — currently lines 5–85) and add to the imports at the top:

```js
import { JOINER_SCHEDULE, todayISO, upcomingTours, formatTourLabel, groupByMonth } from './joiner-schedule.mjs';
```

- [ ] **Step 2: Rewrite populateJoinerDates**

Replace the existing `populateJoinerDates` function (currently lines 90–104) with:

```js
function populateJoinerDates() {
  const select = document.getElementById('tour_date');
  if (!select) return;

  // keep only the disabled "Select departure date" placeholder (first child)
  while (select.children.length > 1) {
    select.lastChild.remove();
  }

  const groups = groupByMonth(upcomingTours(JOINER_SCHEDULE, todayISO()));
  groups.forEach(group => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    group.tours.forEach(tour => {
      const option = document.createElement('option');
      option.value = tour.start;
      option.textContent = formatTourLabel(tour);
      optgroup.appendChild(option);
    });
    select.appendChild(optgroup);
  });
}
```

Do not modify `prefillFromURL` — `select.options` flattens across optgroups, so the `?date=` preselect keeps working, and `select.value = date` works because option values are unchanged.

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`, open `http://localhost:5173/funnel.html?type=joiner`.
Expected:
- Dropdown opens with month headers ("August 2026", "September 2026", … then "January 2027" through "December 2027").
- No 2026 dates before today's date appear (e.g. on 2026-08-06, nothing before "Aug 6 – 9").
- Labels are clean ranges: `Aug 6 – 9`, `Sep 30 – Oct 3`, `Apr 28 – May 1`.
- Open `funnel.html?type=joiner&date=2027-03-04` → dropdown preselects "Mar 4 – 7" under "March 2027".
- Selecting a date and submitting still posts `tour_date=<ISO date>` (check the network request or GHL contact record if convenient; at minimum confirm `document.getElementById('tour_date').value` is e.g. `2027-03-04` in the console).

- [ ] **Step 4: Run tests and build**

Run: `npm test` then `npm run build`
Expected: tests PASS; build succeeds with no import errors.

- [ ] **Step 5: Commit**

```bash
git add src/funnel.js
git commit -m "Funnel: hide past joiner dates, group dropdown by month, add 2027 season"
```

---

### Task 4: Accommodation slideshow machinery (HTML hooks, CSS, JS)

**Files:**
- Modify: `index.html` (the three card image wrappers, currently lines 196, 211, 226)
- Modify: `src/style.css` (append after the `.gold-frame` rules around line 111)
- Modify: `src/main.js` (append new section at the end)

**Interfaces:**
- Consumes: `data-slides-key` attributes on the card image wrappers.
- Produces: `ROOM_SLIDES` manifest in `src/main.js` — `{ canopy: string[], kubo: string[], villa: string[] }`, filenames relative to `/gallery/rooms/`. Task 5 fills these arrays. Empty array = card stays a static image (current behavior preserved).

- [ ] **Step 1: Add data attributes and positioning to the three wrappers in `index.html`**

Card 1 (Canopy Tent), change:

```html
<div class="zoom-wrap gold-frame rounded-t-2xl h-64">
```

to:

```html
<div class="zoom-wrap gold-frame rounded-t-2xl h-64 relative" data-slides-key="canopy">
```

Card 2 (Kubo by the Shore): same change with `data-slides-key="kubo"`.
Card 3 (Malaya Villa): same change with `data-slides-key="villa"`.
(Only the wrapper `<div>` opening tags change; the `<img>` tags inside are untouched in this task.)

- [ ] **Step 2: Add slideshow CSS**

In `src/style.css`, after the `.lift:hover .gold-frame` rule, add:

```css
/* Accommodation card slideshow (extra slides stacked over the cover image) */
.room-slide {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity .6s ease;
  pointer-events: none;
}
.room-slide.show { opacity: 1; }
```

- [ ] **Step 3: Add the slideshow module to `src/main.js`**

Append at the end of `src/main.js`:

```js
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
```

- [ ] **Step 4: Verify the machinery with temporary slides (then revert)**

Run: `npm run dev`, open `http://localhost:5173/`.

1. With empty arrays: cards look and behave exactly as before (zoom-on-hover intact, no console errors).
2. **Temporarily** set `canopy: ['../beachside.jpg', '../night_stay.jpg']` (these existing gallery files resolve via `/gallery/rooms/../beachside.jpg` → `/gallery/beachside.jpg`). Reload:
   - Desktop: hover the Canopy Tent card → crossfades cover → beachside → night_stay → cover, ~2s each; mouse-out resets to cover.
   - Mobile: in DevTools, toggle device emulation (e.g. iPhone), reload; scroll the card into view → slideshow cycles by itself; scroll away → it stops.
3. **Revert the manifest to `canopy: []`** before committing.

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add index.html src/style.css src/main.js
git commit -m "Add accommodation card slideshow machinery (hover crossfade, mobile auto-play)"
```

Verify with `git diff --cached` before committing that `ROOM_SLIDES` arrays are empty.

---

### Task 5: Wire the real accommodation photos (BLOCKED on owner renaming)

**Precondition — do not start until:** the owner has renamed the WebP files in `photos-to-rename/` (project root) to `canopy-1.webp`, `canopy-2.webp`, …, `kubo-1.webp`, …, `villa-1.webp`, … (`-1` = cover photo per room). If files named `img-50xx.webp` still dominate that folder, stop and ask the owner. Leftover un-renamed files (photos the owner chose not to use) are simply not copied.

**Files:**
- Create: `public/gallery/rooms/` (copied from `photos-to-rename/`)
- Modify: `src/main.js` (`ROOM_SLIDES` arrays from Task 4)
- Modify: `index.html` (the three cover `<img>` tags, currently lines 196, 211, 226)

**Interfaces:**
- Consumes: renamed WebPs in `photos-to-rename/`; `ROOM_SLIDES` manifest (Task 4).
- Produces: live slideshows with real photos; new cover images.

- [ ] **Step 1: Copy the renamed photos into the site**

PowerShell:

```powershell
New-Item -ItemType Directory -Force public/gallery/rooms
Copy-Item photos-to-rename/canopy-*.webp, photos-to-rename/kubo-*.webp, photos-to-rename/villa-*.webp public/gallery/rooms/
```

Then list what arrived:

Run (PowerShell): `ls public/gallery/rooms`
Expected: only `canopy-N.webp`, `kubo-N.webp`, `villa-N.webp` files — no `img-*.webp`.

- [ ] **Step 2: Confirm every room has a cover**

Verify `canopy-1.webp`, `kubo-1.webp`, and `villa-1.webp` all exist in `public/gallery/rooms/`. If any is missing, stop and ask the owner which photo is that room's cover.

- [ ] **Step 3: Fill the manifest**

In `src/main.js`, set each `ROOM_SLIDES` array to that room's files **excluding** `-1` (the cover), in numeric order, e.g. if canopy has 4 photos:

```js
const ROOM_SLIDES = {
  canopy: ['canopy-2.webp', 'canopy-3.webp', 'canopy-4.webp'],
  kubo: ['kubo-2.webp', 'kubo-3.webp'],
  villa: ['villa-2.webp', 'villa-3.webp', 'villa-4.webp', 'villa-5.webp'],
};
```

(Adjust counts to the actual files from Step 1.)

- [ ] **Step 4: Swap the cover images in `index.html`**

Get real dimensions first:

```bash
node -e "import('sharp').then(async ({default: sharp}) => { for (const f of ['canopy-1.webp','kubo-1.webp','villa-1.webp']) { const m = await sharp('public/gallery/rooms/' + f).metadata(); console.log(f, m.width, m.height); } })"
```

Then update each cover `<img>` — keep `class`, `loading`, `decoding` as-is; change `src`, `width`, `height` (from the command above), and keep each `alt` descriptive. Card 1 example:

```html
<img src="/gallery/rooms/canopy-1.webp" width="1200" height="900" loading="lazy" decoding="async" alt="Elevated jungle canopy tent nestled among tropical trees" class="zoom-img w-full h-full object-cover" />
```

Card 2: `src="/gallery/rooms/kubo-1.webp"`, alt `"Beachfront native kubo hut with a thatched roof at the shoreline"`.
Card 3: `src="/gallery/rooms/villa-1.webp"`, alt `"Private Malaya beach villa with an open deck facing the ocean"`.
(Use the real width/height per file — do not assume 1200×900.)

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`, open `http://localhost:5173/`.
Expected:
- Each card shows its new cover photo.
- Desktop hover: cycles through all of that room's photos, resets on mouse-out.
- DevTools mobile emulation: auto-plays in view, stops out of view.
- Network tab: non-cover slides only load lazily.

- [ ] **Step 6: Build and commit**

Run: `npm run build` — expected: succeeds.

```bash
git add index.html src/main.js public/gallery/rooms
git commit -m "Accommodation cards: real photo slideshows for Canopy Tent, Kubo, Villa"
```

---

## Out of scope (do not build)

- Itinerary section (will use `public/gallery/boats/`) — future project.
- Sicsican Island camp section (will use `public/gallery/cr/`) — future project.
- No changes to GHL API routes (`api/`), reviews, chat widget, or flatpickr private-stay pickers.
