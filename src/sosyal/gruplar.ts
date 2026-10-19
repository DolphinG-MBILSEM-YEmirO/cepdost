import {
  TUR,
  benimProfilVerim,
  grupKanaliAl,
  grupKanaliBul,
  isoZaman,
  kanalBilgisi,
  kanalDurumu,
  kayitlariDinle,
  kayitZamani,
  metinAl,
  motor,
  nesneMi,
  planZamani,
  profilOzetiAl,
  sayiAl,
  simdiMs,
  yeniAnahtar,
  type Gizlilik,
  type GrupumVerisi,
  type ProfilOzeti,
  type UyeVerisi,
} from './cekirdek'
import { bilinenProfiller, musaitlikKaydi, ozettenProfil, type Profil } from './api'
import { onaylilariSec } from './epostaImzacisi'
import { fotoBilgisiAl, fotoHazirla, fotoSil, fotoUrl, fotoYayinla, type FotoBilgisi } from './foto'
import { kesfetKanali, type Kanal } from './nostr/kanal'
import { rastgeleId } from './nostr/kodlama'
import type { SosyalKayit } from './nostr/motor'

// Groups, group plans, group chat and the memory archive. A group is a
// channel whose key every member holds; members join by receiving the key
// from a friend (see the reconcile step in cekirdek.ts).

export interface Grup {
  id: string
  ad: string
  olusturan_id: string
  olusturulma: string
  emoji: string | null
  aciklama: string | null
  renk: string | null
}

export interface GrupUyesi {
  kullanici_id: string
  rol: 'yonetici' | 'uye'
  profil: Profil | null
}

export interface GrupPlani {
  id: string
  grup_id: string
  olusturan_id: string
  baslik: string
  tarih: string
  saat: string | null
  sure: number | null
  // All-day plan: saat and sure are null.
  tum_gun: boolean
  konum: string | null
  notlar: string | null
  emoji: string | null
  olusturulma: string
}

export type YanitDurumu = 'geliyorum' | 'gelmiyorum' | 'belki'

export interface PlanYaniti {
  plan_id: string
  kullanici_id: string
  durum: YanitDurumu
}

export interface GrupMesaji {
  id: string
  grup_id: string
  gonderen_id: string
  metin: string
  // When set, the message shows as a card for this group plan.
  plan_id: string | null
  olusturulma: string
}

export interface Ani {
  id: string
  sahip_id: string
  grup_id: string | null
  arkadas_id: string | null
  mekan_adi: string
  tarih: string
  notlar: string | null
  // 'arkadaslar': only the group or friend it was shared with.
  // 'herkes': also on the public Keşfet feed.
  gorunurluk: Gizlilik
  olusturulma: string
  foto: FotoBilgisi | null
  // Owner's name and photo (Keşfet shows strangers' memories).
  sahip: ProfilOzeti | null
  // Topic of the channel the record lives on; locates the photo.
  konu: string
}

// ---------- groups ----------

export interface GrupGorunumu {
  emoji?: string | null
  aciklama?: string | null
  renk?: string | null
}

async function benimOzetim(): Promise<ProfilOzeti> {
  const p = await benimProfilVerim()
  if (!p) throw new Error('Oturum bulunamadı')
  return { ad: p.ad, kullanici_adi: p.kullanici_adi, avatar: p.avatar, onay: p.onay ?? null }
}

async function arkadasKanali(pk: string) {
  const durum = await kanalDurumu()
  if (durum.iliskiler.get(pk)?.durum !== 'kabul') {
    throw new Error('Gruba yalnızca arkadaşlarını ekleyebilirsin.')
  }
  return durum.cift.get(pk)!
}

