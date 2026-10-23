// Tests for a plan's memories: which photos in the archive belong to it.
//
//   npm test

process.env.TZ = 'America/Los_Angeles'

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Ani } from '../src/sosyal/gruplar'
import { aniSahipleri, planAnilari } from '../src/lib/planAnilari'

function ani(id: string, sahip: string, mekan: string, tarih: string): Ani {
  return {
    id, sahip_id: sahip, grup_id: 'g', arkadas_id: null, mekan_adi: mekan, tarih, notlar: null,
    gorunurluk: 'arkadaslar', foto: null, sahip: null, olusturulma: `${tarih}T20:00:00Z`, konu: 'k',
  }
}

const idler = (anilar: Ani[]) => anilar.map((a) => a.id)

test("a plan's memories: its day anywhere, its place a day or two either side", () => {
  const arsiv = [
    ani('ayni-gun', 'ayse', 'Kadıköy çarşı', '2026-11-01'),
    ani('ertesi-sabah', 'can', '  moda   SAHİLİ ', '2026-10-02'),
    ani('iki-gun-once', 'ayse', 'Moda Sahili', '2026-09-29'),
    ani('uc-gun-sonra', 'can', 'Moda Sahili', '2026-10-04'),
    ani('baska-yer', 'ayse', 'Karaköy', '2026-10-02'),
    ani('o-gun', 'ben', 'Bambaşka bir yer', '2026-10-01'),
  ]
  const plan = { tarih: '2026-10-01', konum: 'Moda Sahili' }
  assert.deepEqual(idler(planAnilari(arsiv, plan)), ['ertesi-sabah', 'iki-gun-once', 'o-gun'])

  // Across a month's end, and with no place only the day itself counts.
  assert.deepEqual(idler(planAnilari(arsiv, { tarih: '2026-10-31', konum: 'Kadıköy Çarşı' })), ['ayni-gun'])
  assert.deepEqual(idler(planAnilari(arsiv, { tarih: '2026-10-02', konum: null })), ['ertesi-sabah', 'baska-yer'])

  // A plan with no day has none.
  assert.deepEqual(planAnilari(arsiv, { tarih: null, konum: 'Moda Sahili' }), [])
})

test("a plan's memories: who added them, each once", () => {
  const anilar = [ani('1', 'can', 'X', '2026-10-01'), ani('2', 'ayse', 'X', '2026-10-01'), ani('3', 'can', 'X', '2026-10-01')]
  assert.deepEqual(aniSahipleri(anilar), ['can', 'ayse'])
})
