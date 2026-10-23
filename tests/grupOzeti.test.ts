// Tests for a group at a glance: the next plan, the last memory, and where
// the group goes most.
//
//   npm test

process.env.TZ = 'America/Los_Angeles'

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Ani, GrupPlani } from '../src/sosyal/gruplar'
import { grupOzeti } from '../src/lib/grupOzeti'

const BUGUN = '2026-10-23'

function plan(id: string, tarih: string, saat: string | null, konum: string | null = null): GrupPlani {
  return {
    id, grup_id: 'g', olusturan_id: 'ali', baslik: id, tarih, saat, sure: null, tum_gun: saat === null,
    konum, notlar: null, emoji: null, olusturulma: '2026-10-01T10:00:00Z',
  }
}

function ani(id: string, mekan: string, tarih: string, olusturulma = `${tarih}T20:00:00Z`): Ani {
  return {
    id, sahip_id: 'ayse', grup_id: 'g', arkadas_id: null, mekan_adi: mekan, tarih, notlar: null,
    gorunurluk: 'arkadaslar', foto: null, sahip: null, olusturulma, konu: 'k',
  }
}

test('a group at a glance: the next plan, today counting, a timed plan before an all-day one', () => {
  const ozet = grupOzeti(
    [plan('gecen-hafta', '2026-10-16', '10:00'), plan('yarin', '2026-10-24', '09:00'), plan('bugun-tum-gun', BUGUN, null), plan('bugun-aksam', BUGUN, '19:00')],
    [],
    BUGUN,
  )
  assert.equal(ozet.siradaki?.id, 'bugun-aksam')
  assert.equal(ozet.gecmisPlan, 1)
  assert.equal(ozet.sonAni, null)
  assert.equal(ozet.aniSayisi, 0)

  assert.equal(grupOzeti([plan('gecen-hafta', '2026-10-16', '10:00')], [], BUGUN).siradaki, null)
})

test('a group at a glance: the last memory by its day, then by when it was added', () => {
  const ozet = grupOzeti(
    [],
    [ani('eski', 'Moda', '2026-10-01'), ani('dun-sabah', 'Moda', '2026-10-22', '2026-10-22T08:00:00Z'), ani('dun-aksam', 'Moda', '2026-10-22', '2026-10-22T21:00:00Z'), ani('gec-eklenen', 'Moda', '2026-09-30', '2026-10-23T09:00:00Z')],
    BUGUN,
  )
  assert.equal(ozet.sonAni?.id, 'dun-aksam')
  assert.equal(ozet.aniSayisi, 4)
})

test('a group at a glance: where it goes most, one visit per place per day', () => {
  // A plan and three photos from it are one visit; one visit isn't a habit.
  const birZiyaret = grupOzeti(
    [plan('kahvalti', '2026-10-10', '10:00', 'Moda Sahili')],
    [ani('1', 'Moda Sahili', '2026-10-10'), ani('2', 'moda  sahili', '2026-10-10'), ani('3', 'Karaköy', '2026-10-10')],
    BUGUN,
  )
  assert.equal(birZiyaret.enSikYer, null)

  // A second day there makes it the place; an upcoming plan isn't a visit yet.
  const ikiZiyaret = grupOzeti(
    [plan('kahvalti', '2026-10-10', '10:00', 'Moda Sahili'), plan('gelecek', '2026-10-30', '10:00', 'Karaköy'), plan('gelecek-2', '2026-11-30', '10:00', 'Karaköy')],
    [ani('1', 'moda sahili', '2026-10-18'), ani('2', 'Karaköy', '2026-10-10')],
    BUGUN,
  )
  assert.equal(ikiZiyaret.enSikYer, 'Moda Sahili')
})