async function grupDavetiGonder(pk: string, grupId: string, veri: GrupumVerisi, kanal: Kanal) {
  const m = motor()
  const profiller = await bilinenProfiller()
  const p = profiller.get(pk)
  await m.yayinla(kanal, TUR.uye, `uye:${pk}`, {
    durum: 'aktif',
    rol: 'uye',
    profil: p ? { ad: p.ad, kullanici_adi: p.kullanici_adi, avatar: p.avatar } : null,
    ekleyen: m.benimId,
    zaman: simdiMs(),
  } satisfies UyeVerisi)
  await m.yayinla(await arkadasKanali(pk), TUR.grupDavet, `grup-davet:${grupId}`, {
    grupId,
    anahtar: veri.anahtar,
    ad: veri.ad,
    zaman: simdiMs(),
  })
}

export async function grupOlustur(ad: string, uyeIdler: string[], gorunum: GrupGorunumu = {}): Promise<string> {
  const m = motor()
  const temizAd = ad.trim().slice(0, 80)
  if (!temizAd) throw new Error('Gruba bir isim ver.')
  // Fail early if someone on the list isn't a friend.
  for (const pk of uyeIdler) await arkadasKanali(pk)

  const grupId = rastgeleId(9)
  const veri: GrupumVerisi = { anahtar: yeniAnahtar(), ad: temizAd, durum: 'aktif', zaman: simdiMs() }
  const kanal = await grupKanaliAl(veri.anahtar, grupId)
  m.kanalKaydet(kanal)

  await m.yayinla(await m.ben(), TUR.grupum, `grup:${grupId}`, veri)
  await m.yayinla(kanal, TUR.grup, 'grup', {
    ad: temizAd,
    olusturan_id: m.benimId,
    olusturulma: simdiMs(),
    emoji: gorunum.emoji ?? null,
    aciklama: gorunum.aciklama?.trim() || null,
    renk: gorunum.renk ?? null,
  })
  await m.yayinla(kanal, TUR.uye, `uye:${m.benimId}`, {
    durum: 'aktif',
    rol: 'yonetici',
    profil: await benimOzetim(),
    ekleyen: m.benimId,
    zaman: simdiMs(),
  } satisfies UyeVerisi)
  await Promise.all(uyeIdler.map((pk) => grupDavetiGonder(pk, grupId, veri, kanal)))
  void m.esitle().catch(() => {})
  return grupId
}

function grupKur(grupId: string, veri: GrupumVerisi, kart: SosyalKayit | undefined): Grup {
  const k = nesneMi(kart?.veri) ? kart.veri : {}
  return {
    id: grupId,
    ad: metinAl(k.ad, 80) ?? veri.ad,
    olusturan_id: metinAl(k.olusturan_id, 64) ?? kart?.yazar ?? '',
    olusturulma: isoZaman(sayiAl(k.olusturulma) ?? veri.zaman),
    emoji: metinAl(k.emoji, 16),
    aciklama: metinAl(k.aciklama, 200),
    renk: metinAl(k.renk, 20),
  }
}

// Any member may edit the group card; the newest edit wins.
async function grupKarti(kanal: Kanal): Promise<SosyalKayit | undefined> {
  const kartlar = await motor().kayitlar(kanal.konu, TUR.grup)
  return kartlar.sort((a, b) => b.zaman - a.zaman)[0]
}

export async function gruplarimiGetir(): Promise<Grup[]> {
  const durum = await kanalDurumu()
  const liste: Grup[] = []
  for (const [grupId, g] of durum.gruplar) liste.push(grupKur(grupId, g.veri, await grupKarti(g.kanal)))
  return liste.sort((a, b) => b.olusturulma.localeCompare(a.olusturulma))
}

// The groups someone and I are both in (for their profile).
export async function ortakGruplar(kisiId: string): Promise<Grup[]> {
  const durum = await kanalDurumu()
  const liste: Grup[] = []
  for (const [grupId, g] of durum.gruplar) {
    const uye = (await uyeKayitlari(g.kanal)).get(kisiId)
    if (uye?.veri.durum === 'aktif') liste.push(grupKur(grupId, g.veri, await grupKarti(g.kanal)))
  }
  return liste.sort((a, b) => b.olusturulma.localeCompare(a.olusturulma))
}

