// Nearby places in the feed: ranking, the one sponsored slot, banned
// places, and discount codes (shared/yakinMekanlar.ts, api/yakin.ts,
// api/kupon.ts).
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  bugunTR,
  koduTemizle,
  mekanAnahtari,
  mesafe,
  mesafeMetni,
  onerileriSirala,
  puanlariTopla,
  yasakliMi,
  type Kampanya,
  type YakinMekan,
} from '../shared/yakinMekanlar.ts'
import { KAMPANYALAR } from '../api/_lib/kampanyalar.ts'
import { GET as yakinGET, foursquareYeriniCevir } from '../api/yakin.ts'
import { GET as kuponGET, POST as kuponPOST, kodUret, kuponSayaclariniSifirla } from '../api/kupon.ts'

const BEN = { enlem: 40.99, boylam: 29.03 }
const BUGUN = '2026-11-07'

function yer(id: string, ad: string, metreKuzey: number, kategori = 'Café'): YakinMekan {
  // About 111 km per degree of latitude.
  return { id, ad, kategori, adres: null, enlem: BEN.enlem + metreKuzey / 111_000, boylam: BEN.boylam }
}

function kampanya(degisiklik: Partial<Kampanya> = {}): Kampanya {
  return {
    id: 'test-kafe',
    mekanAdi: 'Test Kafe',
    kategori: 'Kafe',
    adres: null,
    enlem: BEN.enlem + 600 / 111_000,
    boylam: BEN.boylam,
    yaricapMetre: 3000,
    baslangic: '2026-11-01',
    bitis: '2026-11-30',
    aciklama: null,
    indirim: { metin: '%10 indirim', kosul: null },
    ...degisiklik,
  }
}

test('place names match however they are typed', () => {
  assert.equal(mekanAnahtari('Kahve Dünyası – Kadıköy'), mekanAnahtari('kahve dunyasi'))
  assert.equal(mekanAnahtari('Moda Sahili, Kadıköy'), 'moda sahili')
  assert.equal(mekanAnahtari('Starbucks (Moda)'), 'starbucks')
  assert.equal(mekanAnahtari('Çiya Sofrası-Kadıköy'), 'ciya sofrasi kadikoy')
  assert.equal(mekanAnahtari('ÇAY BAHÇESİ'), 'cay bahcesi')
})

test('ratings: averaged per place, bad stars ignored', () => {
  const p = puanlariTopla([
    { mekan_adi: 'Moda Kahve', puan: 5 },
    { mekan_adi: 'moda kahve', puan: 4 },
    { mekan_adi: 'Moda Kahve', puan: null },
    { mekan_adi: 'Moda Kahve', puan: 9 },
  ])
  assert.deepEqual(p.get('moda kahve'), { ortalama: 4.5, sayi: 2 })
})

test('alcohol, hookah, tobacco and betting places are left out; juice bars are not', () => {
  for (const ad of ['Cocktail Bar', 'Pub X', 'Nargile Cafe', 'Gece Kulübü', 'İddaa Bayi', 'Tekel Büfe', 'Tütüncü']) assert.ok(yasakliMi(ad), ad)
  for (const ad of ['Juice Bar', 'Barbekü Evi', 'Kahve Dünyası', 'Coffee Bar Moda', 'Park']) assert.ok(!yasakliMi(ad), ad)
})

test('distance and its label', () => {
  assert.ok(Math.abs(mesafe(BEN, yer('a', 'A', 1000)) - 1000) < 5)
  assert.equal(mesafeMetni(234), '230 m')
  assert.equal(mesafeMetni(1500), '1,5 km')
})

test('organic order: well-rated near places first, unrated after, banned ones gone', () => {
  const mekanlar = [yer('1', 'Uzak Ama Harika', 1800), yer('2', 'Yakın Kafe', 200), yer('3', 'Sevilen Kafe', 400), yer('4', 'Wine Bar', 100, 'Wine Bar')]
  const puanlar = puanlariTopla([
    ...Array.from({ length: 6 }, () => ({ mekan_adi: 'Sevilen Kafe', puan: 5 })),
    { mekan_adi: 'Uzak Ama Harika', puan: 5 },
  ])
  const sira = onerileriSirala(mekanlar, [], puanlar, BEN, BUGUN).map((o) => o.mekan.ad)
  assert.deepEqual(sira, ['Sevilen Kafe', 'Yakın Kafe', 'Uzak Ama Harika'])
})

