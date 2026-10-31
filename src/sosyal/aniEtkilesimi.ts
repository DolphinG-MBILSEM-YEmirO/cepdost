import { TUR, benimProfilVerim, kanalBilgisi, kanalDurumu, kayitZamani, metinAl, motor, nesneMi, simdiMs } from './cekirdek'
import { bildirArkaplanda } from './bildirimler'
import type { Ani } from './gruplar'
import { rastgeleId } from './nostr/kodlama'
import type { Kanal } from './nostr/kanal'
import { GOVDE_MAKS } from '../../shared/bildirim'
import { UYGULAMA_ADI } from '../../shared/marka'

// Friends answering a memory: an emoji reaction, comments, and "I want to
// go too". They sit next to the memory on its pair, group or broadcast
// channel, so only the people who see the memory see them:
//
//   ani-tepki 'ani-tepki:<aniId>'           one per person: their emoji
//                                           and whether they want to go
//   ani-yorum 'ani-yorum:<aniId>:<yorumId>' a comment; its author deletes it
//
// Public copies on Keşfet take none of these: strangers can't comment.

export const ANI_TEPKILERI = ['❤️', '😍', '🔥', '😂', '👏'] as const
export const YORUM_AZAMI = 300

export interface AniTepkisi {
  kullanici_id: string
  emoji: string
}

export interface AniYorumu {
  id: string
  yazar: string
  metin: string
  zaman: number
}

export interface AniEtkilesimi {
  tepkiler: AniTepkisi[]
  gitmekIsteyenler: string[]
  // Oldest first, like a conversation.
  yorumlar: AniYorumu[]
}

export const BOS_ETKILESIM: AniEtkilesimi = { tepkiler: [], gitmekIsteyenler: [], yorumlar: [] }

const tepkiAnahtari = (aniId: string) => `ani-tepki:${aniId}`

function tepkiMi(emoji: unknown): emoji is (typeof ANI_TEPKILERI)[number] {
  return typeof emoji === 'string' && (ANI_TEPKILERI as readonly string[]).includes(emoji)
}

// The channel a memory's answers go on: its pair or group channel, or the
// sharer's broadcast channel for a post to all their friends.
export async function etkilesimKanali(ani: Ani): Promise<Kanal | null> {
  await kanalDurumu()
  const kanal = kanalBilgisi(ani.konu)
  return kanal && (kanal.tur === 'cift' || kanal.tur === 'grup' || kanal.tur === 'yayin') ? kanal : null
}

async function kanalAl(ani: Ani): Promise<Kanal> {
  const kanal = await etkilesimKanali(ani)
  if (!kanal) throw new Error('Bu anıya yalnızca onu paylaştığı kişiler yanıt verebilir.')
  return kanal
}

// Everyone's answers to these memories, read from the local copy.
export async function aniEtkilesimleri(anilar: Ani[]): Promise<Map<string, AniEtkilesimi>> {
  const m = motor()
  const idler = new Set(anilar.map((a) => a.id))
  const harita = new Map<string, AniEtkilesimi>()
  const al = (aniId: string) => {
    let e = harita.get(aniId)
    if (!e) harita.set(aniId, (e = { tepkiler: [], gitmekIsteyenler: [], yorumlar: [] }))
    return e
  }

  for (const konu of new Set(anilar.map((a) => a.konu))) {
    const [tepkiler, yorumlar] = await Promise.all([m.kayitlar(konu, TUR.aniTepki), m.kayitlar(konu, TUR.aniYorum)])
    for (const k of tepkiler) {
      const aniId = k.anahtar.slice('ani-tepki:'.length)
      if (!idler.has(aniId) || !nesneMi(k.veri)) continue
      if (tepkiMi(k.veri.emoji)) al(aniId).tepkiler.push({ kullanici_id: k.yazar, emoji: k.veri.emoji })
      if (k.veri.gitmek === true) al(aniId).gitmekIsteyenler.push(k.yazar)
    }
    for (const k of yorumlar) {
      const [, aniId, id] = k.anahtar.split(':')
      const metin = nesneMi(k.veri) ? metinAl(k.veri.metin, YORUM_AZAMI)?.trim() : null
      if (!idler.has(aniId) || !id || !metin) continue
      al(aniId).yorumlar.push({ id, yazar: k.yazar, metin, zaman: kayitZamani(k) })
    }
  }
  for (const e of harita.values()) e.yorumlar.sort((a, b) => a.zaman - b.zaman || a.id.localeCompare(b.id))
  return harita
}

