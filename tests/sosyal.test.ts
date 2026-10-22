// End-to-end test of the social layer against a local relay: accounts,
// friend requests, profiles, availability, chat, invites, groups, unfriend
// with key rotation, password sign-in, restoring on a new device, plan links
// (Sharloop's own and Davet invites), message actions (reply, react, edit,
// delete, pin, star, forward) and email verification.
//
//   npm test

import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { after, before, mock, test } from 'node:test'
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent, type Event } from 'nostr-tools/pure'
// @ts-expect-error plain JS dev tool without types
import { startRelay } from '../scripts/relay.mjs'
import { SosyalMotor } from '../src/sosyal/nostr/motor'
import { ONAY_TURU } from '../shared/epostaOnayi'
import { epostayiKaydet } from '../src/sosyal/eposta'
import { epostaImzacisiniAyarla } from '../src/sosyal/epostaImzacisi'
import {
  arkadasKodu,
  benimYayinAnahtarim,
  etkinMotoruAyarla,
  kanalDurumu,
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
  direktMesajlariDinle,
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
  grupOkunduIsaretle,
  grupOkunmamisSayisi,
  gruptanAyril,
  mesajGonder,
  mesajlariGetir,
  planaYanitVer,
  planYanitlariGetir,
  anilariGetir,
  type Ani,
} from '../src/sosyal/gruplar'
import { bloklariCikar, musaitligiSenkronla } from '../src/sosyal/musaitlikSenkron'
import { CepDostDB, db, kayitOlustur, type Kayit } from '../src/db'
import { planlariEsitle } from '../src/sosyal/planEsitleme'
import { planKatilimi, yanitsizlar } from '../src/sosyal/planKatilimi'
import { getirEkle, getirListesi, getirSil, getiriUstlen } from '../src/sosyal/getirListesi'
import { arkadasPlandaMi } from '../src/sosyal/ortakGecmis'
import {
  aniEtkilesimleri,
  aniYorumunuSil,
  aniyaTepkiVer,
  aniyaYorumYap,
  gitmekIstiyorum,
} from '../src/sosyal/aniEtkilesimi'
import { TUR } from '../src/sosyal/cekirdek'
import { linkKanali } from '../src/sosyal/nostr/kanal'
import { aesAnahtari, base64UrldenBayt, hexe, hmac, jsonCoz, jsonSifrele } from '../src/sosyal/nostr/kodlama'
import type { NostrOlayi } from '../src/sosyal/nostr/role'
import {
  benimLinkim,
  linkeYanitVer,
  linkiCoz,
  linkiOku,
  linkPlaniniGuncelle,
  linkPlaniniIptalEt,
  planiLinklePaylas,
  sharloopKaynagi,
} from '../src/sosyal/planLinki'
import { DAVET_ADRESI, benimDavetim, davetKaynagi, davetLinkiCoz, planiDavetlePaylas } from '../src/sosyal/davet'
import { anidanPlan, linkKaydi, linkPlaniniYanitla, planiGuncelle, planiSil } from '../src/lib/planPaylasimi'
import { adresimiKaydet, adresimiSil, bildir, bildirimGondericisiniAyarla } from '../src/sosyal/bildirimler'
import {
  bendenSil,
  herkestenSil,
  mesajBilgisi,
  mesajiDuzenle,
  mesajiIlet,
  sabitle,
  sabitMesajId,
  tepkiVer,
  yildizla,
  type SohbetHedefi,
} from '../src/sosyal/mesajIslemleri'
import type { BildirimIcerigi, BildirimTuru, Gonderim, WebPushAdresi } from '../shared/bildirim'

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
  // Email verification is off until its own test turns it on.
  epostaImzacisiniAyarla(null)
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

test("a plan's page shows who is coming, from the group's answers or the invites behind it", async () => {
  const kayit = (baslik: string, ek: Partial<Kayit>) => plan(baslik, { tarih: '2099-06-01', saat: '18:00', ...ek })

  // A group plan: every member, by their answer; only the one who set it
  // up can nudge.
  const grupId = await olarak(ali, () => grupOlustur('Bowling ekibi', [ayse.motor.benimId, can.motor.benimId]))
  await esitle(ayse, can, ali)
  const planId = await olarak(ali, () => grupPlaniOlustur({ grupId, baslik: 'Bowling', tarih: '2099-06-01', saat: '18:00' }))
  await olarak(ali, () => planaYanitVer(planId, 'geliyorum'))
  await esitle(ayse)
  await olarak(ayse, () => planaYanitVer(planId, 'belki'))
  await esitle(ali, ayse)
  const alininki = await olarak(ali, () => planKatilimi(kayit('Bowling', { grupPlanId: planId, grupId })))
  assert.deepEqual(
    alininki?.katilimcilar.map((k) => [k.ad, k.durum, k.sahip, k.ben]),
    [
      ['Ali', 'geliyor', true, true],
      ['Ayşe', 'belki', false, false],
      ['Can', 'bekliyor', false, false],
    ],
  )
  assert.deepEqual([alininki?.tur, alininki?.sohbet, alininki?.sahibiyim], ['grup', `grup:${grupId}`, true])
  assert.deepEqual(yanitsizlar(alininki!).map((k) => k.ad), ['Can'])
  const aysenin = await olarak(ayse, () => planKatilimi(kayit('Bowling', { grupPlanId: planId, grupId })))
  assert.equal(aysenin?.sahibiyim, false)

  // Invites I sent: me and each friend, found by the ids on the plan or,
  // for plans set up before those were kept, by title and day.
  const davetId = await olarak(ali, () => davetGonder({ alanId: ayse.motor.benimId, baslik: 'Kahve', tarih: '2099-06-02', saat: '10:00' }))
  const idIle = await olarak(ali, () => planKatilimi(kayit('Kahve', { tarih: '2099-06-02', gidenDavetler: [davetId] })))
  assert.deepEqual(idIle?.katilimcilar.map((k) => [k.ad, k.durum]), [['Ali', 'geliyor'], ['Ayşe', 'bekliyor']])
  assert.deepEqual([idIle?.tur, idIle?.sohbet, idIle?.sahibiyim], ['davet', `dm:${ayse.motor.benimId}`, true])
  const eslesen = await olarak(ali, () => planKatilimi(kayit('Kahve', { tarih: '2099-06-02' })))
  assert.deepEqual(eslesen?.katilimcilar.map((k) => k.ad), ['Ali', 'Ayşe'])
  assert.equal(await olarak(ali, () => planKatilimi(kayit('Yalnız', {}))), null)

  // The invite I accepted: the host and me.
  await esitle(ayse)
  await olarak(ayse, () => davetYanitla(davetId, true))
  await esitle(ali)
  const gelen = await olarak(ayse, () => planKatilimi(kayit('Kahve', { davetId })))
  assert.deepEqual(gelen?.katilimcilar.map((k) => [k.ad, k.durum, k.sahip]), [['Ali', 'geliyor', true], ['Ayşe', 'geliyor', false]])
  assert.deepEqual([gelen?.sohbet, gelen?.sahibiyim], [`dm:${ali.motor.benimId}`, false])
  assert.equal((await olarak(ali, () => planKatilimi(kayit('Kahve', { gidenDavetler: [davetId] }))))?.katilimcilar[1]?.durum, 'geliyor')
})

