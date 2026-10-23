import type { Ani } from '../sosyal/gruplar'
import { yerAnahtari, yerleriSay, type EnCokYer } from './planIstatistikleri'
import { ayBasligi } from './takvimIzgarasi'

// A group's or a friend's memory archive laid out: by month, the newest
// first, and the places in it to filter by.

export interface AniAyi {
  // 'YYYY-MM'
  ay: string
  baslik: string
  anilar: Ani[]
}

// Places shown as filters, the most photographed first.
export const YER_SINIRI = 6

const yeniOnce = (a: Ani, b: Ani) => b.tarih.localeCompare(a.tarih) || b.olusturulma.localeCompare(a.olusturulma)

export function aylaraBol(anilar: Ani[]): AniAyi[] {
  const aylar: AniAyi[] = []
  for (const ani of [...anilar].sort(yeniOnce)) {
    const ay = ani.tarih.slice(0, 7)
    let grup = aylar[aylar.length - 1]
    if (grup?.ay !== ay) {
      const [yil, ayNo] = ay.split('-').map(Number)
      grup = { ay, baslik: ayBasligi(yil, ayNo - 1), anilar: [] }
      aylar.push(grup)
    }
    grup.anilar.push(ani)
  }
  return aylar
}

// Filtering by place only helps with two places or more.
export function arsivYerleri(anilar: Ani[]): EnCokYer[] {
  const yerler = yerleriSay(anilar.map((a) => a.mekan_adi), YER_SINIRI)
  return yerler.length >= 2 ? yerler : []
}

// The memories at a place, however it was spelled; all of them with none.
export function yerdekiAnilar(anilar: Ani[], yer: string | null): Ani[] {
  if (!yer) return anilar
  const anahtar = yerAnahtari(yer)
  return anilar.filter((a) => yerAnahtari(a.mekan_adi) === anahtar)
}
