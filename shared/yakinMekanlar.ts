// Nearby places in the feed: which places show, in what order, and where a
// sponsored place goes. Shared by the API (api/yakin.ts picks candidates
// and live campaigns near the person) and the app (it adds Sharloop's own
// star ratings and sorts). Pure functions, so the rules are tested once.
//
// Rules (business plan, 2026-11-01):
// - Organic places are ranked by Sharloop users' ratings and distance.
// - At most ONE sponsored place per list, in the 2nd slot, always labelled
//   "Sponsorlu"; it must be near the person and its campaign must be live.
// - No alcohol, hookah, tobacco or betting places, sponsored or not (the
//   app is rated 13+).

export interface YakinMekan {
  id: string
  ad: string
  kategori: string | null
  adres: string | null
  enlem: number
  boylam: number
}

// A business's paid campaign. Managed in api/_lib/kampanyalar.ts for now.
// Photos, contact, hours and the discount come from the business's own
// profile in the app (`isletme`); the fields here are what we checked when
// it paid, and stand in until the profile loads.
export interface Kampanya {
  id: string
  // The business account's public key, when it has a profile.
  isletme: string | null
  mekanAdi: string
  kategori: string
  adres: string | null
  enlem: number
  boylam: number
  // Shown only to people within this distance of the place.
  yaricapMetre: number
  // Inclusive, YYYY-MM-DD in Turkey's time.
  baslangic: string
  bitis: string
  // One line under the name, e.g. "Öğrencilere özel menü".
  aciklama: string | null
}

export interface MekanPuani {
  ortalama: number
  sayi: number
}

export interface MekanOnerisi {
  mekan: YakinMekan
  mesafeMetre: number
  puan: MekanPuani | null
  // Set only on the one sponsored slot.
  kampanya: Kampanya | null
}

export const AZAMI_ONERI = 10
export const SPONSORLU_SIRA = 1
// Sponsored and organic entries closer than this with the same name are the
// same place; the organic copy is dropped.
export const AYNI_MEKAN_METRE = 150

const YASAKLI_KELIMELER = [
  'bar', 'pub', 'meyhane', 'birahane', 'nightclub', 'gece kulübü', 'hookah', 'nargile', 'tobacco', 'tütün', 'tütüncü',
  'liquor', 'tekel', 'brewery', 'winery', 'wine', 'şarap', 'bira', 'beer', 'cocktail', 'kokteyl',
  'betting', 'bahis', 'iddaa', 'casino', 'kumarhane',
]
// Letters-only word boundaries (\b doesn't know Turkish letters).
const YASAKLI = new RegExp(`(^|[^\\p{L}\\d])(${YASAKLI_KELIMELER.join('|')})(?=$|[^\\p{L}\\d])`, 'iu')
// "Bar" places that serve no alcohol.
const ZARARSIZ_BAR = /(juice|salad|snack|dessert|coffee|espresso|tatlı|meyve suyu|salata|kahve)\s+bar/giu

export function yasakliMi(kategoriVeAd: string): boolean {
  // Turkish lower case first: "İDDAA" must match "iddaa".
  return YASAKLI.test(kategoriVeAd.toLocaleLowerCase('tr-TR').replace(ZARARSIZ_BAR, ' '))
}

// Great-circle distance in metres.
export function mesafe(a: { enlem: number; boylam: number }, b: { enlem: number; boylam: number }): number {
  const R = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const dEnlem = rad(b.enlem - a.enlem)
  const dBoylam = rad(b.boylam - a.boylam)
  const h = Math.sin(dEnlem / 2) ** 2 + Math.cos(rad(a.enlem)) * Math.cos(rad(b.enlem)) * Math.sin(dBoylam / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))))
}

const DUZ_HARF: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }

