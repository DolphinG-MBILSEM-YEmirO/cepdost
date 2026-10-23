// Tests for ideas: plans with no day yet, who they're with, and giving one
// its first day.
//
//   npm test

process.env.TZ = 'America/Los_Angeles'

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Kayit } from '../src/db'
import type { Ani } from '../src/sosyal/gruplar'
import type { AniEtkilesimi } from '../src/sosyal/aniEtkilesimi'
import { fikirIstegi, fikirKisileri, fikirMi, fikirler } from '../src/lib/fikirler'
import { gunSecenekleri } from '../src/lib/takvimIzgarasi'
import { islemMesaji } from '../src/lib/topluIslem'
import { adListesi } from '../src/sosyal/adlar'
import type { Profil } from '../src/sosyal/api'

function plan(ek: Partial<Kayit> = {}): Kayit {
  return {
    id: `p-${Math.random()}`, kategori: 'mekan', baslik: 'Moda Sahili', tarih: null, saat: null, konum: 'Moda Sahili',
    oncelik: 'orta', sure: null, ozetNot: null, mekanOnerisi: null, yakinOneriler: null, kaynakTipi: 'metin',
    hamBaslik: '', hamMetin: '', hamLink: '', gorseller: [], durum: 'bekliyor', olusturulmaTarihi: 0, ...ek,
  }
}

function ani(id: string, sahip: string, mekan: string): Ani {
  return {
    id, sahip_id: sahip, grup_id: null, arkadas_id: null, mekan_adi: mekan, tarih: '2026-10-01', notlar: null,
    gorunurluk: 'arkadaslar', foto: null, olusturulma: '2026-10-01T10:00:00Z', konu: 'k',
  } as Ani
}

const etkilesim = (gitmekIsteyenler: string[]): AniEtkilesimi => ({ tepkiler: [], gitmekIsteyenler, yorumlar: [] })

test('ideas: pending plans with no day, the newest first', () => {
  const eski = plan({ olusturulmaTarihi: 1 })
  const yeni = plan({ olusturulmaTarihi: 2 })
  const gunlu = plan({ tarih: '2026-10-30' })
  const yapilan = plan({ durum: 'yapildi' })
  assert.deepEqual([fikirMi(eski), fikirMi(gunlu), fikirMi(yapilan)], [true, false, false])
  assert.deepEqual(fikirler([eski, gunlu, yeni, yapilan]).map((k) => k.id), [yeni.id, eski.id])
})

test('who an idea is with: friends who went there and friends who want to go, however the place is spelled', () => {
  const anilar = [ani('a1', 'ali', 'Moda  sahili'), ani('a2', 'can', 'MODA SAHİLİ'), ani('a3', 'ben', 'Moda Sahili'), ani('a4', 'deniz', 'Kadıköy')]
  const etkilesimler = new Map([
    // Ayşe wants to go; Can has been, so he only counts as having been;
    // my own wish isn't news to me.
    ['a1', etkilesim(['ayse', 'can', 'ben'])],
    ['a3', etkilesim(['ayse'])],
    ['a4', etkilesim(['zeynep'])],
  ])
  const kisiler = fikirKisileri(plan({ konum: ' moda sahili ' }), anilar, etkilesimler, 'ben')
  assert.deepEqual(kisiler, { gidenler: ['ali', 'can'], isteyenler: ['ayse'] })
  assert.deepEqual(fikirKisileri(plan({ konum: null }), anilar, etkilesimler, 'ben'), { gidenler: [], isteyenler: [] })
  assert.deepEqual(fikirKisileri(plan({ konum: 'Bebek' }), anilar, etkilesimler, 'ben'), { gidenler: [], isteyenler: [] })
})

test('the request handed to the shared-time planner names the place when it adds something', () => {
  assert.equal(fikirIstegi(plan(), 'Moda Sahili'), 'Moda Sahili')
  assert.equal(fikirIstegi(plan({ konum: 'moda sahili' }), 'Moda Sahili'), 'Moda Sahili')
  assert.equal(fikirIstegi(plan({ baslik: 'Kahvaltı', konum: 'Moda' }), 'Kahvaltı'), 'Kahvaltı (Moda)')
  assert.equal(fikirIstegi(plan({ baslik: 'Tarif', konum: null }), 'Tarif'), 'Tarif')
})

test('first day for an idea: today, tomorrow, the coming Saturday and a week on', () => {
  const secenekler = (bugun: string) => gunSecenekleri(bugun).map((s) => `${s.tarih} ${s.etiket}`)
  // Thursday
  assert.deepEqual(secenekler('2026-10-22'), ['2026-10-22 Bugün', '2026-10-23 Yarın', '2026-10-24 Cumartesi', '2026-10-29 Haftaya'])
  // Friday and Saturday: the weekend is already today or tomorrow.
  assert.deepEqual(secenekler('2026-10-23'), ['2026-10-23 Bugün', '2026-10-24 Yarın', '2026-10-30 Haftaya'])
  assert.deepEqual(secenekler('2026-10-24'), ['2026-10-24 Bugün', '2026-10-25 Yarın', '2026-10-31 Haftaya'])
  // Sunday, across the clock change on 1 November.
  assert.deepEqual(secenekler('2026-10-25'), ['2026-10-25 Bugün', '2026-10-26 Yarın', '2026-10-31 Cumartesi', '2026-11-01 Haftaya'])
})

test('giving an idea its day reads as choosing a day, not postponing', () => {
  const bugun = '2026-10-22'
  assert.equal(islemMesaji([plan()], { tur: 'tasi', tarih: '2026-10-24' }, bugun), '“Moda Sahili” için gün seçildi: Cumartesi')
  assert.equal(islemMesaji([plan(), plan()], { tur: 'tasi', tarih: bugun }, bugun), '2 plan için gün seçildi: Bugün')
  assert.equal(islemMesaji([plan({ tarih: '2026-10-22' })], { tur: 'tasi', tarih: '2026-10-23' }, bugun), '“Moda Sahili” yarına ertelendi')
})

test('names in a sentence', () => {
  const profiller = new Map([['ali', { ad: 'Ali' }], ['ayse', { ad: 'Ayşe' }], ['can', { ad: 'Can' }]]) as unknown as Map<string, Profil>
  assert.equal(adListesi(['ali'], profiller), 'Ali')
  assert.equal(adListesi(['ali', 'ben'], profiller, 'ben'), 'Ali ve Sen')
  assert.equal(adListesi(['ali', 'ayse', 'can', 'x'], profiller), 'Ali, Ayşe ve 2 kişi daha')
  assert.equal(adListesi(['x'], profiller), 'Bir arkadaşın')
})
