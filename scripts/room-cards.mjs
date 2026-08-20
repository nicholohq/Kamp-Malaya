// Regenerates the step-4 card images from the room gallery.
//
// The crop is an explicit band, not sharp's `attention` heuristic: the Kubo and
// Villa shots are 1200x1600 portraits where the top ~40% is palm frond and sky,
// and attention reliably chose the foliage over the building. Villa came out as
// fronds with the roofline just entering at the bottom edge.
//
// A 3:2 card from a 1200-wide source needs a 1200x800 band; `top` picks which.
// Run with: node scripts/room-cards.mjs
import sharp from 'sharp';

const SRC = 'public/gallery/rooms';
const OUT = `${SRC}/cards`;

const CARDS = [
  // canopy-1 is 1200x900 landscape, so there are only 100px of vertical slack.
  { from: 'canopy-1.webp', to: 'canopy.webp', top: 50 },
  // Full A-frame: apex through door, windows, deck and railing.
  { from: 'kubo-1.webp', to: 'kubo.webp', top: 300 },
  // Clears the frond canopy and lands on the facade.
  { from: 'villa-1.webp', to: 'villa.webp', top: 600 },
];

for (const { from, to, top } of CARDS) {
  const meta = await sharp(`${SRC}/${from}`).metadata();
  const band = Math.round(meta.width / 1.5);
  const safeTop = Math.max(0, Math.min(top, meta.height - band));
  const info = await sharp(`${SRC}/${from}`)
    .extract({ left: 0, top: safeTop, width: meta.width, height: band })
    .resize(640, 427)
    .webp({ quality: 78 })
    .toFile(`${OUT}/${to}`);
  console.log(`${from} -> ${to}  band y${safeTop}-${safeTop + band}  ${info.width}x${info.height} ${(info.size / 1024).toFixed(0)}KB`);
}