test("a group plan's bring list: anyone in the group adds, several can bring one thing, only the adder removes", async () => {
  const grupId = (await olarak(ali, () => gruplarimiGetir())).find((g) => g.ad === 'Bowling ekibi')!.id
  const planId = await olarak(ali, () => grupPlaniOlustur({ grupId, baslik: 'Piknik', tarih: '2099-06-10' }))
  const digerPlan = await olarak(ali, () => grupPlaniOlustur({ grupId, baslik: 'Başka', tarih: '2099-06-11' }))
  const buz = await olarak(ali, () => getirEkle(planId, '  Buz  '))
  await esitle(ayse)
  const hoparlor = await olarak(ayse, () => getirEkle(planId, 'Hoparlör'))
  await olarak(ayse, () => getiriUstlen(planId, buz, true))
  await esitle(ali)
  await olarak(ali, () => getiriUstlen(planId, buz, true))
  await esitle(ayse)
  const liste = (await olarak(ayse, () => getirListesi(planId))).map((m) => [m.metin, m.ekleyen, m.getirenler])
  assert.deepEqual(liste, [
    ['Buz', ali.motor.benimId, [ayse.motor.benimId, ali.motor.benimId]],
    ['Hoparlör', ayse.motor.benimId, []],
  ])

  // Taking it back, and removing: Ayşe's "remove" can't touch Ali's item.
  await olarak(ayse, () => getiriUstlen(planId, buz, false))
  await olarak(ayse, () => getirSil(planId, buz))
  await olarak(ayse, () => getirSil(planId, hoparlor))
  await esitle(ali)
  assert.deepEqual(
    (await olarak(ali, () => getirListesi(planId))).map((m) => [m.metin, m.getirenler]),
    [['Buz', [ali.motor.benimId]]],
  )

  // Each plan has its own list; an empty item is refused.
  assert.deepEqual(await olarak(ali, () => getirListesi(digerPlan)), [])
  await assert.rejects(olarak(ali, () => getirEkle(planId, '   ')), /yaz/)
  await assert.rejects(olarak(ali, () => getirListesi('olmayan-plan')), /bulunamadı/)
})

test("a friend's profile counts the plans we're both on", async () => {
  const grupId = (await olarak(ali, () => gruplarimiGetir())).find((g) => g.ad === 'Bowling ekibi')!.id
  // Ayşe is coming to one group plan and not to the other.
  const geliyor = await olarak(ali, () => grupPlaniOlustur({ grupId, baslik: 'Sinema', tarih: '2099-07-01' }))
  const gelmiyor = await olarak(ali, () => grupPlaniOlustur({ grupId, baslik: 'Koşu', tarih: '2099-07-02' }))
  await esitle(ayse)
  await olarak(ayse, () => planaYanitVer(geliyor, 'geliyorum'))
  await olarak(ayse, () => planaYanitVer(gelmiyor, 'gelmiyorum'))
  // Two invites from Ali: she takes one and turns down the other.
  const evet = await olarak(ali, () => davetGonder({ alanId: ayse.motor.benimId, baslik: 'Kahve', tarih: '2099-07-03' }))
  const hayir = await olarak(ali, () => davetGonder({ alanId: ayse.motor.benimId, baslik: 'Müze', tarih: '2099-07-04' }))
  await esitle(ayse)
  await olarak(ayse, () => davetYanitla(evet, true))
  await olarak(ayse, () => davetYanitla(hayir, false))
  await esitle(ali)

  const alininPlanlari = [
    plan('Sinema', { tarih: '2099-07-01', grupPlanId: geliyor, grupId }),
    plan('Koşu', { tarih: '2099-07-02', grupPlanId: gelmiyor, grupId }),
    plan('Kahve', { tarih: '2099-07-03', arkadasId: ayse.motor.benimId, gidenDavetler: [evet] }),
    plan('Müze', { tarih: '2099-07-04', arkadasId: ayse.motor.benimId, gidenDavetler: [hayir] }),
    // From before invites were kept on the plan.
    plan('Eski kahve', { tarih: '2099-06-20', arkadasId: ayse.motor.benimId }),
    plan('Yalnız', { tarih: '2099-07-05' }),
  ]
  const birlikte = await olarak(ali, () => arkadasPlandaMi(ayse.motor.benimId, alininPlanlari))
  assert.deepEqual(alininPlanlari.filter(birlikte).map((k) => k.baslik), ['Sinema', 'Kahve', 'Eski kahve'])
  const canla = await olarak(ali, () => arkadasPlandaMi(can.motor.benimId, alininPlanlari))
  assert.deepEqual(alininPlanlari.filter(canla).map((k) => k.baslik), [])
})