test('one sponsored place, second slot, labelled with its campaign; its organic copy is dropped', () => {
  const mekanlar = [yer('1', 'Bir', 100), yer('2', 'İki', 200), yer('3', 'Test Kafe', 600)]
  const kampanyalar = [kampanya(), kampanya({ id: 'ikinci', mekanAdi: 'Başka Sponsor', enlem: BEN.enlem + 900 / 111_000 })]
  const liste = onerileriSirala(mekanlar, kampanyalar, new Map(), BEN, BUGUN)
  assert.equal(liste.filter((o) => o.kampanya).length, 1)
  assert.equal(liste[1].kampanya?.id, 'test-kafe')
  assert.equal(liste.filter((o) => o.mekan.ad === 'Test Kafe').length, 1)
  assert.deepEqual(liste.map((o) => o.mekan.ad), ['Bir', 'Test Kafe', 'İki'])
})

test('a campaign shows only while live, within its radius, and never for a banned place', () => {
  const tek = (k: Kampanya, gun = BUGUN) => onerileriSirala([], [k], new Map(), BEN, gun)
  assert.equal(tek(kampanya()).length, 1)
  assert.equal(tek(kampanya({ bitis: '2026-11-06' })).length, 0)
  assert.equal(tek(kampanya({ baslangic: '2026-11-08' })).length, 0)
  assert.equal(tek(kampanya({ yaricapMetre: 500 })).length, 0)
  assert.equal(tek(kampanya({ kategori: 'Nargile Kafe' })).length, 0)
  // With nothing organic, the sponsored place is the whole list.
  assert.equal(tek(kampanya())[0].kampanya?.id, 'test-kafe')
})

test('Foursquare answers: places worth going to only, in both response shapes', () => {
  assert.deepEqual(
    foursquareYeriniCevir({ fsq_place_id: 'x', name: 'Moda Kahve', latitude: 1, longitude: 2, categories: [{ name: 'Coffee Shop' }] }),
    { id: 'fsq:x', ad: 'Moda Kahve', kategori: 'Coffee Shop', adres: null, enlem: 1, boylam: 2 },
  )
  assert.equal(foursquareYeriniCevir({ fsq_id: 'y', name: 'Garanti ATM', geocodes: { main: { latitude: 1, longitude: 2 } }, categories: [{ name: 'ATM' }] }), null)
  assert.equal(foursquareYeriniCevir({ fsq_id: 'z', name: 'Hops', latitude: 1, longitude: 2, categories: [{ name: 'Pub' }, { name: 'Restaurant' }] }), null)
})

// ---------- API ----------

const ESKI_ENV = { ...process.env }
const asilFetch = globalThis.fetch

beforeEach(() => {
  KAMPANYALAR.length = 0
  kuponSayaclariniSifirla()
  delete process.env.FOURSQUARE_API_KEY
  process.env.KUPON_GIZLI = 'test-gizli'
})

afterEach(() => {
  process.env = { ...ESKI_ENV }
  globalThis.fetch = asilFetch
})

function canliKampanya(degisiklik: Partial<Kampanya> = {}): Kampanya {
  const bugun = bugunTR()
  return kampanya({ baslangic: bugun, bitis: bugun, ...degisiklik })
}

