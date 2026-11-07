import { TUR, metinAl, motor, nesneMi, simdiMs } from './cekirdek'
import { etiketListesiAl, yereldekiAni, type Ani } from './gruplar'

// Two private lists of posts, kept on my own channel ('ben') so my other
// devices have them too and nobody else sees them:
//
//   kaydedilen    'kaydedilen:<aniId>'    a post I saved to look at again
//   gitmek-listesi 'gitmek-listesi:<aniId>' a post whose place I want to go
//                                         to ("Gitmek istediklerim")
//
// Each keeps a copy of the post as I saw it, so a Keşfet post (which this
// device doesn't keep) still shows. Posts on channels I follow are read
// again when the list opens, so edits show and deleted or archived ones
// are marked as gone.

export type KayitListesi = 'kaydedilen' | 'gitmek-listesi'

export interface KayitliPaylasim {
  ani: Ani
  // When I added it (ms).
  zaman: number
  // The sharer deleted or archived it.
  kaldirildi: boolean
}

const turu = (liste: KayitListesi) => (liste === 'kaydedilen' ? TUR.kaydedilen : TUR.gitmekListesi)
const anahtari = (liste: KayitListesi, aniId: string) => `${liste}:${aniId}`

// Reads a stored copy back, keeping only what a post can hold.
function kopyadanAni(deger: unknown): Ani | null {
  if (!nesneMi(deger)) return null
  const id = metinAl(deger.id, 40)
  const sahip = metinAl(deger.sahip_id, 64)
  const konu = metinAl(deger.konu, 200)
  const mekan = metinAl(deger.mekan_adi, 120)
  const tarih = metinAl(deger.tarih, 10)
  if (!id || !sahip || !konu || !mekan || !tarih) return null
  const ani = deger as unknown as Ani
  return {
    ...ani,
    id,
    sahip_id: sahip,
    konu,
    mekan_adi: mekan,
    tarih,
    medya: Array.isArray(ani.medya) ? ani.medya : [],
    etiketler: etiketListesiAl(ani.etiketler, sahip),
    yorumlar_kapali: ani.yorumlar_kapali === true,
    arsivde: false,
  }
}

// The ids in one of my lists, for marking posts in the feed.
export async function kayitliIdler(liste: KayitListesi): Promise<Set<string>> {
  const m = motor()
  const onEk = `${liste}:`
  const kayitlar = await m.kayitlar((await m.ben()).konu, turu(liste))
  return new Set(kayitlar.filter((k) => k.anahtar.startsWith(onEk)).map((k) => k.anahtar.slice(onEk.length)))
}

// Puts a post in one of my lists, or takes it out.
export async function listeyeKoy(liste: KayitListesi, ani: Ani, koy: boolean): Promise<void> {
  const m = motor()
  await m.yayinla(
    await m.ben(),
    turu(liste),
    anahtari(liste, ani.id),
    koy ? { ani, zaman: simdiMs() } : null,
  )
}

// One of my lists, the newest addition first.
export async function kayitliPaylasimlar(liste: KayitListesi): Promise<KayitliPaylasim[]> {
  const m = motor()
  const onEk = `${liste}:`
  const kayitlar = await m.kayitlar((await m.ben()).konu, turu(liste))
  const sonuc: KayitliPaylasim[] = []
  for (const k of kayitlar) {
    if (!k.anahtar.startsWith(onEk) || !nesneMi(k.veri)) continue
    const kopya = kopyadanAni(k.veri.ani)
    if (!kopya) continue
    const guncel = await yereldekiAni(kopya.konu, kopya.sahip_id, kopya.id).catch(() => undefined)
    sonuc.push({
      ani: guncel ?? kopya,
      zaman: typeof k.veri.zaman === 'number' ? k.veri.zaman : 0,
      kaldirildi: guncel === null,
    })
  }
  return sonuc.sort((a, b) => b.zaman - a.zaman)
}