test('memories: friends react, say they want to go too, and comment; strangers on Keşfet cannot', async () => {
  // Ali shares a memory with Ayşe (its photo travels apart; left out here).
  await olarak(ali, async () => {
    const kanal = (await kanalDurumu()).cift.get(ayse.motor.benimId)!
    await ali.motor.yayinla(kanal, TUR.ani, 'ani:moda1', {
      mekan_adi: 'Moda Sahili', tarih: '2099-05-01', notlar: null, gorunurluk: 'arkadaslar', foto: null, zaman: Date.now(),
    })
  })
  await esitle(ayse)
  const bul = (liste: Ani[]) => liste.find((a) => a.id === 'moda1')!
  const aysedeki = bul(await olarak(ayse, () => anilariGetir({ arkadasId: ali.motor.benimId })))
  await olarak(ayse, () => aniyaTepkiVer(aysedeki, '❤️'))
  await olarak(ayse, () => gitmekIstiyorum(aysedeki, true))
  // A new emoji replaces the old one and keeps "I want to go".
  await olarak(ayse, () => aniyaTepkiVer(aysedeki, '🔥'))
  const yorum = await olarak(ayse, () => aniyaYorumYap(aysedeki, '  Çok güzel!  '))
  await assert.rejects(olarak(ayse, () => aniyaYorumYap(aysedeki, '   ')), /Bir şey yaz/)
  await assert.rejects(olarak(ayse, () => aniyaTepkiVer(aysedeki, '💩')), /kullanılamıyor/)
  await esitle(ali)
  const alideki = bul(await olarak(ali, () => anilariGetir({ arkadasId: ayse.motor.benimId })))
  await olarak(ali, () => aniyaYorumYap(alideki, 'Haftaya beraber gidelim'))
  await esitle(ayse)

  let e = (await olarak(ayse, () => aniEtkilesimleri([aysedeki]))).get('moda1')!
  assert.deepEqual(e.tepkiler, [{ kullanici_id: ayse.motor.benimId, emoji: '🔥' }])
  assert.deepEqual(e.gitmekIsteyenler, [ayse.motor.benimId])
  assert.deepEqual(
    e.yorumlar.map((y) => [y.yazar, y.metin]),
    [[ayse.motor.benimId, 'Çok güzel!'], [ali.motor.benimId, 'Haftaya beraber gidelim']],
  )

  // The same emoji again takes it back; she deletes her comment; then she
  // no longer wants to go either.
  await olarak(ayse, () => aniyaTepkiVer(aysedeki, '🔥'))
  await olarak(ayse, () => aniYorumunuSil(aysedeki, yorum.id))
  await esitle(ali)
  e = (await olarak(ali, () => aniEtkilesimleri([alideki]))).get('moda1')!
  assert.deepEqual([e.tepkiler, e.gitmekIsteyenler, e.yorumlar.map((y) => y.metin)], [[], [ayse.motor.benimId], ['Haftaya beraber gidelim']])
  await olarak(ayse, () => gitmekIstiyorum(aysedeki, false))
  await esitle(ali)
  assert.deepEqual((await olarak(ali, () => aniEtkilesimleri([alideki]))).get('moda1')?.gitmekIsteyenler, [])

  // Wanting to go puts the place in my calendar as an idea with no day,
  // once: asking again (any spelling) finds the same idea.
  const fikir = await anidanPlan('  Moda   Sahili ', 'Ali')
  assert.equal(fikir.yeni, true)
  assert.deepEqual(
    [fikir.kayit.baslik, fikir.kayit.konum, fikir.kayit.tarih, fikir.kayit.kategori, fikir.kayit.ozetNot],
    ['Moda Sahili', 'Moda Sahili', null, 'mekan', 'Ali buradan bir anı paylaştı.'],
  )
  const tekrar = await anidanPlan('moda sahili', null)
  assert.deepEqual([tekrar.yeni, tekrar.kayit.id], [false, fikir.kayit.id])
  await db.kayitlar.delete(fikir.kayit.id)

  // Keşfet copies (any channel other than a pair or a group) take no answers.
  const kesfetteki: Ani = { ...alideki, konu: 'kesfet-konusu' }
  await assert.rejects(olarak(ayse, () => aniyaYorumYap(kesfetteki, 'Selam')), /yalnızca/)
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
  assert.deepEqual((await olarak(yeniCihaz, () => gruplarimiGetir())).map((g) => g.ad).sort(), ['Bowling ekibi', 'Ekip'])
})

// ---------- plan sync between one account's devices ----------

interface Cihaz {
  kisi: Kisi
  db: CepDostDB
  depo: { oku(): string | null; yaz(d: string): void }
}

function cihaz(kisi: Kisi, ad: string): Cihaz {
  let deger: string | null = null
  return { kisi, db: new CepDostDB(`plan-${ad}-${Math.random()}`), depo: { oku: () => deger, yaz: (d) => void (deger = d) } }
}

async function esitlePlanlar(c: Cihaz) {
  await c.kisi.motor.esitle()
  return planlariEsitle(c.kisi.motor, c.db.kayitlar, c.depo)
}

function plan(baslik: string, ek: Partial<Kayit> = {}): Kayit {
  return {
    id: `${baslik}-${Math.random()}`, kategori: 'etkinlik', baslik, tarih: '2099-04-01', saat: '19:00', konum: null,
    oncelik: 'orta', sure: 60, ozetNot: null, mekanOnerisi: null, yakinOneriler: null, kaynakTipi: 'metin',
    hamBaslik: '', hamMetin: '', hamLink: '', gorseller: [], durum: 'bekliyor', olusturulmaTarihi: Date.now(), ...ek,
  }
}

test('plans follow the account to another device', async () => {
  const bilgisayar = cihaz(ali, 'pc')
  const telefon = cihaz(kisiOlustur('ali-tel', ali.sk), 'tel')

  // Writes are stamped, and an update always moves the stamp forward.
  const sinema = plan('Sinema', { gorseller: [{ name: 'bilet.png', type: 'image/png', blob: new Blob(['x']) }] })
  await bilgisayar.db.kayitlar.add(sinema)
  const ilk = (await bilgisayar.db.kayitlar.get(sinema.id))!.guncellenme!
  await bilgisayar.db.kayitlar.update(sinema.id, { guncellenme: ilk + 10_000 })
  await bilgisayar.db.kayitlar.update(sinema.id, { saat: '20:00' })
  assert.ok((await bilgisayar.db.kayitlar.get(sinema.id))!.guncellenme! > ilk + 10_000)

  // A device that never synced brings all of its plans to the account.
  assert.equal((await esitlePlanlar(bilgisayar)).gonderilen, 1)
  assert.equal((await esitlePlanlar(bilgisayar)).gonderilen, 0)
  assert.equal((await esitlePlanlar(telefon)).alinan, 1)
  const telefondaki = await telefon.db.kayitlar.get(sinema.id)
  assert.deepEqual([telefondaki?.baslik, telefondaki?.saat, telefondaki?.gorseller], ['Sinema', '20:00', []])

  // An edit on the phone reaches the computer; the photo stays there.
  await telefon.db.kayitlar.update(sinema.id, { baslik: 'Sinema (IMAX)', tumGun: false })
  assert.equal((await esitlePlanlar(telefon)).gonderilen, 1)
  assert.equal((await esitlePlanlar(bilgisayar)).alinan, 1)
  const bilgisayardaki = await bilgisayar.db.kayitlar.get(sinema.id)
  assert.equal(bilgisayardaki?.baslik, 'Sinema (IMAX)')
  assert.equal(bilgisayardaki?.gorseller.length, 1)
  // Applying it did not count as a new change on the computer.
  assert.equal((await esitlePlanlar(bilgisayar)).gonderilen, 0)

  // A deletion on the computer removes it from the phone.
  await bilgisayar.db.kayitlar.delete(sinema.id)
  assert.equal((await esitlePlanlar(bilgisayar)).gonderilen, 1)
  await esitlePlanlar(telefon)
  assert.equal(await telefon.db.kayitlar.get(sinema.id), undefined)
  assert.equal((await esitlePlanlar(bilgisayar)).gonderilen, 0)

  // After switching accounts, the plans already on a device stay out of
  // the new account until they change.
  const baskaHesap = cihaz(ali, 'baska')
  baskaHesap.depo.yaz(JSON.stringify({ hesap: 'baska-hesap', esik: 0, surumler: {} }))
  const eski = plan('Eski hesabın planı', { guncellenme: Date.now() - 60_000 })
  await baskaHesap.db.kayitlar.add(eski)
  const sonuc = await esitlePlanlar(baskaHesap)
  assert.equal(sonuc.gonderilen, 0)
  assert.equal(sonuc.alinan, 0)
  await baskaHesap.db.kayitlar.update(eski.id, { durum: 'yapildi' })
  assert.equal((await esitlePlanlar(baskaHesap)).gonderilen, 1)
  await esitlePlanlar(telefon)
  assert.equal((await telefon.db.kayitlar.get(eski.id))?.durum, 'yapildi')

  // Three weeks on, records that still matter are published again before
  // relays forget them: the plan and the recent deletion.
  const sonra = () => Date.now() + 22 * 24 * 60 * 60 * 1000
  assert.equal((await planlariEsitle(telefon.kisi.motor, telefon.db.kayitlar, telefon.depo, sonra)).gonderilen, 2)
  assert.equal((await esitlePlanlar(telefon)).gonderilen, 0)
})

