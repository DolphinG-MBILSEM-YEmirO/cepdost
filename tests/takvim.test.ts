// Tests for the calendar: the month grid, missed plans, where plans can be
// moved, and moving several at once with undo.
//
//   npm test
//
// Runs west of Greenwich, where reading a plan's day as UTC midnight puts
// it on the day before, and where clocks change on 2026-11-01.
process.env.TZ = 'America/Los_Angeles'

import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type Kayit, db } from '../src/db'
import { deDa, formatDate, isPast, isSameDay, isToday, localDateString, parseLocalDate } from '../src/lib/format'
import {
  ayIzgarasi,
  ertelemeSecenekleri,
  goreceGun,
  gunEkle,
  gunFarki,
  gunOzetleri,
  kacanPlanlar,
} from '../src/lib/takvimIzgarasi'
import { geriAl, islemMesaji, topluUygula } from '../src/lib/topluIslem'

function plan(ek: Partial<Kayit> = {}): Kayit {
  return {
    id: `p-${Math.random()}`, kategori: 'etkinlik', baslik: 'Konser', tarih: '2026-10-22', saat: null, konum: null,
    oncelik: 'orta', sure: null, ozetNot: null, mekanOnerisi: null, yakinOneriler: null, kaynakTipi: 'metin',
    hamBaslik: '', hamMetin: '', hamLink: '', gorseller: [], durum: 'bekliyor', olusturulmaTarihi: 0, ...ek,
  }
}

test("a plan's day is a local day, not UTC midnight", () => {
  assert.equal(new Date().getTimezoneOffset() > 0, true, 'the test runs west of Greenwich')
  const gun = parseLocalDate('2026-10-22')
  assert.deepEqual([gun.getFullYear(), gun.getMonth(), gun.getDate(), gun.getHours()], [2026, 9, 22, 0])
  assert.equal(isSameDay('2026-10-22', new Date(2026, 9, 22, 9)), true)
  assert.equal(isSameDay('2026-10-22', new Date(2026, 9, 21, 23)), false)
  const bugun = localDateString()
  assert.equal(isToday(bugun), true)
  assert.equal(isPast(bugun), false)
  assert.equal(isPast(gunEkle(bugun, -1)), true)
  assert.equal(formatDate(bugun), 'Bugün')
  assert.equal(formatDate(gunEkle(bugun, 1)), 'Yarın')
  // A full timestamp still reads as one.
  assert.equal(parseLocalDate('2026-10-22T10:00:00Z').getTime(), Date.UTC(2026, 9, 22, 10))
})

test('month grid: six Monday-first weeks', () => {
  const ekim = ayIzgarasi(2026, 9)
  assert.equal(ekim.length, 42)
  // 1 October 2026 is a Thursday: the grid opens on Monday 28 September.
  assert.deepEqual(ekim[0], { tarih: '2026-09-28', gun: 28, buAy: false })
  assert.deepEqual(ekim[3], { tarih: '2026-10-01', gun: 1, buAy: true })
  assert.equal(ekim.filter((g) => g.buAy).length, 31)
  assert.equal(ekim[41].tarih, '2026-11-08')
  // A month that starts on a Monday starts the grid; the clocks changing
  // inside it (1 November in this zone) doesn't skip or repeat a day.
  const subat = ayIzgarasi(2021, 1)
  assert.equal(subat[0].tarih, '2021-02-01')
  const kasim = ayIzgarasi(2026, 10).map((g) => g.tarih)
  assert.equal(new Set(kasim).size, 42)
  assert.equal(kasim.includes('2026-11-01') && kasim.includes('2026-11-02'), true)
  // January's grid reaches back into the year before.
  assert.equal(ayIzgarasi(2027, 0)[0].tarih, '2026-12-28')
})

test('day sums: pending plans and how many are done', () => {
  const ozet = gunOzetleri([
    plan({ id: 'a' }),
    plan({ id: 'b', durum: 'yapildi' }),
    plan({ id: 'c', tarih: '2026-10-23' }),
    plan({ id: 'd', tarih: null }),
  ])
  assert.deepEqual(ozet.get('2026-10-22')?.bekleyen.map((k) => k.id), ['a'])
  assert.equal(ozet.get('2026-10-22')?.yapilan, 1)
  assert.equal(ozet.get('2026-10-23')?.yapilan, 0)
  assert.equal(ozet.size, 2)
})

test('day arithmetic and how a day reads on a button', () => {
  assert.equal(gunFarki('2026-10-31', '2026-11-02'), 2)
  assert.equal(gunFarki('2026-11-02', '2026-10-31'), -2)
  assert.equal(gunEkle('2026-10-31', 1), '2026-11-01')
  assert.equal(gunEkle('2026-11-01', 1), '2026-11-02')
  assert.equal(gunEkle('2026-12-31', 1), '2027-01-01')

  const bugun = '2026-10-22'
  assert.equal(goreceGun('2026-10-22', bugun), 'Bugün')
  assert.equal(goreceGun('2026-10-23', bugun), 'Yarın')
  assert.equal(goreceGun('2026-10-21', bugun), 'Dün')
  assert.equal(goreceGun('2026-10-25', bugun), 'Pazar')
  assert.equal(goreceGun('2026-10-29', bugun), 'Haftaya')
  assert.equal(goreceGun('2026-11-05', bugun), '5 Kas')
  assert.equal(goreceGun('2027-01-05', bugun), '5 Oca 2027')
})

