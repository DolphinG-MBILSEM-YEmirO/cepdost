import { arkadaslariGetir, type Profil } from './api'
import { aniEtkilesimleri, type AniEtkilesimi } from './aniEtkilesimi'
import { motor, motorVarMi } from './cekirdek'
import { akisAnilariGetir, profilleriGetir, type Ani } from './gruplar'

// What the ideas list needs from the social side to say who an idea is
// with: my friends' memories and their answers, names, and which of those
// people are friends I can plan with. Read from the local copy.

export interface FikirBaglami {
  benimId: string
  anilar: Ani[]
  etkilesimler: Map<string, AniEtkilesimi>
  profiller: Map<string, Profil>
  // Friends (accepted), who the shared-time planner can take.
  arkadaslar: Map<string, Profil>
}

export const BOS_FIKIR_BAGLAMI: FikirBaglami = {
  benimId: '',
  anilar: [],
  etkilesimler: new Map(),
  profiller: new Map(),
  arkadaslar: new Map(),
}

// More than the feed shows: an idea can come from an older memory.
const ANI_SINIRI = 300

export async function fikirBaglamiGetir(): Promise<FikirBaglami> {
  if (!motorVarMi()) return BOS_FIKIR_BAGLAMI
  const [anilar, liste] = await Promise.all([akisAnilariGetir('arkadaslar', ANI_SINIRI), arkadaslariGetir()])
  const etkilesimler = await aniEtkilesimleri(anilar)
  const kisiler = [...anilar.map((a) => a.sahip_id), ...[...etkilesimler.values()].flatMap((e) => e.gitmekIsteyenler)]
  return {
    benimId: motor().benimId,
    anilar,
    etkilesimler,
    profiller: await profilleriGetir(kisiler),
    arkadaslar: new Map(liste.filter((a) => a.durum === 'kabul').map((a) => [a.profil.id, a.profil])),
  }
}