test("a plan's checklist and reminder follow it to my other devices, cleaned on the way in", async () => {
  const pc = cihaz(ali, 'pc-liste')
  const tel = cihaz(kisiOlustur('ali-tel-liste', ali.sk), 'tel-liste')
  const hazirlik = plan('Hazırlık', { yapilacaklar: [{ id: 'a', metin: 'Bilet al', tamam: true }], hatirlatma: 60, gidenDavetler: ['d1'] })
  await pc.db.kayitlar.add(hazirlik)
  await esitlePlanlar(pc)
  await esitlePlanlar(tel)
  const gelen = await tel.db.kayitlar.get(hazirlik.id)
  assert.deepEqual(
    [gelen?.yapilacaklar, gelen?.hatirlatma, gelen?.gidenDavetler],
    [[{ id: 'a', metin: 'Bilet al', tamam: true }], 60, ['d1']],
  )

  // A broken copy from another device can't break the plan screen.
  await pc.db.kayitlar.update(hazirlik.id, { yapilacaklar: [{ id: 'b', metin: '' }, 'x'] as never, hatirlatma: -5 })
  await esitlePlanlar(pc)
  await esitlePlanlar(tel)
  const temiz = await tel.db.kayitlar.get(hazirlik.id)
  assert.deepEqual([temiz?.yapilacaklar, temiz?.hatirlatma], [[], null])
})

test('a shared plan added on two devices before they synced keeps one copy', async () => {
  const tablet = cihaz(kisiOlustur('ali-tablet', ali.sk), 'tablet')
  const saat = cihaz(kisiOlustur('ali-saat', ali.sk), 'saat')
  // Both accepted the same invite while apart.
  await tablet.db.kayitlar.add(plan('Konser', { id: 'konser-b', davetId: 'davet-konser' }))
  await saat.db.kayitlar.add(plan('Konser', { id: 'konser-a', davetId: 'davet-konser' }))
  await tablet.db.kayitlar.add(plan('Piknik', { id: 'piknik-b', grupPlanId: 'grup-piknik' }))
  await saat.db.kayitlar.add(plan('Piknik', { id: 'piknik-a', grupPlanId: 'grup-piknik' }))

  await esitlePlanlar(tablet)
  await esitlePlanlar(saat)
  await esitlePlanlar(tablet)

  for (const c of [tablet, saat]) {
    const kopyalar = (await c.db.kayitlar.toArray()).filter((k) => k.davetId === 'davet-konser' || k.grupPlanId === 'grup-piknik')
    assert.deepEqual(kopyalar.map((k) => k.id).sort(), ['konser-a', 'piknik-a'])
  }
  // Settled: nothing left to send either way.
  assert.equal((await esitlePlanlar(saat)).gonderilen, 0)
  assert.equal((await esitlePlanlar(tablet)).gonderilen, 0)
})

test('plan links: anyone with the link sees the plan and answers; only the host can change it', async () => {
  const kayit = await kayitOlustur({
    ...plan('Piknik'),
    konum: 'Maçka Parkı',
    ozetNot: 'Herkes bir şey getirsin',
  })
  const adres = await olarak(ali, () => planiLinklePaylas(kayit))
  const link = linkiCoz(adres.slice(adres.indexOf('#')))
  assert.ok(link)
  assert.equal(link.sahip, ali.motor.benimId)
  // Sharing again gives the same link.
  const kayitli = (await db.kayitlar.get(kayit.id))!
  assert.equal(kayitli.planLinki, link.anahtar)
  assert.equal(await olarak(ali, () => planiLinklePaylas(kayitli)), adres)
  assert.equal(linkiCoz('#plan=bozuk.link'), null)
  assert.equal(linkiCoz('#baska=1'), null)

  // Someone without an account opens the link and answers.
  const misafir = kisiOlustur('misafir')
  const gorulen = await linkiOku(misafir.motor, link)
  assert.equal(gorulen.plan?.baslik, 'Piknik')
  assert.equal(gorulen.plan?.konum, 'Maçka Parkı')
  assert.equal(gorulen.plan?.sahipAdi, 'Ali')
  assert.equal(gorulen.plan?.sahipKodu, arkadasKodu(ali.motor.benimId))
  assert.deepEqual(gorulen.katilimcilar, [])
  await assert.rejects(linkeYanitVer(misafir.motor, link, gorulen.plan!, '  ', 'geliyorum'), /Adını/)
  await linkeYanitVer(misafir.motor, link, gorulen.plan!, 'Zeynep', 'geliyorum')
  await linkeYanitVer(misafir.motor, link, gorulen.plan!, 'Zeynep', 'belki')

  // Someone else with the link can't replace the plan.
  const sahte = kisiOlustur('sahte')
  await sahte.motor.yayinla(await linkKanali(base64UrldenBayt(link.anahtar)), TUR.linkPlan, 'plan', {
    ...gorulen.plan,
    baslik: 'Sahte plan',
  })
  assert.equal((await linkiOku(misafir.motor, link)).plan?.baslik, 'Piknik')
  assert.equal((await linkiOku(misafir.motor, { ...link, sahip: sahte.motor.benimId })).plan?.baslik, 'Sahte plan')

  // A signed-in friend says they're coming: it lands in their calendar
  // once, and leaves it when they change their mind.
  await olarak(ayse, () => linkPlaniniYanitla(ayse.motor, sharloopKaynagi(link), gorulen.plan!, 'Ayşe', 'geliyorum'))
  await olarak(ayse, () => linkPlaniniYanitla(ayse.motor, sharloopKaynagi(link), gorulen.plan!, 'Ayşe', 'geliyorum'))
  const takvimde = await linkKaydi(link.anahtar)
  assert.equal(takvimde?.baslik, 'Piknik')
  assert.equal(await db.kayitlar.filter((k) => k.linkAnahtari === link.anahtar).count(), 1)

  // The host sees one answer per person (the latest), and not their own.
  const ev = await olarak(ali, () => linkiOku(ali.motor, benimLinkim(kayitli)!))
  assert.deepEqual(
    ev.katilimcilar.map((k) => [k.ad, k.yanit]).sort(),
    [['Ayşe', 'geliyorum'], ['Zeynep', 'belki']],
  )

  // The host moves it, then calls it off; the link follows.
  await olarak(ali, () => linkPlaniniGuncelle({ ...kayitli, saat: '20:30' }))
  assert.equal((await linkiOku(misafir.motor, link)).plan?.saat, '20:30')
  await olarak(ali, () => linkPlaniniIptalEt(kayitli))
  const iptal = await linkiOku(misafir.motor, link)
  assert.equal(iptal.plan?.iptal, true)
  assert.equal(iptal.katilimcilar.length, 2)

  await olarak(ayse, () => linkPlaniniYanitla(ayse.motor, sharloopKaynagi(link), iptal.plan!, 'Ayşe', 'gelemiyorum'))
  assert.equal(await linkKaydi(link.anahtar), undefined)
})

