import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, 'icon-source.svg');
const outDir = path.join(__dirname, '..', 'public', 'icons');

const sizes = [192, 512];

for (const size of sizes) {
  await sharp(src, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, `icon-${size}.png`));
  console.log(`wrote icon-${size}.png`);
}

// maskable: same art, sharp already has ~30% padding built into the source
// (icon occupies the inner region within a 512 canvas with a filled bg),
// good enough for a spike test.
await sharp(src, { density: 384 })
  .resize(512, 512)
  .png()
  .toFile(path.join(outDir, 'icon-512-maskable.png'));
console.log('wrote icon-512-maskable.png');