export async function grupGuncelle(grupId: string, degisiklik: GrupGorunumu & { ad?: string }): Promise<void> {
  const m = motor()
  const kanal = await grupKanaliBul(grupId)
  const durum = await kanalDurumu()
  const mevcut = grupKur(grupId, durum.gruplar.get(grupId)!.veri, await grupKarti(kanal))
  const ad = degisiklik.ad?.trim().slice(0, 80) || mevcut.ad
  await m.yayinla(kanal, TUR.grup, 'grup', {
    ad,
    olusturan_id: mevcut.olusturan_id,
    olusturulma: Date.parse(mevcut.olusturulma),
    emoji: degisiklik.emoji !== undefined ? degisiklik.emoji : mevcut.emoji,
    aciklama: degisiklik.aciklama !== undefined ? degisiklik.aciklama?.trim() || null : mevcut.aciklama,
    renk: degisiklik.renk !== undefined ? degisiklik.renk : mevcut.renk,
  })
}

// Each member's latest membership record decides whether they're in.
async function uyeKayitlari(kanal: Kanal): Promise<Map<string, { veri: Record<string, unknown>; zaman: number }>> {
  const harita = new Map<string, { veri: Record<string, unknown>; zaman: number }>()
  for (const k of await motor().kayitlar(kanal.konu, TUR.uye)) {
    const pk = k.anahtar.slice(4)
    if (!/^[0-9a-f]{64}$/.test(pk) || !nesneMi(k.veri)) continue
    const zaman = kayitZamani(k)
    const onceki = harita.get(pk)
    if (!onceki || onceki.zaman < zaman) harita.set(pk, { veri: k.veri, zaman })
  }
  return harita
}

export async function grupUyeleriGetir(grupId: string): Promise<GrupUyesi[]> {
  const kanal = await grupKanaliBul(grupId)
  const profiller = await bilinenProfiller()
  const liste: GrupUyesi[] = []
  for (const [pk, { veri }] of await uyeKayitlari(kanal)) {
    if (veri.durum !== 'aktif') continue
    const ozet = profilOzetiAl(veri.profil)
    const profil = profiller.get(pk) ?? (ozet ? ozettenProfil(pk, ozet) : null)
    // Planning needs to know whether their availability can be read here.
    if (profil) profil.musaitlik_paylas = (await musaitlikKaydi(pk)) !== null
    liste.push({ kullanici_id: pk, rol: veri.rol === 'yonetici' ? 'yonetici' : 'uye', profil })
  }
  return liste
}

export async function grubaUyeEkle(grupId: string, kullaniciId: string): Promise<void> {
  const kanal = await grupKanaliBul(grupId)
  const durum = await kanalDurumu()
  await grupDavetiGonder(kullaniciId, grupId, durum.gruplar.get(grupId)!.veri, kanal)
}

// Leaving a group. Members can only remove themselves: removing someone
// else would need a new group key, which the others don't have yet.
export async function gruptanAyril(grupId: string, kullaniciId: string): Promise<void> {
  const m = motor()
  if (kullaniciId !== m.benimId) throw new Error('Gruptan yalnızca kendini çıkarabilirsin.')
  const kanal = await grupKanaliBul(grupId)
  const durum = await kanalDurumu()
  const veri = durum.gruplar.get(grupId)!.veri
  await m.yayinla(kanal, TUR.uye, `uye:${m.benimId}`, {
    durum: 'ayrildi',
    rol: 'uye',
    profil: null,
    ekleyen: m.benimId,
    zaman: simdiMs(),
  } satisfies UyeVerisi)
  await m.yayinla(kanal, TUR.musaitlik, 'musaitlik', null).catch(() => {})
  await m.yayinla(await m.ben(), TUR.grupum, `grup:${grupId}`, { ...veri, durum: 'ayrildi', zaman: simdiMs() })
}

// ---------- group plans ----------

export interface YeniGrupPlani {
  grupId: string
  baslik: string
  tarih: string
  saat?: string | null
  sure?: number | null
  tumGun?: boolean
  konum?: string | null
  notlar?: string | null
  emoji?: string | null
}