// A place name folded for matching. People add the area after a comma or a
// dash ("Moda Sahili, Kadıköy"), and Foursquare in brackets ("Starbucks
// (Moda)"), so only the part before those counts:
// "Kahve Dünyası – Kadıköy" and "kahve dunyasi" are the same key.
export function mekanAnahtari(ad: string): string {
  const yalnizAd = ad.split(/,|\s[–—-]\s|\(|\|/)[0]
  return [...yalnizAd.toLocaleLowerCase('tr-TR')]
    .map((h) => DUZ_HARF[h] ?? h)
    .join('')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Sharloop's own rating of each place, from posts' 1-5 stars.
export function puanlariTopla(paylasimlar: { mekan_adi: string; puan: number | null }[]): Map<string, MekanPuani> {
  const toplam = new Map<string, { t: number; n: number }>()
  for (const p of paylasimlar) {
    if (p.puan === null || !Number.isFinite(p.puan) || p.puan < 1 || p.puan > 5) continue
    const anahtar = mekanAnahtari(p.mekan_adi)
    if (!anahtar) continue
    const t = toplam.get(anahtar) ?? { t: 0, n: 0 }
    t.t += p.puan
    t.n += 1
    toplam.set(anahtar, t)
  }
  return new Map([...toplam].map(([k, { t, n }]) => [k, { ortalama: Math.round((t / n) * 10) / 10, sayi: n }]))
}

// A place with few ratings is pulled towards an average 3.5, so one 5-star
// post doesn't beat twenty 4.6s.
const ONCEL_PUAN = 3.5
const ONCEL_AGIRLIK = 3

export function siralamaPuani(mesafeMetre: number, puan: MekanPuani | null): number {
  const n = puan?.sayi ?? 0
  const ortalama = puan ? (puan.ortalama * n + ONCEL_PUAN * ONCEL_AGIRLIK) / (n + ONCEL_AGIRLIK) : ONCEL_PUAN
  // Every kilometre away costs about as much as half a star.
  return ortalama - (mesafeMetre / 1000) * 0.5
}

// Today in Turkey's time, YYYY-MM-DD.
export function bugunTR(simdi = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(simdi)
}

export function kampanyaCanliMi(k: Kampanya, bugun: string): boolean {
  return k.baslangic <= bugun && bugun <= k.bitis && !yasakliMi(`${k.kategori} ${k.mekanAdi}`)
}

// Live campaigns that reach someone at this spot.
export function yakindakiKampanyalar(kampanyalar: Kampanya[], konum: { enlem: number; boylam: number }, bugun: string): Kampanya[] {
  return kampanyalar.filter((k) => kampanyaCanliMi(k, bugun) && mesafe(konum, k) <= k.yaricapMetre)
}

function kampanyaMekani(k: Kampanya): YakinMekan {
  return { id: `kampanya:${k.id}`, ad: k.mekanAdi, kategori: k.kategori, adres: k.adres, enlem: k.enlem, boylam: k.boylam }
}

// The list the feed shows: organic places best first, and the one
// sponsored place (the best-rated live one nearby) in the second slot.
export function onerileriSirala(
  mekanlar: YakinMekan[],
  kampanyalar: Kampanya[],
  puanlar: Map<string, MekanPuani>,
  konum: { enlem: number; boylam: number },
  bugun: string,
): MekanOnerisi[] {
  const puanla = (m: YakinMekan): MekanOnerisi => ({
    mekan: m,
    mesafeMetre: mesafe(konum, m),
    puan: puanlar.get(mekanAnahtari(m.ad)) ?? null,
    kampanya: null,
  })

  const sponsorlu =
    yakindakiKampanyalar(kampanyalar, konum, bugun)
      .map((k) => ({ ...puanla(kampanyaMekani(k)), kampanya: k }))
      .sort((a, b) => siralamaPuani(b.mesafeMetre, b.puan) - siralamaPuani(a.mesafeMetre, a.puan))[0] ?? null

  const gorulen = new Set<string>()
  const organik = mekanlar
    .filter((m) => !yasakliMi(`${m.kategori ?? ''} ${m.ad}`))
    .filter((m) => {
      const anahtar = mekanAnahtari(m.ad)
      if (!anahtar || gorulen.has(m.id)) return false
      gorulen.add(m.id)
      return !(sponsorlu && mekanAnahtari(sponsorlu.mekan.ad) === anahtar && mesafe(sponsorlu.mekan, m) <= AYNI_MEKAN_METRE)
    })
    .map(puanla)
    .sort((a, b) => siralamaPuani(b.mesafeMetre, b.puan) - siralamaPuani(a.mesafeMetre, a.puan) || a.mesafeMetre - b.mesafeMetre)
    .slice(0, sponsorlu ? AZAMI_ONERI - 1 : AZAMI_ONERI)

  if (!sponsorlu) return organik
  return [...organik.slice(0, SPONSORLU_SIRA), sponsorlu, ...organik.slice(SPONSORLU_SIRA)]
}

export function mesafeMetni(metre: number): string {
  if (metre < 1000) return `${Math.max(10, Math.round(metre / 10) * 10)} m`
  return `${(metre / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} km`
}

// ---------- discount codes ----------
//
// A business sets its own discount in its profile. A code is 8 letters
// shown as "ABCD-EFGH": the first half depends on the person and the day
// (so the same person gets the same code all day), the second half is a
// server MAC over the business, the day and the first half. The business
// scans the code's QR (or types it) on /isletme/dogrula.html; no database
// is needed.

// The page the QR on a code opens.
export function dogrulamaAdresi(koken: string, isletme: string, kod?: string): string {
  const url = new URL('/isletme/dogrula.html', koken)
  url.searchParams.set('i', isletme)
  if (kod) url.searchParams.set('kod', kod)
  return url.toString()
}

export const KOD_ALFABESI = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function koduBicimle(kod: string): string {
  return `${kod.slice(0, 4)}-${kod.slice(4, 8)}`
}

// "abcd efgh", "ABCD-EFGH" → "ABCDEFGH"; null if it can't be a code.
export function koduTemizle(girdi: string): string | null {
  const temiz = girdi.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (temiz.length !== 8) return null
  return [...temiz].every((h) => KOD_ALFABESI.includes(h)) ? temiz : null
}

export function baytlardanKod(baytlar: Uint8Array, uzunluk: number): string {
  let kod = ''
  for (let i = 0; i < uzunluk; i++) kod += KOD_ALFABESI[baytlar[i] % KOD_ALFABESI.length]
  return kod
}
