// Tests for the archive list: search, where a record stands, sections.
//
//   npm test

process.env.TZ = 'America/Los_Angeles'

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Kayit } from '../src/db'
import { aramaSorgusu } from '../src/lib/arama'
import {
  arsivBolumleri,
  durumSayilari,
  gizliEslesme,
  kayitDurumu,
  kayitEslesiyor,
  silmeMesaji,
} from '../src/lib/arsivListesi'

function kayit(id: string, ek: Partial<Kayit> = {}): Kayit {
  return {
    id, kategori: 'mekan', baslik: id, tarih: null, saat: null, konum: null,
    oncelik: 'orta', sure: null, ozetNot: null, mekanOnerisi: null, yakinOneriler: null, kaynakTipi: 'metin',
    hamBaslik: '', hamMetin: '', hamLink: '', gorseller: [], durum: 'bekliyor', olusturulmaTarihi: 0, ...ek,
  }
}

const BUGUN = '2026-10-23'

test('the archive: where a record stands, and the counts', () => {
  const kayitlar = [
    kayit('ileride', { tarih: '2026-10-30' }),
    kayit('bugun', { tarih: BUGUN }),
    kayit('tarihsiz'),
    kayit('kacan', { tarih: '2026-10-20' }),
    kayit('yapilan', { tarih: '2026-10-20', durum: 'yapildi' }),
  ]
  assert.deepEqual(
    kayitlar.map((k) => kayitDurumu(k, BUGUN)),
    ['bekleyen', 'bekleyen', 'bekleyen', 'kacti', 'yapildi'],
  )
  assert.deepEqual(durumSayilari(kayitlar, BUGUN), { hepsi: 5, bekleyen: 3, yapildi: 1, kacti: 1 })
})

test('the archive: search folds Turkish letters and says where a hidden match is', () => {
  const k = kayit('Çay bahçesi', { konum: 'Üsküdar', ozetNot: 'Akşamüstü gün batımında simit ve çay; köşedeki masa en iyisi.' })
  const sorgu = (s: string) => aramaSorgusu(s)!
  assert.ok(kayitEslesiyor(k, sorgu('cay')))
  assert.ok(kayitEslesiyor(k, sorgu('USKUDAR')))
  assert.ok(kayitEslesiyor(k, sorgu('kose')))
  assert.ok(!kayitEslesiyor(k, sorgu('kahve')))

  // The title and place are on the card already.
  assert.equal(gizliEslesme(k, sorgu('çay')), null)
  assert.equal(gizliEslesme(k, sorgu('uskudar')), null)
  // A match in the note comes with the line around it.
  assert.equal(gizliEslesme(k, sorgu('simit')), '…müstü gün batımında simit ve çay; köşedeki masa en iyisi.')
})

test('the archive: sections for each order', () => {
  const ekim = new Date(2026, 9, 5).getTime()
  const eylul = new Date(2026, 8, 30).getTime()
  const kayitlar = [
    kayit('eski-not', { kategori: 'not', olusturulmaTarihi: eylul }),
    kayit('yeni-mekan', { tarih: '2026-11-02', saat: '19:00', olusturulmaTarihi: ekim + 2 }),
    kayit('ayni-gun-sabah', { tarih: '2026-11-02', saat: '09:00', olusturulmaTarihi: ekim + 1 }),
    kayit('siniflanmamis', { kategori: null, tarih: '2026-10-25', olusturulmaTarihi: ekim }),
    kayit('tarif', { kategori: 'tarif', olusturulmaTarihi: eylul + 1 }),
  ]
  const ozet = (s: ReturnType<typeof arsivBolumleri>) => s.map((b) => [b.baslik, b.kayitlar.map((k) => k.id)])

  assert.deepEqual(ozet(arsivBolumleri(kayitlar, 'recent')), [
    ['Ekim 2026', ['yeni-mekan', 'ayni-gun-sabah', 'siniflanmamis']],
    ['Eylül 2026', ['tarif', 'eski-not']],
  ])
  assert.deepEqual(ozet(arsivBolumleri(kayitlar, 'date')), [
    ['Ekim 2026', ['siniflanmamis']],
    ['Kasım 2026', ['ayni-gun-sabah', 'yeni-mekan']],
    ['Tarihsiz', ['tarif', 'eski-not']],
  ])
  assert.deepEqual(ozet(arsivBolumleri(kayitlar, 'category')), [
    ['Mekân', ['yeni-mekan', 'ayni-gun-sabah']],
    ['Tarif', ['tarif']],
    ['Not', ['eski-not']],
    ['Sınıflandırılmamış', ['siniflanmamis']],
  ])
  assert.deepEqual(arsivBolumleri([], 'recent'), [])
})

test('the archive: what a bulk delete says', () => {
  assert.equal(silmeMesaji([kayit('Moda kahvaltısı')]), '“Moda kahvaltısı” silindi')
  assert.equal(silmeMesaji([kayit('a'), kayit('b'), kayit('c')]), '3 kayıt silindi')
})