// Returns the plan id, so the creator can mark themselves as coming.
export async function grupPlaniOlustur(plan: YeniGrupPlani): Promise<string> {
  const kanal = await grupKanaliBul(plan.grupId)
  const id = rastgeleId()
  await motor().yayinla(kanal, TUR.plan, `plan:${id}`, {
    baslik: plan.baslik.trim().slice(0, 120),
    tarih: plan.tarih,
    saat: plan.tumGun ? null : plan.saat || null,
    sure: plan.tumGun ? null : plan.sure ?? null,
    tumGun: plan.tumGun === true,
    konum: plan.konum?.trim() || null,
    notlar: plan.notlar?.trim() || null,
    emoji: plan.emoji || null,
    zaman: simdiMs(),
  })
  return id
}

function planKur(k: SosyalKayit): GrupPlani | null {
  const kanal = kanalBilgisi(k.konu)
  if (!kanal?.grupId || !nesneMi(k.veri)) return null
  const baslik = metinAl(k.veri.baslik, 120)
  const tarih = metinAl(k.veri.tarih, 10)
  if (!baslik || !tarih) return null
  return {
    id: k.anahtar.slice('plan:'.length),
    grup_id: kanal.grupId,
    olusturan_id: k.yazar,
    baslik,
    tarih,
    ...planZamani(k.veri),
    konum: metinAl(k.veri.konum, 200),
    notlar: metinAl(k.veri.notlar, 1000),
    emoji: metinAl(k.veri.emoji, 16),
    olusturulma: isoZaman(kayitZamani(k)),
  }
}

export async function grupPlanlariGetir(grupId: string): Promise<GrupPlani[]> {
  const kanal = await grupKanaliBul(grupId)
  const kayitlar = await motor().kayitlar(kanal.konu, TUR.plan)
  return kayitlar
    .flatMap((k) => planKur(k) ?? [])
    .sort((a, b) => (a.tarih + (a.saat ?? '')).localeCompare(b.tarih + (b.saat ?? '')))
}

export async function planYanitlariGetir(planIdler: string[]): Promise<PlanYaniti[]> {
  await kanalDurumu()
  const kayitlar = await motor().anahtarIle(planIdler.map((id) => `yanit:${id}`))
  return kayitlar.flatMap((k) => {
    const durum = nesneMi(k.veri) ? k.veri.durum : null
    if (k.tur !== TUR.yanit || (durum !== 'geliyorum' && durum !== 'gelmiyorum' && durum !== 'belki')) return []
    return [{ plan_id: k.anahtar.slice('yanit:'.length), kullanici_id: k.yazar, durum }]
  })
}

export async function planaYanitVer(planId: string, durum: YanitDurumu): Promise<void> {
  await kanalDurumu()
  const m = motor()
  const [plan] = (await m.anahtarIle([`plan:${planId}`])).filter((k) => k.tur === TUR.plan)
  const kanal = plan ? kanalBilgisi(plan.konu) : undefined
  if (!kanal) throw new Error('Plan bulunamadı.')
  await m.yayinla(kanal, TUR.yanit, `yanit:${planId}`, { durum, zaman: simdiMs() })
}

// For drawing plan cards in a chat: id → plan.
export async function planlariIdyeGoreGetir(idler: string[]): Promise<Map<string, GrupPlani>> {
  await kanalDurumu()
  const harita = new Map<string, GrupPlani>()
  const kayitlar = await motor().anahtarIle([...new Set(idler.filter(Boolean))].map((id) => `plan:${id}`))
  for (const k of kayitlar) {
    const p = k.tur === TUR.plan ? planKur(k) : null
    if (p) harita.set(p.id, p)
  }
  return harita
}

// ---------- group chat ----------

