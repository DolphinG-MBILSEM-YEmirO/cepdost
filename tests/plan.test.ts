// Tests for a plan's own details: the checklist, the countdown and the
// reminder (in the app and as a calendar alarm).
//
//   npm test

import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Kayit } from '../src/db'
import {
  YAPILACAK_AZAMI,
  geriSayim,
  hatirlatmaEtiketi,
  hatirlatmaOku,
  hatirlatmaSecenekleri,
  hatirlatmaZamani,
  icsTetikleyici,
  maddeEkle,
  maddeyiIsaretle,
  maddeyiSil,
  planBitisi,
  yaklasanHatirlatmalar,
  yapilacaklariOku,
} from '../src/lib/planAyrintilari'
import { planIcsOlustur, planiYerelEtkinligeCevir } from '../src/takvim'

// Local time, like the app: plans are stored as local dates and times.
const an = (tarih: string, saat: string) => new Date(`${tarih}T${saat}:00`)

function plan(ek: Partial<Kayit> = {}): Kayit {
  return {
    id: `p-${Math.random()}`, kategori: 'etkinlik', baslik: 'Konser', tarih: '2099-05-10', saat: '20:00', konum: null,
    oncelik: 'orta', sure: 90, ozetNot: null, mekanOnerisi: null, yakinOneriler: null, kaynakTipi: 'metin',
    hamBaslik: '', hamMetin: '', hamLink: '', gorseller: [], durum: 'bekliyor', olusturulmaTarihi: 0, ...ek,
  }
}

test('checklist: add, tick, delete, and limits', () => {
  let liste = maddeEkle([], '  Bilet al  ')
  liste = maddeEkle(liste, 'Ulaşım')
  liste = maddeEkle(liste, '   ')
  assert.deepEqual(liste.map((m) => [m.metin, m.tamam]), [['Bilet al', false], ['Ulaşım', false]])
  assert.notEqual(liste[0].id, liste[1].id)

  liste = maddeyiIsaretle(liste, liste[0].id)
  assert.deepEqual(liste.map((m) => m.tamam), [true, false])
  liste = maddeyiIsaretle(liste, liste[0].id)
  assert.equal(liste[0].tamam, false)
  assert.deepEqual(maddeyiSil(liste, liste[0].id).map((m) => m.metin), ['Ulaşım'])

  assert.equal(maddeEkle([], 'x'.repeat(500))[0].metin.length, 120)
  let dolu = maddeEkle([], 'ilk')
  for (let i = 0; i < 40; i++) dolu = maddeEkle(dolu, `madde ${i}`)
  assert.equal(dolu.length, YAPILACAK_AZAMI)
})

test('checklist from another device: broken entries are dropped', () => {
  assert.deepEqual(yapilacaklariOku('liste değil'), [])
  const okunan = yapilacaklariOku([
    { id: 'a', metin: ' Bilet ', tamam: true },
    { id: 'a', metin: 'aynı id', tamam: false },
    { id: '', metin: 'idsiz' },
    { id: 'b', metin: '' },
    { id: 'c', metin: 42 },
    null,
    { id: 'd', metin: 'Su', tamam: 'evet' },
    { id: 'x'.repeat(41), metin: 'uzun id' },
  ])
  assert.deepEqual(okunan, [
    { id: 'a', metin: 'Bilet', tamam: true },
    { id: 'd', metin: 'Su', tamam: false },
  ])
})

