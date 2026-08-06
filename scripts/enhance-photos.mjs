// Batch photo enhancement: adaptive brightness (dim photos get a bigger lift),
// gentle contrast, saturation, and mild sharpening. Edits WebP files IN PLACE —
// back up the folder first if you might want the originals.
// Usage: node scripts/enhance-photos.mjs [folder]   (default: photos-to-rename)
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const folder = process.argv[2] || 'photos-to-rename';
const SATURATION = 1.10;
const CONTRAST = 1.07; // linear slope around mid-gray
const SHARPEN_SIGMA = 0.8;

function brightnessFor(luma) {
  if (luma < 118) return 1.10;
  if (luma < 128) return 1.06;
  if (luma < 140) return 1.03;
  return 1.0;
}

const files = (await readdir(folder)).filter(f => f.toLowerCase().endsWith('.webp')).sort();
if (files.length === 0) {
  console.log(`no .webp files in ${folder}`);
  process.exit(0);
}

for (const f of files) {
  const p = path.join(folder, f);
  const buf = await readFile(p);
  const s = await sharp(buf).stats();
  const luma = s.channels.slice(0, 3).reduce(
    (a, c, i) => a + c.mean * [0.2126, 0.7152, 0.0722][i], 0);
  const brightness = brightnessFor(luma);
  const out = await sharp(buf)
    .modulate({ brightness, saturation: SATURATION })
    .linear(CONTRAST, -(128 * (CONTRAST - 1)))
    .sharpen({ sigma: SHARPEN_SIGMA })
    .webp({ quality: 82 })
    .toBuffer();
  await writeFile(p, out);
  console.log(`${f.padEnd(16)} luma ${luma.toFixed(0).padStart(3)} -> brightness x${brightness}`);
}
console.log(`done: ${files.length} enhanced in ${folder}`);
