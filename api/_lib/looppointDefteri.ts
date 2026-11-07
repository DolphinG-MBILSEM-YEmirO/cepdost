// The LoopPoint ledger on the server side: reads and writes the records
// that carry a person's points (shared/looppoint.ts explains the rules).
//
// Where things live, all on the public relays:
//   - each person's points: their pair channel with the server's key,
//     encrypted, written only by the server. The app reads the same channel
//     with its own key (motor.ciftKanali), so nothing else is needed;
//   - who was scanned where today with which plan: a channel only the
//     server can read, used to spot friends from the same plan;
//   - businesses' names and rewards: their public profiles
//     (src/sosyal/isletme.ts), read like anyone would.

import { createHmac } from 'node:crypto'
import { getConversationKey } from 'nostr-tools/nip44'
import { finalizeEvent, getPublicKey, verifyEvent, type Event } from 'nostr-tools/pure'
import { adlaTuret, dEtiketiTuret, gizlidenTuret, type KanalAnahtarlari } from '../../shared/kanalTuretme.js'
import { hmac, jsonCoz, jsonSifrele } from '../../shared/kodlama.js'
import { OLAY_TURU } from '../../shared/roleler.js'
import {
  PUANLAR,
  LOOPPOINT_TURU,
  grupAnahtari,
  hareketAl,
  odulAnahtari,
  odulleriAl,
  ozetle,
  ziyaretAnahtari,
  ziyaretKazanci,
  type IsletmeOdulu,
  type LooppointHareketi,
  type LooppointOzeti,
} from '../../shared/looppoint.js'
import { yetiskinMi } from '../../shared/yakinMekanlar.js'
import type { RoleErisimi } from './roleler.js'

export function imzaAnahtari(gizli: string): Uint8Array {
  return new Uint8Array(createHmac('sha256', gizli).update('sharloop-looppoint/imza').digest())
}

export function imzaci(gizli: string): string {
  return getPublicKey(imzaAnahtari(gizli))
}

// The key a business's till keeps (see KASA_ISTEK_TURU).
export function kasaAnahtari(gizli: string, isletme: string): string {
  return createHmac('sha256', gizli).update(`sharloop-kasa|${isletme}`).digest('hex').slice(0, 32)
}

export async function musteriKanali(sk: Uint8Array, musteri: string): Promise<KanalAnahtarlari> {
  return gizlidenTuret(getConversationKey(sk, musteri))
}

async function sunucuKanali(sk: Uint8Array): Promise<KanalAnahtarlari> {
  return gizlidenTuret(await hmac(sk, 'sharloop/looppoint/sunucu'))
}

interface Zarf {
  t: string
  k: string
  v: unknown
}

// The newest record per key a given author wrote on a channel, checked
// the way the app checks them (signature, d tag).
export async function kayitlariOku(role: RoleErisimi, kanal: KanalAnahtarlari, yazar: string): Promise<Map<string, Zarf>> {
  const olaylar = await role.sorgula({ kinds: [OLAY_TURU], authors: [yazar], '#i': [kanal.konu] })
  const enYeni = new Map<string, Event>()
  for (const o of olaylar) {
    const d = o.tags.find((t) => t[0] === 'd')?.[1]
    if (!d || o.pubkey !== yazar) continue
    const onceki = enYeni.get(d)
    if (!onceki || onceki.created_at < o.created_at) enYeni.set(d, o)
  }
  const sonuc = new Map<string, Zarf>()
  for (const [d, o] of enYeni) {
    if (!verifyEvent(o)) continue
    let zarf: unknown
    if (kanal.sifre) zarf = await jsonCoz(kanal.sifre, o.content)
    else {
      try {
        zarf = JSON.parse(o.content)
      } catch {
        continue
      }
    }
    if (typeof zarf !== 'object' || zarf === null) continue
    const z = zarf as Partial<Zarf>
    if (typeof z.t !== 'string' || typeof z.k !== 'string') continue
    if ((await dEtiketiTuret(kanal.dAnahtari, z.k)) !== d) continue
    sonuc.set(z.k, { t: z.t, k: z.k, v: z.v })
  }
  return sonuc
}

// Writes one record the way the app's motor would (motor.yayinla).
export async function kayitYaz(
  role: RoleErisimi,
  sk: Uint8Array,
  kanal: KanalAnahtarlari,
  tur: string,
  anahtar: string,
  veri: unknown,
  zaman = Math.floor(Date.now() / 1000),
): Promise<void> {
  const zarf: Zarf = { t: tur, k: anahtar, v: veri }
  const icerik = kanal.sifre ? await jsonSifrele(kanal.sifre, zarf) : JSON.stringify(zarf)
  const olay = finalizeEvent(
    {
      kind: OLAY_TURU,
      created_at: zaman,
      tags: [
        ['d', await dEtiketiTuret(kanal.dAnahtari, anahtar)],
        ['i', kanal.konu],
      ],
      content: icerik,
    },
    sk,
  )
  if ((await role.yayinla(olay)) === 0) throw new Error('LoopPoint şu an kaydedilemedi.')
}

export interface IsletmeBilgisi {
  ad: string
  oduller: IsletmeOdulu[]
}

