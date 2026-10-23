import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { decode, npubEncode, nsecEncode } from 'nostr-tools/nip19'
import { hexe, hextenBayt } from './nostr/kodlama'

// The account is a key pair kept on the device. There is no server-side
// account: the public key is the user id, the secret key signs and decrypts
// everything. Losing the secret key means losing the account, so it can be
// restored two ways:
//   - the recovery code (the secret key as an "nsec1..." string), and
//   - username + password (a password-encrypted backup on the relays, see
//     hesap.ts).

const KIMLIK_ANAHTARI = 'cepdost-kimlik'

// Storage key the old Supabase client used for its session. If it's still
// there, this device had an account before the switch to the new system.
const ESKI_OTURUM_ANAHTARI = 'cepdost-oturum'

function depo(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function kayitliKimlik(): Uint8Array | null {
  const hex = depo()?.getItem(KIMLIK_ANAHTARI)
  if (!hex || !/^[0-9a-f]{64}$/.test(hex)) return null
  return hextenBayt(hex)
}

export function kimlikKaydet(gizliAnahtar: Uint8Array): void {
  depo()?.setItem(KIMLIK_ANAHTARI, hexe(gizliAnahtar))
}

export function kimlikSil(): void {
  depo()?.removeItem(KIMLIK_ANAHTARI)
}

export function yeniKimlik(): Uint8Array {
  return generateSecretKey()
}

export function acikAnahtar(gizliAnahtar: Uint8Array): string {
  return getPublicKey(gizliAnahtar)
}

export function kurtarmaKodu(gizliAnahtar: Uint8Array): string {
  return nsecEncode(gizliAnahtar)
}

// Accepts the recovery code ("nsec1...") or the raw 64-character hex key.
export function kurtarmaKodundanKimlik(kod: string): Uint8Array | null {
  const temiz = kod.trim().replace(/\s+/g, '')
  if (/^[0-9a-fA-F]{64}$/.test(temiz)) return hextenBayt(temiz.toLowerCase())
  try {
    const sonuc = decode(temiz.toLowerCase())
    return sonuc.type === 'nsec' ? sonuc.data : null
  } catch {
    return null
  }
}

// "npub1..." form of a public key, used in invite links.
export function davetAnahtari(acik: string): string {
  return npubEncode(acik)
}

export function davetAnahtarindanKimlik(deger: string): string | null {
  try {
    const sonuc = decode(deger.trim().toLowerCase())
    return sonuc.type === 'npub' ? sonuc.data : null
  } catch {
    return null
  }
}

export function eskiOturumVarMi(): boolean {
  return Boolean(depo()?.getItem(ESKI_OTURUM_ANAHTARI))
}

export function eskiOturumuUnut(): void {
  depo()?.removeItem(ESKI_OTURUM_ANAHTARI)
}
