import { TUR, kanalDurumu, metinAl, motor, nesneMi, sayiAl, simdiMs } from './cekirdek'
import { rastgeleId } from './nostr/kodlama'
import type { Kanal } from './nostr/kanal'
import type { SosyalKayit } from './nostr/motor'

// A group plan's shared "who brings what" list, kept on the group's
// channel next to the plan.
//
// Every record has one author, so the list is built from small records:
//   getir:<planId>:<itemId>   an item, written by whoever added it (only
//                              they can take it off: { silindi: true })
//   ustlen:<planId>:<itemId>  "I'll bring it", written by each person who
//                              says so ({ ustlendi: false } takes it back)
// Several people can bring the same thing (two bags of ice is fine).

export interface GetirMaddesi {
  id: string
  metin: string
  ekleyen: string
  // People bringing it, in the order they said so.
  getirenler: string[]
  zaman: number
}

export const GETIR_METIN_AZAMI = 80
// Items read per plan; the rest are ignored, so a flood can't drown the
// page.
export const GETIR_LISTE_AZAMI = 40

async function planKanali(planId: string): Promise<Kanal> {
  await kanalDurumu()
  const m = motor()
  const [plan] = (await m.anahtarIle([`plan:${planId}`])).filter((k) => k.tur === TUR.plan)
  const kanal = plan ? m.kanal(plan.konu) : undefined
  if (!kanal) throw new Error('Plan bulunamadı.')
  return kanal
}

// Order by the moment written into the record (milliseconds); the event's
// own time only has seconds, too coarse for two quick taps.
function siraZamani(k: SosyalKayit): number {
  return (nesneMi(k.veri) ? sayiAl(k.veri.zaman) : null) ?? k.zaman * 1000
}

const eskidenYeniye = (a: SosyalKayit, b: SosyalKayit) => siraZamani(a) - siraZamani(b)

function maddeIdsi(k: SosyalKayit, onek: string): string | null {
  if (!k.anahtar.startsWith(onek)) return null
  const id = k.anahtar.slice(onek.length)
  return id && id.length <= 40 && !id.includes(':') ? id : null
}

export async function getirListesi(planId: string): Promise<GetirMaddesi[]> {
  const kanal = await planKanali(planId)
  const m = motor()
  const [maddeKayitlari, ustlenmeler] = await Promise.all([
    m.kayitlar(kanal.konu, TUR.getir),
    m.kayitlar(kanal.konu, TUR.ustlen),
  ])

  const maddeler = new Map<string, GetirMaddesi>()
  for (const k of maddeKayitlari.sort(eskidenYeniye)) {
    const id = maddeIdsi(k, `getir:${planId}:`)
    if (!id || !nesneMi(k.veri) || k.veri.silindi === true) continue
    const metin = metinAl(k.veri.metin, GETIR_METIN_AZAMI)?.trim()
    if (!metin || maddeler.has(id)) continue
    maddeler.set(id, { id, metin, ekleyen: k.yazar, getirenler: [], zaman: siraZamani(k) })
    if (maddeler.size === GETIR_LISTE_AZAMI) break
  }

  for (const k of ustlenmeler.sort(eskidenYeniye)) {
    const id = maddeIdsi(k, `ustlen:${planId}:`)
    const madde = id ? maddeler.get(id) : undefined
    if (madde && nesneMi(k.veri) && k.veri.ustlendi === true) madde.getirenler.push(k.yazar)
  }
  return [...maddeler.values()]
}

export async function getirEkle(planId: string, metin: string): Promise<string> {
  const temiz = metin.trim().slice(0, GETIR_METIN_AZAMI)
  if (!temiz) throw new Error('Ne getirilecek, yaz.')
  const kanal = await planKanali(planId)
  const id = rastgeleId(8)
  await motor().yayinla(kanal, TUR.getir, `getir:${planId}:${id}`, { metin: temiz, zaman: simdiMs() })
  return id
}

// Only the one who added an item can take it off; the record is theirs.
export async function getirSil(planId: string, maddeId: string): Promise<void> {
  const kanal = await planKanali(planId)
  await motor().yayinla(kanal, TUR.getir, `getir:${planId}:${maddeId}`, { silindi: true, zaman: simdiMs() })
}

export async function getiriUstlen(planId: string, maddeId: string, ustlen: boolean): Promise<void> {
  const kanal = await planKanali(planId)
  await motor().yayinla(kanal, TUR.ustlen, `ustlen:${planId}:${maddeId}`, { ustlendi: ustlen, zaman: simdiMs() })
}