function mesajKur(k: SosyalKayit, grupId: string): GrupMesaji | null {
  if (!nesneMi(k.veri)) return null
  const metin = metinAl(k.veri.metin, 4000) ?? ''
  const planId = metinAl(k.veri.planId, 40)
  if (!metin && !planId) return null
  return {
    id: k.anahtar.slice('mesaj:'.length),
    grup_id: grupId,
    gonderen_id: k.yazar,
    metin,
    plan_id: planId,
    olusturulma: isoZaman(kayitZamani(k)),
  }
}

export async function mesajlariGetir(grupId: string, limit = 100): Promise<GrupMesaji[]> {
  const kanal = await grupKanaliBul(grupId)
  const kayitlar = await motor().kayitlar(kanal.konu, TUR.mesaj)
  return kayitlar
    .flatMap((k) => mesajKur(k, grupId) ?? [])
    .sort((a, b) => a.olusturulma.localeCompare(b.olusturulma))
    .slice(-limit)
}

// With planId the message shows as a card for that plan.
export async function mesajGonder(grupId: string, metin: string, planId?: string | null): Promise<void> {
  const kanal = await grupKanaliBul(grupId)
  await motor().yayinla(kanal, TUR.mesaj, `mesaj:${rastgeleId()}`, {
    metin: metin.trim().slice(0, 4000),
    planId: planId ?? null,
    zaman: simdiMs(),
  })
}

// New messages as they arrive (including my own from other devices).
export function mesajlariDinle(grupId: string, geldi: (m: GrupMesaji) => void): () => void {
  let konu: string | null = null
  void grupKanaliBul(grupId)
    .then((k) => (konu = k.konu))
    .catch(() => {})
  return kayitlariDinle((k) => {
    if (k.konu !== konu || k.tur !== TUR.mesaj) return
    const mesaj = mesajKur(k, grupId)
    if (mesaj) geldi(mesaj)
  })
}

// Unread = messages from others newer than my last 'okundu' mark.
export async function grupOkunmamisSayisi(grupId: string): Promise<number> {
  const m = motor()
  const kanal = await grupKanaliBul(grupId)
  const okundu = await m.kayit(kanal, m.benimId, 'okundu')
  const sinir = nesneMi(okundu?.veri) ? (sayiAl(okundu.veri.zaman) ?? 0) : 0
  const mesajlar = await m.kayitlar(kanal.konu, TUR.mesaj)
  return mesajlar.filter((k) => k.yazar !== m.benimId && kayitZamani(k) > sinir).length
}

export async function grupOkunduIsaretle(grupId: string): Promise<void> {
  if ((await grupOkunmamisSayisi(grupId)) === 0) return
  const m = motor()
  const kanal = await grupKanaliBul(grupId)
  const gelenler = (await m.kayitlar(kanal.konu, TUR.mesaj)).filter((k) => k.yazar !== m.benimId).map(kayitZamani)
  // Times come from each sender's clock (see okunduIsaretle in mesajlar.ts).
  await m.yayinla(kanal, TUR.okundu, 'okundu', { zaman: Math.max(simdiMs(), ...gelenler) })
}

// ---------- memories ----------

export interface YeniAni {
  grupId?: string | null
  arkadasId?: string | null
  mekanAdi: string
  tarih: string
  notlar?: string | null
  gorunurluk?: Gizlilik
  dosya: File
}

// Where a memory lives: the group, the pair channel with the friend, or
// (with neither) my own channel.
async function aniKanali(grupId?: string | null, arkadasId?: string | null): Promise<Kanal> {
  if (grupId) return grupKanaliBul(grupId)
  if (arkadasId) {
    const durum = await kanalDurumu()
    const kanal = durum.cift.get(arkadasId)
    if (!kanal || durum.iliskiler.get(arkadasId)?.durum !== 'kabul') {
      throw new Error('Anıyı yalnızca arkadaşlarınla paylaşabilirsin.')
    }
    return kanal
  }
  return motor().ben()
}

let kesfet: Promise<Kanal> | null = null
function kesfetKanaliAl(): Promise<Kanal> {
  kesfet ??= kesfetKanali().then((k) => {
    motor().kanalKaydet(k)
    return k
  })
  return kesfet
}

