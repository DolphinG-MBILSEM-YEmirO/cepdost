// Tests for the numbers on the profile pages: my month, my run of weeks,
// who and where most, and what a friend and I have done together.
//
//   npm test

import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Kayit } from '../src/db'
import {
  gorusulmeyenler,
  haftaBasi,
  neKadarOnce,
  ortakGecmis,
  planOzeti,
  uzunAraVar,
  yerAnahtari,
  type OrtakGecmis,
} from '../src/lib/planIstatistikleri'

function plan(ek: Partial<Kayit> = {}): Kayit {
  return {
    id: `p-${Math.random()}`, kategori: 'etkinlik', baslik: 'Plan', tarih: '2026-10-22', saat: null, konum: null,
    oncelik: 'orta', sure: null, ozetNot: null, mekanOnerisi: null, yakinOneriler: null, kaynakTipi: 'metin',
    hamBaslik: '', hamMetin: '', hamLink: '', gorseller: [], durum: 'bekliyor', olusturulmaTarihi: 0, ...ek,
  }
}

// Thursday 22 October 2026.
const BUGUN = '2026-10-22'

test('weeks start on Monday', () => {
  assert.equal(haftaBasi('2026-10-22'), '2026-10-19')
  assert.equal(haftaBasi('2026-10-19'), '2026-10-19')
  assert.equal(haftaBasi('2026-10-25'), '2026-10-19')
  assert.equal(haftaBasi('2026-11-01'), '2026-10-26')
})

test('my month: this month against the last, by category', () => {
  const ozet = planOzeti(
    [
      plan({ tarih: '2026-10-02', kategori: 'mekan', durum: 'yapildi' }),
      plan({ tarih: '2026-10-20', kategori: 'mekan' }),
      plan({ tarih: '2026-10-30', kategori: 'tarif' }),
      plan({ tarih: '2026-09-30' }),
      plan({ tarih: '2025-10-10' }),
      plan({ tarih: null, kategori: 'urun' }),
    ],
    BUGUN,
  )
  assert.equal(ozet.buAy, 3)
  assert.equal(ozet.buAyYapilan, 1)
  assert.equal(ozet.gecenAy, 1)
  assert.deepEqual(ozet.kategoriler, [{ kategori: 'mekan', sayi: 2 }, { kategori: 'tarif', sayi: 1 }])
  // January looks back at December of the year before.
  assert.equal(planOzeti([plan({ tarih: '2026-12-31' })], '2027-01-05').gecenAy, 1)
})

test('weeks in a row: an empty week so far keeps the run, a missed week ends it', () => {
  const haftalar = (...tarihler: string[]) => tarihler.map((tarih) => plan({ tarih }))
  // Last three weeks had plans, this one has none yet.
  assert.equal(planOzeti(haftalar('2026-10-13', '2026-10-06', '2026-09-29'), BUGUN).seri, 3)
  // This week too (a plan later this week counts).
  assert.equal(planOzeti(haftalar('2026-10-25', '2026-10-13', '2026-10-06'), BUGUN).seri, 3)
  // A gap two weeks ago.
  assert.equal(planOzeti(haftalar('2026-10-20', '2026-10-13', '2026-09-29'), BUGUN).seri, 2)
  // Only plans far ahead: no run yet.
  assert.equal(planOzeti(haftalar('2026-11-20'), BUGUN).seri, 0)
  assert.equal(planOzeti([], BUGUN).seri, 0)
})

