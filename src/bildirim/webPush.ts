import { base64Url, base64UrldenBayt, rastgeleBaytlar } from '../sosyal/nostr/kodlama'

// Web Push message encryption (RFC 8291, "aes128gcm" content coding), done
// in the sender's browser so the server that forwards it only ever handles
// ciphertext. Only the receiving browser, which holds the subscription's
// private key, can read it.

const KAYIT_BOYU = 4096
const ANAHTAR_BOYU = 65

const metin = (s: string) => new TextEncoder().encode(s)

function birlestir(...parcalar: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const sonuc = new Uint8Array(parcalar.reduce((t, p) => t + p.length, 0))
  let i = 0
  for (const p of parcalar) {
    sonuc.set(p, i)
    i += p.length
  }
  return sonuc
}

// HKDF-SHA-256 (extract and expand in one), `uzunluk` bytes.
async function hkdf(tuz: Uint8Array, girdi: Uint8Array, bilgi: Uint8Array, uzunluk: number): Promise<Uint8Array> {
  const anahtar = await crypto.subtle.importKey('raw', birlestir(girdi), 'HKDF', false, ['deriveBits'])
  const bitler = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: birlestir(tuz), info: birlestir(bilgi) },
    anahtar,
    uzunluk * 8,
  )
  return new Uint8Array(bitler)
}

// Encrypts `acik` for a push subscription, given its p256dh and auth keys
// (base64url, as PushSubscription.toJSON() gives them). Returns the request
// body to send to the subscription's endpoint. `sabit` pins the one-time key
// and salt, for checking against the RFC's worked example.
export async function webPushSifrele(
  acik: Uint8Array,
  p256dh: string,
  auth: string,
  sabit?: { gecici: CryptoKeyPair; tuz: Uint8Array },
): Promise<Uint8Array> {
  const aliciAnahtari = base64UrldenBayt(p256dh)
  const yetki = base64UrldenBayt(auth)
  if (aliciAnahtari.length !== ANAHTAR_BOYU || yetki.length !== 16) throw new Error('Geçersiz bildirim adresi')
  // One record: the payload plus the delimiter must fit with the 16-byte tag.
  if (acik.length + 1 + 16 > KAYIT_BOYU) throw new Error('Bildirim çok uzun')

  const alici = await crypto.subtle.importKey('raw', birlestir(aliciAnahtari), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const gecici =
    sabit?.gecici ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])) as CryptoKeyPair)
  const geciciAcik = new Uint8Array(await crypto.subtle.exportKey('raw', gecici.publicKey))
  const ortakSir = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: alici }, gecici.privateKey, 256))

  // IKM = HKDF(auth, ecdh_secret, "WebPush: info" || 0 || ua_public || as_public)
  const ikm = await hkdf(yetki, ortakSir, birlestir(metin('WebPush: info\0'), aliciAnahtari, geciciAcik), 32)
  const tuz = sabit?.tuz ?? rastgeleBaytlar(16)
  const icerikAnahtari = await hkdf(tuz, ikm, metin('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(tuz, ikm, metin('Content-Encoding: nonce\0'), 12)

  const aes = await crypto.subtle.importKey('raw', birlestir(icerikAnahtari), 'AES-GCM', false, ['encrypt'])
  // 0x02 marks the last (and only) record.
  const sifreli = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: birlestir(nonce) }, aes, birlestir(acik, Uint8Array.of(2))),
  )

  // Header: salt (16) | record size (4, big-endian) | key id length (1) | key id
  const baslik = new Uint8Array(16 + 4 + 1)
  baslik.set(tuz, 0)
  new DataView(baslik.buffer).setUint32(16, KAYIT_BOYU)
  baslik[20] = ANAHTAR_BOYU
  return birlestir(baslik, geciciAcik, sifreli)
}

export async function webPushSifreleB64(acik: Uint8Array, p256dh: string, auth: string): Promise<string> {
  return base64Url(await webPushSifrele(acik, p256dh, auth))
}
