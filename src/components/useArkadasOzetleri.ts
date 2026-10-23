import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { ortakGecmis, type OrtakGecmis } from '../lib/planIstatistikleri'
import { grupOzeti } from '../lib/grupOzeti'
import { useBugun } from '../hooks/useBugun'
import { useSosyalSurum } from '../sosyal/cekirdek'
import { grupPlanlariGetir, type GrupPlani } from '../sosyal/gruplar'
import { plandakiArkadaslar } from '../sosyal/ortakGecmis'

// What each friend and group in the friends list has going on: what we've
// done together with each friend, and each group's next plan. Worked out
// on the device from my calendar and the local social records, again when
// either changes.

export interface ArkadasOzetleri {
  gecmisler: Map<string, OrtakGecmis>
  siradakiler: Map<string, GrupPlani>
}

export function useArkadasOzetleri(arkadasIdler: string[], grupIdler: string[]): ArkadasOzetleri | null {
  const bugun = useBugun()
  const surum = useSosyalSurum()
  const kayitlar = useLiveQuery(() => db.kayitlar.toArray(), [])
  const [ozetler, setOzetler] = useState<ArkadasOzetleri | null>(null)
  // Keys rather than arrays, so a re-render with the same people doesn't
  // start the work again.
  const arkadasAnahtari = arkadasIdler.join(',')
  const grupAnahtari = grupIdler.join(',')

  useEffect(() => {
    if (!kayitlar) return
    let iptal = false
    const arkadaslar = arkadasAnahtari ? arkadasAnahtari.split(',') : []
    const gruplar = grupAnahtari ? grupAnahtari.split(',') : []
    void (async () => {
      const plandaMi = await plandakiArkadaslar(kayitlar)
      const gecmisler = new Map(arkadaslar.map((id) => [id, ortakGecmis(kayitlar, plandaMi(id), bugun)] as const))
      const siradakiler = new Map<string, GrupPlani>()
      await Promise.all(
        gruplar.map(async (id) => {
          const siradaki = grupOzeti(await grupPlanlariGetir(id), [], bugun).siradaki
          if (siradaki) siradakiler.set(id, siradaki)
        }),
      )
      if (!iptal) setOzetler({ gecmisler, siradakiler })
    })().catch(() => {})
    return () => {
      iptal = true
    }
  }, [kayitlar, bugun, surum, arkadasAnahtari, grupAnahtari])

  return ozetler
}
