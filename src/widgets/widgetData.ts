import type { Kayit } from '../db'
import type { Ani } from '../sosyal/gruplar'
import { RENKLER, renkAl, type RenkAnahtari } from '../lib/kisisellestirme'
import type { BusyRange, FreeFriend, MemoryAgeKind, WidgetFriend } from './types'

// The pure logic behind the three home widgets: which plan is next, which
// friends are free right now, and which memory to bring back today. Kept
// free of React and storage so it is easy to test, and so the native
// widgets (Kotlin, Swift) can mirror it line by line.

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// A timed plan without a duration is taken to last this long.
const DEFAULT_PLAN_MINUTES = 120

// How many upcoming plans the snapshot carries.
export const PLAN_LOOKAHEAD = 3

// Memories younger than this aren't "throwbacks" yet.
const MIN_THROWBACK_DAYS = 7

// ---------- time helpers ----------

function localDate(dateStr: string, time = '00:00'): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0)
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function clockKey(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ---------- 1. next plan ----------

export interface PlanWindow {
  startsAt: number
  endsAt: number
}

// When a plan starts and ends. All-day plans (and plans with no time) span
// their whole day.
export function planWindow(kayit: Pick<Kayit, 'tarih' | 'saat' | 'sure' | 'tumGun'>): PlanWindow | null {
  if (!kayit.tarih) return null
  const day = localDate(kayit.tarih)
  if (isNaN(day.getTime())) return null
  if (kayit.tumGun || !kayit.saat) {
    const end = new Date(day)
    end.setDate(end.getDate() + 1)
    return { startsAt: day.getTime(), endsAt: end.getTime() }
  }
  const start = localDate(kayit.tarih, kayit.saat.slice(0, 5)).getTime()
  const minutes = kayit.sure && kayit.sure > 0 ? kayit.sure : DEFAULT_PLAN_MINUTES
  return { startsAt: start, endsAt: start + minutes * MINUTE }
}

// Plans still to come (or happening now), soonest first. Done plans and
// ideas without a day are left out.
export function upcomingPlans(kayitlar: Kayit[], now: number, limit = PLAN_LOOKAHEAD): Array<{ kayit: Kayit } & PlanWindow> {
  return kayitlar
    .filter((k) => k.durum === 'bekliyor')
    .flatMap((kayit) => {
      const w = planWindow(kayit)
      return w && w.endsAt > now ? [{ kayit, ...w }] : []
    })
    .sort((a, b) => a.startsAt - b.startsAt || a.endsAt - b.endsAt)
    .slice(0, limit)
}

export type PlanPhase = 'upcoming' | 'soon' | 'live'

// 'soon' within the hour, 'live' once it has started.
export function planPhase(window: PlanWindow, now: number): PlanPhase {
  if (now >= window.startsAt) return 'live'
  return window.startsAt - now <= HOUR ? 'soon' : 'upcoming'
}

export interface CountdownParts {
  days: number
  hours: number
  minutes: number
  seconds: number
}

export function countdownParts(ms: number): CountdownParts {
  const total = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

// A short Turkish phrase for how far away a start is: "3 gün sonra",
// "2 sa 15 dk sonra", "12 dk sonra", "Şimdi".
export function countdownPhrase(ms: number): string {
  if (ms <= 0) return 'Şimdi'
  const { days, hours, minutes } = countdownParts(ms)
  if (days >= 2) return `${days} gün sonra`
  if (days === 1) return hours > 0 ? `1 gün ${hours} sa sonra` : '1 gün sonra'
  if (hours > 0) return minutes > 0 ? `${hours} sa ${minutes} dk sonra` : `${hours} sa sonra`
  return `${Math.max(1, minutes)} dk sonra`
}

// "Bugün 19:30", "Yarın", "Cumartesi 14:00", "12 Kasım".
export function planWhenLabel(window: PlanWindow, time: string | null, now: number): string {
  const start = new Date(window.startsAt)
  const today = localDate(dateKey(new Date(now)))
  const days = Math.round((localDate(dateKey(start)).getTime() - today.getTime()) / DAY)
  const clock = time ? ` ${time.slice(0, 5)}` : ''
  if (days <= 0) return `Bugün${clock}`
  if (days === 1) return `Yarın${clock}`
  if (days < 7) return `${start.toLocaleDateString('tr-TR', { weekday: 'long' })}${clock}`
  return `${start.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}${clock}`
}

// ---------- 2. friends free now ----------

// Is `clock` inside [start, end)?
function within(clock: string, start: string, end: string): boolean {
  return clock >= start.slice(0, 5) && clock < end.slice(0, 5)
}

// Friends free at `now`, the ones free longest first. A friend counts only
// when their calendar reached this device (busy is a list, even if empty)
// and, if they set usual hours, `now` falls inside them.
export function freeFriendsAt(friends: WidgetFriend[], now: Date): FreeFriend[] {
  const today = dateKey(now)
  const clock = clockKey(now)
  const free: FreeFriend[] = []
  for (const friend of friends) {
    if (friend.window && !within(clock, friend.window.start, friend.window.end)) continue
    const busyToday = friend.busy.filter((b) => b.date === today)
    if (busyToday.some((b) => within(clock, b.start, b.end))) continue
    const nextBusy = busyToday
      .map((b) => b.start.slice(0, 5))
      .filter((start) => start > clock)
      .sort()[0]
    const windowEnd = friend.window?.end.slice(0, 5) ?? null
    const candidates = [nextBusy, windowEnd].filter((t): t is string => !!t && t > clock).sort()
    free.push({ friend, freeUntil: candidates[0] ?? null })
  }
  // Free all evening first, then by how long they stay free, then by name.
  return free.sort(
    (a, b) =>
      (b.freeUntil ?? '99:99').localeCompare(a.freeUntil ?? '99:99') || a.friend.name.localeCompare(b.friend.name, 'tr'),
  )
}

// Only today's and tomorrow's ranges go into the snapshot.
export function busyForWidget(blocks: ReadonlyArray<{ tarih: string; baslangic: string; bitis: string }>, now: Date): BusyRange[] {
  const today = dateKey(now)
  const tomorrow = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  return blocks
    .filter((b) => b.tarih === today || b.tarih === tomorrow)
    .map((b) => ({ date: b.tarih, start: b.baslangic.slice(0, 5), end: b.bitis.slice(0, 5) }))
}

// ---------- 3. on this day ----------

export interface PickedMemory {
  ani: Ani
  kind: MemoryAgeKind
  label: string
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

// A small stable number for a string, so "a memory for today" stays the same
// all day and changes the next.
function hashOf(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h
}

// The memory to bring back today: one from this very day in an earlier
// year, else from this day of an earlier month, else any memory from more
// than a week ago (a different one each day). Only memories with a photo.
export function pickOnThisDay(anilar: Ani[], today: string): PickedMemory | null {
  const withPhoto = anilar.filter((a) => a.foto && a.tarih < today)
  const monthDay = today.slice(5)
  const day = today.slice(8)
  const newestFirst = (a: Ani, b: Ani) => b.tarih.localeCompare(a.tarih)

  const sameDay = withPhoto.filter((a) => a.tarih.slice(5) === monthDay).sort(newestFirst)[0]
  if (sameDay) {
    const years = Number(today.slice(0, 4)) - Number(sameDay.tarih.slice(0, 4))
    return { ani: sameDay, kind: 'years', label: `${years} yıl önce bugün` }
  }

  const sameDate = withPhoto.filter((a) => a.tarih.slice(8) === day).sort(newestFirst)[0]
  if (sameDate) {
    const months = monthsBetween(sameDate.tarih, today)
    return { ani: sameDate, kind: 'months', label: `${months} ay önce bugün` }
  }

  const cutoff = dateKey(new Date(localDate(today).getTime() - MIN_THROWBACK_DAYS * DAY))
  const older = withPhoto.filter((a) => a.tarih <= cutoff).sort((a, b) => a.id.localeCompare(b.id))
  if (older.length === 0) return null
  return { ani: older[hashOf(today) % older.length], kind: 'recent', label: 'Hatırlıyor musun?' }
}

// Where a memory lives, as the chat to open: its group, or the chat with
// the other person in a pair memory. Memories shared with all friends have
// no single chat.
export function memoryTarget(ani: Pick<Ani, 'grup_id' | 'arkadas_id' | 'sahip_id'>, myId: string): string | null {
  if (ani.grup_id) return `grup:${ani.grup_id}`
  if (ani.arkadas_id) return `dm:${ani.sahip_id === myId ? ani.arkadas_id : ani.sahip_id}`
  return null
}

// ---------- people ----------

// Hex of each personal colour's solid swatch (the '500' shades in
// tailwind.config.js and Tailwind's palette), for the native widgets.
const COLOR_HEX: Record<RenkAnahtari, string> = {
  orkide: '#4A62F0',
  mercan: '#FF5A3C',
  turkuaz: '#14B8A6',
  gok: '#0EA5E9',
  kehribar: '#F59E0B',
  gul: '#F43F5E',
  mor: '#8B5CF6',
}

export function personColorHex(colorKey: string | null | undefined, name: string): string {
  const chosen = renkAl(colorKey, name)
  const key = (Object.keys(RENKLER) as RenkAnahtari[]).find((k) => RENKLER[k] === chosen)
  return key ? COLOR_HEX[key] : COLOR_HEX.mor
}

// ---------- Turkish ----------

const UNIT_SUFFIX = ["'a", "'e", "'ye", "'e", "'e", "'e", "'ya", "'ye", "'e", "'a"]
const TENS_SUFFIX: Record<number, string> = { 1: "'a", 2: "'ye", 3: "'a", 4: "'a", 5: "'ye" }

// The dative suffix a number takes when read out: 21 "yirmi bir'e",
// 19 "on dokuz'a", 20 "yirmi'ye".
function dativeOf(n: number): string {
  if (n % 10 !== 0) return UNIT_SUFFIX[n % 10]
  if (n === 0) return "'a"
  return TENS_SUFFIX[Math.floor(n / 10) % 10] ?? "'e"
}

// "21:00'e kadar", "19:30'a kadar", "20:00'ye kadar".
export function untilPhrase(clock: string): string {
  const [h, m] = clock.split(':').map(Number)
  return `${clock}${dativeOf(m ? m : h)} kadar`
}
