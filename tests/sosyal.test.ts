// End-to-end test of the social layer against a local relay: accounts,
// friend requests, profiles, availability, chat, invites, groups, unfriend
// with key rotation, password sign-in and restoring on a new device.
//
//   npm test

import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { generateSecretKey } from 'nostr-tools/pure'
// @ts-expect-error plain JS dev tool without types
import { startRelay } from '../scripts/relay.mjs'
import { SosyalMotor } from '../src/sosyal/nostr/motor'
import {
  arkadasKodu,
  benimYayinAnahtarim,
  etkinMotoruAyarla,
  koduGoster,
  motorOlustur,
  yayinKanaliAl,
} from '../src/sosyal/cekirdek'
import { hesabiKur, sifreyiKaydet, sifreyleGiris } from '../src/sosyal/hesap'
import {
  arkadaslariGetir,
  arkadaslikIsteGonder,
  arkadaslikYanitla,
  arkadasliktanCik,
  arkadasMusaitligi,
  bekleyenSayisi,
  davetGonder,
  davetleriGetir,
  davetYanitla,
  profilAra,
  profilGuncelle,
  profilimiGetir,
} from '../src/sosyal/api'
import {
  direktMesajGonder,
  direktMesajlariGetir,
  okunduIsaretle,
  okunmamisMesajSayisi,
  sohbetleriGetir,
} from '../src/sosyal/mesajlar'
import {
  grupOlustur,
  grupPlaniOlustur,
  grupPlanlariGetir,
  grupUyeleriGetir,
  gruplarimiGetir,
  gruptanAyril,
  mesajGonder,
  mesajlariGetir,
  planaYanitVer,
  planYanitlariGetir,
} from '../src/sosyal/gruplar'
import { bloklariCikar, musaitligiSenkronla } from '../src/sosyal/musaitlikSenkron'
import { kayitOlustur, type Kayit } from '../src/db'

let relay: { url: string; close: () => Promise<void> }
const motorlar: SosyalMotor[] = []

interface Kisi {
  ad: string
  sk: Uint8Array
  motor: SosyalMotor
}

function kisiOlustur(ad: string, sk = generateSecretKey(), db = `test-${ad}-${Math.random()}`): Kisi {
  const motor = motorOlustur(sk, { roleler: [relay.url], veritabaniAdi: db })
  motorlar.push(motor)
  return { ad, sk, motor }
}

// Runs `fn` as this person: every social function uses the active engine.
async function olarak<T>(kisi: Kisi, fn: () => Promise<T>): Promise<T> {
  etkinMotoruAyarla(kisi.motor)
  return fn()
}

async function esitle(...kisiler: Kisi[]) {
  // Two rounds: reactions on one side become visible to the other.
  for (let tur = 0; tur < 2; tur++) {
    for (const k of kisiler) await olarak(k, () => k.motor.esitle())
  }
}

let ali: Kisi
let ayse: Kisi
let can: Kisi

before(async () => {
  relay = startRelay(17000 + Math.floor(Math.random() * 1000))
  ali = kisiOlustur('ali')
  ayse = kisiOlustur('ayse')
  can = kisiOlustur('can')
})

after(async () => {
  for (const m of motorlar) m.kapat()
  await relay.close()
})

test('accounts are created and found by username and code', async () => {
  await olarak(ali, () => hesabiKur({ ad: 'Ali', kullanici_adi: 'ali', gizlilik: 'arkadaslar' }))
  await olarak(ali, () => sifreyiKaydet('gizli-sifre-1'))
  await olarak(ayse, () => hesabiKur({ ad: 'Ayşe', kullanici_adi: 'ayse', gizlilik: 'herkes' }))
  await olarak(can, () => hesabiKur({ ad: 'Can', kullanici_adi: 'can', gizlilik: 'arkadaslar' }))

  const profil = await olarak(ali, () => profilimiGetir())
  assert.equal(profil?.ad, 'Ali')
  assert.equal(profil?.sifre_belirlendi, true)

  await assert.rejects(
    olarak(can, () => hesabiKur({ ad: 'Sahte', kullanici_adi: 'ali', gizlilik: 'arkadaslar' })),
    /zaten alınmış/,
  )

  const adla = await olarak(ayse, () => profilAra('@ali'))
  assert.equal(adla?.id, ali.motor.benimId)
  const kodla = await olarak(ayse, () => profilAra(koduGoster(arkadasKodu(ali.motor.benimId)).toLowerCase()))
  assert.equal(kodla?.id, ali.motor.benimId)
  assert.equal(await olarak(ayse, () => profilAra('yok-boyle-biri')), null)
})

