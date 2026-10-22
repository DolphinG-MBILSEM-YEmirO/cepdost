import { TUR, isoZaman, metinAl, motor, nesneMi, sayiAl } from './cekirdek'
import type { SosyalKayit } from './nostr/motor'

// What WhatsApp-style message actions add to a chat message, shared by
// direct chats (mesajlar.ts) and group chats (gruplar.ts). The actions
// themselves are in mesajIslemleri.ts.
//
// Where each piece lives (see the record map in cekirdek.ts):
//   - the message record ('dm:<id>' / 'mesaj:<id>') carries the quoted
//     message (yanit) and the forwarded mark (iletildi). Editing or
//     deleting it for everyone republishes the same record with
//     duzenlendi / silindi; its zaman stays, so it keeps its place.
//   - reactions: 'tepki:<mesajId>' on the chat channel, one per person.
//   - "delete for me" and stars: 'gizle:<mesajId>' / 'yildiz:<mesajId>' on
//     my own channel, so only my devices see them.

// A quote keeps a short copy of the original, for when it's not loaded.
export const ALINTI_AZAMI = 140
// As in WhatsApp: a message can be edited for 15 minutes after sending.
export const DUZENLEME_SURESI_MS = 15 * 60 * 1000
const EMOJI_AZAMI = 16
const HEX64 = /^[0-9a-f]{64}$/

export interface MesajAlintisi {
  id: string
  gonderen_id: string
  metin: string
}

export interface MesajTepkisi {
  kullanici_id: string
  emoji: string
}

export interface MesajEkleri {
  // The message this one answers.
  yanit: MesajAlintisi | null
  iletildi: boolean
  // When the text was last edited (ISO), or null.
  duzenlendi: string | null
  // Deleted for everyone: no text and no card are left.
  silindi: boolean
  tepkiler: MesajTepkisi[]
  // Starred by me (only my devices know).
  yildizli: boolean
}

// Extra fields a sender may put on a new message.
export interface MesajGonderimEki {
  yanit?: MesajAlintisi | null
  iletildi?: boolean
}

// Reactions on one chat plus my own marks, read once per message list.
export interface MesajBaglami {
  tepkiler: Map<string, MesajTepkisi[]>
  gizliler: Set<string>
  yildizlar: Set<string>
}

export const BOS_BAGLAM: MesajBaglami = { tepkiler: new Map(), gizliler: new Set(), yildizlar: new Set() }

export function alintiyiKisalt(metin: string): string {
  const tek = metin.replace(/\s+/g, ' ').trim()
  return tek.length > ALINTI_AZAMI ? `${tek.slice(0, ALINTI_AZAMI - 1)}…` : tek
}

// What goes into a new message record next to its text.
export function gonderimEkiVerisi(ek: MesajGonderimEki): Record<string, unknown> {
  const veri: Record<string, unknown> = {}
  if (ek.yanit) veri.yanit = { id: ek.yanit.id, kim: ek.yanit.gonderen_id, metin: alintiyiKisalt(ek.yanit.metin) }
  if (ek.iletildi) veri.iletildi = true
  return veri
}

function alintiAl(deger: unknown): MesajAlintisi | null {
  if (!nesneMi(deger)) return null
  const id = metinAl(deger.id, 40)
  const kim = typeof deger.kim === 'string' && HEX64.test(deger.kim) ? deger.kim : null
  if (!id || !kim) return null
  return { id, gonderen_id: kim, metin: metinAl(deger.metin, ALINTI_AZAMI) ?? '' }
}

export function silindiMi(veri: Record<string, unknown>): boolean {
  return veri.silindi === true
}

// A change to a message that's already there (not a new message).
export function degisiklikMi(veri: Record<string, unknown>): boolean {
  return veri.silindi === true || sayiAl(veri.duzenlendi) !== null
}

// The action fields of a message record, read defensively (records come
// from other people's devices).
export function mesajEkleriniOku(id: string, veri: Record<string, unknown>, baglam: MesajBaglami): MesajEkleri {
  const duzenlendi = sayiAl(veri.duzenlendi)
  if (silindiMi(veri)) {
    return { yanit: null, iletildi: false, duzenlendi: null, silindi: true, tepkiler: [], yildizli: baglam.yildizlar.has(id) }
  }
  return {
    yanit: alintiAl(veri.yanit),
    iletildi: veri.iletildi === true,
    duzenlendi: duzenlendi === null ? null : isoZaman(duzenlendi),
    silindi: false,
    tepkiler: baglam.tepkiler.get(id) ?? [],
    yildizli: baglam.yildizlar.has(id),
  }
}

export function tepkiAl(k: SosyalKayit): { mesajId: string; emoji: string } | null {
  if (k.tur !== TUR.tepki || !nesneMi(k.veri)) return null
  const mesajId = metinAl(k.veri.mesajId, 40)
  const emoji = metinAl(k.veri.emoji, EMOJI_AZAMI)?.trim()
  if (!mesajId || !emoji || k.anahtar !== `tepki:${mesajId}`) return null
  return { mesajId, emoji }
}

// The ids behind my own 'gizle:' or 'yildiz:' marks.
async function benimIsaretlerim(tur: string): Promise<Set<string>> {
  const m = motor()
  const kayitlar = await m.kayitlar((await m.ben()).konu, tur)
  const onEk = `${tur}:`
  return new Set(kayitlar.filter((k) => k.anahtar.startsWith(onEk)).map((k) => k.anahtar.slice(onEk.length)))
}

export function gizlenenMesajlar(): Promise<Set<string>> {
  return benimIsaretlerim(TUR.gizle)
}

export async function mesajBaglami(konu: string): Promise<MesajBaglami> {
  const m = motor()
  const [kayitlar, gizliler, yildizlar] = await Promise.all([
    m.kayitlar(konu, TUR.tepki),
    benimIsaretlerim(TUR.gizle),
    benimIsaretlerim(TUR.yildiz),
  ])
  const tepkiler = new Map<string, MesajTepkisi[]>()
  for (const k of kayitlar.sort((a, b) => a.zaman - b.zaman)) {
    const t = tepkiAl(k)
    if (!t) continue
    tepkiler.set(t.mesajId, [...(tepkiler.get(t.mesajId) ?? []), { kullanici_id: k.yazar, emoji: t.emoji }])
  }
  return { tepkiler, gizliler, yildizlar }
}
