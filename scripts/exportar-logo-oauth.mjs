#!/usr/bin/env node
/** Regenera el PNG de 120 × 120 px que se sube a Google Auth Platform → Branding. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = path.join(raiz, 'public', 'brand', 'vendemia-oauth.svg');
const png = path.join(raiz, 'public', 'brand', 'vendemia-oauth-120.png');

await sharp(await readFile(svg))
  .resize(120, 120)
  .png({ compressionLevel: 9 })
  .toFile(png);

console.log(png);