test('friend request, accept and profiles', async () => {
  const sonuc = await olarak(ayse, () => profilAra('ali'))
  await olarak(ayse, () => arkadaslikIsteGonder(ali.motor.benimId, sonuc))

  const giden = await olarak(ayse, () => arkadaslariGetir())
  assert.deepEqual(giden.map((a) => [a.profil.ad, a.durum, a.yon]), [['Ali', 'bekliyor', 'giden']])

  await esitle(ali)
  const gelen = await olarak(ali, () => arkadaslariGetir())
  assert.deepEqual(gelen.map((a) => [a.profil.ad, a.durum, a.yon]), [['Ayşe', 'bekliyor', 'gelen']])
  assert.equal(await olarak(ali, () => bekleyenSayisi()), 1)

  await olarak(ali, () => arkadaslikYanitla(ayse.motor.benimId, true))
  await esitle(ayse, ali)

  const aliIcin = await olarak(ali, () => arkadaslariGetir())
  const ayseIcin = await olarak(ayse, () => arkadaslariGetir())
  assert.equal(aliIcin[0]?.durum, 'kabul')
  assert.equal(ayseIcin[0]?.durum, 'kabul')
  // Full profiles come over the broadcast channels.
  assert.equal(ayseIcin[0]?.profil.kullanici_adi, 'ali')
  assert.equal(aliIcin[0]?.profil.gizlilik, 'herkes')

  // Profile changes reach friends.
  await olarak(ali, () => profilGuncelle({ biyografi: 'Kahve sever', emoji: '☕' }))
  await esitle(ayse)
  const guncel = await olarak(ayse, () => arkadaslariGetir())
  assert.equal(guncel[0]?.profil.biyografi, 'Kahve sever')

  // Both asking each other at once also ends in friendship.
  await olarak(ali, () => arkadaslikIsteGonder(can.motor.benimId, null))
  await olarak(can, () => arkadaslikIsteGonder(ali.motor.benimId, null))
  await esitle(ali, can)
  assert.equal((await olarak(can, () => arkadaslariGetir()))[0]?.durum, 'kabul')
})

test('availability is shared with friends as busy ranges only', async () => {
  await kayitOlustur({
    kategori: 'etkinlik',
    baslik: 'Gizli toplantı',
    tarih: '2099-01-10',
    saat: '14:00',
    konum: 'Gizli yer',
    oncelik: 'orta',
    sure: 90,
    ozetNot: null,
    mekanOnerisi: null,
    yakinOneriler: null,
    kaynakTipi: 'metin',
    hamBaslik: '',
    hamMetin: '',
    hamLink: '',
    gorseller: [],
  })
  // Dates far ahead are outside the shared window; use a near date too.
  const yarin = new Date(Date.now() + 86_400_000)
  const tarih = `${yarin.getFullYear()}-${String(yarin.getMonth() + 1).padStart(2, '0')}-${String(yarin.getDate()).padStart(2, '0')}`
  await kayitOlustur({
    kategori: 'etkinlik',
    baslik: 'Dişçi',
    tarih,
    saat: '10:00',
    konum: null,
    oncelik: 'orta',
    sure: 60,
    ozetNot: null,
    mekanOnerisi: null,
    yakinOneriler: null,
    kaynakTipi: 'metin',
    hamBaslik: '',
    hamMetin: '',
    hamLink: '',
    gorseller: [],
  })
  await olarak(ayse, () => musaitligiSenkronla(ayse.motor.benimId, true))
  await esitle(ali)
  const bloklar = await olarak(ali, () => arkadasMusaitligi(ayse.motor.benimId, tarih, tarih))
  assert.deepEqual(
    bloklar.map((b) => [b.tarih, b.baslangic, b.bitis]),
    [[tarih, '10:00', '11:00']],
  )
  assert.ok(!JSON.stringify(bloklar).includes('Dişçi'))
})

test('busy ranges: untimed and done plans are skipped, late plans spill into the next day', () => {
  const bugun = new Date(2026, 9, 18, 12)
  const kayit = (k: Partial<Kayit>) => ({ id: k.baslik, durum: 'bekliyor', tarih: '2026-10-20', saat: null, sure: null, ...k }) as Kayit
  const bloklar = bloklariCikar(
    [
      kayit({ baslik: 'parti', saat: '22:00', sure: 240 }),
      kayit({ baslik: 'kahve', saat: '10:00' }),
      kayit({ baslik: 'saatsiz' }),
      kayit({ baslik: 'bitti', saat: '12:00', durum: 'yapildi' }),
      kayit({ baslik: 'ay sonu', tarih: '2026-10-31', saat: '23:30', sure: 60 }),
    ],
    bugun,
  )
  assert.deepEqual(
    bloklar.map((b) => `${b.yerel_kayit_id} ${b.tarih} ${b.baslangic}-${b.bitis}`),
    [
      'parti 2026-10-20 22:00-23:59',
      'parti 2026-10-21 00:00-02:00',
      'kahve 2026-10-20 10:00-11:00',
      'ay sonu 2026-10-31 23:30-23:59',
      'ay sonu 2026-11-01 00:00-00:30',
    ],
  )
})

