// Tests for a memory archive's layout: months and places.
//
//   npm test

process.env.TZ = 'America/Los_Angeles'

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Ani } from '../src/sosyal/gruplar'
import { arsivYerleri, aylaraBol, yerdekiAnilar } from '../src/lib/aniArsivi'

function ani(id: string, mekan: string, tarih: string, olusturulma = `${tarih}T20:00:00Z`): Ani {
  return {
    id, sahip_id: 'ayse', grup_id: 'g', arkadas_id: null, mekan_adi: mekan, tarih, notlar: null,
    gorunurluk: 'arkadaslar', foto: null, sahip: null, olusturulma, konu: 'k',
  }
}

test('a memory archive: months, the newest first, with Turkish month names', () => {
  const aylar = aylaraBol([
    ani('eylul', 'Moda', '2026-09-30'),
    ani('ekim-erken', 'Moda', '2026-10-01'),
    ani('ocak', 'Moda', '2026-01-15'),
    ani('ekim-gec', 'Moda', '2026-10-20'),
    ani('ekim-ayni-gun-sonra', 'Moda', '2026-10-20', '2026-10-21T09:00:00Z'),
  ])
  assert.deepEqual(
    aylar.map((a) => [a.baslik, a.anilar.map((x) => x.id)]),
    [
      ['Ekim 2026', ['ekim-ayni-gun-sonra', 'ekim-gec', 'ekim-erken']],
      ['Eylül 2026', ['eylul']],
      ['Ocak 2026', ['ocak']],
    ],
  )
  assert.deepEqual(aylaraBol([]), [])
})

test('a memory archive: places to filter by, however they were spelled', () => {
  const anilar = [ani('1', 'Moda Sahili', '2026-10-01'), ani('2', 'moda  sahili', '2026-10-02'), ani('3', 'Karaköy', '2026-10-03')]
  assert.deepEqual(arsivYerleri(anilar), [
    { ad: 'Moda Sahili', sayi: 2 },
    { ad: 'Karaköy', sayi: 1 },
  ])
  // One place is nothing to filter.
  assert.deepEqual(arsivYerleri(anilar.slice(0, 2)), [])

  assert.deepEqual(yerdekiAnilar(anilar, 'MODA SAHİLİ').map((a) => a.id), ['1', '2'])
  assert.equal(yerdekiAnilar(anilar, null).length, 3)
})
