import { useEffect, useState } from 'react'
import { arkadaslariGetir, type Profil } from '../sosyal/api'
import { grupUyeleriGetir } from '../sosyal/gruplar'
import { motor, motorVarMi } from '../sosyal/cekirdek'

// Only people who will see a post can be tagged in it: the group's members
// for a group post, the one friend for a post to them, otherwise my
// friends.

export type EtiketKitlesi = { grupId: string } | { arkadasId: string } | 'arkadaslarim'

// The people who can be tagged for this audience (never me).
export function useEtiketAdaylari(kitle: EtiketKitlesi): Profil[] | null {
  const anahtar = typeof kitle === 'string' ? kitle : 'grupId' in kitle ? `g:${kitle.grupId}` : `a:${kitle.arkadasId}`
  const [adaylar, setAdaylar] = useState<{ anahtar: string; liste: Profil[] } | null>(null)

  useEffect(() => {
    if (!motorVarMi()) return
    let iptal = false
    const benimId = motor().benimId
    const oku = async (): Promise<Profil[]> => {
      if (typeof kitle !== 'string' && 'grupId' in kitle) {
        const uyeler = await grupUyeleriGetir(kitle.grupId)
        return uyeler.flatMap((u) => (u.kullanici_id !== benimId && u.profil ? [u.profil] : []))
      }
      const arkadaslar = (await arkadaslariGetir()).filter((a) => a.durum === 'kabul').map((a) => a.profil)
      return typeof kitle === 'string' ? arkadaslar : arkadaslar.filter((p) => p.id === kitle.arkadasId)
    }
    oku()
      .then((liste) => !iptal && setAdaylar({ anahtar, liste }))
      .catch(() => !iptal && setAdaylar({ anahtar, liste: [] }))
    return () => {
      iptal = true
    }
    // The key stands for the audience.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anahtar])

  return adaylar?.anahtar === anahtar ? adaylar.liste : null
}