test('who and where most', () => {
  const ozet = planOzeti(
    [
      plan({ tarih: '2026-10-01', arkadasId: 'ayse', arkadasAdi: 'Ayşe', konum: 'Moda Sahili' }),
      plan({ tarih: '2026-10-15', arkadasId: 'ayse', arkadasAdi: 'Ayşe Y.', konum: ' moda   sahili ' }),
      plan({ tarih: '2026-09-01', arkadasId: 'ayse', arkadasAdi: 'Ayşe', konum: 'Moda Sahili' }),
      plan({ tarih: '2026-10-10', grupId: 'g1', grupAdi: 'Piknik ekibi', arkadasId: null, konum: 'Belgrad Ormanı' }),
      plan({ tarih: '2026-10-12', grupId: 'g1', grupAdi: 'Piknik ekibi', konum: 'Belgrad Ormanı' }),
      plan({ tarih: '2026-10-05', arkadasId: 'can', arkadasAdi: 'Can' }),
      plan({ tarih: '2026-10-21', arkadasId: 'ali', arkadasAdi: 'Ali' }),
      plan({ tarih: '2026-10-03', konum: 'Kadıköy' }),
    ],
    BUGUN,
  )
  // Newest name wins; a tie goes to the most recent.
  assert.deepEqual(
    ozet.kisiler.map((k) => [k.tur, k.ad, k.sayi]),
    [['arkadas', 'Ayşe Y.', 3], ['grup', 'Piknik ekibi', 2], ['arkadas', 'Ali', 1]],
  )
  assert.deepEqual(ozet.yerler, [
    { ad: 'Moda Sahili', sayi: 3 },
    { ad: 'Belgrad Ormanı', sayi: 2 },
    { ad: 'Kadıköy', sayi: 1 },
  ])
  assert.equal(yerAnahtari('  İSTANBUL  Kadıköy '), 'istanbul kadıköy')
})

test('a friend and me: how many plans, the last time we met, the next one', () => {
  const benimle = (k: Kayit) => k.arkadasId === 'ayse'
  const gecmis = ortakGecmis(
    [
      plan({ baslik: 'Kahve', tarih: '2026-10-12', arkadasId: 'ayse', konum: 'Moda' }),
      plan({ baslik: 'Sinema', tarih: '2026-10-02', arkadasId: 'ayse', konum: 'Moda', durum: 'yapildi' }),
      plan({ baslik: 'Konser', tarih: '2026-11-02', saat: '21:00', arkadasId: 'ayse' }),
      plan({ baslik: 'Brunch', tarih: '2026-10-25', saat: '11:00', arkadasId: 'ayse' }),
      plan({ baslik: 'Başkasıyla', tarih: '2026-10-21', arkadasId: 'can' }),
    ],
    benimle,
    BUGUN,
  )
  assert.deepEqual(gecmis, {
    toplam: 4,
    sonBulusma: { tarih: '2026-10-12', baslik: 'Kahve', gunOnce: 10 },
    siradaki: { tarih: '2026-10-25', saat: '11:00', baslik: 'Brunch' },
    enSikYer: 'Moda',
  })
  assert.deepEqual(ortakGecmis([], benimle, BUGUN), { toplam: 0, sonBulusma: null, siradaki: null, enSikYer: null })
})

test('friends not seen in a long while, the longest gap first', () => {
  const gecmis = (gunOnce: number | null, siradaki = false): OrtakGecmis => ({
    toplam: 1,
    sonBulusma: gunOnce === null ? null : { tarih: '2026-09-01', baslik: 'Kahve', gunOnce },
    siradaki: siradaki ? { tarih: '2026-10-30', saat: null, baslik: 'Sinema' } : null,
    enSikYer: null,
  })
  assert.equal(uzunAraVar(gecmis(45)), true)
  assert.equal(uzunAraVar(gecmis(29)), false)
  // Something already planned, or never met: nothing to nudge about.
  assert.equal(uzunAraVar(gecmis(45, true)), false)
  assert.equal(uzunAraVar(gecmis(null)), false)

  const gecmisler = new Map([
    ['ayse', gecmis(40)],
    ['can', gecmis(90)],
    ['ece', gecmis(10)],
    ['deniz', gecmis(60, true)],
    ['mert', gecmis(31)],
  ])
  assert.deepEqual(gorusulmeyenler(gecmisler), ['can', 'ayse', 'mert'])
  assert.deepEqual(gorusulmeyenler(gecmisler, 2), ['can', 'ayse'])
})

test('how long ago, in words', () => {
  assert.deepEqual(
    [0, 1, 3, 7, 20, 30, 59, 364, 365, 800].map(neKadarOnce),
    ['Bugün', 'Dün', '3 gün önce', '1 hafta önce', '2 hafta önce', '1 ay önce', '1 ay önce', '12 ay önce', '1 yıl önce', '2 yıl önce'],
  )
})

test('a place written two ways shows the way names are written', () => {
  const ozet = planOzeti([plan({ konum: 'moda  sahili' }), plan({ konum: 'Moda Sahili' })], BUGUN)
  assert.deepEqual(ozet.yerler, [{ ad: 'Moda Sahili', sayi: 2 }])
})
