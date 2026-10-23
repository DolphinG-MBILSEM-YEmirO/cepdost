// Small WebCrypto helpers shared by the social layer: byte encodings,
// hashing, HMAC key derivation and AES-GCM encryption of JSON values.
//
// Everything that leaves the device is encrypted with keys derived here, so
// relays only ever store ciphertext they cannot read.

const kodlayici = new TextEncoder()
const cozucu = new TextDecoder()

export function rastgeleBaytlar(uzunluk: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(uzunluk))
}

export function hexe(baytlar: Uint8Array): string {
  return Array.from(baytlar, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function hextenBayt(hex: string): Uint8Array {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) throw new Error('Geçersiz hex')
  return Uint8Array.from(hex.match(/../g) ?? [], (cift) => parseInt(cift, 16))
}

export function base64Url(baytlar: Uint8Array): string {
  let ikili = ''
  for (const b of baytlar) ikili += String.fromCharCode(b)
  return btoa(ikili).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrldenBayt(deger: string): Uint8Array {
  const b64 = deger.replace(/-/g, '+').replace(/_/g, '/')
  const ikili = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(ikili, (k) => k.charCodeAt(0))
}

export function metniBayta(metin: string): Uint8Array {
  return kodlayici.encode(metin)
}

// WebCrypto wants an ArrayBuffer-backed view; a copy keeps TypeScript and
// every browser happy regardless of where the bytes came from.
function tampon(baytlar: Uint8Array): ArrayBuffer {
  return baytlar.slice().buffer as ArrayBuffer
}

export async function sha256(veri: Uint8Array | string): Promise<Uint8Array> {
  const baytlar = typeof veri === 'string' ? metniBayta(veri) : veri
  return new Uint8Array(await crypto.subtle.digest('SHA-256', tampon(baytlar)))
}

export async function sha256Hex(veri: Uint8Array | string): Promise<string> {
  return hexe(await sha256(veri))
}

export async function hmac(anahtar: Uint8Array, mesaj: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', tampon(anahtar), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, tampon(metniBayta(mesaj))))
}

export async function aesAnahtari(ham: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', tampon(ham), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function jsonSifrele(anahtar: CryptoKey, deger: unknown): Promise<string> {
  const iv = rastgeleBaytlar(12)
  const sifreli = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: tampon(iv) },
    anahtar,
    tampon(metniBayta(JSON.stringify(deger))),
  )
  const birlesik = new Uint8Array(iv.length + sifreli.byteLength)
  birlesik.set(iv)
  birlesik.set(new Uint8Array(sifreli), iv.length)
  return base64Url(birlesik)
}

// Returns null for anything that doesn't decrypt (wrong key or tampered data).
export async function jsonCoz(anahtar: CryptoKey, yuk: string): Promise<unknown> {
  try {
    const baytlar = base64UrldenBayt(yuk)
    const acik = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: tampon(baytlar.slice(0, 12)) },
      anahtar,
      tampon(baytlar.slice(12)),
    )
    return JSON.parse(cozucu.decode(acik))
  } catch {
    return null
  }
}

// Short random ids for records (messages, plans, groups...).
export function rastgeleId(bayt = 12): string {
  return base64Url(rastgeleBaytlar(bayt))
}

// --- password-based encryption (account backup) ---

// OWASP's current recommendation for PBKDF2-HMAC-SHA256. Runs natively, so
// it stays well under a second on phones.
export const PBKDF2_TEKRAR = 600_000

async function sifredenAnahtar(sifre: string, tuz: Uint8Array, tekrar: number): Promise<CryptoKey> {
  const temel = await crypto.subtle.importKey('raw', tampon(metniBayta(sifre)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: tampon(tuz), iterations: tekrar, hash: 'SHA-256' },
    temel,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export interface SifreliYedek {
  tuz: string
  tekrar: number
  veri: string
}

export async function sifreyleSifrele(sifre: string, acik: Uint8Array): Promise<SifreliYedek> {
  const tuz = rastgeleBaytlar(16)
  const anahtar = await sifredenAnahtar(sifre, tuz, PBKDF2_TEKRAR)
  return { tuz: base64Url(tuz), tekrar: PBKDF2_TEKRAR, veri: await jsonSifrele(anahtar, hexe(acik)) }
}

export async function sifreyleCoz(sifre: string, yedek: SifreliYedek): Promise<Uint8Array | null> {
  try {
    // Refuse absurd iteration counts so a forged backup can't freeze the app.
    if (!Number.isInteger(yedek.tekrar) || yedek.tekrar < 100_000 || yedek.tekrar > 5_000_000) return null
    const anahtar = await sifredenAnahtar(sifre, base64UrldenBayt(yedek.tuz), yedek.tekrar)
    const hex = await jsonCoz(anahtar, yedek.veri)
    return typeof hex === 'string' && /^[0-9a-f]{64}$/.test(hex) ? hextenBayt(hex) : null
  } catch {
    return null
  }
}
