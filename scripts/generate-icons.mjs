// Renders the app icons from the SVG sources in this folder:
//   public/icons/icon-192.png, icon-512.png   rounded icon (browser, PWA)
//   public/icons/icon-512-maskable.png        full bleed, art in the safe zone
//   store_icon.png                            Play Store listing (full bleed)
//
//   node scripts/generate-icons.mjs
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const klasor = path.dirname(fileURLToPath(import.meta.url))
const kok = path.join(klasor, '..')
const yuvarlak = path.join(klasor, 'icon-source.svg')
const tamKaplayan = path.join(klasor, 'icon-maskable.svg')

const ciktilar = [
  { kaynak: yuvarlak, boyut: 192, hedef: 'public/icons/icon-192.png' },
  { kaynak: yuvarlak, boyut: 512, hedef: 'public/icons/icon-512.png' },
  { kaynak: tamKaplayan, boyut: 512, hedef: 'public/icons/icon-512-maskable.png' },
  { kaynak: tamKaplayan, boyut: 512, hedef: 'store_icon.png' },
]

for (const { kaynak, boyut, hedef } of ciktilar) {
  await sharp(kaynak, { density: 384 }).resize(boyut, boyut).png().toFile(path.join(kok, hedef))
  console.log(`wrote ${hedef}`)
}
