import { motor, TUR } from './cekirdek'
import { baytiParcala, parcalariBirlestir } from './nostr/motor'
import type { Kanal } from './nostr/kanal'

// Photos are shrunk on the device and stored inside records: a profile
// photo inline as a small data URL, memory photos as a few chunks on the
// channel's photo topic (fetched only when the photo is actually shown).

const AVATAR_KENAR = 128
const FOTO_KENAR = 800
// Keeps a memory photo to a handful of records.
const FOTO_AZAMI_BAYT = 120_000
// Characters of base64 per record; with encryption overhead each record
// stays well under the relays' size limits.
const PARCA_BOYU = 30_000

export interface FotoBilgisi {
  parca: number
  tip: string
}

async function tuvaleCiz(dosya: Blob, azamiKenar: number, kare: boolean): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(dosya)
  // Square avatars are centre-cropped; photos keep their shape.
  const kenar = Math.min(bitmap.width, bitmap.height)
  const kaynak = kare
    ? { x: (bitmap.width - kenar) / 2, y: (bitmap.height - kenar) / 2, en: kenar, boy: kenar }
    : { x: 0, y: 0, en: bitmap.width, boy: bitmap.height }
  const olcek = Math.min(1, azamiKenar / Math.max(kaynak.en, kaynak.boy))
  const tuval = document.createElement('canvas')
  tuval.width = Math.max(1, Math.round(kaynak.en * olcek))
  tuval.height = Math.max(1, Math.round(kaynak.boy * olcek))
  const ctx = tuval.getContext('2d')
  if (!ctx) throw new Error('Görsel işlenemedi')
  ctx.drawImage(bitmap, kaynak.x, kaynak.y, kaynak.en, kaynak.boy, 0, 0, tuval.width, tuval.height)
  bitmap.close()
  return tuval
}

function jpeg(tuval: HTMLCanvasElement, kalite: number): Promise<Blob> {
  return new Promise((coz, red) =>
    tuval.toBlob((b) => (b ? coz(b) : red(new Error('Görsel işlenemedi'))), 'image/jpeg', kalite),
  )
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((coz, red) => {
    const okuyucu = new FileReader()
    okuyucu.onload = () => coz(String(okuyucu.result))
    okuyucu.onerror = () => red(new Error('Görsel okunamadı'))
    okuyucu.readAsDataURL(blob)
  })
}

// Avatars show at 44px at most; 128px JPEG is a few KB.
export async function avatarHazirla(dosya: Blob): Promise<string> {
  return dataUrl(await jpeg(await tuvaleCiz(dosya, AVATAR_KENAR, true), 0.85))
}

export async function fotoHazirla(dosya: Blob): Promise<Uint8Array> {
  const tuval = await tuvaleCiz(dosya, FOTO_KENAR, false)
  let blob = await jpeg(tuval, 0.8)
  for (const kalite of [0.65, 0.5, 0.4]) {
    if (blob.size <= FOTO_AZAMI_BAYT) break
    blob = await jpeg(tuval, kalite)
  }
  return new Uint8Array(await blob.arrayBuffer())
}

const parcaAnahtari = (aniId: string, i: number) => `foto:${aniId}:${i}`

export async function fotoYayinla(kanal: Kanal, aniId: string, bayt: Uint8Array): Promise<FotoBilgisi> {
  const parcalar = baytiParcala(bayt, PARCA_BOYU)
  const m = motor()
  await Promise.all(
    parcalar.map((p, i) => m.yayinla(kanal, TUR.foto, parcaAnahtari(aniId, i), p, { konu: kanal.fotoKonu })),
  )
  return { parca: parcalar.length, tip: 'image/jpeg' }
}

export async function fotoSil(kanal: Kanal, aniId: string, bilgi: FotoBilgisi): Promise<void> {
  const m = motor()
  await Promise.all(
    Array.from({ length: bilgi.parca }, (_, i) =>
      m.yayinla(kanal, TUR.foto, parcaAnahtari(aniId, i), null, { konu: kanal.fotoKonu }),
    ),
  )
}

const urlOnbellegi = new Map<string, Promise<string | null>>()

// Object URL of a memory photo: from the local store when its chunks are
// there, otherwise fetched from the relays once.
export function fotoUrl(kanal: Kanal, yazar: string, aniId: string, bilgi: FotoBilgisi): Promise<string | null> {
  const anahtar = `${kanal.fotoKonu}:${yazar}:${aniId}`
  let url = urlOnbellegi.get(anahtar)
  if (!url) {
    url = fotoBirlestir(kanal, yazar, aniId, bilgi)
    urlOnbellegi.set(anahtar, url)
    // A failed fetch may succeed later (back online); don't cache it.
    url.then((u) => u ?? urlOnbellegi.delete(anahtar)).catch(() => urlOnbellegi.delete(anahtar))
  }
  return url
}

async function fotoBirlestir(kanal: Kanal, yazar: string, aniId: string, bilgi: FotoBilgisi): Promise<string | null> {
  const m = motor()
  const anahtarlar = Array.from({ length: Math.min(bilgi.parca, 20) }, (_, i) => parcaAnahtari(aniId, i))
  const oku = () => Promise.all(anahtarlar.map((a) => m.kayit(kanal, yazar, a)))
  let parcalar = await oku()
  if (parcalar.some((p) => !p || typeof p.veri !== 'string')) {
    await m.kayitlariGetir(kanal, yazar, anahtarlar, kanal.fotoKonu)
    parcalar = await oku()
  }
  if (parcalar.some((p) => !p || typeof p.veri !== 'string')) return null
  const bayt = parcalariBirlestir(parcalar.map((p) => p!.veri as string))
  return URL.createObjectURL(new Blob([bayt.slice().buffer as ArrayBuffer], { type: bilgi.tip }))
}

export function fotoBilgisiAl(deger: unknown): FotoBilgisi | null {
  if (typeof deger !== 'object' || deger === null) return null
  const { parca, tip } = deger as Record<string, unknown>
  if (typeof parca !== 'number' || !Number.isInteger(parca) || parca < 1 || parca > 20) return null
  return { parca, tip: tip === 'image/png' || tip === 'image/webp' ? tip : 'image/jpeg' }
}
