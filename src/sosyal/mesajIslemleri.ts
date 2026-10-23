import { TUR, benimProfilVerim, grupKanaliBul, kanalDurumu, kayitZamani, metinAl, motor, nesneMi, sayiAl, simdiMs } from './cekirdek'
import { bildirArkaplanda } from './bildirimler'
import { direktMesajGonder } from './mesajlar'
import { grupUyeleriGetir, gruplarimiGetir, mesajGonder } from './gruplar'
import { DUZENLEME_SURESI_MS, alintiyiKisalt, tepkiAl, type MesajGonderimEki } from './mesajOrtak'
import type { Kanal } from './nostr/kanal'
import type { SosyalKayit } from './nostr/motor'
import { UYGULAMA_ADI } from '../../shared/marka'

// WhatsApp-style actions on chat messages, for direct and group chats
// alike: edit, delete (for everyone or just me), react, pin, star and
// forward. Replies are sent with the message itself (see MesajGonderimEki).

export type SohbetHedefi = { tur: 'arkadas'; id: string } | { tur: 'grup'; id: string }

// The fields of a message the actions need.
export interface IslenenMesaj {
  id: string
  gonderen_id: string
  metin: string
  olusturulma: string
}

interface SohbetKanali {
  kanal: Kanal
  // Record type and key prefix of its messages.
  tur: string
  onEk: string
}

async function sohbetKanali(hedef: SohbetHedefi): Promise<SohbetKanali> {
  if (hedef.tur === 'grup') return { kanal: await grupKanaliBul(hedef.id), tur: TUR.mesaj, onEk: 'mesaj:' }
  const durum = await kanalDurumu()
  const kanal = durum.cift.get(hedef.id)
  if (!kanal || durum.iliskiler.get(hedef.id)?.durum !== 'kabul') {
    throw new Error('Bu sohbete artık yazamazsın — arkadaşlığınız bitmiş.')
  }
  return { kanal, tur: TUR.dm, onEk: 'dm:' }
}

// Only the sender's own record can be replaced, so edits and deletions
// always start from it.
async function benimMesajim(s: SohbetKanali, mesajId: string): Promise<SosyalKayit & { veri: Record<string, unknown> }> {
  const m = motor()
  const k = await m.kayit(s.kanal, m.benimId, `${s.onEk}${mesajId}`)
  if (!k || k.tur !== s.tur || !nesneMi(k.veri)) throw new Error('Mesaj bulunamadı.')
  return k as SosyalKayit & { veri: Record<string, unknown> }
}

export function duzenlenebilirMi(mesaj: { olusturulma: string }, simdi = simdiMs()): boolean {
  return simdi - Date.parse(mesaj.olusturulma) <= DUZENLEME_SURESI_MS
}

// ---------- edit and delete ----------

export async function mesajiDuzenle(hedef: SohbetHedefi, mesajId: string, yeniMetin: string): Promise<void> {
  const metin = yeniMetin.trim().slice(0, 4000)
  if (!metin) throw new Error('Mesaj boş olamaz.')
  const s = await sohbetKanali(hedef)
  const k = await benimMesajim(s, mesajId)
  if (k.veri.silindi === true) throw new Error('Silinen mesaj düzenlenemez.')
  if (simdiMs() - kayitZamani(k) > DUZENLEME_SURESI_MS) {
    throw new Error('Mesajlar gönderildikten sonraki 15 dakika içinde düzenlenebilir.')
  }
  if (metin === k.veri.metin) return
  // Everything else stays, zaman too, so the message keeps its place.
  await motor().yayinla(s.kanal, s.tur, k.anahtar, { ...k.veri, metin, duzenlendi: simdiMs() })
}

// The record keeps only its time: the text, quote and card are gone from
// the relays as well (the new version replaces the old one).
export async function herkestenSil(hedef: SohbetHedefi, mesajId: string): Promise<void> {
  const s = await sohbetKanali(hedef)
  const k = await benimMesajim(s, mesajId)
  if (k.veri.silindi === true) return
  if (metinAl(k.veri.davetId, 40) || metinAl(k.veri.planId, 40)) {
    throw new Error('Plan kartları silinemez. Planı kartın üstünden iptal edebilirsin.')
  }
  await motor().yayinla(s.kanal, s.tur, k.anahtar, { zaman: kayitZamani(k), silindi: true })
}

// Hidden on my devices only; the others still see the message.
export async function bendenSil(mesajId: string): Promise<void> {
  const m = motor()
  await m.yayinla(await m.ben(), TUR.gizle, `gizle:${mesajId}`, { zaman: simdiMs() })
}

// ---------- reactions ----------

