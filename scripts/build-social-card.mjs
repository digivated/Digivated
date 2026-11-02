// Generates the 1200 x 630 PNG consumed by Open Graph / X cards before Astro copies public assets.
// Keep the SVG as an editable source; changing it does not affect website UI components.
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile(new URL('../public/digivated-social-card.svg', import.meta.url));
await sharp(svg, { density: 96 })
  .resize(1200, 630)
  .png({ compressionLevel: 9, palette: false })
  .toFile(new URL('../public/digivated-social-card.png', import.meta.url).pathname);
console.log('Built Digivated X / Open Graph image (1200 x 630).');