// Edits go out in the background: waits until the relay shows them.
async function olanaKadar(kosul: () => Promise<boolean>, mesaj: string) {
  for (let i = 0; i < 50; i++) {
    if (await kosul()) return
    await new Promise((r) => setTimeout(r, 50))
  }
  assert.fail(mesaj)
}

test('plan links as Davet invites: Davet reads them, its answers show in Sharloop and back', async () => {
  const kayit = await kayitOlustur({ ...plan('Kahvaltı', { emoji: '☕', saat: '10:00', sure: 90 }), konum: 'Moda' })
  const adres = await olarak(ali, () => planiDavetlePaylas(kayit))
  assert.ok(adres.startsWith(`${DAVET_ADRESI}#/e/`))
  const kimlik = adres.slice(adres.indexOf('#/e/') + 4)
  const link = davetLinkiCoz(`#davet=${kimlik}`)
  assert.ok(link)
  assert.equal(link.sahip, ali.motor.benimId)
  const kayitli = (await db.kayitlar.get(kayit.id))!
  assert.equal(kayitli.davetLinki, link.gizli)
  assert.equal(await olarak(ali, () => planiDavetlePaylas(kayitli)), adres, 'sharing again gives the same link')
  assert.equal(davetLinkiCoz('#davet=bozuk.link'), null)

  // What Davet reads: its own fields, plus Sharloop's.
  const sirdan = base64UrldenBayt(link.gizli)
  const konu = hexe(await hmac(sirdan, 'davet/topic'))
  const sifre = await aesAnahtari(await hmac(sirdan, 'davet/encryption'))
  const davetOlayi = (await can.motor.hamSorgula({ kinds: [30078], '#i': [konu] })).find((o) => o.pubkey === link.sahip)!
  assert.ok(verifyEvent(davetOlayi as Event))
  assert.deepEqual(davetOlayi.tags.find((t) => t[0] === 'd'), ['d', konu])
  const davet = (await jsonCoz(sifre, davetOlayi.content)) as Record<string, unknown>
  assert.equal(davet.title, 'Kahvaltı')
  assert.equal(davet.startsAt, '2099-04-01T10:00')
  assert.equal(davet.hostName, 'Ali')
  assert.equal(davet.theme, 'coffee')
  assert.equal(davet.emoji, '☕')
  assert.equal(davet.allDay, false)
  assert.equal(davet.durationMinutes, 90)
  assert.deepEqual(davet.sharloop, { kod: arkadasKodu(ali.motor.benimId), kullaniciAdi: 'ali' })

  // Someone answers in Davet, with a key Davet made for their browser.
  const davetMisafiri = generateSecretKey()
  const misafirYaniti = finalizeEvent(
    {
      kind: 30078,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['d', `${konu}:rsvp`], ['i', konu]],
      content: await jsonSifrele(sifre, { name: 'Zeynep', status: 'maybe', note: 'Geç kalabilirim' }),
    },
    davetMisafiri,
  )
  await can.motor.hamYayinla(misafirYaniti as NostrOlayi)

  // A Sharloop user opens it from Davet ("Sharloop'ta aç") and is coming:
  // it lands in their calendar, and the answer is in Davet's format.
  const kaynak = davetKaynagi(link)
  const gorulen = await olarak(ayse, () => kaynak.oku(ayse.motor))
  assert.equal(gorulen.plan?.baslik, 'Kahvaltı')
  assert.equal(gorulen.plan?.saat, '10:00')
  assert.equal(gorulen.plan?.sure, 90)
  assert.equal(gorulen.plan?.sahipKodu, arkadasKodu(ali.motor.benimId))
  assert.deepEqual(gorulen.katilimcilar.map((k) => [k.ad, k.yanit]), [['Zeynep', 'belki']])
  await olarak(ayse, () => linkPlaniniYanitla(ayse.motor, kaynak, gorulen.plan!, 'Ayşe', 'geliyorum'))
  assert.equal((await linkKaydi(link.gizli))?.baslik, 'Kahvaltı')
  const ayseninYaniti = (await can.motor.hamSorgula({ kinds: [30078], '#i': [konu], authors: [ayse.motor.benimId] }))[0]
  assert.deepEqual(await jsonCoz(sifre, ayseninYaniti.content), { name: 'Ayşe', status: 'going', note: '' })

  // The host sees both answers on the plan's page.
  const ev = await olarak(ali, () => davetKaynagi(benimDavetim(kayitli)!).oku(ali.motor))
  assert.deepEqual(ev.katilimcilar.map((k) => [k.ad, k.yanit]).sort(), [['Ayşe', 'geliyorum'], ['Zeynep', 'belki']])

  // Someone else with the link can't replace the invite.
  await can.motor.hamYayinla(
    finalizeEvent(
      { kind: 30078, created_at: Math.floor(Date.now() / 1000) + 30, tags: [['d', konu], ['i', konu]], content: await jsonSifrele(sifre, { ...davet, title: 'Sahte' }) },
      can.sk,
    ) as NostrOlayi,
  )
  assert.equal((await kaynak.oku(can.motor)).plan?.baslik, 'Kahvaltı')

  // Editing the plan moves the invite; an all-day plan has no time there.
  await olarak(ali, () => planiGuncelle(kayitli, { tumGun: true, saat: null }))
  await olanaKadar(async () => (await kaynak.oku(can.motor)).plan?.tum_gun === true, 'invite follows the edit')
  const tumGun = await kaynak.oku(can.motor)
  assert.equal(tumGun.plan?.saat, null)
  assert.equal(tumGun.plan?.sure, null)

  // Deleting the plan deletes the invite, the way Davet does it.
  await olarak(ali, () => planiSil({ ...kayitli, tumGun: true, saat: null }))
  await olanaKadar(async () => (await kaynak.oku(can.motor)).plan === null, 'invite deleted')
})

