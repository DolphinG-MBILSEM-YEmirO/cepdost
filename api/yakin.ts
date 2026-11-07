// Nearby places for the feed's "Yakınında" strip.
//
//   GET /api/yakin?enlem=40.99&boylam=29.03
//   → { mekanlar: YakinMekan[], kampanyalar: Kampanya[] }
//
// The app rounds the position to two decimals (about a kilometre) before
// asking, so the exact spot never leaves the phone and nearby people share
// one cached answer. Places come from the Foursquare Places API (free tier,
// FOURSQUARE_API_KEY); without it only sponsored places come back. The app
// adds Sharloop's own ratings and sorts (shared/yakinMekanlar.ts).

import {
  bugunTR,
  yakindakiKampanyalar,
  yasakliMi,
  type Kampanya,
  type YakinMekan,
} from '../shared/yakinMekanlar.js'
import { KAMPANYALAR } from './_lib/kampanyalar.js'
import { kaynakReddi, yanit } from './_lib/http.js'

export const config = { maxDuration: 15 }

const ARAMA_YARICAPI = 2500
const ADAY_SAYISI = 40

// Foursquare's top-level groups: Dining and Drinking, Arts and
// Entertainment, Landmarks and Outdoors.
const KATEGORI_GRUPLARI = ['63be6904847c3692a84b9bb5', '4d4b7104d754a06370d81259', '4d4b7105d754a06377d81259']

// Places worth going out to with friends; offices, banks and the like are
// left out even if the category filter above isn't honoured.
const GIDILECEK_YER =
  /restaurant|restoran|caf[eé]|coffee|kahve|bakery|f[ıi]r[ıi]n|pastane|patisserie|pastry|dessert|tatl[ıi]|ice cream|dondurma|tea|çay|food|pizza|burger|kebab|kebap|döner|doner|breakfast|kahvalt|sandwich|diner|bistro|noodle|sushi|steak|seafood|balık|köfte|pide|lahmacun|börek|simit|waffle|park|museum|müze|gallery|galeri|cinema|sinema|movie|theater|tiyatro|bowling|arcade|escape|book|kitap|library|kütüphane|beach|plaj|garden|bahçe|zoo|aquarium|akvaryum|climbing|tırmanış|art|sanat|music venue|concert|market|pazar|plaza|landmark|viewpoint|seyir|scenic|historic|tarihi/i

function sayiAl(deger: string | null): number | null {
  if (deger === null || deger.trim() === '') return null
  const n = Number(deger)
  return Number.isFinite(n) ? n : null
}

interface FoursquareYeri {
  fsq_place_id?: string
  fsq_id?: string
  name?: string
  latitude?: number
  longitude?: number
  geocodes?: { main?: { latitude?: number; longitude?: number } }
  categories?: Array<{ name?: string }>
  location?: { formatted_address?: string }
}

export function foursquareYeriniCevir(yer: FoursquareYeri): YakinMekan | null {
  const id = yer.fsq_place_id ?? yer.fsq_id
  const ad = yer.name?.trim()
  const enlem = yer.latitude ?? yer.geocodes?.main?.latitude
  const boylam = yer.longitude ?? yer.geocodes?.main?.longitude
  if (!id || !ad || typeof enlem !== 'number' || typeof boylam !== 'number') return null
  const kategori = yer.categories?.map((c) => c.name).find((n): n is string => !!n) ?? null
  const butunKategoriler = (yer.categories ?? []).map((c) => c.name ?? '').join(' ')
  if (!GIDILECEK_YER.test(butunKategoriler) || yasakliMi(`${butunKategoriler} ${ad}`)) return null
  return { id: `fsq:${id}`, ad: ad.slice(0, 80), kategori, adres: yer.location?.formatted_address?.slice(0, 160) ?? null, enlem, boylam }
}

async function foursquareAra(anahtar: string, enlem: number, boylam: number, kategoriyle: boolean): Promise<YakinMekan[] | null> {
  const url = new URL('https://places-api.foursquare.com/places/search')
  url.searchParams.set('ll', `${enlem},${boylam}`)
  url.searchParams.set('radius', String(ARAMA_YARICAPI))
  url.searchParams.set('limit', String(ADAY_SAYISI))
  if (kategoriyle) url.searchParams.set('fsq_category_ids', KATEGORI_GRUPLARI.join(','))
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${anahtar}`, Accept: 'application/json', 'X-Places-Api-Version': '2025-06-17' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    console.error('Foursquare yakın arama hatası', res.status, await res.text().catch(() => ''))
    return null
  }
  const veri = (await res.json()) as { results?: FoursquareYeri[] }
  return (veri.results ?? []).map(foursquareYeriniCevir).filter((m): m is YakinMekan => m !== null)
}

async function yakinMekanlar(enlem: number, boylam: number): Promise<YakinMekan[]> {
  const anahtar = process.env.FOURSQUARE_API_KEY?.trim()
  if (!anahtar) return []
  try {
    // If the category filter is ever refused, the name filter above still
    // keeps the list to places worth going to.
    return (await foursquareAra(anahtar, enlem, boylam, true)) ?? (await foursquareAra(anahtar, enlem, boylam, false)) ?? []
  } catch (err) {
    console.error('Foursquare yakın arama beklenmeyen hata', err)
    return []
  }
}

export async function GET(request: Request): Promise<Response> {
  const red = kaynakReddi(request)
  if (red) return red
  const params = new URL(request.url).searchParams
  const enlemHam = sayiAl(params.get('enlem'))
  const boylamHam = sayiAl(params.get('boylam'))
  if (enlemHam === null || boylamHam === null || Math.abs(enlemHam) > 90 || Math.abs(boylamHam) > 180) {
    return yanit({ error: 'Konum eksik ya da geçersiz.' }, 400)
  }
  // Rounded here too, in case a client sends more.
  const enlem = Math.round(enlemHam * 100) / 100
  const boylam = Math.round(boylamHam * 100) / 100

  const mekanlar = await yakinMekanlar(enlem, boylam)
  const kampanyalar: Kampanya[] = yakindakiKampanyalar(KAMPANYALAR, { enlem, boylam }, bugunTR())

  return new Response(JSON.stringify({ mekanlar, kampanyalar }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Same rounded spot, same answer: the CDN keeps it for a few hours (a
      // new deploy, e.g. a new campaign, clears it).
      'Cache-Control': 'public, max-age=600, s-maxage=21600',
    },
  })
}
