import { onayGecerliMi, type EpostaOnayi } from '../../shared/epostaOnayi'

export type { EpostaOnayi }

// Which key email attestations must be signed with (see api/eposta.ts),
// and the checks built on it. Kept apart from eposta.ts so the social core
// can use it without an import cycle.

const IMZACI_ANAHTARI = 'cepdost_eposta_imzacisi'
// How long a key read from storage stands in before the server is asked again.
const YEDEK_SURESI_MS = 60_000

// undefined: not known yet. null: this deployment doesn't verify emails.
let imzaci: string | null | undefined
// When `imzaci` came from storage because the server couldn't be reached;
// 0 when it is the server's own answer, which holds for the session.
let yedektenAlindi = 0
let istek: Promise<string | null> | null = null

function kayitliImzaci(): string | null {
  try {
    const deger = globalThis.localStorage?.getItem(IMZACI_ANAHTARI) ?? null
    return deger && /^[0-9a-f]{64}$/.test(deger) ? deger : null
  } catch {
    return null
  }
}

function kaydet(deger: string | null): void {
  try {
    if (deger) globalThis.localStorage?.setItem(IMZACI_ANAHTARI, deger)
    else globalThis.localStorage?.removeItem(IMZACI_ANAHTARI)
  } catch {
    /* memory only */
  }
}

// The key, or null when nobody is held to verification here (then an
// account without an attestation is treated like any other).
export function epostaImzacisi(): Promise<string | null> {
  if (istek) return istek
  if (imzaci !== undefined && (yedektenAlindi === 0 || Date.now() - yedektenAlindi < YEDEK_SURESI_MS)) {
    return Promise.resolve(imzaci)
  }
  istek = (async () => {
    try {
      const res = await fetch('/api/eposta', { signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const veri = (await res.json()) as { imzaci?: unknown }
      imzaci = typeof veri.imzaci === 'string' && /^[0-9a-f]{64}$/.test(veri.imzaci) ? veri.imzaci : null
      yedektenAlindi = 0
      kaydet(imzaci)
    } catch {
      imzaci = kayitliImzaci()
      yedektenAlindi = Date.now()
    } finally {
      istek = null
    }
    return imzaci ?? null
  })()
  return istek
}

// Tests set the key directly.
export function epostaImzacisiniAyarla(deger: string | null): void {
  imzaci = deger
  yedektenAlindi = 0
}

export async function epostaDogrulamasiGerekli(): Promise<boolean> {
  return (await epostaImzacisi()) !== null
}

// Whether account `pk` may show up in public places (search results,
// Keşfet, friend requests): it has a valid attestation, or nobody needs one.
export async function onayliMi(pk: string, onay: unknown): Promise<boolean> {
  const anahtar = await epostaImzacisi()
  return anahtar === null || onayGecerliMi(onay, pk, anahtar)
}

// Keeps the entries whose account passes onayliMi.
export async function onaylilariSec<T>(liste: T[], kim: (x: T) => { pk: string; onay: unknown }): Promise<T[]> {
  const anahtar = await epostaImzacisi()
  if (anahtar === null) return liste
  return liste.filter((x) => {
    const { pk, onay } = kim(x)
    return onayGecerliMi(onay, pk, anahtar)
  })
}
