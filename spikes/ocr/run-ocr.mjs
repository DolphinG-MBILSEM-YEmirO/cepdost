import { createWorker } from 'tesseract.js';
import path from 'node:path';

const outDir = path.join(import.meta.dirname, 'out');
const images = ['instagram.png', 'tiktok.png', 'notes.png'];

const worker = await createWorker('tur');

for (const img of images) {
  const { data } = await worker.recognize(path.join(outDir, img));
  console.log('\n========', img, '========');
  console.log('--- confidence:', data.confidence);
  console.log('--- text ---');
  console.log(data.text);
}

await worker.terminate();
