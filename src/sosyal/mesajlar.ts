import {
  TUR,
  isoZaman,
  kanalBilgisi,
  kanalDurumu,
  kayitlariDinle,
  kayitZamani,
  metinAl,
  motor,
  nesneMi,
  sayiAl,
  simdiMs,
} from './cekirdek'
import { arkadaslariGetir, type Profil } from './api'
import { grupOkunmamisSayisi, gruplarimiGetir, mesajlariGetir, type Grup } from './gruplar'
import { rastgeleId } from './nostr/kodlama'
import type { SosyalKayit } from './nostr/motor'

// One-to-one chat with friends, and the combined chat list. Messages live
// on the pair channel only the two people can read.

export interface DirektMesaj {
  id: string
  gonderen_id: string
  alan_id: string
  metin: string
  // When set, the message shows as a card for this plan invite.
  davet_id: string | null
  // For messages I received: whether I've read them. For messages I sent:
  // whether the other person has.
  okundu: boolean
  olusturulma: string
}

async function arkadasKanali(arkadasId: string) {
  const durum = await kanalDurumu()
  const kanal = durum.cift.get(arkadasId)
  if (!kanal || durum.iliskiler.get(arkadasId)?.durum !== 'kabul') {
    throw new Error('Bu kişiye mesaj gönderemezsin — önce arkadaş olmanız gerekiyor.')
  }
  return kanal
}

async function okunduSiniri(konu: string, kim: string): Promise<number> {
  const m = motor()
  const kanal = kanalBilgisi(konu)
  if (!kanal) return 0
  const k = await m.kayit(kanal, kim, 'okundu')
  return nesneMi(k?.veri) ? (sayiAl(k.veri.zaman) ?? 0) : 0
}

function mesajKur(k: SosyalKayit, benimId: string, karsi: string, sinirlar: { ben: number; o: number }): DirektMesaj | null {
  if (!nesneMi(k.veri)) return null
  const metin = metinAl(k.veri.metin, 4000) ?? ''
  const davetId = metinAl(k.veri.davetId, 40)
  if (!metin && !davetId) return null
  const zaman = kayitZamani(k)
  const benden = k.yazar === benimId
  return {
    id: k.anahtar.slice('dm:'.length),
    gonderen_id: k.yazar,
    alan_id: benden ? karsi : benimId,
    metin,
    davet_id: davetId,
    okundu: benden ? zaman <= sinirlar.o : zaman <= sinirlar.ben,
    olusturulma: isoZaman(zaman),
  }
}

export async function direktMesajlariGetir(arkadasId: string, limit = 100): Promise<DirektMesaj[]> {
  const m = motor()
  const durum = await kanalDurumu()
  const kanal = durum.cift.get(arkadasId)
  if (!kanal) return []
  const sinirlar = {
    ben: await okunduSiniri(kanal.konu, m.benimId),
    o: await okunduSiniri(kanal.konu, arkadasId),
  }
  const kayitlar = await m.kayitlar(kanal.konu, TUR.dm)
  return kayitlar
    .flatMap((k) => mesajKur(k, m.benimId, arkadasId, sinirlar) ?? [])
    .sort((a, b) => a.olusturulma.localeCompare(b.olusturulma))
    .slice(-limit)
}

// With davetId the message shows as a card for that plan invite.
export async function direktMesajGonder(arkadasId: string, metin: string, davetId?: string | null): Promise<void> {
  const kanal = await arkadasKanali(arkadasId)
  await motor().yayinla(kanal, TUR.dm, `dm:${rastgeleId()}`, {
    metin: metin.trim().slice(0, 4000),
    davetId: davetId ?? null,
    zaman: simdiMs(),
  })
}

export async function okunduIsaretle(arkadasId: string): Promise<void> {
  const m = motor()
  const durum = await kanalDurumu()
  const kanal = durum.cift.get(arkadasId)
  if (!kanal) return
  const sinir = await okunduSiniri(kanal.konu, m.benimId)
  const kayitlar = await m.kayitlar(kanal.konu, TUR.dm)
  const gelenler = kayitlar.filter((k) => k.yazar === arkadasId).map(kayitZamani)
  if (!gelenler.some((z) => z > sinir)) return
  // Message times come from the sender's clock; covering the newest one
  // keeps a friend whose clock runs ahead from staying "unread" forever.
  await m.yayinla(kanal, TUR.okundu, 'okundu', { zaman: Math.max(simdiMs(), ...gelenler) })
}

// New messages from friends as they arrive.
export function direktMesajlariDinle(benimId: string, geldi: (m: DirektMesaj) => void): () => void {
  return kayitlariDinle((k) => {
    if (k.tur !== TUR.dm || k.yazar === benimId) return
    const kanal = kanalBilgisi(k.konu)
    if (kanal?.tur !== 'cift' || !kanal.karsi) return
    const mesaj = mesajKur(k, benimId, kanal.karsi, { ben: 0, o: 0 })
    if (mesaj) geldi(mesaj)
  })
}

// ---------- combined chat list ----------

export interface Sohbet {
  tur: 'arkadas' | 'grup'
  id: string
  ad: string
  kullaniciAdi: string | null
  avatar: string | null
  sonMesaj: string | null
  sonZaman: string | null
  okunmamis: number
  profil?: Profil
  grup?: Grup
}

// Friends and groups in one list, latest conversation first. Friends and
// groups without messages stay in the list, so a chat can be started.
export async function sohbetleriGetir(): Promise<Sohbet[]> {
  const [arkadaslar, gruplar] = await Promise.all([arkadaslariGetir(), gruplarimiGetir()])

  const arkadasSohbetleri: Sohbet[] = await Promise.all(
    arkadaslar
      .filter((a) => a.durum === 'kabul')
      .map(async (a) => {
        const mesajlar = await direktMesajlariGetir(a.profil.id)
        const son = mesajlar[mesajlar.length - 1]
        return {
          tur: 'arkadas' as const,
          id: a.profil.id,
          ad: a.profil.ad,
          kullaniciAdi: a.profil.kullanici_adi,
          avatar: a.profil.avatar,
          sonMesaj: son ? son.metin || 'Plan daveti' : null,
          sonZaman: son?.olusturulma ?? null,
          okunmamis: mesajlar.filter((m) => m.gonderen_id === a.profil.id && !m.okundu).length,
          profil: a.profil,
        }
      }),
  )

  const grupSohbetleri: Sohbet[] = await Promise.all(
    gruplar.map(async (g) => {
      const mesajlar = await mesajlariGetir(g.id, 1)
      const son = mesajlar[mesajlar.length - 1]
      return {
        tur: 'grup' as const,
        id: g.id,
        ad: g.ad,
        kullaniciAdi: null,
        avatar: null,
        sonMesaj: son ? son.metin || 'Grup planı' : null,
        sonZaman: son?.olusturulma ?? null,
        okunmamis: await grupOkunmamisSayisi(g.id),
        grup: g,
      }
    }),
  )

  return [...arkadasSohbetleri, ...grupSohbetleri].sort((a, b) => {
    // Chats with messages first, newest on top; the rest by name.
    if (a.sonZaman && b.sonZaman) return b.sonZaman.localeCompare(a.sonZaman)
    if (a.sonZaman) return -1
    if (b.sonZaman) return 1
    return a.ad.localeCompare(b.ad, 'tr')
  })
}

// Badge on the chat tab.
export async function okunmamisMesajSayisi(): Promise<number> {
  const sohbetler = await sohbetleriGetir()
  return sohbetler.reduce((t, s) => t + s.okunmamis, 0)
}
