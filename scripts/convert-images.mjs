// One-off image optimizer for Kamp Malaya.
// Converts the oversized photographic PNGs to WebP (full-res + a 768w variant
// for responsive srcset) and moves the heavy originals out of public/ so they
// are not shipped in the build. Run: node scripts/convert-images.mjs
import sharp from 'sharp';
import { mkdir, rename, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const GALLERY = path.resolve('public/gallery');
const BACKUP = path.resolve('originals-backup/gallery'); // outside public/, not deployed

// Photographic PNGs that should never have been PNG.
const PNGS = [
  'panorama.png', 'coralreef.png', 'fireflylagoon.png',
  'reefsanctuary.png', 'seasidefeast.png', 'villagevisit.png',
];

const QUALITY = 80;
const RESPONSIVE_WIDTH = 768; // mobile/tablet variant; sources are ~1376w

await mkdir(BACKUP, { recursive: true });

let savedBytes = 0;
for (const file of PNGS) {
  const src = path.join(GALLERY, file);
  if (!existsSync(src)) { console.warn(`skip (missing): ${file}`); continue; }

  const base = path.basename(file, '.png');
  const before = (await stat(src)).size;

  // Full-resolution WebP
  await sharp(src).webp({ quality: QUALITY }).toFile(path.join(GALLERY, `${base}.webp`));
  // 768w responsive WebP
  await sharp(src).resize({ width: RESPONSIVE_WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY }).toFile(path.join(GALLERY, `${base}-768.webp`));

  const after = (await stat(path.join(GALLERY, `${base}.webp`))).size;
  savedBytes += before - after;
  console.log(`${file}: ${(before/1024).toFixed(0)}KB -> ${base}.webp ${(after/1024).toFixed(0)}KB`);

  // Move heavy original out of public/ (kept as backup, not deployed)
  await rename(src, path.join(BACKUP, file));
}

console.log(`\nDone. Approx saved on full-res set: ${(savedBytes/1024/1024).toFixed(2)} MB`);
console.log('Originals backed up to originals-backup/gallery/ (excluded from build).');
