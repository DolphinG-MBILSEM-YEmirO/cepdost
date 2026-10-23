import { getEventHash, verifyEvent, type Event } from 'nostr-tools/pure'

// Email verification, shared by the server (api/eposta.ts) and the app.
//
// A new account proves it can read mail at an address: the server mails a
// code, and when the code comes back it signs a small Nostr event saying
// "this account has a verified email". The event carries a keyed hash of
// the address, never the address itself, so it can travel in public places
// (search results, Keşfet, friend requests) without exposing anyone's mail.
// The app checks it against the server's public key.

// Event kinds. Both stay between the app and our server; neither is
// published to relays on its own (the attestation rides inside records).
export const ONAY_TURU = 27_001
export const ISTEK_TURU = 27_002

// A code request is signed by the account and carries proof of work
// (NIP-13 leading zero bits of its id): about a second on a phone, which is
// nothing for a person and a real cost for a script sending thousands.
export const ISTEK_ZORLUGU = 16
// How far a code request's timestamp may be from the server's clock.
export const ISTEK_ZAMAN_PAYI_SN = 5 * 60

// 8 characters from an alphabet without look-alikes (0/O, 1/I): about 40
// bits, so guessing a code within its lifetime is out of reach.
export const KOD_ALFABESI = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const KOD_UZUNLUGU = 8
export const KOD_GECERLILIK_MS = 15 * 60 * 1000

export type EpostaOnayi = Event

// Lower-case, trimmed, and plausibly an address; null otherwise. Only a sent
// code proves the address really exists.
export function epostaNormallestir(eposta: string): string | null {
  const temiz = eposta.trim().toLowerCase()
  if (temiz.length > 254) return null
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/.test(temiz) ? temiz : null
}

// What the user typed, in the form codes are issued: "abcd-efgh" and
// "ABCD EFGH" both read as "ABCDEFGH".
export function kodNormallestir(kod: string): string {
  return kod.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// "ABCDEFGH" -> "ABCD-EFGH", easier to read in a mail and to type.
export function kodGoster(kod: string): string {
  return `${kod.slice(0, 4)}-${kod.slice(4)}`
}

function etiket(olay: { tags: string[][] }, ad: string): string | null {
  return olay.tags.find((t) => t[0] === ad)?.[1] ?? null
}

// The keyed hash of the address the attestation was issued for. The same
// address always gives the same value, so several accounts on one address
// can be noticed without learning the address.
export function onayOzeti(onay: EpostaOnayi): string | null {
  return etiket(onay, 'ozet')
}

// Signature checks already done, by event id and signature. The id is
// recomputed from the fields on every check, so an entry here can never
// vouch for changed content. Lists (search, Keşfet) re-check the same
// attestations often.
const imzaSonuclari = new Map<string, boolean>()

function imzaGecerliMi(o: Event): boolean {
  // Checked on a fresh copy: nostr-tools marks a verified event object, and
  // that mark would carry over to a copy whose fields were changed.
  const olay: Event = {
    id: o.id,
    pubkey: o.pubkey,
    created_at: o.created_at,
    kind: o.kind,
    tags: o.tags,
    content: o.content,
    sig: o.sig,
  }
  if (getEventHash(olay) !== olay.id) return false
  const anahtar = `${olay.id}:${olay.sig}`
  let sonuc = imzaSonuclari.get(anahtar)
  if (sonuc === undefined) {
    sonuc = verifyEvent(olay)
    if (imzaSonuclari.size >= 2000) imzaSonuclari.clear()
    imzaSonuclari.set(anahtar, sonuc)
  }
  return sonuc
}

// Whether `onay` is our server's attestation for account `pk`.
export function onayGecerliMi(onay: unknown, pk: string, imzaci: string): onay is EpostaOnayi {
  if (typeof onay !== 'object' || onay === null) return false
  const o = onay as Partial<Event>
  if (o.kind !== ONAY_TURU || o.pubkey !== imzaci || !Array.isArray(o.tags)) return false
  if (!o.tags.every((t) => Array.isArray(t) && t.every((x) => typeof x === 'string'))) return false
  if (etiket(o as Event, 'p') !== pk) return false
  if (typeof o.content !== 'string' || typeof o.created_at !== 'number') return false
  if (typeof o.id !== 'string' || typeof o.sig !== 'string') return false
  try {
    return imzaGecerliMi(o as Event)
  } catch {
    return false
  }
}
