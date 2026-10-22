import type { Kayit } from '../db'
import { addDays, parseLocalDate, toDateString } from './format'

// Date arithmetic behind the calendar: the month grid, missed plans and
// where a day's plans can be moved. Days are 'YYYY-MM-DD' strings in local
// time, the way plans store them.

export const HAFTA_GUNLERI = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const

export interface IzgaraGunu {
  tarih: string
  gun: number
  // False for the days of the previous and next month that fill the grid.
  buAy: boolean
}

// Six Monday-first weeks around a month (`ay` counts from 0), so every month
// takes the same space and the grid doesn't jump while paging.
export function ayIzgarasi(yil: number, ay: number): IzgaraGunu[] {
  const ilk = new Date(yil, ay, 1)
  const pazartesiyeKadar = (ilk.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => {
    const gun = new Date(yil, ay, 1 - pazartesiyeKadar + i)
    return { tarih: toDateString(gun), gun: gun.getDate(), buAy: gun.getMonth() === ilk.getMonth() }
  })
}

export function ayBasligi(yil: number, ay: number): string {
  return new Date(yil, ay, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
}

export interface GunOzeti {
  bekleyen: Kayit[]
  yapilan: number
}

// Each day's pending plans and how many are done, for the grid's dots.
export function gunOzetleri(kayitlar: Kayit[]): Map<string, GunOzeti> {
  const ozetler = new Map<string, GunOzeti>()
  for (const k of kayitlar) {
    if (!k.tarih) continue
    const ozet = ozetler.get(k.tarih) ?? { bekleyen: [], yapilan: 0 }
    if (k.durum === 'yapildi') ozet.yapilan++
    else ozet.bekleyen.push(k)
    ozetler.set(k.tarih, ozet)
  }
  return ozetler
}

// Whole days from one day to another (negative when `son` is earlier).
// Rounded, so a daylight-saving change doesn't cost a day.
export function gunFarki(ilk: string, son: string): number {
  return Math.round((parseLocalDate(son).getTime() - parseLocalDate(ilk).getTime()) / 86_400_000)
}

export function gunEkle(tarih: string, gun: number): string {
  return toDateString(addDays(parseLocalDate(tarih), gun))
}

// A day as a button reads it: Bugün, Yarın, a weekday within the coming
// week, Haftaya for a week from today, else the date.
export function goreceGun(tarih: string, bugun: string): string {
  const fark = gunFarki(bugun, tarih)
  if (fark === 0) return 'Bugün'
  if (fark === 1) return 'Yarın'
  if (fark === -1) return 'Dün'
  if (fark === 7) return 'Haftaya'
  const gun = parseLocalDate(tarih)
  if (fark > 1 && fark < 7) return gun.toLocaleDateString('tr-TR', { weekday: 'long' })
  const ayniYil = gun.getFullYear() === parseLocalDate(bugun).getFullYear()
  return gun.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: ayniYil ? undefined : 'numeric' })
}

// Pending plans whose day has passed, the most recent day first.
export function kacanPlanlar(kayitlar: Kayit[], bugun: string): Kayit[] {
  return kayitlar
    .filter((k) => k.durum === 'bekliyor' && k.tarih && k.tarih < bugun)
    .sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? '') || (a.saat ?? '99').localeCompare(b.saat ?? '99'))
}

export interface ErtelemeSecenegi {
  etiket: string
  tarih: string
}

// Where plans on a day can go. A missed day's plans come back to today or
// later; plans on today or a later day only move forward from their day.
export function ertelemeSecenekleri(tarih: string, bugun: string): ErtelemeSecenegi[] {
  const hedefler = tarih < bugun ? [bugun, gunEkle(bugun, 1), gunEkle(bugun, 7)] : [1, 3, 7].map((n) => gunEkle(tarih, n))
  return hedefler.map((hedef) => ({ etiket: goreceGun(hedef, bugun), tarih: hedef }))
}