export async function aniEkle(yeni: YeniAni): Promise<Ani> {
  const m = motor()
  const kanal = await aniKanali(yeni.grupId, yeni.arkadasId)
  const id = rastgeleId()
  const bayt = await fotoHazirla(yeni.dosya)
  const foto = await fotoYayinla(kanal, id, bayt)
  const gorunurluk = yeni.gorunurluk ?? 'arkadaslar'
  const sahip = await benimOzetim()
  const veri = {
    mekan_adi: yeni.mekanAdi.trim().slice(0, 120),
    tarih: yeni.tarih,
    notlar: yeni.notlar?.trim() || null,
    grup_id: yeni.grupId ?? null,
    arkadas_id: yeni.arkadasId ?? null,
    gorunurluk,
    foto,
    zaman: simdiMs(),
  }
  const kayit = await m.yayinla(kanal, TUR.ani, `ani:${id}`, veri)

  // Public memories get a second, unencrypted copy on Keşfet.
  if (gorunurluk === 'herkes') {
    try {
      const k = await kesfetKanaliAl()
      const kesfetFoto = await fotoYayinla(k, id, bayt)
      await m.yayinla(k, TUR.ani, `ani:${id}`, { ...veri, grup_id: null, arkadas_id: null, foto: kesfetFoto, sahip })
    } catch (err) {
      console.warn('anı Keşfet\'e eklenemedi', err)
    }
  }
  return aniKur(kayit)!
}

function aniKur(k: SosyalKayit): Ani | null {
  if (!nesneMi(k.veri)) return null
  const mekan = metinAl(k.veri.mekan_adi, 120)
  const tarih = metinAl(k.veri.tarih, 10)
  if (!mekan || !tarih) return null
  const kanal = kanalBilgisi(k.konu)
  return {
    id: k.anahtar.slice('ani:'.length),
    sahip_id: k.yazar,
    grup_id: kanal?.grupId ?? metinAl(k.veri.grup_id, 40),
    arkadas_id: kanal?.tur === 'cift' ? (k.yazar === motor().benimId ? kanal.karsi! : motor().benimId) : null,
    mekan_adi: mekan,
    tarih,
    notlar: metinAl(k.veri.notlar, 1000),
    gorunurluk: k.veri.gorunurluk === 'herkes' ? 'herkes' : 'arkadaslar',
    olusturulma: isoZaman(kayitZamani(k)),
    foto: fotoBilgisiAl(k.veri.foto),
    sahip: profilOzetiAl(k.veri.sahip),
    konu: k.konu,
  }
}

function tarihSirasi(a: Ani, b: Ani) {
  return b.tarih.localeCompare(a.tarih) || b.olusturulma.localeCompare(a.olusturulma)
}

export async function anilariGetir(secim: { grupId?: string | null; arkadasId?: string | null }): Promise<Ani[]> {
  const kanal = await aniKanali(secim.grupId, secim.arkadasId)
  const kayitlar = await motor().kayitlar(kanal.konu, TUR.ani)
  return kayitlar.flatMap((k) => aniKur(k) ?? []).sort(tarihSirasi)
}

// Puts my current summary (name, photo, email attestation) on my Keşfet
// posts, so posts made before I verified my email show up again.
export async function kesfetSahibimiTazele(): Promise<void> {
  const m = motor()
  const kanal = await kesfetKanaliAl()
  const sahip = await benimOzetim()
  const kayitlar = await m.kanalSorgula(kanal, { authors: [m.benimId] })
  for (const k of kayitlar) {
    if (k.yazar !== m.benimId || k.tur !== TUR.ani || !nesneMi(k.veri)) continue
    if (JSON.stringify(k.veri.sahip ?? null) === JSON.stringify(sahip)) continue
    await m.yayinla(kanal, TUR.ani, k.anahtar, { ...k.veri, sahip })
  }
}