// One reaction per person, as in WhatsApp: a new emoji replaces mine, the
// same one again (or null) takes it back.
export async function tepkiVer(hedef: SohbetHedefi, mesaj: IslenenMesaj, emoji: string | null): Promise<void> {
  const s = await sohbetKanali(hedef)
  const m = motor()
  const anahtar = `tepki:${mesaj.id}`
  const onceki = await m.kayit(s.kanal, m.benimId, anahtar)
  const eski = onceki ? tepkiAl(onceki)?.emoji ?? null : null
  const yeni = emoji && emoji !== eski ? emoji : null
  if (yeni === eski) return
  await m.yayinla(s.kanal, TUR.tepki, anahtar, yeni ? { mesajId: mesaj.id, emoji: yeni, zaman: simdiMs() } : null)
  if (yeni && mesaj.gonderen_id !== m.benimId) tepkiyiBildir(hedef, mesaj, yeni)
}

// The author hears about a reaction to their message, nobody else.
function tepkiyiBildir(hedef: SohbetHedefi, mesaj: IslenenMesaj, emoji: string) {
  void (async () => {
    const m = motor()
    const ad = (await benimProfilVerim())?.ad ?? UYGULAMA_ADI
    const alinti = mesaj.metin ? `: “${alintiyiKisalt(mesaj.metin)}”` : ''
    if (hedef.tur === 'arkadas') {
      bildirArkaplanda([mesaj.gonderen_id], {
        tur: 'mesaj',
        baslik: ad,
        govde: `Mesajına ${emoji} bıraktı${alinti}`,
        git: `dm:${m.benimId}`,
        etiket: `dm:${m.benimId}`,
      })
      return
    }
    const grup = (await gruplarimiGetir()).find((g) => g.id === hedef.id)
    bildirArkaplanda(
      [mesaj.gonderen_id],
      {
        tur: 'grup',
        baslik: grup?.ad ?? 'Grup',
        govde: `${ad} mesajına ${emoji} bıraktı${alinti}`,
        git: `grup:${hedef.id}`,
        etiket: `grup:${hedef.id}`,
      },
      { grupId: hedef.id },
    )
  })().catch(() => {})
}

// ---------- pin and star ----------

// Anyone in the chat can pin one message; the latest pin wins.
export async function sabitle(hedef: SohbetHedefi, mesajId: string | null): Promise<void> {
  const s = await sohbetKanali(hedef)
  await motor().yayinla(s.kanal, TUR.sabit, 'sabit', { mesajId, zaman: simdiMs() })
}

export async function sabitMesajId(hedef: SohbetHedefi): Promise<string | null> {
  let kanal: Kanal
  try {
    kanal = (await sohbetKanali(hedef)).kanal
  } catch {
    return null
  }
  const kayitlar = await motor().kayitlar(kanal.konu, TUR.sabit)
  const son = kayitlar.sort((a, b) => kayitZamani(b) - kayitZamani(a))[0]
  return nesneMi(son?.veri) ? metinAl(son.veri.mesajId, 40) : null
}

export async function yildizla(mesajId: string, yildizli: boolean): Promise<void> {
  const m = motor()
  await m.yayinla(await m.ben(), TUR.yildiz, `yildiz:${mesajId}`, yildizli ? { zaman: simdiMs() } : null)
}

// ---------- forward ----------

// Sends the text on to other chats, marked as forwarded. Returns how many
// of them it reached.
export async function mesajiIlet(metin: string, hedefler: SohbetHedefi[]): Promise<number> {
  const ek: MesajGonderimEki = { iletildi: true }
  const sonuclar = await Promise.allSettled(
    hedefler.map((h) => (h.tur === 'arkadas' ? direktMesajGonder(h.id, metin, null, ek) : mesajGonder(h.id, metin, null, ek))),
  )
  const ulasan = sonuclar.filter((s) => s.status === 'fulfilled').length
  if (ulasan === 0 && hedefler.length > 0) throw new Error('Mesaj iletilemedi.')
  return ulasan
}

// ---------- message info ----------

export interface MesajBilgisi {
  okuyanlar: string[]
  bekleyenler: string[]
}

// Who has read one of my messages: each person's last 'okundu' mark
// covers everything up to its time.
export async function mesajBilgisi(hedef: SohbetHedefi, mesaj: IslenenMesaj): Promise<MesajBilgisi> {
  const s = await sohbetKanali(hedef)
  const m = motor()
  const kisiler =
    hedef.tur === 'arkadas'
      ? [hedef.id]
      : (await grupUyeleriGetir(hedef.id)).map((u) => u.kullanici_id).filter((pk) => pk !== mesaj.gonderen_id)
  const sinirlar = new Map<string, number>()
  for (const k of await m.kayitlar(s.kanal.konu, TUR.okundu)) {
    if (nesneMi(k.veri)) sinirlar.set(k.yazar, sayiAl(k.veri.zaman) ?? 0)
  }
  const zaman = Date.parse(mesaj.olusturulma)
  const okuyanlar = kisiler.filter((pk) => (sinirlar.get(pk) ?? 0) >= zaman)
  return { okuyanlar, bekleyenler: kisiler.filter((pk) => !okuyanlar.includes(pk)) }
}
