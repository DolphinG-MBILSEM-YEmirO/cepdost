import type { Kayit, Kategori, Oncelik } from '../db'

// Today's date as YYYY-MM-DD in the user's own time zone. toISOString() gives
// the UTC date, which in Turkey (UTC+3) is still "yesterday" until 03:00.
export function localDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A date string as a Date. A plan's day ('YYYY-MM-DD') is local midnight:
// new Date('2026-10-22') would be UTC midnight, which west of Greenwich is
// still the day before. Anything else (a full timestamp) parses as usual.
export function parseLocalDate(dateStr: string): Date {
  const gun = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  return gun ? new Date(Number(gun[1]), Number(gun[2]) - 1, Number(gun[3])) : new Date(dateStr)
}

export function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null
  const date = parseLocalDate(dateStr)
  if (isNaN(date.getTime())) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)

  const diffMs = target.getTime() - today.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Bugün'
  if (diffDays === 1) return 'Yarın'
  if (diffDays === -1) return 'Dün'
  if (diffDays > 0 && diffDays <= 7) return `${diffDays} gün sonra`
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)} gün önce`

  return date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: target.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  })
}

export function formatTime(timeStr: string | null): string | null {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  const date = new Date()
  date.setHours(h, m, 0, 0)
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

// Clock time of a message timestamp (ISO), with the day when it isn't today.
export function formatMessageTime(iso: string): string | null {
  const date = new Date(iso)
  if (isNaN(date.getTime())) return null
  const saat = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  if (isSameDay(iso, new Date())) return saat
  return `${date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${saat}`
}

// A plan's time for display: "Tüm gün" for an all-day plan, else its clock
// time (null when it has none).
export function formatPlanTime(saat: string | null, tumGun?: boolean | null): string | null {
  if (tumGun) return 'Tüm gün'
  return saat ? formatTime(saat.slice(0, 5)) : null
}

// A day's busy ranges for display. A range covering the whole day (an
// all-day plan) reads as such instead of "00:00–23:59".
export function formatBusyRanges(bloklar: ReadonlyArray<{ baslangic: string; bitis: string }>): string {
  if (bloklar.some((b) => b.baslangic.slice(0, 5) === '00:00' && b.bitis.slice(0, 5) >= '23:59')) return 'Bütün gün dolu'
  return bloklar.map((b) => `${b.baslangic.slice(0, 5)}–${b.bitis.slice(0, 5)}`).join(', ') + ' dolu'
}

export function formatDuration(min: number | null): string | null {
  if (!min || min <= 0) return null
  if (min < 60) return `${min} dk`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h} sa ${m} dk` : `${h} sa`
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diffMs = now - timestamp
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'şimdi'
  if (diffMin < 60) return `${diffMin} dk önce`
  if (diffHr < 24) return `${diffHr} sa önce`
  if (diffDay < 7) return `${diffDay} gün önce`
  return new Date(timestamp).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

export function isSameDay(dateStr: string | null, ref: Date): boolean {
  if (!dateStr) return false
  const d = parseLocalDate(dateStr)
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate()
}

export function isToday(dateStr: string | null): boolean {
  return isSameDay(dateStr, new Date())
}

export function isTomorrow(dateStr: string | null): boolean {
  const t = new Date()
  t.setDate(t.getDate() + 1)
  return isSameDay(dateStr, t)
}

export function isUpcoming(dateStr: string | null): boolean {
  if (!dateStr) return false
  const date = parseLocalDate(dateStr)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return date.getTime() >= now.getTime()
}

export function isPast(dateStr: string | null): boolean {
  if (!dateStr) return false
  const date = parseLocalDate(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date.getTime() < today.getTime()
}

export function sortByTime(kayitlar: Kayit[]): Kayit[] {
  return [...kayitlar].sort((a, b) => {
    // All-day plans first, untimed ones last.
    const aTime = a.tumGun ? '' : (a.saat ?? '99:99')
    const bTime = b.tumGun ? '' : (b.saat ?? '99:99')
    return aTime.localeCompare(bTime)
  })
}

export function priorityRank(p: Oncelik): number {
  return p === 'yuksek' ? 0 : p === 'orta' ? 1 : 2
}

export function sortByPriority(kayitlar: Kayit[]): Kayit[] {
  return [...kayitlar].sort((a, b) => priorityRank(a.oncelik) - priorityRank(b.oncelik))
}

export function mapUrl(kayit: Kayit): string | null {
  if (kayit.konum) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(kayit.konum)}`
  }
  return null
}

export const CATEGORIES: Kategori[] = ['mekan', 'tarif', 'urun', 'etkinlik', 'not']
export const PRIORITIES: Oncelik[] = ['yuksek', 'orta', 'dusuk']

export function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export const CATEGORY_LABELS: Record<Kategori, string> = {
  mekan: 'Mekân',
  tarif: 'Tarif',
  urun: 'Ürün',
  etkinlik: 'Etkinlik',
  not: 'Not',
}

export const CATEGORY_ICON_NAME: Record<Kategori, 'MapPin' | 'UtensilsCrossed' | 'ShoppingBag' | 'CalendarHeart' | 'StickyNote'> = {
  mekan: 'MapPin',
  tarif: 'UtensilsCrossed',
  urun: 'ShoppingBag',
  etkinlik: 'CalendarHeart',
  not: 'StickyNote',
}

export const CATEGORY_COLORS: Record<Kategori, { bg: string; text: string; ring: string }> = {
  mekan: { bg: 'bg-teal-100', text: 'text-teal-700', ring: 'ring-teal-200' },
  tarif: { bg: 'bg-amber-100', text: 'text-amber-700', ring: 'ring-amber-200' },
  urun: { bg: 'bg-sky-100', text: 'text-sky-700', ring: 'ring-sky-200' },
  etkinlik: { bg: 'bg-violet-100', text: 'text-violet-700', ring: 'ring-violet-200' },
  not: { bg: 'bg-ink-100', text: 'text-ink-600', ring: 'ring-ink-200' },
}

// Category colours for small marks (calendar dots, share bars), in this
// order checked to stay apart for colour-blind eyes; 'not' is the neutral
// one. Marks always come with a label, so colour is never the only cue.
export const CATEGORY_MARK_COLORS: Record<Kategori, string> = {
  mekan: 'bg-teal-600',
  tarif: 'bg-amber-600',
  urun: 'bg-sky-600',
  etkinlik: 'bg-violet-600',
  not: 'bg-ink-400',
}

export const PRIORITY_LABELS: Record<Oncelik, string> = {
  dusuk: 'Düşük',
  orta: 'Orta',
  yuksek: 'Yüksek',
}

export const PRIORITY_COLORS: Record<Oncelik, { bg: string; text: string; dot: string }> = {
  dusuk: { bg: 'bg-ink-100', text: 'text-ink-500', dot: 'bg-ink-300' },
  orta: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-400' },
  yuksek: { bg: 'bg-rose-100', text: 'text-rose-700', dot: 'bg-rose-500' },
}
