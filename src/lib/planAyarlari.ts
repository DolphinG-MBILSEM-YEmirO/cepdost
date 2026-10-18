import { useSyncExternalStore } from 'react'
import type { SaatPenceresi } from '../sosyal/cekirdek'

// The user's own planning preferences. The usual hours travel to friends
// with the busy ranges (see musaitlikSenkron.ts), so their suggestions
// skip times the user is never free; the travel buffer only shapes the
// suggestions made on this device.

export interface PlanAyarlari {
  // null = no preference: the planner's default day window applies.
  pencere: SaatPenceresi | null
  // Room left before and after busy ranges when a time is suggested.
  yolPayiDk: number
}

export const YOL_PAYI_SECENEKLERI = [0, 15, 30] as const

export const VARSAYILAN_PLAN_AYARLARI: PlanAyarlari = { pencere: null, yolPayiDk: 15 }

const ANAHTAR = 'cepdost_plan_ayarlari'
const DEGISTI = 'cepdost-plan-ayarlari'

const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/

// Private windows and blocked storage throw on access; the defaults apply.
function depo(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function oku(ham: string | null): PlanAyarlari {
  try {
    const v = ham ? (JSON.parse(ham) as Partial<PlanAyarlari>) : null
    const p = v?.pencere
    const pencere =
      p && SAAT.test(p.baslangic) && SAAT.test(p.bitis) && p.bitis > p.baslangic
        ? { baslangic: p.baslangic, bitis: p.bitis }
        : null
    const yolPayiDk = (YOL_PAYI_SECENEKLERI as readonly number[]).includes(Number(v?.yolPayiDk))
      ? Number(v?.yolPayiDk)
      : VARSAYILAN_PLAN_AYARLARI.yolPayiDk
    return { pencere, yolPayiDk }
  } catch {
    return VARSAYILAN_PLAN_AYARLARI
  }
}

// Cached so useSyncExternalStore gets the same object until it changes.
let onbellek: { ham: string | null; ayar: PlanAyarlari } | null = null

export function planAyarlari(): PlanAyarlari {
  let ham: string | null = null
  try {
    ham = depo()?.getItem(ANAHTAR) ?? null
  } catch {
    /* unreadable storage: defaults */
  }
  if (!onbellek || onbellek.ham !== ham) onbellek = { ham, ayar: oku(ham) }
  return onbellek.ayar
}

export function planAyarlariniKaydet(ayar: PlanAyarlari): void {
  try {
    depo()?.setItem(ANAHTAR, JSON.stringify(ayar))
  } catch {
    /* not saved; the screen still shows the choice until reload */
  }
  globalThis.dispatchEvent?.(new Event(DEGISTI))
}

function dinle(dinleyici: () => void): () => void {
  globalThis.addEventListener?.(DEGISTI, dinleyici)
  globalThis.addEventListener?.('storage', dinleyici)
  return () => {
    globalThis.removeEventListener?.(DEGISTI, dinleyici)
    globalThis.removeEventListener?.('storage', dinleyici)
  }
}

export function usePlanAyarlari(): PlanAyarlari {
  return useSyncExternalStore(dinle, planAyarlari, planAyarlari)
}