test('missed plans: pending ones from past days, the latest day first', () => {
  const bugun = '2026-10-22'
  const liste = kacanPlanlar(
    [
      plan({ baslik: 'Geçen hafta', tarih: '2026-10-15' }),
      plan({ baslik: 'Dün akşam', tarih: '2026-10-21', saat: '20:00' }),
      plan({ baslik: 'Dün sabah', tarih: '2026-10-21', saat: '09:00' }),
      plan({ baslik: 'Dün saatsiz', tarih: '2026-10-21' }),
      plan({ baslik: 'Yapıldı', tarih: '2026-10-20', durum: 'yapildi' }),
      plan({ baslik: 'Bugün', tarih: bugun }),
      plan({ baslik: 'Tarihsiz', tarih: null }),
    ],
    bugun,
  )
  assert.deepEqual(liste.map((k) => k.baslik), ['Dün sabah', 'Dün akşam', 'Dün saatsiz', 'Geçen hafta'])
})

test('moving plans: missed ones come back to today or later, others only move forward', () => {
  const bugun = '2026-10-22'
  assert.deepEqual(ertelemeSecenekleri('2026-10-18', bugun), [
    { etiket: 'Bugün', tarih: '2026-10-22' },
    { etiket: 'Yarın', tarih: '2026-10-23' },
    { etiket: 'Haftaya', tarih: '2026-10-29' },
  ])
  assert.deepEqual(
    ertelemeSecenekleri(bugun, bugun).map((s) => s.etiket),
    ['Yarın', 'Pazar', 'Haftaya'],
  )
  assert.deepEqual(
    ertelemeSecenekleri('2026-10-30', bugun).map((s) => s.tarih),
    ['2026-10-31', '2026-11-02', '2026-11-06'],
  )
})

test('several plans at once: move, mark done, and undo', async () => {
  await db.kayitlar.clear()
  const bugun = localDateString()
  const dun = gunEkle(bugun, -1)
  const a = plan({ id: 'a', baslik: 'Spor', tarih: dun })
  const b = plan({ id: 'b', baslik: 'Fatura', tarih: gunEkle(bugun, -3) })
  const c = plan({ id: 'c', baslik: 'Zaten bugün', tarih: bugun })
  await db.kayitlar.bulkAdd([a, b, c])

  const onceki = await topluUygula([a, b, c], { tur: 'tasi', tarih: bugun })
  // The plan already on that day isn't touched, so undo leaves it alone.
  assert.deepEqual(onceki.map((o) => o.id), ['a', 'b'])
  assert.deepEqual((await db.kayitlar.toArray()).map((k) => k.tarih), [bugun, bugun, bugun])
  assert.ok(((await db.kayitlar.get('a'))?.guncellenme ?? 0) > 0, 'a move is a new version, so it syncs')

  await geriAl(onceki)
  assert.deepEqual((await db.kayitlar.bulkGet(['a', 'b', 'c'])).map((k) => k?.tarih), [dun, gunEkle(bugun, -3), bugun])

  const yapildi = await topluUygula([a, b], { tur: 'yapildi' })
  assert.deepEqual((await db.kayitlar.bulkGet(['a', 'b'])).map((k) => k?.durum), ['yapildi', 'yapildi'])
  // A plan deleted before undo stays deleted.
  await db.kayitlar.delete('b')
  await geriAl(yapildi)
  assert.equal((await db.kayitlar.get('a'))?.durum, 'bekliyor')
  assert.equal(await db.kayitlar.get('b'), undefined)

  assert.equal(islemMesaji([a], { tur: 'tasi', tarih: bugun }, bugun), '“Spor” bugüne alındı')
  assert.equal(islemMesaji([a, b], { tur: 'tasi', tarih: gunEkle(bugun, 1) }, bugun), '2 plan yarına ertelendi')
  assert.equal(islemMesaji([a, b], { tur: 'tasi', tarih: gunEkle(bugun, 7) }, bugun), '2 plan taşındı: Haftaya')
  assert.equal(islemMesaji([a, b, c], { tur: 'yapildi' }, bugun), '3 plan yapıldı olarak işaretlendi')
})

test('"de/da" follows the last vowel of the name before it', () => {
  assert.deepEqual(
    ['Ali Veli', 'Ayşe Yılmaz', 'Can', 'Ömür', 'Bir arkadaşın', 'Ayşe ve 2 kişi daha', 'Kâmil', 'X'].map(deDa),
    ['de', 'da', 'da', 'de', 'da', 'da', 'de', 'de'],
  )
})
