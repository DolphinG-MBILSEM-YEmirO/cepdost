import { getConversationKey } from 'nostr-tools/nip44'
import { aesAnahtari, hexe, hmac, sha256, sha256Hex } from './kodlama'

// A channel is a shared secret turned into everything needed to read and
// write one stream of records on the relays:
//   - konu: the public `i` tag relays index the records by. It is a hash, so
//     it says nothing about who or what is behind it;
//   - fotoKonu: a second tag for photo chunks, fetched only when a photo is
//     actually shown so normal syncing stays light;
//   - sifre: the AES-GCM key every record is encrypted with (null on public
//     channels such as Keşfet);
//   - dAnahtari: turns a logical record key ("profil", "dm:abc") into an
//     opaque `d` tag, so relays can't tell record types apart either.
//
// Who can read a channel is decided by who knows its secret:
//   ben    - derived from my secret key: only my own devices
//   cift   - ECDH of two people's keys: only the two of us
//   yayin  - a random key I hand to each friend: my friends
//   grup   - a random key handed to each member: the group
//   dizin  - derived from a friend code/username: anyone who knows it
//   link   - a random key in a shared plan link: anyone who has the link
//   kesfet - public

export type KanalTuru = 'ben' | 'cift' | 'yayin' | 'grup' | 'dizin' | 'link' | 'kesfet' | 'yedek'

export interface Kanal {
  tur: KanalTuru
  konu: string
  fotoKonu: string
  sifre: CryptoKey | null
  dAnahtari: Uint8Array
  // Pair channel: the other person. Broadcast channel: its owner.
  karsi?: string
  sahip?: string
  grupId?: string
}

async function gizlidenKanal(
  tur: KanalTuru,
  gizli: Uint8Array,
  ek: Pick<Kanal, 'karsi' | 'sahip' | 'grupId'> = {},
): Promise<Kanal> {
  const [konu, fotoKonu, sifreHam, dAnahtari] = await Promise.all([
    hmac(gizli, 'cepdost/konu'),
    hmac(gizli, 'cepdost/foto'),
    hmac(gizli, 'cepdost/sifre'),
    hmac(gizli, 'cepdost/d'),
  ])
  return { tur, konu: hexe(konu), fotoKonu: hexe(fotoKonu), sifre: await aesAnahtari(sifreHam), dAnahtari, ...ek }
}

async function acikKanal(tur: KanalTuru, ad: string): Promise<Kanal> {
  const [konu, fotoKonu, dAnahtari] = await Promise.all([
    sha256Hex(`cepdost/${ad}/konu`),
    sha256Hex(`cepdost/${ad}/foto`),
    sha256(`cepdost/${ad}/d`),
  ])
  return { tur, konu, fotoKonu, sifre: null, dAnahtari }
}

export async function kendiKanali(gizliAnahtar: Uint8Array): Promise<Kanal> {
  return gizlidenKanal('ben', await hmac(gizliAnahtar, 'cepdost/ben'))
}

export async function ciftKanali(gizliAnahtar: Uint8Array, karsiPubkey: string): Promise<Kanal> {
  return gizlidenKanal('cift', getConversationKey(gizliAnahtar, karsiPubkey), { karsi: karsiPubkey })
}

export async function yayinKanali(anahtar: Uint8Array, sahip: string): Promise<Kanal> {
  return gizlidenKanal('yayin', anahtar, { sahip })
}

export async function grupKanali(anahtar: Uint8Array, grupId: string): Promise<Kanal> {
  return gizlidenKanal('grup', anahtar, { grupId })
}

// A plan shared as a link (see sosyal/planLinki.ts). The key travels in the
// link's #fragment, which browsers never send to the server.
export async function linkKanali(anahtar: Uint8Array): Promise<Kanal> {
  return gizlidenKanal('link', anahtar)
}

export type DizinTipi = 'kod' | 'kullanici'

// Lets someone who knows a friend code or username find the account behind
// it, and nothing else: without the exact value the record can't be found
// or read.
export async function dizinKanali(tip: DizinTipi, deger: string): Promise<Kanal> {
  return gizlidenKanal('dizin', await sha256(`cepdost/dizin/${tip}/${deger}`))
}

// The account backup (secret key encrypted with the user's password) lives
// under the username. The payload is already password-encrypted.
export async function yedekKanali(kullaniciAdi: string): Promise<Kanal> {
  return acikKanal('yedek', `yedek/${kullaniciAdi}`)
}

export async function kesfetKanali(): Promise<Kanal> {
  return acikKanal('kesfet', 'kesfet/v1')
}

// Friend requests from people I don't know yet land here. Records are
// encrypted with the pair channel's key, so only I can read them.
export async function gelenKutusuKonusu(pubkey: string): Promise<string> {
  return sha256Hex(`cepdost/gelen/${pubkey}`)
}

export async function dEtiketi(kanal: Pick<Kanal, 'dAnahtari'>, anahtar: string): Promise<string> {
  return hexe(await hmac(kanal.dAnahtari, anahtar)).slice(0, 40)
}
