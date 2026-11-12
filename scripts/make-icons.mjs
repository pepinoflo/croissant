#!/usr/bin/env node
// Draws the app icon, favicon and iOS launch images from one SVG croissant.
// Run with `npm run icons` after changing the logo; the results are committed.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { splashEntries } from './splash-devices.mjs';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const NAVY = '#232B45';
const CREAM = '#F6EEDF';

/** The croissant, drawn in a 96×96 box. */
const croissant = `
  <path d="M9 68C4 40 24 14 48 14s44 26 39 54c-7-13-20-22-39-22S16 55 9 68z"
        fill="#F0B04A" stroke="#9A5A16" stroke-width="4" stroke-linejoin="round"/>
  <path d="M37 15.5c-2 10-1 21 2 31M59 15.5c2 10 1 21-2 31M20 30c3 8 7 15 11 21M76 30c-3 8-7 15-11 21"
        fill="none" stroke="#9A5A16" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M28 27c5-4 11-6 17-6.5" fill="none" stroke="#FBD98F" stroke-width="3" stroke-linecap="round"/>`;

/** A square or rectangular canvas with the croissant centred at `scale` of the short side. */
function canvas(width, height, background, scale) {
  const size = Math.min(width, height) * scale;
  const x = (width - size) / 2;
  // The drawing sits slightly high in its box; nudge it to look centred.
  const y = (height - size) / 2 + size * 0.03;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="${background}"/>
    <g transform="translate(${x} ${y}) scale(${size / 96})">${croissant}</g>
  </svg>`;
}

async function png(file, svg) {
  const out = join(PUBLIC, file);
  mkdirSync(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, colours: 64 }).toFile(out);
  return file;
}

writeFileSync(
  join(PUBLIC, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">${croissant}\n</svg>\n`,
);

const made = await Promise.all([
  png('icons/icon-192.png', canvas(192, 192, NAVY, 0.72)),
  png('icons/icon-512.png', canvas(512, 512, NAVY, 0.72)),
  // Maskable icons may be cropped to a circle: keep the drawing inside the safe zone.
  png('icons/icon-maskable-512.png', canvas(512, 512, NAVY, 0.56)),
  // iOS rounds the corners itself and wants no transparency.
  png('icons/apple-touch-icon.png', canvas(180, 180, NAVY, 0.72)),
  ...splashEntries().map((s) => png(s.file, canvas(s.width, s.height, CREAM, 0.26))),
]);
console.log(`${made.length} images written to public/.`);