test('busy ranges: an all-day plan fills its day, and only with a date', () => {
  const bugun = new Date(2026, 9, 18, 12)
  const kayit = (k: Partial<Kayit>) => ({ id: k.baslik, durum: 'bekliyor', tarih: '2026-10-22', saat: null, sure: null, ...k }) as Kayit
  const bloklar = bloklariCikar(
    [
      kayit({ baslik: 'kamp', tumGun: true }),
      kayit({ baslik: 'tarihsiz', tarih: null, tumGun: true }),
      kayit({ baslik: 'bitti', tumGun: true, durum: 'yapildi' }),
    ],
    bugun,
  )
  assert.deepEqual(
    bloklar.map((b) => `${b.yerel_kayit_id} ${b.tarih} ${b.baslangic}-${b.bitis}`),
    ['kamp 2026-10-22 00:00-23:59'],
  )
})

test('direct messages, unread counts and read receipts', async () => {
  await olarak(ali, () => direktMesajGonder(ayse.motor.benimId, 'Selam!'))
  await esitle(ayse)
  const mesajlar = await olarak(ayse, () => direktMesajlariGetir(ali.motor.benimId))
  assert.deepEqual(mesajlar.map((m) => [m.metin, m.okundu]), [['Selam!', false]])
  assert.equal(await olarak(ayse, () => okunmamisMesajSayisi()), 1)

  await olarak(ayse, () => okunduIsaretle(ali.motor.benimId))
  assert.equal(await olarak(ayse, () => okunmamisMesajSayisi()), 0)
  await esitle(ali)
  const aliGorur = await olarak(ali, () => direktMesajlariGetir(ayse.motor.benimId))
  assert.equal(aliGorur[0]?.okundu, true)

  const sohbetler = await olarak(ali, () => sohbetleriGetir())
  assert.equal(sohbetler[0]?.ad, 'Ayşe')
  assert.equal(sohbetler[0]?.sonMesaj, 'Selam!')
})

test('plan invites and answers', async () => {
  const davetId = await olarak(ali, () =>
    davetGonder({ alanId: ayse.motor.benimId, baslik: 'Kahve', tarih: '2099-02-01', saat: '15:00', sure: 60 }),
  )
  await esitle(ayse)
  const { gelen } = await olarak(ayse, () => davetleriGetir())
  assert.deepEqual(gelen.map((d) => [d.id, d.baslik, d.durum]), [[davetId, 'Kahve', 'bekliyor']])
  assert.equal(await olarak(ayse, () => bekleyenSayisi()), 1)

  await olarak(ayse, () => davetYanitla(davetId, true))
  await esitle(ali)
  const { giden } = await olarak(ali, () => davetleriGetir())
  assert.equal(giden[0]?.durum, 'kabul')

  await assert.rejects(
    olarak(can, () => davetGonder({ alanId: ayse.motor.benimId, baslik: 'X', tarih: '2099-02-01' })),
    /arkadaş olmanız/,
  )

  // An all-day invite arrives without a time, whatever was filled in.
  const kampId = await olarak(ali, () =>
    davetGonder({ alanId: ayse.motor.benimId, baslik: 'Kamp', tarih: '2099-02-07', saat: '10:00', sure: 60, tumGun: true }),
  )
  await esitle(ayse)
  const kamp = (await olarak(ayse, () => davetleriGetir())).gelen.find((d) => d.id === kampId)
  assert.deepEqual([kamp?.tum_gun, kamp?.saat, kamp?.sure], [true, null, null])
  assert.equal((await olarak(ayse, () => davetleriGetir())).gelen.find((d) => d.id === davetId)?.tum_gun, false)
})

