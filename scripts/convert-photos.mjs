// Converts photo originals (HEIC/JFIF/JPG/PNG) to optimized WebP for the site.
// Accommodations go to photos-to-rename/ (owner renames them to canopy-N.webp /
// kubo-N.webp / villa-N.webp while viewing, then they get moved to
// public/gallery/rooms/). Boats and CR need no renaming and go straight to
// public/gallery/. Idempotent: skips outputs newer than their source.
// Run: npm run photos
import { readdir, mkdir, stat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import heicConvert from 'heic-convert';

const JOBS = [
  { src: 'originals-backup/Accommodations', out: 'photos-to-rename' },
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
    const rawExt = path.extname(f); // may be uppercase (.HEIC) — strip with original casing
    const ext = rawExt.toLowerCase();
    if (!EXTS.has(ext)) continue;
    const srcPath = path.join(job.src, f);
    const outPath = path.join(job.out, slugify(path.basename(f, rawExt)) + '.webp');
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
