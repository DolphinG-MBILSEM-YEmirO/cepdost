// Tests for the home widgets' logic: next plan, friends free now, on this day.
//
//   npm test

process.env.TZ = 'Europe/Istanbul'

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Kayit } from '../src/db'
import type { Ani } from '../src/sosyal/gruplar'
import type { WidgetFriend } from '../src/widgets/types'
import {
  countdownParts,
  countdownPhrase,
  freeFriendsAt,
  memoryTarget,
  personColorHex,
  pickOnThisDay,
  planPhase,
  planWindow,
  untilPhrase,
  upcomingPlans,
} from '../src/widgets/widgetData'

function plan(id: string, tarih: string | null, saat: string | null, extra: Partial<Kayit> = {}): Kayit {
  return {
    id, kategori: 'etkinlik', baslik: id, tarih, saat, konum: null, oncelik: 'orta', sure: null, ozetNot: null,
    mekanOnerisi: null, yakinOneriler: null, kaynakTipi: 'metin', hamBaslik: '', hamMetin: '', hamLink: '',
    gorseller: [], durum: 'bekliyor', olusturulmaTarihi: 0, ...extra,
  }
}

const at = (iso: string) => new Date(iso).getTime()

test('the next plans: upcoming or still on, soonest first, done and undated left out', () => {
  const now = at('2026-11-01T18:00:00+03:00')
  const list = upcomingPlans(
    [
      plan('later', '2026-11-03', '20:00'),
      plan('on-now', '2026-11-01', '17:00', { sure: 120 }),
      plan('over', '2026-11-01', '14:00', { sure: 60 }),
      plan('done', '2026-11-02', '10:00', { durum: 'yapildi' }),
      plan('idea', null, null),
      plan('all-day', '2026-11-02', null, { tumGun: true }),
    ],
    now,
  )
  assert.deepEqual(list.map((p) => p.kayit.id), ['on-now', 'all-day', 'later'])
})

test('plan windows: default two hours, all-day spans the day', () => {
  const timed = planWindow(plan('a', '2026-11-01', '19:30'))!
  assert.equal(timed.endsAt - timed.startsAt, 120 * 60_000)
  const allDay = planWindow(plan('b', '2026-11-01', '10:00', { tumGun: true }))!
  assert.equal(allDay.startsAt, at('2026-11-01T00:00:00+03:00'))
  assert.equal(allDay.endsAt, at('2026-11-02T00:00:00+03:00'))
})

test('plan phases and countdown text', () => {
  const w = { startsAt: at('2026-11-01T20:00:00+03:00'), endsAt: at('2026-11-01T22:00:00+03:00') }
  assert.equal(planPhase(w, at('2026-11-01T17:00:00+03:00')), 'upcoming')
  assert.equal(planPhase(w, at('2026-11-01T19:30:00+03:00')), 'soon')
  assert.equal(planPhase(w, at('2026-11-01T20:10:00+03:00')), 'live')
  assert.deepEqual(countdownParts(90_061_000), { days: 1, hours: 1, minutes: 1, seconds: 1 })
  assert.equal(countdownPhrase(3 * 86_400_000), '3 gün sonra')
  assert.equal(countdownPhrase(2 * 3_600_000 + 15 * 60_000), '2 sa 15 dk sonra')
  assert.equal(countdownPhrase(30_000), '1 dk sonra')
  assert.equal(countdownPhrase(0), 'Şimdi')
})

function friend(id: string, busy: WidgetFriend['busy'], window: WidgetFriend['window'] = null): WidgetFriend {
  return { id, name: id, photo: null, emoji: null, color: '#000000', busy, window }
}

test('friends free now: not inside a busy range or outside their hours; free longest first', () => {
  const now = new Date('2026-11-01T18:00:00+03:00')
  const free = freeFriendsAt(
    [
      friend('busy', [{ date: '2026-11-01', start: '17:00', end: '19:00' }]),
      friend('until-21', [{ date: '2026-11-01', start: '21:00', end: '23:00' }]),
      friend('all-evening', [{ date: '2026-11-02', start: '09:00', end: '10:00' }]),
      friend('window-ends', [], { start: '09:00', end: '20:00' }),
      friend('outside-window', [], { start: '09:00', end: '17:00' }),
    ],
    now,
  )
  assert.deepEqual(
    free.map((f) => [f.friend.id, f.freeUntil]),
    [
      ['all-evening', null],
      ['until-21', '21:00'],
      ['window-ends', '20:00'],
    ],
  )
})

test('"until" phrases take the right Turkish suffix', () => {
  assert.equal(untilPhrase('21:00'), "21:00'e kadar")
  assert.equal(untilPhrase('19:00'), "19:00'a kadar")
  assert.equal(untilPhrase('20:00'), "20:00'ye kadar")
  assert.equal(untilPhrase('18:30'), "18:30'a kadar")
  assert.equal(untilPhrase('16:00'), "16:00'ya kadar")
})

function ani(id: string, tarih: string, foto = true, extra: Partial<Ani> = {}): Ani {
  return {
    id, sahip_id: 'ayse', grup_id: null, arkadas_id: null, mekan_adi: id, tarih, notlar: null,
    gorunurluk: 'arkadaslar', foto: foto ? { parca: 1, boyut: 1, tip: 'image/jpeg' } as unknown as Ani['foto'] : null,
    sahip: null, olusturulma: `${tarih}T20:00:00Z`, konu: 'k', ...extra,
  }
}

test('on this day: same day earlier year first, then same date earlier month, then an older one', () => {
  const today = '2026-11-01'
  const yearAgo = pickOnThisDay([ani('month', '2026-10-01'), ani('year', '2025-11-01'), ani('no-photo', '2024-11-01', false)], today)
  assert.equal(yearAgo?.ani.id, 'year')
  assert.equal(yearAgo?.label, '1 yıl önce bugün')

  const monthAgo = pickOnThisDay([ani('month', '2026-08-01'), ani('other', '2026-09-15')], today)
  assert.equal(monthAgo?.label, '3 ay önce bugün')

  const recent = pickOnThisDay([ani('old', '2026-10-10'), ani('too-new', '2026-10-30')], today)
  assert.equal(recent?.ani.id, 'old')
  assert.equal(recent?.kind, 'recent')

  assert.equal(pickOnThisDay([ani('too-new', '2026-10-30')], today), null)
  // The same pick all day.
  const many = [ani('a', '2026-09-02'), ani('b', '2026-09-03'), ani('c', '2026-09-04')]
  assert.equal(pickOnThisDay(many, today)?.ani.id, pickOnThisDay([...many].reverse(), today)?.ani.id)
})

test("a memory's chat: its group, or the other person in a pair memory", () => {
  assert.equal(memoryTarget({ grup_id: 'g1', arkadas_id: null, sahip_id: 'x' }, 'me'), 'grup:g1')
  assert.equal(memoryTarget({ grup_id: null, arkadas_id: 'can', sahip_id: 'me' }, 'me'), 'dm:can')
  assert.equal(memoryTarget({ grup_id: null, arkadas_id: 'me', sahip_id: 'can' }, 'me'), 'dm:can')
  assert.equal(memoryTarget({ grup_id: null, arkadas_id: null, sahip_id: 'can' }, 'me'), null)
})

test('person colours come out as hex for the native widgets', () => {
  assert.equal(personColorHex('gul', 'Ayşe'), '#F43F5E')
  assert.match(personColorHex(null, 'Ayşe'), /^#[0-9A-F]{6}$/)
})