test('countdown: timed plans', () => {
  const p = plan({ tarih: '2099-05-10', saat: '20:00', sure: 90 })
  assert.deepEqual(geriSayim(p, an('2099-05-10', '19:15')), { metin: '45 dk sonra başlıyor', durum: 'yakin' })
  assert.deepEqual(geriSayim(p, an('2099-05-10', '18:30')), { metin: '1 sa 30 dk sonra başlıyor', durum: 'yakin' })
  assert.deepEqual(geriSayim(p, an('2099-05-10', '12:00')), { metin: '8 sa sonra', durum: 'gelecek' })
  assert.deepEqual(geriSayim(p, an('2099-05-10', '20:30')), { metin: 'Şu an sürüyor', durum: 'suruyor' })
  assert.deepEqual(geriSayim(p, an('2099-05-10', '21:45')), { metin: 'Bugün bitti', durum: 'gecti' })
  assert.deepEqual(geriSayim(p, an('2099-05-09', '10:00')), { metin: 'Yarın 20:00', durum: 'gelecek' })
  assert.deepEqual(geriSayim(p, an('2099-05-07', '10:00')), { metin: '3 gün sonra', durum: 'gelecek' })
  assert.deepEqual(geriSayim(p, an('2099-05-03', '10:00')), { metin: 'Haftaya', durum: 'gelecek' })
  assert.deepEqual(geriSayim(p, an('2099-04-20', '10:00')), { metin: '3 hafta sonra', durum: 'gelecek' })
  assert.deepEqual(geriSayim(p, an('2099-02-10', '10:00')), { metin: '3 ay sonra', durum: 'gelecek' })
  assert.deepEqual(geriSayim(p, an('2097-05-01', '10:00')), { metin: '2 yıl sonra', durum: 'gelecek' })
  assert.deepEqual(geriSayim(p, an('2099-05-11', '10:00')), { metin: 'Dün', durum: 'gecti' })
  assert.deepEqual(geriSayim(p, an('2099-05-14', '10:00')), { metin: '4 gün önce', durum: 'gecti' })
  assert.equal(geriSayim(plan({ tarih: null }), new Date()), null)
})

test('countdown: plans without a time, and all-day plans', () => {
  const saatsiz = plan({ saat: null, sure: null })
  assert.deepEqual(geriSayim(saatsiz, an('2099-05-10', '08:00')), { metin: 'Bugün', durum: 'yakin' })
  assert.deepEqual(geriSayim(saatsiz, an('2099-05-09', '23:00')), { metin: 'Yarın', durum: 'gelecek' })
  assert.deepEqual(geriSayim(saatsiz, an('2099-05-11', '00:30')), { metin: 'Dün', durum: 'gecti' })
  const tumGun = plan({ saat: '10:00', tumGun: true })
  assert.deepEqual(geriSayim(tumGun, an('2099-05-10', '15:00')), { metin: 'Bugün, tüm gün', durum: 'suruyor' })
  // An all-day plan ends at midnight, whatever time was left on it.
  assert.deepEqual(planBitisi(tumGun), an('2099-05-11', '00:00'))
  // A timed plan without a length counts as an hour.
  assert.deepEqual(planBitisi(plan({ sure: null })), an('2099-05-10', '21:00'))
})

test('reminder: choices, label and moment', () => {
  const saatli = plan({ hatirlatma: 60 })
  assert.deepEqual(hatirlatmaSecenekleri(saatli).map((s) => s.dk), [0, 15, 60, 1440])
  assert.equal(hatirlatmaEtiketi(saatli), '1 saat önce')
  assert.deepEqual(hatirlatmaZamani(saatli), an('2099-05-10', '19:00'))
  assert.equal(hatirlatmaEtiketi(plan({ hatirlatma: 90 })), '1 sa 30 dk önce')
  assert.equal(hatirlatmaEtiketi(plan({ hatirlatma: null })), null)

  // Without a clock time the plan "starts" at 09:00.
  const saatsiz = plan({ saat: null, hatirlatma: 1440 })
  assert.deepEqual(hatirlatmaSecenekleri(saatsiz).map((s) => s.etiket), ['O gün 09:00', 'Bir gün önce 09:00'])
  assert.deepEqual(hatirlatmaZamani(saatsiz), an('2099-05-09', '09:00'))

  for (const kotu of [-1, 1.5, 10_081, '60', null, undefined]) assert.equal(hatirlatmaOku(kotu), null)
  assert.equal(hatirlatmaOku(0), 0)
  assert.equal(hatirlatmaOku(1440), 1440)
})

