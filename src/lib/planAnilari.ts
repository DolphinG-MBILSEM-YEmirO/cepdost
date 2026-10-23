import type { Ani } from '../sosyal/gruplar'
import { yerAnahtari } from './planIstatistikleri'

// A plan's memories: the photos added from it to the group's or the
// friend's archive. A memory belongs to the plan when it is from the plan's
// day, or from the plan's place a day or two either side (a photo added the
// next morning with that day's date, or a plan that moved by a day).

export const YAKIN_GUN = 2

export interface AnininPlani {
  tarih: string | null
  konum?: string | null
}

function gunSirasi(tarih: string): number {
  const [y, a, g] = tarih.split('-').map(Number)
  return Date.UTC(y, a - 1, g) / 86_400_000
}

// In the order given (the archive's: the newest day first).
export function planAnilari(anilar: Ani[], plan: AnininPlani): Ani[] {
  const { tarih } = plan
  if (!tarih) return []
  const yer = plan.konum?.trim() ? yerAnahtari(plan.konum) : null
  return anilar.filter(
    (ani) =>
      ani.tarih === tarih ||
      (yer !== null && yerAnahtari(ani.mekan_adi) === yer && Math.abs(gunSirasi(ani.tarih) - gunSirasi(tarih)) <= YAKIN_GUN),
  )
}

// Who added them, each once, in the order of their first photo.
export function aniSahipleri(anilar: Ani[]): string[] {
  return [...new Set(anilar.map((a) => a.sahip_id))]
}
