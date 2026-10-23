import { goruntulemeBasligi, type Kategori, type Kayit } from '../db'
import { CATEGORIES, parseLocalDate } from './format'
import { gunEkle, gunFarki } from './takvimIzgarasi'

// Numbers about my plans for the profile pages: this month against the last,
// weeks in a row with a plan, who I make plans with and where, and what a
// friend and I have done together. Worked out on the device from my own
// plans, which never leave it.

export interface EnCokKisi {
  tur: 'arkadas' | 'grup'
  id: string
  ad: string
  sayi: number
}

export interface EnCokYer {
  ad: string
  sayi: number
}

export interface PlanOzeti {
  buAy: number
  buAyYapilan: number
  gecenAy: number
  // Weeks in a row with at least one plan, up to this week. A week without
  // plans yet doesn't break the run until it's over.
  seri: number
  // This month's plans by category, the biggest first.
  kategoriler: { kategori: Kategori; sayi: number }[]
  kisiler: EnCokKisi[]
  yerler: EnCokYer[]
}

const ILK_UC = 3

// The Monday of the week a day is in.
export function haftaBasi(tarih: string): string {
  return gunEkle(tarih, -((parseLocalDate(tarih).getDay() + 6) % 7))
}

// The same place written a little differently counts once: spacing and
// case don't matter, and it shows the way it was written most (on a tie,
// the one with more capitals, as names are usually written).
export function yerAnahtari(konum: string): string {
  return konum.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR')
}

function buyukHarfler(metin: string): number {
  return [...metin].filter((h) => h !== h.toLocaleLowerCase('tr-TR')).length
}

function enCokYerler(kayitlar: Kayit[], adet = ILK_UC): EnCokYer[] {
  return yerleriSay(kayitlar.map((k) => k.konum), adet)
}

// The places named most, each however it was written most.
export function yerleriSay(yerler: (string | null | undefined)[], adet = ILK_UC): EnCokYer[] {
  const sayac = new Map<string, { sayi: number; yazimlar: Map<string, number> }>()
  for (const yer of yerler) {
    const yazim = yer?.trim().replace(/\s+/g, ' ')
    if (!yazim) continue
    const kayit = sayac.get(yerAnahtari(yazim)) ?? { sayi: 0, yazimlar: new Map() }
    kayit.sayi++
    kayit.yazimlar.set(yazim, (kayit.yazimlar.get(yazim) ?? 0) + 1)
    sayac.set(yerAnahtari(yazim), kayit)
  }
  return [...sayac.values()]
    .map(({ sayi, yazimlar }) => ({ ad: [...yazimlar].sort((a, b) => b[1] - a[1] || buyukHarfler(b[0]) - buyukHarfler(a[0]))[0][0], sayi }))
    .sort((a, b) => b.sayi - a.sayi || a.ad.localeCompare(b.ad, 'tr'))
    .slice(0, adet)
}