// A business's name and rewards from its public profile.
export async function isletmeBilgisi(role: RoleErisimi, isletme: string): Promise<IsletmeBilgisi | null> {
  const kanal = await adlaTuret('isletme/v1')
  const kayit = (await kayitlariOku(role, kanal, isletme)).get('isletme')
  const v = kayit?.v
  if (typeof v !== 'object' || v === null) return null
  const { ad, oduller } = v as Record<string, unknown>
  if (typeof ad !== 'string' || !ad.trim()) return null
  return { ad: ad.trim().slice(0, 80), oduller: odulleriAl(oduller, yetiskinMi) }
}

function hareketler(kayitlar: Map<string, Zarf>): Map<string, LooppointHareketi> {
  const sonuc = new Map<string, LooppointHareketi>()
  for (const [k, z] of kayitlar) {
    if (z.t !== LOOPPOINT_TURU) continue
    const h = hareketAl(z.v)
    if (h) sonuc.set(k, h)
  }
  return sonuc
}

export type OdulSonucu =
  | { durum: 'tamam'; metin: string; puan: number }
  | { durum: 'yok' }
  | { durum: 'kullanildi'; metin: string }
  | { durum: 'yetersiz'; metin: string; puan: number }

export interface ZiyaretSonucu {
  // Points this scan added (0 when today's visit was already counted).
  kazanilan: number
  ozet: LooppointOzeti
  odul: OdulSonucu | null
}

interface GrupIsareti {
  k: string
  p: string[]
}

// One scan at a till: counts the visit (once a day per business), the
// group bonus when a friend from the same plan was scanned there today,
// and spends a reward when the QR asked for one.
export async function ziyaretiIsle(girdi: {
  role: RoleErisimi
  sk: Uint8Array
  isletme: string
  musteri: string
  gun: string
  oneCikan: boolean
  isaretler: string[]
  odulId: string | null
  zaman?: number
}): Promise<ZiyaretSonucu> {
  const { role, sk, isletme, musteri, gun, isaretler, odulId } = girdi
  const zaman = girdi.zaman ?? Date.now()
  const sunucu = getPublicKey(sk)
  const [kanal, bilgi] = await Promise.all([musteriKanali(sk, musteri), isletmeBilgisi(role, isletme)])
  const defter = hareketler(await kayitlariOku(role, kanal, sunucu))
  const isletmeAdi = bilgi?.ad ?? null
  const yaz = async (anahtar: string, h: LooppointHareketi, k = kanal) => {
    await kayitYaz(role, sk, k, LOOPPOINT_TURU, anahtar, h)
    if (k === kanal) defter.set(anahtar, h)
  }

  let kazanilan = 0
  const ziyaret = ziyaretAnahtari(isletme, gun)
  if (!defter.has(ziyaret)) {
    const { puan, nedenler } = ziyaretKazanci({ oneCikan: girdi.oneCikan, plan: isaretler.length > 0 })
    await yaz(ziyaret, { tur: 'kazanc', puan, isletme, isletmeAdi, nedenler, odul: null, gun, zaman })
    kazanilan += puan
  }

  // Friends from the same plan: everyone scanned here today with a shared
  // plan hash gets the bonus once, including the ones scanned earlier.
  if (isaretler.length > 0) {
    const sunucuK = await sunucuKanali(sk)
    const isaretAnahtari = `grup-isaret:${isletme}:${gun}`
    const kayit = (await kayitlariOku(role, sunucuK, sunucu)).get(isaretAnahtari)
    const liste: GrupIsareti[] = Array.isArray((kayit?.v as { liste?: unknown })?.liste)
      ? ((kayit!.v as { liste: GrupIsareti[] }).liste.filter((g) => typeof g?.k === 'string' && Array.isArray(g.p)))
      : []
    const arkadaslar = liste.filter((g) => g.k !== musteri && g.p.some((p) => isaretler.includes(p)))
    if (arkadaslar.length > 0) {
      const grup = grupAnahtari(isletme, gun)
      const bonus = (): LooppointHareketi => ({ tur: 'kazanc', puan: PUANLAR.grup, isletme, isletmeAdi, nedenler: ['grup'], odul: null, gun, zaman })
      if (!defter.has(grup)) {
        await yaz(grup, bonus())
        kazanilan += PUANLAR.grup
      }
      for (const a of arkadaslar) {
        const k = await musteriKanali(sk, a.k)
        const onlarinki = hareketler(await kayitlariOku(role, k, sunucu))
        if (!onlarinki.has(grup)) await yaz(grup, bonus(), k)
      }
    }
    if (!liste.some((g) => g.k === musteri)) {
      const yeni = [...liste, { k: musteri, p: isaretler }].slice(-50)
      await kayitYaz(role, sk, sunucuK, 'grup-isaret', isaretAnahtari, { liste: yeni })
    }
  }

  let odul: OdulSonucu | null = null
  if (odulId) {
    const secilen = bilgi?.oduller.find((o) => o.id === odulId)
    const anahtar = odulAnahtari(isletme, gun, odulId)
    if (!secilen) odul = { durum: 'yok' }
    else if (defter.has(anahtar)) odul = { durum: 'kullanildi', metin: secilen.metin }
    else if (ozetle([...defter.values()]).bakiye < secilen.puan) odul = { durum: 'yetersiz', metin: secilen.metin, puan: secilen.puan }
    else {
      await yaz(anahtar, { tur: 'harcama', puan: secilen.puan, isletme, isletmeAdi, nedenler: [], odul: secilen.metin, gun, zaman })
      odul = { durum: 'tamam', metin: secilen.metin, puan: secilen.puan }
    }
  }

  return { kazanilan, ozet: ozetle([...defter.values()]), odul }
}
