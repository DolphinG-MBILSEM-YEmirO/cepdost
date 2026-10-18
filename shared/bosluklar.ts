// F16 — free-slot ("boşluk") arithmetic for group plans.
//
// Used by the server (api/ortak-plan.ts) and importable from the browser
// app, so this file must stay pure: no Node or DOM APIs and no relative
// imports (the API side resolves `.js` extensions under nodenext, the app
// side resolves through the bundler; keeping the file import-free means it
// compiles the same under both).
//
// The free slots are computed by this code, never by the model. The model
// only picks among them and writes a human title; leaving clock arithmetic
// to it would produce "everyone is free" suggestions that are not.

// A busy time range as the availability layer shares it. Only the range,
// never the title, location or category of what fills it.
export interface DoluBlok {
  tarih: string // YYYY-MM-DD
  baslangic: string // HH:MM
  bitis: string // HH:MM
}

// The hours someone is usually free for plans (their own setting).
export interface SaatPenceresi {
  baslangic: string // HH:MM
  bitis: string // HH:MM
}

// Anything that carries busy blocks. gunBosluklari only needs this part, so
// the browser can pass `[{ bloklar }]` for a single person.
export interface BlokSahibi {
  bloklar: readonly DoluBlok[]
  // Narrows the day window for everyone in the plan.
  pencere?: SaatPenceresi | null
}

export interface Katilimci extends BlokSahibi {
  ad: string
  // Someone who does not share availability arrives with an empty list.
  // That means "unknown", NOT "free all day"; the prompt says so separately.
  paylasiyor: boolean
}

// A free range in minutes since midnight. `bitis` is exclusive.
export interface Aralik {
  tarih: string // YYYY-MM-DD
  baslangic: number
  bitis: number
}

// The same range as clock times, the shape the API returns to the client.
export interface SaatliAralik {
  tarih: string // YYYY-MM-DD
  baslangic: string // HH:MM
  bitis: string // HH:MM
}

export interface BoslukSecenekleri {
  gunler: readonly string[] // candidate dates, YYYY-MM-DD
  katilimcilar: readonly BlokSahibi[]
  // Reasonable meeting window within a day.
  enErken?: string // HH:MM, default VARSAYILAN_ERKEN
  enGec?: string // HH:MM, default VARSAYILAN_GEC
  enAzDakika?: number // default VARSAYILAN_EN_AZ, clamped by enAzDakikaSinirla
  // Travel time kept free before and after every busy range.
  yolPayiDk?: number // default 0, clamped by yolPayiSinirla
  // The client's local "now". The server runs in UTC, so this has to come
  // from the client; without it a past hour could be suggested for today.
  simdiTarih?: string // YYYY-MM-DD
  simdiSaat?: string // HH:MM
}

// Suggesting a slot that starts right now is pointless too: leave time to
// get there.
export const HAZIRLIK_DK = 30

export const VARSAYILAN_ERKEN = '09:00'
export const VARSAYILAN_GEC = '23:00'
export const VARSAYILAN_EN_AZ = 60

// Bounds for the minimum slot length a caller may ask for.
const EN_AZ_ALT_SINIR = 15
const EN_AZ_UST_SINIR = 480
const YOL_PAYI_UST_SINIR = 60

const SAAT_KALIBI = /^([01]\d|2[0-3]):[0-5]\d$/

export function dakikaya(saat: string): number {
  const [s, d] = saat.split(':').map(Number)
  if (Number.isNaN(s) || Number.isNaN(d)) return 0
  return s * 60 + d
}

export function saate(dakika: number): string {
  const s = Math.floor(dakika / 60)
  const d = dakika % 60
  return `${String(s).padStart(2, '0')}:${String(d).padStart(2, '0')}`
}

export function saatliAralik(a: Aralik): SaatliAralik {
  return { tarih: a.tarih, baslangic: saate(a.baslangic), bitis: saate(a.bitis) }
}

// Missing, zero or non-numeric input falls back to the default; anything
// else is kept within 15 minutes .. 8 hours.
export function enAzDakikaSinirla(enAzDakika: unknown): number {
  return Math.max(EN_AZ_ALT_SINIR, Math.min(Number(enAzDakika) || VARSAYILAN_EN_AZ, EN_AZ_UST_SINIR))
}