export function planOzeti(kayitlar: Kayit[], bugun: string): PlanOzeti {
  const buAyOnek = bugun.slice(0, 7)
  const gecenAyOnek = gunEkle(`${buAyOnek}-01`, -1).slice(0, 7)
  const tarihli = kayitlar.filter((k): k is Kayit & { tarih: string } => !!k.tarih)
  const buAy = tarihli.filter((k) => k.tarih.startsWith(buAyOnek))

  const kategoriSayilari = new Map<Kategori, number>()
  for (const k of buAy) kategoriSayilari.set(k.kategori ?? 'not', (kategoriSayilari.get(k.kategori ?? 'not') ?? 0) + 1)

  // Weeks with a plan, counted back from this one (or last week, while this
  // one has none yet).
  const haftalar = new Set(tarihli.filter((k) => k.tarih <= gunEkle(haftaBasi(bugun), 6)).map((k) => haftaBasi(k.tarih)))
  let hafta = haftaBasi(bugun)
  if (!haftalar.has(hafta)) hafta = gunEkle(hafta, -7)
  let seri = 0
  while (haftalar.has(hafta)) {
    seri++
    hafta = gunEkle(hafta, -7)
  }

  // Friends and groups, newest name first in case it changed.
  const kisiler = new Map<string, EnCokKisi & { son: string }>()
  for (const k of [...kayitlar].sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''))) {
    const kim = k.grupId
      ? { tur: 'grup' as const, id: k.grupId, ad: k.grupAdi ?? 'Grup' }
      : k.arkadasId
        ? { tur: 'arkadas' as const, id: k.arkadasId, ad: k.arkadasAdi ?? 'Arkadaşın' }
        : null
    if (!kim) continue
    const anahtar = `${kim.tur}:${kim.id}`
    const mevcut = kisiler.get(anahtar)
    if (mevcut) mevcut.sayi++
    else kisiler.set(anahtar, { ...kim, sayi: 1, son: k.tarih ?? '' })
  }

  return {
    buAy: buAy.length,
    buAyYapilan: buAy.filter((k) => k.durum === 'yapildi').length,
    gecenAy: tarihli.filter((k) => k.tarih.startsWith(gecenAyOnek)).length,
    seri,
    kategoriler: CATEGORIES.filter((c) => kategoriSayilari.has(c))
      .map((kategori) => ({ kategori, sayi: kategoriSayilari.get(kategori)! }))
      .sort((a, b) => b.sayi - a.sayi),
    kisiler: [...kisiler.values()]
      .sort((a, b) => b.sayi - a.sayi || b.son.localeCompare(a.son))
      .slice(0, ILK_UC)
      .map(({ son: _son, ...kisi }) => kisi),
    yerler: enCokYerler(kayitlar),
  }
}

export interface OrtakGecmis {
  toplam: number
  // The latest plan together whose day has passed.
  sonBulusma: { tarih: string; baslik: string; gunOnce: number } | null
  // The next one coming up.
  siradaki: { tarih: string; saat: string | null; baslik: string } | null
  enSikYer: string | null
}

// What a friend and I have done together, from the plans in my calendar
// that are known to include them (`birlikte` decides which).
export function ortakGecmis(kayitlar: Kayit[], birlikte: (k: Kayit) => boolean, bugun: string): OrtakGecmis {
  const ortak = kayitlar.filter((k): k is Kayit & { tarih: string } => !!k.tarih && birlikte(k))
  const gecmis = ortak.filter((k) => k.tarih < bugun).sort((a, b) => b.tarih.localeCompare(a.tarih))
  const gelecek = ortak
    .filter((k) => k.tarih >= bugun && k.durum === 'bekliyor')
    .sort((a, b) => `${a.tarih}${a.saat ?? '99'}`.localeCompare(`${b.tarih}${b.saat ?? '99'}`))
  const son = gecmis[0]
  const ilk = gelecek[0]
  return {
    toplam: ortak.length,
    sonBulusma: son ? { tarih: son.tarih, baslik: goruntulemeBasligi(son), gunOnce: gunFarki(son.tarih, bugun) } : null,
    siradaki: ilk ? { tarih: ilk.tarih, saat: ilk.saat, baslik: goruntulemeBasligi(ilk) } : null,
    // One visit isn't a habit yet.
    enSikYer: enCokYerler(ortak, 1).find((y) => y.sayi > 1)?.ad ?? null,
  }
}

// How long ago, in the roughest unit that still reads naturally.
export function neKadarOnce(gun: number): string {
  if (gun <= 0) return 'Bugün'
  if (gun === 1) return 'Dün'
  if (gun < 7) return `${gun} gün önce`
  if (gun < 30) return `${Math.floor(gun / 7)} hafta önce`
  if (gun < 365) return `${Math.floor(gun / 30)} ay önce`
  return `${Math.floor(gun / 365)} yıl önce`
}

// A month or more since we last met and nothing planned: time to nudge.
export const UZUN_ARA_GUN = 30

export function uzunAraVar(gecmis: OrtakGecmis): boolean {
  return !!gecmis.sonBulusma && gecmis.sonBulusma.gunOnce >= UZUN_ARA_GUN && !gecmis.siradaki
}

// The friends to nudge about, the longest gap first.
export function gorusulmeyenler(gecmisler: Map<string, OrtakGecmis>, adet = ILK_UC): string[] {
  return [...gecmisler]
    .filter(([, g]) => uzunAraVar(g))
    .sort(([, a], [, b]) => b.sonBulusma!.gunOnce - a.sonBulusma!.gunOnce)
    .slice(0, adet)
    .map(([id]) => id)
}
