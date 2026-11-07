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
import { yakinlariBirlestir } from '../src/lib/yakin.ts'
import { instagramAl, isletmeKur, telefonAl, webAdresiAl, type IsletmeProfili } from '../src/sosyal/isletme.ts'

const BEN = { enlem: 40.99, boylam: 29.03 }
const BUGUN = '2026-11-07'

function yer(id: string, ad: string, metreKuzey: number, kategori = 'Café'): YakinMekan {
  // About 111 km per degree of latitude.
  return { id, ad, kategori, adres: null, enlem: BEN.enlem + metreKuzey / 111_000, boylam: BEN.boylam }
}

function kampanya(degisiklik: Partial<Kampanya> = {}): Kampanya {
  return {
    id: 'test-kafe',
    isletme: null,
    mekanAdi: 'Test Kafe',
    kategori: 'Kafe',
    adres: null,
    enlem: BEN.enlem + 600 / 111_000,
    boylam: BEN.boylam,
    yaricapMetre: 3000,
    baslangic: '2026-11-01',
    bitis: '2026-11-30',
    aciklama: null,
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
const ISLETME = 'c'.repeat(64)

function kuponIstegi(govde: unknown) {
  return new Request('http://localhost/api/kupon', { method: 'POST', body: JSON.stringify(govde), headers: { 'Content-Type': 'application/json' } })
}

async function kodAl(kullanici: string, isletme = ISLETME) {
  return ((await (await kuponPOST(kuponIstegi({ isletme, kullanici }))).json()) as { kod: string }).kod
}

async function dogrula(kod: string, isletme = ISLETME) {
  const res = await kuponGET(new Request(`http://localhost/api/kupon?i=${isletme}&kod=${encodeURIComponent(kod)}`))
  return ((await res.json()) as { gecerli?: boolean }).gecerli
}

test('api/kupon: same person, same day, same code; the business QR page accepts it', async () => {
  const kod = await kodAl(KISI)
  assert.match(kod, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  assert.equal(await kodAl(KISI), kod)
  assert.notEqual(await kodAl('b'.repeat(64)), kod)
  assert.equal(await dogrula(kod), true)
  assert.equal(await dogrula(kod.toLowerCase().replace('-', ' ')), true)
  // A typo, another business's code, or yesterday's code is not accepted.
  assert.equal(await dogrula(kod.slice(0, 8) + (kod[8] === 'A' ? 'B' : 'A')), false)
  assert.equal(await dogrula(kod, 'd'.repeat(64)), false)
  assert.equal(await dogrula(kodUret('test-gizli', ISLETME, KISI, '2020-01-01')), false)
})

test('api/kupon: signed-in people only, a real business key, and no endless guessing', async () => {
  assert.equal((await kuponPOST(kuponIstegi({ isletme: ISLETME, kullanici: 'kim' }))).status, 400)
  assert.equal((await kuponPOST(kuponIstegi({ isletme: 'kafe', kullanici: KISI }))).status, 400)
  assert.equal((await kuponPOST(kuponIstegi({ isletme: KISI, kullanici: KISI }))).status, 400)
  assert.equal((await kuponGET(new Request('http://localhost/api/kupon?kod=AAAA-AAAA'))).status, 400)
  assert.equal(koduTemizle('ABCD-EFG1'), null)

  let son = 0
  for (let i = 0; i < 31; i++) son = (await kuponGET(new Request(`http://localhost/api/kupon?i=${ISLETME}&kod=AAAA-AAAA`))).status
  assert.equal(son, 429)

  delete process.env.KUPON_GIZLI
  delete process.env.EPOSTA_GIZLI
  assert.equal((await kuponPOST(kuponIstegi({ isletme: ISLETME, kullanici: KISI }))).status, 503)
})

// ---------- business profiles ----------

function profil(degisiklik: Partial<IsletmeProfili> = {}): IsletmeProfili {
  return {
    id: ISLETME,
    ad: 'Test Kafe',
    kategori: 'Kafe',
    aciklama: null,
    adres: 'Moda',
    enlem: BEN.enlem + 600 / 111_000,
    boylam: BEN.boylam,
    telefon: null,
    web: null,
    instagram: null,
    saatler: null,
    fotolar: [],
    indirim: { metin: '%10', kosul: null },
    guncelleme: 0,
    onay: null,
    ...degisiklik,
  }
}

test('business profile records: links and handles cleaned, broken or banned ones dropped', () => {
  assert.equal(webAdresiAl('javascript:alert(1)'), null)
  assert.equal(webAdresiAl('ornek.com'), 'https://ornek.com/')
  assert.equal(instagramAl('https://instagram.com/moda.kafe/'), 'moda.kafe')
  assert.equal(telefonAl('ara beni'), null)
  const veri = { ad: 'Moda Kafe', kategori: 'Kafe', adres: 'Moda', enlem: 40.98, boylam: 29.02, fotolar: [{ id: 'isletme-0011aabb', parca: 2, tip: 'image/jpeg' }, { id: 'isletme-Xy_9-Ab3cD0', parca: 1, tip: 'image/jpeg' }, { id: '../ani', parca: 1, tip: 'image/jpeg' }] }
  const p = isletmeKur({ yazar: ISLETME, veri })
  assert.equal(p?.fotolar.length, 2)
  assert.equal(isletmeKur({ yazar: ISLETME, veri: { ...veri, kategori: 'Bar' } }), null)
  assert.equal(isletmeKur({ yazar: ISLETME, veri: { ...veri, enlem: 'kuzey' } }), null)
})

test('a business profile takes the map entry\'s place, and a sponsored one shows once with its profile', () => {
  const mekanlar = [yer('fsq:1', 'Test Kafe', 600), yer('fsq:2', 'Bir', 100), yer('fsq:3', 'İki', 200)]
  const organik = yakinlariBirlestir(mekanlar, [], [profil()], new Map(), BEN, BUGUN)
  assert.equal(organik.filter((o) => o.mekan.ad === 'Test Kafe').length, 1)
  assert.equal(organik.find((o) => o.mekan.ad === 'Test Kafe')?.isletme?.id, ISLETME)

  const sponsorlu = yakinlariBirlestir(mekanlar, [kampanya({ isletme: ISLETME, mekanAdi: 'Eski Ad' })], [profil()], new Map(), BEN, BUGUN)
  assert.equal(sponsorlu.filter((o) => o.isletme?.id === ISLETME).length, 1)
  assert.equal(sponsorlu[1].kampanya?.id, 'test-kafe')
  // The profile's own name wins over what the campaign was sold with.
  assert.equal(sponsorlu[1].mekan.ad, 'Test Kafe')
  assert.equal(sponsorlu[1].isletme?.indirim?.metin, '%10')
})