// ---------- push notifications ----------

// A browser's push subscription, with what the browser does on arrival.
async function testCihazi() {
  const anahtar = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveBits',
  ])) as CryptoKeyPair
  const acik = new Uint8Array(await crypto.subtle.exportKey('raw', anahtar.publicKey))
  const auth = crypto.getRandomValues(new Uint8Array(16))
  const endpoint = `https://fcm.googleapis.com/fcm/send/${Math.random().toString(36).slice(2)}`
  const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64url')
  const hkdf = async (tuz: Uint8Array, girdi: Uint8Array, bilgi: Uint8Array, boy: number) =>
    new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: tuz, info: bilgi },
        await crypto.subtle.importKey('raw', girdi, 'HKDF', false, ['deriveBits']),
        boy * 8,
      ),
    )
  const yazi = (m: string) => new TextEncoder().encode(m)
  return {
    endpoint,
    adres: (turler: BildirimTuru[]): WebPushAdresi => ({ tur: 'webpush', endpoint, p256dh: b64(acik), auth: b64(auth), turler }),
    // RFC 8291 decryption, as the receiving browser does it.
    async coz(g: Gonderim): Promise<Event & { icerik: BildirimIcerigi }> {
      assert.equal(g.endpoint, endpoint)
      const govde = new Uint8Array(Buffer.from(g.govde, 'base64url'))
      const tuz = govde.slice(0, 16)
      const gonderen = govde.slice(21, 21 + govde[20])
      const ortak = new Uint8Array(
        await crypto.subtle.deriveBits(
          {
            name: 'ECDH',
            public: await crypto.subtle.importKey('raw', gonderen, { name: 'ECDH', namedCurve: 'P-256' }, false, []),
          },
          anahtar.privateKey,
          256,
        ),
      )
      const ikm = await hkdf(auth, ortak, new Uint8Array([...yazi('WebPush: info\0'), ...acik, ...gonderen]), 32)
      const cek = await hkdf(tuz, ikm, yazi('Content-Encoding: aes128gcm\0'), 16)
      const nonce = await hkdf(tuz, ikm, yazi('Content-Encoding: nonce\0'), 12)
      const acikMetin = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: nonce },
          await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']),
          govde.slice(21 + govde[20]),
        ),
      )
      assert.equal(acikMetin.at(-1), 2)
      const olay = JSON.parse(new TextDecoder().decode(acikMetin.slice(0, -1))) as Event
      assert.ok(verifyEvent(olay))
      return { ...olay, icerik: JSON.parse(olay.content) as BildirimIcerigi }
    },
  }
}

async function olana(kosul: () => boolean, mesaj: string) {
  for (let i = 0; i < 100 && !kosul(); i++) await new Promise((r) => setTimeout(r, 30))
  assert.ok(kosul(), mesaj)
}

const icerik = (tur: BildirimTuru): BildirimIcerigi => ({ tur, baslik: 'Bora', govde: 'Selam', git: 'arkadaslar', etiket: 't' })

test('notifications reach a device through friends, groups and the directory, for the kinds it chose', async () => {
  const gonderilen: Gonderim[] = []
  bildirimGondericisiniAyarla(async (g) => void gonderilen.push(...g))
  try {
    const [bora, cem, dila] = ['bora', 'cem', 'dila'].map((ad) => kisiOlustur(ad))
    for (const k of [bora, cem, dila]) {
      await olarak(k, () => hesabiKur({ ad: k.ad, kullanici_adi: k.ad, gizlilik: 'arkadaslar' }))
    }
    await olarak(bora, async () => arkadaslikIsteGonder(cem.motor.benimId, await profilAra('@cem')))
    await esitle(cem)
    await olarak(cem, () => arkadaslikYanitla(bora.motor.benimId, true))
    await esitle(bora, cem)

    // Cem turns notifications on for messages, requests and groups.
    const cihaz = await testCihazi()
    await olarak(cem, () => adresimiKaydet(cihaz.adres(['mesaj', 'istek', 'grup'])))
    await esitle(cem, bora)

    // A friend finds it on Cem's broadcast channel; it arrives signed by them.
    assert.equal(await olarak(bora, () => bildir([cem.motor.benimId], icerik('mesaj'))), 1)
    const olay = await cihaz.coz(gonderilen.pop()!)
    assert.equal(olay.pubkey, bora.motor.benimId)
    assert.deepEqual(olay.icerik, icerik('mesaj'))
    // Kinds Cem turned off are skipped, and nobody notifies themselves.
    assert.equal(await olarak(bora, () => bildir([cem.motor.benimId], icerik('davet'))), 0)
    assert.equal(await olarak(cem, () => bildir([cem.motor.benimId], icerik('mesaj'))), 0)

    // A stranger finds it next to Cem's directory entry, and only there.
    assert.equal(await olarak(dila, () => bildir([cem.motor.benimId], icerik('mesaj'))), 0)
    assert.equal(await olarak(dila, () => bildir([cem.motor.benimId], icerik('istek'), { dizinden: true })), 1)
    assert.equal((await cihaz.coz(gonderilen.pop()!)).pubkey, dila.motor.benimId)

    // Sending a message notifies by itself (in the background).
    await olarak(bora, () => direktMesajGonder(cem.motor.benimId, 'Yarın akşam?'))
    await olana(() => gonderilen.length === 1, 'mesaj bildirimi gitti')
    const dm = await cihaz.coz(gonderilen.pop()!)
    assert.deepEqual([dm.icerik.tur, dm.icerik.baslik, dm.icerik.govde, dm.icerik.git], [
      'mesaj',
      'bora',
      'Yarın akşam?',
      `dm:${bora.motor.benimId}`,
    ])

    // Group members find it on the group's channel.
    const grupId = await olarak(bora, () => grupOlustur('Kulüp', [cem.motor.benimId]))
    await esitle(cem, bora)
    await olarak(bora, () => mesajGonder(grupId, 'Cuma toplanıyoruz'))
    await olana(() => gonderilen.length === 1, 'grup bildirimi gitti')
    const grup = await cihaz.coz(gonderilen.pop()!)
    assert.deepEqual([grup.icerik.baslik, grup.icerik.govde, grup.icerik.git], ['Kulüp', 'bora: Cuma toplanıyoruz', `grup:${grupId}`])

    // Turning the device off takes it out everywhere.
    await olarak(cem, () => adresimiSil(cihaz.endpoint))
    await esitle(cem, bora)
    assert.equal(await olarak(bora, () => bildir([cem.motor.benimId], icerik('mesaj'))), 0)
    assert.equal(await olarak(bora, () => bildir([cem.motor.benimId], icerik('grup'), { grupId })), 0)
  } finally {
    bildirimGondericisiniAyarla(null)
  }
})

