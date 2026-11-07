import { aesAnahtari, hexe, hmac, sha256, sha256Hex, type SifreAnahtari } from './kodlama.js'

// How a channel's secret becomes the tags and keys its records use (see
// src/sosyal/nostr/kanal.ts for what each one is for). Shared so the
// server can write records into a channel the app reads, and read the
// public ones, with exactly the same derivation.

export interface KanalAnahtarlari {
  konu: string
  fotoKonu: string
  sifre: SifreAnahtari | null
  dAnahtari: Uint8Array
}

// A channel whose secret two or more parties share: encrypted.
export async function gizlidenTuret(gizli: Uint8Array): Promise<KanalAnahtarlari & { sifre: SifreAnahtari }> {
  const [konu, fotoKonu, sifreHam, dAnahtari] = await Promise.all([
    hmac(gizli, 'cepdost/konu'),
    hmac(gizli, 'cepdost/foto'),
    hmac(gizli, 'cepdost/sifre'),
    hmac(gizli, 'cepdost/d'),
  ])
  return { konu: hexe(konu), fotoKonu: hexe(fotoKonu), sifre: await aesAnahtari(sifreHam), dAnahtari }
}

// A public channel named by a fixed string: not encrypted.
export async function adlaTuret(ad: string): Promise<KanalAnahtarlari & { sifre: null }> {
  const [konu, fotoKonu, dAnahtari] = await Promise.all([
    sha256Hex(`cepdost/${ad}/konu`),
    sha256Hex(`cepdost/${ad}/foto`),
    sha256(`cepdost/${ad}/d`),
  ])
  return { konu, fotoKonu, sifre: null, dAnahtari }
}

// The opaque `d` tag of a logical record key ("profil", "dm:abc").
export async function dEtiketiTuret(dAnahtari: Uint8Array, anahtar: string): Promise<string> {
  return hexe(await hmac(dAnahtari, anahtar)).slice(0, 40)
}