// Anything else becomes 0; the rest is kept within 0 .. 60 minutes.
export function yolPayiSinirla(yolPayiDk: unknown): number {
  return Math.max(0, Math.min(Math.round(Number(yolPayiDk)) || 0, YOL_PAYI_UST_SINIR))
}

// The day window everyone in the plan shares: the caller's window cut down
// to each participant's usual hours. Malformed windows are ignored.
export function ortakPencere(erken: number, gec: number, katilimcilar: readonly BlokSahibi[]): [number, number] {
  let bas = erken
  let son = gec
  for (const k of katilimcilar) {
    const p = k.pencere
    if (!p || !SAAT_KALIBI.test(p.baslangic) || !SAAT_KALIBI.test(p.bitis) || p.bitis <= p.baslangic) continue
    bas = Math.max(bas, dakikaya(p.baslangic))
    son = Math.min(son, dakikaya(p.bitis))
  }
  return [bas, son]
}

// For one day: subtract every participant's busy blocks (widened by the
// travel buffer) from the window and return the remaining gaps that are
// long enough.
export function gunBosluklari(
  tarih: string,
  katilimcilar: readonly BlokSahibi[],
  erken: number,
  gec: number,
  enAz: number,
  yolPayi = 0,
): Aralik[] {
  const dolu: Array<[number, number]> = []
  for (const k of katilimcilar) {
    for (const b of k.bloklar) {
      if (b.tarih !== tarih) continue
      const bas = dakikaya(b.baslangic)
      const bit = dakikaya(b.bitis)
      if (bit > bas) dolu.push([bas - yolPayi, bit + yolPayi])
    }
  }

  dolu.sort((a, b) => a[0] - b[0])

  // Merge overlapping blocks: two people's overlapping classes are one busy
  // range.
  const birlesik: Array<[number, number]> = []
  for (const [bas, bit] of dolu) {
    const son = birlesik[birlesik.length - 1]
    if (son && bas <= son[1]) son[1] = Math.max(son[1], bit)
    else birlesik.push([bas, bit])
  }

  const bosluklar: Aralik[] = []
  let imlec = erken
  for (const [bas, bit] of birlesik) {
    if (bas > imlec) {
      const sonu = Math.min(bas, gec)
      if (sonu - imlec >= enAz) bosluklar.push({ tarih, baslangic: imlec, bitis: sonu })
    }
    imlec = Math.max(imlec, bit)
    if (imlec >= gec) break
  }
  if (imlec < gec && gec - imlec >= enAz) {
    bosluklar.push({ tarih, baslangic: imlec, bitis: gec })
  }

  return bosluklar
}

// Whether any of someone's busy blocks overlaps [baslangic, bitis) on that
// date. Used to check a time the user picked themselves.
export function mesgulMu(kisi: BlokSahibi, tarih: string, baslangic: number, bitis: number): boolean {
  return kisi.bloklar.some(
    (b) => b.tarih === tarih && dakikaya(b.baslangic) < bitis && dakikaya(b.bitis) > baslangic,
  )
}

// All free slots over the candidate days, in day order. For today the window
// starts no earlier than "now + HAZIRLIK_DK", so past hours are never offered.
export function bosluklariHesapla(secenekler: BoslukSecenekleri): Aralik[] {
  const [erken, gec] = ortakPencere(
    dakikaya(secenekler.enErken || VARSAYILAN_ERKEN),
    dakikaya(secenekler.enGec || VARSAYILAN_GEC),
    secenekler.katilimcilar,
  )
  const enAz = enAzDakikaSinirla(secenekler.enAzDakika)
  const yolPayi = yolPayiSinirla(secenekler.yolPayiDk)

  const simdiTarih = secenekler.simdiTarih ?? ''
  const simdiSaat = secenekler.simdiSaat ?? ''

  const bosluklar: Aralik[] = []
  for (const gun of secenekler.gunler) {
    const gunErken =
      gun === simdiTarih && /^\d{2}:\d{2}$/.test(simdiSaat)
        ? Math.max(erken, dakikaya(simdiSaat) + HAZIRLIK_DK)
        : erken
    if (gunErken >= gec) continue
    bosluklar.push(...gunBosluklari(gun, secenekler.katilimcilar, gunErken, gec, enAz, yolPayi))
  }
  return bosluklar
}