test('message actions: reply, react, edit, delete, pin, star, forward and read info', async () => {
  const gonderilen: Gonderim[] = []
  bildirimGondericisiniAyarla(async (g) => void gonderilen.push(...g))
  try {
    const [eda, fil, gul] = ['eda', 'fil', 'gul'].map((ad) => kisiOlustur(ad))
    for (const k of [eda, fil, gul]) {
      await olarak(k, () => hesabiKur({ ad: k.ad, kullanici_adi: k.ad, gizlilik: 'arkadaslar' }))
    }
    for (const k of [fil, gul]) {
      await olarak(k, () => arkadaslikIsteGonder(eda.motor.benimId, null))
      await esitle(eda)
      await olarak(eda, () => arkadaslikYanitla(k.motor.benimId, true))
      await esitle(eda, k)
    }
    const filIle: SohbetHedefi = { tur: 'arkadas', id: fil.motor.benimId }
    const edaIle: SohbetHedefi = { tur: 'arkadas', id: eda.motor.benimId }
    const edaninMesajlari = () => olarak(fil, () => direktMesajlariGetir(eda.motor.benimId))

    // A reply carries a short copy of the message it answers.
    await olarak(eda, () => direktMesajGonder(fil.motor.benimId, 'Bu akşam sinema?'))
    await esitle(fil)
    const [soru] = await edaninMesajlari()
    await olarak(fil, () => direktMesajGonder(eda.motor.benimId, 'Olur!', null, { yanit: soru }))
    await esitle(eda)
    const [, cevap] = await olarak(eda, () => direktMesajlariGetir(fil.motor.benimId))
    assert.deepEqual(cevap?.yanit, { id: soru.id, gonderen_id: eda.motor.benimId, metin: 'Bu akşam sinema?' })

    // One reaction per person: a new emoji replaces it, the same one takes it back.
    await olarak(fil, () => tepkiVer(edaIle, soru, '👍'))
    await esitle(eda)
    assert.deepEqual((await olarak(eda, () => direktMesajlariGetir(fil.motor.benimId)))[0]?.tepkiler, [
      { kullanici_id: fil.motor.benimId, emoji: '👍' },
    ])
    await olarak(fil, () => tepkiVer(edaIle, soru, '❤️'))
    await esitle(eda)
    assert.deepEqual((await olarak(eda, () => direktMesajlariGetir(fil.motor.benimId)))[0]?.tepkiler.map((t) => t.emoji), ['❤️'])
    await olarak(fil, () => tepkiVer(edaIle, soru, '❤️'))
    await esitle(eda)
    assert.deepEqual((await olarak(eda, () => direktMesajlariGetir(fil.motor.benimId)))[0]?.tepkiler, [])

    // The author's phone hears about a reaction.
    const cihaz = await testCihazi()
    await olarak(eda, () => adresimiKaydet(cihaz.adres(['mesaj', 'grup'])))
    await esitle(eda, fil)
    await olarak(fil, () => tepkiVer(edaIle, soru, '😂'))
    await olana(() => gonderilen.length === 1, 'tepki bildirimi gitti')
    const tepkiBildirimi = await cihaz.coz(gonderilen.pop()!)
    assert.deepEqual([tepkiBildirimi.icerik.baslik, tepkiBildirimi.icerik.govde, tepkiBildirimi.icerik.git], [
      'fil',
      'Mesajına 😂 bıraktı: “Bu akşam sinema?”',
      `dm:${fil.motor.benimId}`,
    ])

    // Edits keep the message in its place; nobody else can edit it, and
    // a "new message" listener doesn't fire for them.
    const yeniGelenler: string[] = []
    const dinlemeyiBirak = olarak(fil, async () => direktMesajlariDinle(fil.motor.benimId, (m) => yeniGelenler.push(m.metin)))
    await olarak(eda, () => mesajiDuzenle(filIle, soru.id, 'Bu akşam sinemaya ne dersin?'))
    await esitle(fil)
    const [duzenlenen, ikinci] = await edaninMesajlari()
    assert.deepEqual([duzenlenen?.id, duzenlenen?.metin, !!duzenlenen?.duzenlendi, ikinci?.metin], [
      soru.id,
      'Bu akşam sinemaya ne dersin?',
      true,
      'Olur!',
    ])
    assert.deepEqual(yeniGelenler, [])
    await olarak(eda, () => direktMesajGonder(fil.motor.benimId, 'Saat 9 iyi mi?'))
    await esitle(fil)
    assert.deepEqual(yeniGelenler, ['Saat 9 iyi mi?'])
    ;(await dinlemeyiBirak)()
    await assert.rejects(olarak(fil, () => mesajiDuzenle(edaIle, soru.id, 'Sahte')), /bulunamadı/)
    const simdi = Date.now()
    mock.method(Date, 'now', () => simdi + 16 * 60 * 1000)
    try {
      await assert.rejects(olarak(eda, () => mesajiDuzenle(filIle, soru.id, 'Geç kaldım')), /15 dakika/)
    } finally {
      mock.restoreAll()
    }

    // Deleted for everyone: the place stays, the text is gone, and it
    // doesn't count as unread.
    await olarak(eda, () => direktMesajGonder(fil.motor.benimId, 'Yanlış kişiye yazdım'))
    await esitle(fil)
    const yanlis = (await edaninMesajlari()).at(-1)!
    await olarak(eda, () => herkestenSil(filIle, yanlis.id))
    await esitle(fil)
    const silinen = (await edaninMesajlari()).at(-1)!
    assert.deepEqual([silinen.id, silinen.silindi, silinen.metin], [yanlis.id, true, ''])
    await olarak(fil, () => okunduIsaretle(eda.motor.benimId))
    assert.equal(await olarak(fil, () => okunmamisMesajSayisi()), 0)
    const filinSohbetleri = await olarak(fil, () => sohbetleriGetir())
    assert.equal(filinSohbetleri.find((s) => s.id === eda.motor.benimId)?.sonMesaj, 'Bu mesaj silindi')
    // Plan cards are cancelled on the card, not deleted from the chat.
    await olarak(eda, () => direktMesajGonder(fil.motor.benimId, 'Plan', 'davet-kimligi'))
    const kartli = (await olarak(eda, () => direktMesajlariGetir(fil.motor.benimId))).at(-1)!
    await assert.rejects(olarak(eda, () => herkestenSil(filIle, kartli.id)), /Plan kartları/)

    // Read info for my message.
    await esitle(eda)
    assert.deepEqual(await olarak(eda, () => mesajBilgisi(filIle, soru)), { okuyanlar: [fil.motor.benimId], bekleyenler: [] })

    // Deleting for me hides it on my devices only.
    await olarak(fil, () => bendenSil(cevap!.id))
    assert.equal((await edaninMesajlari()).some((m) => m.id === cevap!.id), false)
    assert.equal((await olarak(eda, () => direktMesajlariGetir(fil.motor.benimId))).some((m) => m.id === cevap!.id), true)

    // Stars are mine; pins are shared, and the latest one wins.
    await olarak(eda, () => yildizla(soru.id, true))
    assert.equal((await olarak(eda, () => direktMesajlariGetir(fil.motor.benimId)))[0]?.yildizli, true)
    assert.equal((await edaninMesajlari())[0]?.yildizli, false)
    await olarak(eda, () => yildizla(soru.id, false))
    assert.equal((await olarak(eda, () => direktMesajlariGetir(fil.motor.benimId)))[0]?.yildizli, false)
    await olarak(fil, () => sabitle(edaIle, soru.id))
    await esitle(eda)
    assert.equal(await olarak(eda, () => sabitMesajId(filIle)), soru.id)
    await olarak(eda, () => sabitle(filIle, null))
    await esitle(fil)
    assert.equal(await olarak(fil, () => sabitMesajId(edaIle)), null)

    // Forwarding sends the text on to other chats, marked as forwarded.
    const grupId = await olarak(eda, () => grupOlustur('Sinema', [fil.motor.benimId, gul.motor.benimId]))
    await esitle(fil, gul, eda)
    const grupla: SohbetHedefi = { tur: 'grup', id: grupId }
    assert.equal(
      await olarak(eda, () => mesajiIlet('Olur!', [{ tur: 'arkadas', id: gul.motor.benimId }, grupla])),
      2,
    )
    await esitle(gul)
    const gulGorur = await olarak(gul, () => direktMesajlariGetir(eda.motor.benimId))
    assert.deepEqual(gulGorur.map((m) => [m.metin, m.iletildi]), [['Olur!', true]])
    const grupMesajlari = await olarak(gul, () => mesajlariGetir(grupId))
    assert.deepEqual(grupMesajlari.map((m) => [m.metin, m.iletildi]), [['Olur!', true]])

    // Group chats: reactions from members, deletions, unread counts, read info.
    gonderilen.length = 0
    await olarak(gul, () => tepkiVer(grupla, grupMesajlari[0], '🎉'))
    await olana(() => gonderilen.length === 1, 'grup tepki bildirimi gitti')
    assert.equal((await cihaz.coz(gonderilen.pop()!)).icerik.govde, 'gul mesajına 🎉 bıraktı: “Olur!”')
    await olarak(gul, () => mesajGonder(grupId, 'Saat kaçta?', null, { yanit: grupMesajlari[0] }))
    await esitle(eda, fil)
    const edaGrupta = await olarak(eda, () => mesajlariGetir(grupId))
    assert.deepEqual(edaGrupta[0]?.tepkiler, [{ kullanici_id: gul.motor.benimId, emoji: '🎉' }])
    assert.equal(edaGrupta[1]?.yanit?.id, grupMesajlari[0].id)
    assert.equal(await olarak(fil, () => grupOkunmamisSayisi(grupId)), 2)
    await olarak(gul, () => herkestenSil(grupla, edaGrupta[1]!.id))
    await esitle(fil)
    assert.equal(await olarak(fil, () => grupOkunmamisSayisi(grupId)), 1)
    await olarak(gul, () => grupOkunduIsaretle(grupId))
    await esitle(eda)
    assert.deepEqual(await olarak(eda, () => mesajBilgisi(grupla, edaGrupta[0]!)), {
      okuyanlar: [gul.motor.benimId],
      bekleyenler: [fil.motor.benimId],
    })
  } finally {
    mock.restoreAll()
    bildirimGondericisiniAyarla(null)
  }
})

