// Tests for narrowing the friends feed and spotting new posts.
//
//   npm test

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Ani } from '../src/sosyal/gruplar'
import { akisSecenekleri, secimdekiler, yeniMi } from '../src/lib/akisSuzgeci'

function ani(id: string, sahip: string, grup: string | null, olusturulma = '2026-10-20T10:00:00.000Z'): Ani {
  return {
    id, sahip_id: sahip, grup_id: grup, arkadas_id: grup ? null : 'ben', mekan_adi: 'Moda', tarih: '2026-10-20',
    notlar: null, gorunurluk: 'arkadaslar', foto: null, sahip: null, olusturulma, konu: 'k',
  }
}

const ADLAR: Record<string, string> = { ayse: 'Ayşe Yılmaz', can: 'Can Demir', ece: 'Ece Kaya', g1: 'Kahvaltı Ekibi' }
const ad = (id: string) => ADLAR[id] ?? null

test('the feed: people and groups to narrow it to, the busiest first, me last', () => {
  const anilar = [
    ani('1', 'ayse', 'g1'),
    ani('2', 'can', 'g1'),
    ani('3', 'ayse', null),
    ani('4', 'ben', 'g1'),
    ani('5', 'can', null),
    ani('6', 'ece', null),
    // Someone whose name I can't read yet isn't offered.
    ani('7', 'bilinmeyen', null),
  ]
  assert.deepEqual(
    akisSecenekleri(anilar, 'ben', ad, ad).map((s) => `${s.tur}:${s.ad}:${s.sayi}`),
    ['grup:Kahvaltı Ekibi:3', 'kisi:Ayşe Yılmaz:2', 'kisi:Can Demir:2', 'kisi:Ece Kaya:1', 'kisi:Sen:1'],
  )
  // One person is nothing to choose from.
  assert.deepEqual(akisSecenekleri([ani('1', 'ayse', null), ani('2', 'ayse', null)], 'ben', ad, ad), [])

  assert.deepEqual(secimdekiler(anilar, { tur: 'grup', id: 'g1' }).map((a) => a.id), ['1', '2', '4'])
  assert.deepEqual(secimdekiler(anilar, { tur: 'kisi', id: 'ayse' }).map((a) => a.id), ['1', '3'])
  assert.equal(secimdekiler(anilar, null).length, 7)
})

test('the feed: posts since my last look are new, never my own', () => {
  const son = '2026-10-20T09:00:00.000Z'
  assert.equal(yeniMi(ani('1', 'ayse', null, '2026-10-20T10:00:00.000Z'), 'ben', son), true)
  assert.equal(yeniMi(ani('2', 'ayse', null, '2026-10-20T08:00:00.000Z'), 'ben', son), false)
  assert.equal(yeniMi(ani('3', 'ben', null, '2026-10-20T10:00:00.000Z'), 'ben', son), false)
  // The first visit on this device marks nothing.
  assert.equal(yeniMi(ani('4', 'ayse', null), 'ben', null), false)
})