test('groups: join through a friend, plans, answers, chat, member availability', async () => {
  const grupId = await olarak(ali, () => grupOlustur('Ekip', [ayse.motor.benimId, can.motor.benimId], { emoji: '🎉' }))
  await esitle(ayse, can, ali)

  for (const kisi of [ayse, can]) {
    const gruplar = await olarak(kisi, () => gruplarimiGetir())
    assert.deepEqual(gruplar.map((g) => [g.id, g.ad, g.emoji]), [[grupId, 'Ekip', '🎉']])
  }
  const uyeler = await olarak(can, () => grupUyeleriGetir(grupId))
  assert.deepEqual(uyeler.map((u) => u.profil?.ad).sort(), ['Ali', 'Ayşe', 'Can'])
  // Can isn't Ayşe's friend but sees her busy ranges through the group.
  assert.equal(uyeler.find((u) => u.kullanici_id === ayse.motor.benimId)?.profil?.musaitlik_paylas, true)

  const planId = await olarak(ali, () => grupPlaniOlustur({ grupId, baslik: 'Piknik', tarih: '2099-03-01', saat: '12:00' }))
  const festivalId = await olarak(ali, () =>
    grupPlaniOlustur({ grupId, baslik: 'Festival', tarih: '2099-03-02', saat: '09:00', tumGun: true }),
  )
  await olarak(ali, () => mesajGonder(grupId, 'Yeni plan', planId))
  await esitle(ayse)
  await olarak(ayse, () => planaYanitVer(planId, 'geliyorum'))
  await olarak(ayse, () => mesajGonder(grupId, 'Ben de varım'))
  const grupPlanlari = await olarak(ayse, () => grupPlanlariGetir(grupId))
  assert.deepEqual(
    grupPlanlari.map((p) => [p.id, p.saat, p.tum_gun]),
    [
      [planId, '12:00', false],
      [festivalId, null, true],
    ],
  )
  await esitle(ali)
  const yanitlar = await olarak(ali, () => planYanitlariGetir([planId]))
  assert.deepEqual(yanitlar.map((y) => [y.kullanici_id, y.durum]), [[ayse.motor.benimId, 'geliyorum']])
  const mesajlar = await olarak(ali, () => mesajlariGetir(grupId))
  assert.deepEqual(mesajlar.map((m) => [m.metin, m.plan_id]), [
    ['Yeni plan', planId],
    ['Ben de varım', null],
  ])

  await olarak(can, () => gruptanAyril(grupId, can.motor.benimId))
  await esitle(can, ali)
  assert.equal((await olarak(can, () => gruplarimiGetir())).length, 0)
  assert.deepEqual((await olarak(ali, () => grupUyeleriGetir(grupId))).map((u) => u.profil?.ad).sort(), ['Ali', 'Ayşe'])
})

test('unfriending ends the friendship and rotates the broadcast key', async () => {
  assert.equal((await olarak(ayse, () => arkadaslariGetir())).length, 1)
  const eskiAnahtar = await olarak(ayse, () => benimYayinAnahtarim())
  await olarak(ayse, () => arkadasliktanCik(ali.motor.benimId))
  await esitle(ali, ayse)
  assert.equal((await olarak(ali, () => arkadaslariGetir())).filter((a) => a.profil.id === ayse.motor.benimId).length, 0)
  assert.equal((await olarak(ayse, () => arkadaslariGetir())).length, 0)

  const yeniAnahtar = await olarak(ayse, () => benimYayinAnahtarim())
  assert.ok(yeniAnahtar && yeniAnahtar !== eskiAnahtar)
  // The old channel is emptied, so Ali can't follow her anymore.
  const eskiKanal = await yayinKanaliAl(eskiAnahtar!, ayse.motor.benimId)
  const eskiProfil = await ali.motor.kanalSorgula(eskiKanal)
  assert.equal(eskiProfil.length, 0)

  // A rejected request stays hidden on both sides.
  await olarak(ayse, () => arkadaslikIsteGonder(ali.motor.benimId, null))
  await esitle(ali)
  await olarak(ali, () => arkadaslikYanitla(ayse.motor.benimId, false))
  await esitle(ayse, ali)
  assert.equal((await olarak(ayse, () => arkadaslariGetir())).length, 0)
  assert.equal((await olarak(ali, () => arkadaslariGetir())).filter((a) => a.profil.id === ayse.motor.benimId).length, 0)
})

test('password sign-in and restoring an account on a new device', async () => {
  const sk = await sifreyleGiris('ali', 'gizli-sifre-1', [relay.url])
  assert.deepEqual(sk, ali.sk)
  await assert.rejects(sifreyleGiris('ali', 'yanlis-sifre', [relay.url]), /hatalı/)
  await assert.rejects(sifreyleGiris('kimse', 'gizli-sifre-1', [relay.url]), /bulunamadı/)

  const yeniCihaz = kisiOlustur('ali-2', sk)
  await esitle(yeniCihaz)
  assert.equal((await olarak(yeniCihaz, () => profilimiGetir()))?.ad, 'Ali')
  const arkadaslar = await olarak(yeniCihaz, () => arkadaslariGetir())
  assert.deepEqual(arkadaslar.map((a) => [a.profil.ad, a.durum]), [['Can', 'kabul']])
  assert.equal((await olarak(yeniCihaz, () => gruplarimiGetir()))[0]?.ad, 'Ekip')
})
