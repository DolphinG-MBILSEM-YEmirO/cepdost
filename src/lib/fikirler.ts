import type { Kayit } from '../db'
import type { Ani } from '../sosyal/gruplar'
import type { AniEtkilesimi } from '../sosyal/aniEtkilesimi'
import { yerAnahtari } from './planIstatistikleri'

// Ideas: plans with no day yet, such as a place saved from a friend's
// memory with "Ben de gitmek istiyorum", or a link saved for later.

export function fikirMi(k: Kayit): boolean {
  return k.durum === 'bekliyor' && !k.tarih
}

// The newest idea first.
export function fikirler(kayitlar: Kayit[]): Kayit[] {
  return kayitlar.filter(fikirMi).sort((a, b) => b.olusturulmaTarihi - a.olusturulmaTarihi)
}

export interface FikirKisileri {
  // Friends who shared a memory from the place: they've been there.
  gidenler: string[]
  // Friends who said they want to go there too.
  isteyenler: string[]
}

export const BOS_KISILER: FikirKisileri = { gidenler: [], isteyenler: [] }

// Who an idea is with, from the memories at its place (matched however the
// place was spelled). Someone who has been there isn't also counted as
// wanting to go, and I'm in neither list.
export function fikirKisileri(
  fikir: Kayit,
  anilar: Ani[],
  etkilesimler: Map<string, AniEtkilesimi>,
  benimId: string,
): FikirKisileri {
  const yer = fikir.konum?.trim() ? yerAnahtari(fikir.konum) : null
  if (!yer) return BOS_KISILER
  const gidenler = new Set<string>()
  const isteyenler = new Set<string>()
  for (const ani of anilar) {
    if (yerAnahtari(ani.mekan_adi) !== yer) continue
    gidenler.add(ani.sahip_id)
    for (const id of etkilesimler.get(ani.id)?.gitmekIsteyenler ?? []) isteyenler.add(id)
  }
  gidenler.delete(benimId)
  isteyenler.delete(benimId)
  for (const id of gidenler) isteyenler.delete(id)
  return { gidenler: [...gidenler], isteyenler: [...isteyenler] }
}

// What the shared-time planner is asked for: the idea's title, and its
// place when that says something more.
export function fikirIstegi(fikir: Kayit, baslik: string): string {
  const konum = fikir.konum?.trim()
  return konum && yerAnahtari(konum) !== yerAnahtari(baslik) ? `${baslik} (${konum})` : baslik
}
