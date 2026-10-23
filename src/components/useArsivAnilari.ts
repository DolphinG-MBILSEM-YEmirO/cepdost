import { useCallback, useEffect, useState } from 'react'
import { useSosyalSurum } from '../sosyal/cekirdek'
import { anilariGetir, profilleriGetir, type Ani } from '../sosyal/gruplar'
import { aniEtkilesimleri, yanitlayanlar, type AniEtkilesimi } from '../sosyal/aniEtkilesimi'
import type { Profil } from '../sosyal/api'

// The memories in a group's or a friend's archive (newest day first), with
// their reactions and comments and the names that go with them. Read from
// the local copy and kept up with sync.

export interface ArsivAnilari {
  anilar: Ani[]
  etkilesimler: Map<string, AniEtkilesimi>
  profiller: Map<string, Profil>
}

export function useArsivAnilari(grupId?: string | null, arkadasId?: string | null) {
  // null while loading.
  const [arsiv, setArsiv] = useState<ArsivAnilari | null>(null)
  // The archive can't be read (say, no longer friends).
  const [ulasilamaz, setUlasilamaz] = useState(false)
  const sosyalSurum = useSosyalSurum()

  const tazele = useCallback(async () => {
    try {
      const anilar = await anilariGetir({ grupId, arkadasId })
      const etkilesimler = await aniEtkilesimleri(anilar)
      const profiller = await profilleriGetir([...anilar.map((a) => a.sahip_id), ...yanitlayanlar(etkilesimler)])
      setArsiv({ anilar, etkilesimler, profiller })
      setUlasilamaz(false)
    } catch {
      setUlasilamaz(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupId, arkadasId, sosyalSurum])

  useEffect(() => {
    void tazele()
  }, [tazele])

  return { arsiv, ulasilamaz, tazele }
}
