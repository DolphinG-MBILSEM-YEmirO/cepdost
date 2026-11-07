import { useEffect, useState } from 'react'
import { motorVarMi, useSosyalSurum } from '../sosyal/cekirdek'
import { kayitliIdler, listeyeKoy, type KayitListesi } from '../sosyal/kaydedilenler'
import type { Ani } from '../sosyal/gruplar'

// Which posts are in my saved list and my "want to go" list, for the
// buttons on every card. Every card asks; one read per sync answers them
// all.

interface Listeler {
  kaydedilen: Set<string>
  gitmek: Set<string>
}

const BOS: Listeler = { kaydedilen: new Set(), gitmek: new Set() }

let onbellek: { surum: number; okuma: Promise<Listeler> } | null = null

function oku(surum: number): Promise<Listeler> {
  if (onbellek?.surum !== surum) {
    const okuma = Promise.all([kayitliIdler('kaydedilen'), kayitliIdler('gitmek-listesi')]).then(
      ([kaydedilen, gitmek]) => ({ kaydedilen, gitmek }),
    )
    onbellek = { surum, okuma }
  }
  return onbellek.okuma
}

export function useKayitliListeler(ani: Ani) {
  const surum = useSosyalSurum()
  const [listeler, setListeler] = useState<Listeler>(BOS)
  // Shown at once on a tap, before the write comes back.
  const [bekleyen, setBekleyen] = useState<Partial<Record<KayitListesi, boolean>>>({})

  useEffect(() => {
    if (!motorVarMi()) return
    let iptal = false
    oku(surum)
      .then((l) => {
        if (iptal) return
        setListeler(l)
        setBekleyen({})
      })
      .catch(() => {})
    return () => {
      iptal = true
    }
  }, [surum])

  const kayitli = bekleyen.kaydedilen ?? listeler.kaydedilen.has(ani.id)
  const gitmekListesinde = bekleyen['gitmek-listesi'] ?? listeler.gitmek.has(ani.id)

  async function koy(liste: KayitListesi, koy: boolean) {
    setBekleyen((b) => ({ ...b, [liste]: koy }))
    try {
      await listeyeKoy(liste, ani, koy)
    } catch (err) {
      setBekleyen((b) => ({ ...b, [liste]: undefined }))
      throw err
    }
  }

  return { kayitli, gitmekListesinde, koy }
}
