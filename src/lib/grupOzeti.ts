import type { Ani, GrupPlani } from '../sosyal/gruplar'
import { yerAnahtari, yerleriSay } from './planIstatistikleri'

// A group at a glance, for the top of its page: the next plan, the last
// memory, how much the group has done together and where it goes most.

export interface GrupOzeti {
  siradaki: GrupPlani | null
  // Plans whose day has passed.
  gecmisPlan: number
  sonAni: Ani | null
  aniSayisi: number
  // A place the group has been to on more than one day.
  enSikYer: string | null
}

// Earliest first; on the same day, a plan with no time goes last.
const siraAnahtari = (p: GrupPlani) => `${p.tarih}${p.saat ?? '99'}`

export function grupOzeti(planlar: GrupPlani[], anilar: Ani[], bugun: string): GrupOzeti {
  const gelecek = planlar.filter((p) => p.tarih >= bugun).sort((a, b) => siraAnahtari(a).localeCompare(siraAnahtari(b)))
  const gecmis = planlar.filter((p) => p.tarih < bugun)
  const sonAni = anilar.reduce<Ani | null>(
    (son, a) => (!son || a.tarih > son.tarih || (a.tarih === son.tarih && a.olusturulma > son.olusturulma) ? a : son),
    null,
  )

  // One visit per place per day: a plan and the photos from it count once.
  const ziyaretler = new Map<string, string>()
  const ziyaret = (yer: string | null, tarih: string) => {
    const anahtar = yer?.trim() ? `${yerAnahtari(yer)}|${tarih}` : null
    if (anahtar && !ziyaretler.has(anahtar)) ziyaretler.set(anahtar, yer!)
  }
  for (const p of gecmis) ziyaret(p.konum, p.tarih)
  for (const a of anilar) ziyaret(a.mekan_adi, a.tarih)

  return {
    siradaki: gelecek[0] ?? null,
    gecmisPlan: gecmis.length,
    sonAni,
    aniSayisi: anilar.length,
    enSikYer: yerleriSay([...ziyaretler.values()], 1).find((y) => y.sayi > 1)?.ad ?? null,
  }
}