test('email verification: strangers only see and hear from verified accounts', async () => {
  const sunucu = generateSecretKey()
  const onayVer = (pk: string) =>
    finalizeEvent(
      { kind: ONAY_TURU, created_at: Math.floor(Date.now() / 1000), tags: [['p', pk], ['ozet', pk.slice(0, 22)]], content: '' },
      sunucu,
    )
  epostaImzacisiniAyarla(getPublicKey(sunucu))
  try {
    const deniz = kisiOlustur('deniz')
    const ece = kisiOlustur('ece')
    const kur = (k: Kisi, onay?: ReturnType<typeof onayVer>) =>
      olarak(k, () => hesabiKur({ ad: k.ad, kullanici_adi: k.ad, gizlilik: 'herkes', eposta: `${k.ad}@example.com`, onay }))

    // Setup needs an attestation for this very account.
    await assert.rejects(kur(deniz), /e-posta/)
    await assert.rejects(kur(deniz, onayVer(ece.motor.benimId)), /e-posta/)
    await kur(deniz, onayVer(deniz.motor.benimId))

    // The address stays on my devices; friends get the attestation only.
    assert.equal((await olarak(deniz, () => profilimiGetir()))?.eposta, 'deniz@example.com')
    const yayin = await yayinKanaliAl((await olarak(deniz, () => benimYayinAnahtarim()))!, deniz.motor.benimId)
    const yayinKopyasi = (await deniz.motor.kayit(yayin, deniz.motor.benimId, 'profil'))?.veri as Record<string, unknown>
    assert.equal('eposta' in yayinKopyasi, false)
    assert.ok(yayinKopyasi.onay)

    // Search finds verified accounts only (ali, ayşe and can predate it).
    assert.equal((await olarak(ali, () => profilAra('@deniz')))?.id, deniz.motor.benimId)
    assert.equal(await olarak(deniz, () => profilAra('@ayse')), null)

    // A stranger's request waits until they verify; their next sync then
    // brings the attestation to it without sending it again.
    await olarak(can, () => arkadaslikIsteGonder(deniz.motor.benimId, null))
    await esitle(deniz)
    assert.equal(await olarak(deniz, () => bekleyenSayisi()), 0)
    await olarak(can, () => epostayiKaydet('can@example.com', onayVer(can.motor.benimId)))
    await esitle(can, deniz)
    assert.equal(await olarak(deniz, () => bekleyenSayisi()), 1)
    assert.equal((await olarak(deniz, () => profilAra('@can')))?.id, can.motor.benimId)

    // Someone I asked myself is never filtered.
    await olarak(deniz, () => arkadaslikIsteGonder(ali.motor.benimId, null))
    await esitle(ali)
    await olarak(ali, () => arkadaslikYanitla(deniz.motor.benimId, true))
    await esitle(deniz, ali)
    const denizIcin = await olarak(deniz, () => arkadaslariGetir())
    assert.equal(denizIcin.find((a) => a.profil.id === ali.motor.benimId)?.durum, 'kabul')
  } finally {
    epostaImzacisiniAyarla(null)
  }
})