// Feed scope: 'arkadaslar' = memories shared with me or my groups,
// 'herkes' = the public Keşfet feed.
export type AkisKapsami = 'arkadaslar' | 'herkes'

const kesfetSahipleri = new Map<string, ProfilOzeti>()

export async function akisAnilariGetir(kapsam: AkisKapsami, limit = 60): Promise<Ani[]> {
  const m = motor()
  if (kapsam === 'herkes') {
    const kayitlar = await m.kanalSorgula(await kesfetKanaliAl(), { limit: limit * 3 })
    // Public posts count only from accounts with a verified email, so bots
    // can't flood Keşfet.
    const anilar = await onaylilariSec(
      kayitlar
        .filter((k) => k.tur === TUR.ani)
        .flatMap((k) => aniKur(k) ?? [])
        .filter((a) => a.foto),
      (a) => ({ pk: a.sahip_id, onay: a.sahip?.onay }),
    )
    for (const a of anilar) if (a.sahip) kesfetSahipleri.set(a.sahip_id, a.sahip)
    return anilar.sort((a, b) => b.olusturulma.localeCompare(a.olusturulma)).slice(0, limit)
  }

  const durum = await kanalDurumu()
  const kanallar = [...durum.cift.values(), ...[...durum.gruplar.values()].map((g) => g.kanal)]
  const anilar: Ani[] = []
  for (const kanal of kanallar) {
    for (const k of await m.kayitlar(kanal.konu, TUR.ani)) {
      const a = aniKur(k)
      if (a?.foto) anilar.push(a)
    }
  }
  return anilar.sort((a, b) => b.olusturulma.localeCompare(a.olusturulma)).slice(0, limit)
}

// Names and photos for memory owners: people I know, plus the owner card
// public memories carry.
export async function profilleriGetir(idler: string[]): Promise<Map<string, Profil>> {
  const bilinen = await bilinenProfiller()
  const harita = new Map<string, Profil>()
  for (const id of new Set(idler)) {
    const p = bilinen.get(id) ?? (kesfetSahipleri.has(id) ? ozettenProfil(id, kesfetSahipleri.get(id)!) : null)
    if (p) harita.set(id, p)
  }
  return harita
}

async function aniKanaliBul(ani: Ani): Promise<Kanal | null> {
  await kanalDurumu()
  const k = kanalBilgisi(ani.konu)
  if (k) return k
  const kesfetK = await kesfetKanaliAl()
  return kesfetK.konu === ani.konu ? kesfetK : null
}

// Object URL of the memory's photo (fetched on first use).
export async function aniGorselUrl(ani: Ani): Promise<string | null> {
  if (!ani.foto) return null
  const kanal = await aniKanaliBul(ani)
  return kanal ? fotoUrl(kanal, ani.sahip_id, ani.id, ani.foto) : null
}

export async function aniSil(ani: Ani): Promise<void> {
  const m = motor()
  if (ani.sahip_id !== m.benimId) throw new Error('Yalnızca kendi eklediğin anıları silebilirsin.')
  const kanal = await aniKanaliBul(ani)
  if (!kanal) throw new Error('Anı bulunamadı.')
  await m.yayinla(kanal, TUR.ani, `ani:${ani.id}`, null)
  if (ani.foto) await fotoSil(kanal, ani.id, ani.foto).catch(() => {})

  // Remove the Keşfet copy too, wherever the delete started from.
  if (ani.gorunurluk === 'herkes') {
    const kesfetK = await kesfetKanaliAl()
    if (kesfetK.konu !== kanal.konu) {
      const kopya = await m.kayit(kesfetK, m.benimId, `ani:${ani.id}`)
      await m.yayinla(kesfetK, TUR.ani, `ani:${ani.id}`, null).catch(() => {})
      const kopyaFoto = fotoBilgisiAl(nesneMi(kopya?.veri) ? kopya.veri.foto : null)
      if (kopyaFoto) await fotoSil(kesfetK, ani.id, kopyaFoto).catch(() => {})
    }
  }
}