test('api/yakin: rounds the position, returns nearby live campaigns, and is cacheable', async () => {
  KAMPANYALAR.push(canliKampanya(), canliKampanya({ id: 'uzak', enlem: BEN.enlem + 1 }))
  process.env.FOURSQUARE_API_KEY = 'fsq'
  let istenen = ''
  globalThis.fetch = (async (url: URL) => {
    istenen = String(url)
    return new Response(
      JSON.stringify({ results: [{ fsq_place_id: 'p', name: 'Park Kafe', latitude: 40.991, longitude: 29.031, categories: [{ name: 'Café' }] }] }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }) as typeof fetch
  const res = await yakinGET(new Request('http://localhost/api/yakin?enlem=40.98765&boylam=29.03123'))
  assert.equal(res.status, 200)
  assert.match(res.headers.get('cache-control') ?? '', /s-maxage/)
  assert.match(istenen, /ll=40\.99%2C29\.03|ll=40\.99,29\.03/)
  const veri = (await res.json()) as { mekanlar: YakinMekan[]; kampanyalar: Kampanya[] }
  assert.deepEqual(veri.mekanlar.map((m) => m.ad), ['Park Kafe'])
  assert.deepEqual(veri.kampanyalar.map((k) => k.id), ['test-kafe'])
})

test('api/yakin: bad position is refused; no Foursquare key still gives campaigns', async () => {
  assert.equal((await yakinGET(new Request('http://localhost/api/yakin?enlem=abc&boylam=1'))).status, 400)
  KAMPANYALAR.push(canliKampanya())
  const veri = (await (await yakinGET(new Request('http://localhost/api/yakin?enlem=40.99&boylam=29.03'))).json()) as {
    mekanlar: unknown[]
    kampanyalar: unknown[]
  }
  assert.equal(veri.mekanlar.length, 0)
  assert.equal(veri.kampanyalar.length, 1)
})

const KISI = 'a'.repeat(64)

function kuponIstegi(govde: unknown) {
  return new Request('http://localhost/api/kupon', { method: 'POST', body: JSON.stringify(govde), headers: { 'Content-Type': 'application/json' } })
}

test('api/kupon: same person, same day, same code; the business page accepts it', async () => {
  KAMPANYALAR.push(canliKampanya())
  const r1 = (await (await kuponPOST(kuponIstegi({ kampanya: 'test-kafe', kullanici: KISI }))).json()) as { kod: string }
  const r2 = (await (await kuponPOST(kuponIstegi({ kampanya: 'test-kafe', kullanici: KISI }))).json()) as { kod: string }
  assert.match(r1.kod, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  assert.equal(r1.kod, r2.kod)
  const baska = (await (await kuponPOST(kuponIstegi({ kampanya: 'test-kafe', kullanici: 'b'.repeat(64) }))).json()) as { kod: string }
  assert.notEqual(baska.kod, r1.kod)

  const dogrula = async (kod: string, k = 'test-kafe') =>
    (await (await kuponGET(new Request(`http://localhost/api/kupon?k=${k}&kod=${encodeURIComponent(kod)}`))).json()) as { gecerli?: boolean }
  assert.equal((await dogrula(r1.kod)).gecerli, true)
  assert.equal((await dogrula(r1.kod.toLowerCase().replace('-', ' '))).gecerli, true)
  // A typo, or yesterday's code, is not accepted.
  const yanlis = r1.kod.slice(0, 8) + (r1.kod[8] === 'A' ? 'B' : 'A')
  assert.equal((await dogrula(yanlis)).gecerli, false)
  const dun = kodUret('test-gizli', 'test-kafe', KISI, '2020-01-01')
  assert.equal((await dogrula(dun)).gecerli, false)
})

test('api/kupon: only live campaigns with a discount, signed-in people, and no endless guessing', async () => {
  KAMPANYALAR.push(canliKampanya(), canliKampanya({ id: 'indirimsiz', indirim: null }), canliKampanya({ id: 'bitti', baslangic: '2020-01-01', bitis: '2020-01-02' }))
  assert.equal((await kuponPOST(kuponIstegi({ kampanya: 'indirimsiz', kullanici: KISI }))).status, 404)
  assert.equal((await kuponPOST(kuponIstegi({ kampanya: 'bitti', kullanici: KISI }))).status, 404)
  assert.equal((await kuponPOST(kuponIstegi({ kampanya: 'test-kafe', kullanici: 'kim' }))).status, 400)
  assert.equal(koduTemizle('ABCD-EFG1'), null)

  let son = 0
  for (let i = 0; i < 31; i++) son = (await kuponGET(new Request('http://localhost/api/kupon?k=test-kafe&kod=AAAA-AAAA'))).status
  assert.equal(son, 429)

  delete process.env.KUPON_GIZLI
  delete process.env.EPOSTA_GIZLI
  assert.equal((await kuponPOST(kuponIstegi({ kampanya: 'test-kafe', kullanici: KISI }))).status, 503)
})