// Everyone who answered, for looking up their names.
export function yanitlayanlar(etkilesimler: Map<string, AniEtkilesimi>): string[] {
  return [...etkilesimler.values()].flatMap((e) => [
    ...e.tepkiler.map((t) => t.kullanici_id),
    ...e.gitmekIsteyenler,
    ...e.yorumlar.map((y) => y.yazar),
  ])
}

async function benimTepkim(kanal: Kanal, aniId: string): Promise<{ emoji: string | null; gitmek: boolean }> {
  const m = motor()
  const k = await m.kayit(kanal, m.benimId, tepkiAnahtari(aniId))
  if (!k || !nesneMi(k.veri)) return { emoji: null, gitmek: false }
  return { emoji: tepkiMi(k.veri.emoji) ? k.veri.emoji : null, gitmek: k.veri.gitmek === true }
}

async function tepkiYaz(kanal: Kanal, aniId: string, emoji: string | null, gitmek: boolean) {
  await motor().yayinla(kanal, TUR.aniTepki, tepkiAnahtari(aniId), emoji || gitmek ? { aniId, emoji, gitmek, zaman: simdiMs() } : null)
}

// The one who shared it hears about it; nobody else.
function sahibineBildir(ani: Ani, ne: string) {
  const m = motor()
  if (ani.sahip_id === m.benimId) return
  void (async () => {
    const ad = (await benimProfilVerim())?.ad ?? UYGULAMA_ADI
    bildirArkaplanda(
      [ani.sahip_id],
      {
        tur: ani.grup_id ? 'grup' : 'mesaj',
        baslik: ad,
        govde: `${ne} · ${ani.mekan_adi}`.slice(0, GOVDE_MAKS),
        git: 'akis',
        etiket: `ani:${ani.id}`,
      },
      ani.grup_id ? { grupId: ani.grup_id } : undefined,
    )
  })().catch(() => {})
}

// One reaction per person: a new emoji replaces mine, the same one again
// (or null) takes it back.
export async function aniyaTepkiVer(ani: Ani, emoji: string | null): Promise<void> {
  if (emoji !== null && !tepkiMi(emoji)) throw new Error('Bu tepki kullanılamıyor.')
  const kanal = await kanalAl(ani)
  const onceki = await benimTepkim(kanal, ani.id)
  const yeni = emoji && emoji !== onceki.emoji ? emoji : null
  if (yeni === onceki.emoji) return
  await tepkiYaz(kanal, ani.id, yeni, onceki.gitmek)
  if (yeni) sahibineBildir(ani, `Anına ${yeni} bıraktı`)
}

// "Ben de gitmek istiyorum": the one who shared it sees who wants to go.
export async function gitmekIstiyorum(ani: Ani, istiyor: boolean): Promise<void> {
  const kanal = await kanalAl(ani)
  const onceki = await benimTepkim(kanal, ani.id)
  if (onceki.gitmek === istiyor) return
  await tepkiYaz(kanal, ani.id, onceki.emoji, istiyor)
  if (istiyor) sahibineBildir(ani, 'Oraya o da gitmek istiyor')
}

export async function aniyaYorumYap(ani: Ani, metin: string): Promise<AniYorumu> {
  const temiz = metin.trim().slice(0, YORUM_AZAMI)
  if (!temiz) throw new Error('Bir şey yaz.')
  const kanal = await kanalAl(ani)
  const m = motor()
  const id = rastgeleId(8)
  const zaman = simdiMs()
  await m.yayinla(kanal, TUR.aniYorum, `ani-yorum:${ani.id}:${id}`, { aniId: ani.id, metin: temiz, zaman })
  sahibineBildir(ani, `Anına yorum yaptı: “${temiz.slice(0, 80)}”`)
  return { id, yazar: m.benimId, metin: temiz, zaman }
}

// Only one's own comments: each is its author's record.
export async function aniYorumunuSil(ani: Ani, yorumId: string): Promise<void> {
  const kanal = await kanalAl(ani)
  await motor().yayinla(kanal, TUR.aniYorum, `ani-yorum:${ani.id}:${yorumId}`, null)
}