test('reminders due soon: only pending plans, inside the window, keyed by time', () => {
  const simdi = an('2099-05-10', '19:00').getTime()
  const yakin = plan({ baslik: 'Yakın', saat: '19:30', hatirlatma: 15 })
  const kacirilan = plan({ baslik: 'Az önce', saat: '19:10', hatirlatma: 15 })
  const eski = plan({ baslik: 'Eski', saat: '18:00', hatirlatma: 15 })
  const uzak = plan({ baslik: 'Uzak', tarih: '2099-05-20', hatirlatma: 15 })
  const yapildi = plan({ baslik: 'Yapıldı', saat: '19:30', hatirlatma: 15, durum: 'yapildi' })
  const kapali = plan({ baslik: 'Kapalı', saat: '19:30' })
  const liste = yaklasanHatirlatmalar([yakin, kacirilan, eski, uzak, yapildi, kapali], simdi, 15 * 60_000, 24 * 60 * 60_000)
  assert.deepEqual(liste.map((h) => h.kayit.baslik), ['Az önce', 'Yakın'])
  // Moving the plan gives the reminder a new key, so it reminds again.
  const tasindi = yaklasanHatirlatmalar([{ ...yakin, saat: '19:45' }], simdi, 0, 24 * 60 * 60_000)
  assert.notEqual(tasindi[0].anahtar, liste[1].anahtar)
})

test('calendar file: the reminder becomes an alarm, the plan keeps one id', () => {
  const zamanli = planIcsOlustur({ baslik: 'Konser', tarih: '2099-05-10', saat: '20:00', sure: 90, uid: 'abc', hatirlatmaDk: 60 })
  assert.match(zamanli, /UID:abc@cepdost/)
  assert.match(zamanli, /BEGIN:VALARM\r?\nACTION:DISPLAY\r?\nDESCRIPTION:Konser\r?\nTRIGGER:-PT60M\r?\nEND:VALARM\r?\nEND:VEVENT/)

  // A date-only plan starts at midnight: 09:00 that day is 9 hours after.
  const saatsiz = planIcsOlustur({ baslik: 'Doğum günü', tarih: '2099-05-10', hatirlatmaDk: 0 })
  assert.match(saatsiz, /TRIGGER:PT540M/)
  assert.equal(icsTetikleyici({ tarih: '2099-05-10', saat: null, sure: null }, 1440), 'TRIGGER:-PT900M')

  assert.doesNotMatch(planIcsOlustur({ baslik: 'Alarmsız', tarih: '2099-05-10', saat: '20:00' }), /VALARM/)
})

test("phone calendar in the store app: same times and alarm as the calendar file", () => {
  const zamanli = planiYerelEtkinligeCevir({ baslik: 'Konser', tarih: '2099-05-10', saat: '23:30', sure: 90, konum: 'Harbiye', hatirlatmaDk: 60 })
  assert.equal(zamanli.title, 'Konser')
  assert.equal(zamanli.location, 'Harbiye')
  assert.equal(zamanli.allDay, false)
  assert.equal(zamanli.start, new Date('2099-05-10T23:30:00').getTime())
  // Runs past midnight into the next day.
  assert.equal(zamanli.end, new Date('2099-05-11T01:00:00').getTime())
  assert.equal(zamanli.alarmMinutes, 60)
  assert.equal('notes' in zamanli, false)

  // No duration: one hour. No time: all day, midnight to midnight, and the
  // alarm counts from 09:00 like the .ics one.
  const saatsiz = planiYerelEtkinligeCevir({ baslik: 'Doğum günü', tarih: '2099-05-10', notlar: 'Pasta', hatirlatmaDk: 0 })
  assert.equal(saatsiz.allDay, true)
  assert.equal(saatsiz.start, new Date('2099-05-10T00:00:00').getTime())
  assert.equal(saatsiz.end, new Date('2099-05-11T00:00:00').getTime())
  assert.equal(saatsiz.alarmMinutes, -540)
  assert.equal(saatsiz.notes, 'Pasta')

  const tekSaat = planiYerelEtkinligeCevir({ baslik: 'Kahve', tarih: '2099-05-10', saat: '10:00' })
  assert.equal(tekSaat.end - tekSaat.start, 60 * 60_000)
  assert.equal('alarmMinutes' in tekSaat, false)
})
