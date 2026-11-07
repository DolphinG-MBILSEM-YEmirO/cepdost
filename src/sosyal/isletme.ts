import { TUR, benimProfilVerim, metinAl, motor, nesneMi, sayiAl, simdiMs } from './cekirdek'
import type { SosyalKayit } from './nostr/motor'
import { onaylilariSec } from './epostaImzacisi'
import { fotoBilgisiAl, fotoHazirla, fotoSil, fotoUrl, fotoYayinla, type FotoBilgisi } from './foto'
import { isletmeKanali, type Kanal } from './nostr/kanal'
import { rastgeleId } from './nostr/kodlama'
import { engellenenler } from './engel'
import { mesafe, yasakliMi } from '../../shared/yakinMekanlar'
import type { EpostaOnayi } from '../../shared/epostaOnayi'

// A business's public profile: what people see when its place comes up in
// the feed's "Yakınında" (photos, contact, hours, a short description) and
// the discount it gives people who come through the app.
//
// Any Sharloop account can open one for free in Settings. It is one public
// record on the business channel, written and signed by the account, so
// only the business can change it. Being *sponsored* (shown in the paid
// slot) is separate: that is a campaign we add after the business pays
// (api/_lib/kampanyalar.ts), pointing at this profile.

export const AZAMI_ISLETME_FOTO = 5
const ISLETME_ANAHTARI = 'isletme'
// Profiles are only read near the person; beyond this they don't matter.
export const ISLETME_YARICAPI = 5000

export interface IsletmeFotosu {
  id: string
  bilgi: FotoBilgisi
}

export interface IsletmeIndirimi {
  metin: string
  kosul: string | null
}

export interface IsletmeProfili {
  // The business account's public key.
  id: string
  ad: string
  kategori: string
  aciklama: string | null
  adres: string
  enlem: number
  boylam: number
  telefon: string | null
  web: string | null
  instagram: string | null
  // Free text, e.g. "Her gün 08:00–23:00".
  saatler: string | null
  fotolar: IsletmeFotosu[]
  indirim: IsletmeIndirimi | null
  guncelleme: number
  onay: EpostaOnayi | null
}

export type IsletmeGirdisi = Omit<IsletmeProfili, 'id' | 'fotolar' | 'guncelleme' | 'onay'>

let kanal: Promise<Kanal> | null = null
function kanalAl(): Promise<Kanal> {
  kanal ??= isletmeKanali().then((k) => {
    motor().kanalKaydet(k)
    return k
  })
  return kanal
}

function bosaNull(deger: unknown, azami: number): string | null {
  return metinAl(deger, azami)?.trim() || null
}

// Only http(s) links, so a profile can't carry a javascript: link.
export function webAdresiAl(deger: unknown): string | null {
  const metin = bosaNull(deger, 200)
  if (!metin) return null
  try {
    const url = new URL(/^https?:\/\//i.test(metin) ? metin : `https://${metin}`)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

export function instagramAl(deger: unknown): string | null {
  const ad = bosaNull(deger, 60)?.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '')
  return ad && /^[A-Za-z0-9._]{1,30}$/.test(ad) ? ad : null
}

export function telefonAl(deger: unknown): string | null {
  const metin = bosaNull(deger, 30)
  return metin && /^[+\d][\d\s()-]{6,}$/.test(metin) ? metin : null
}

function indirimAl(deger: unknown): IsletmeIndirimi | null {
  if (!nesneMi(deger)) return null
  const metin = bosaNull(deger.metin, 80)
  return metin ? { metin, kosul: bosaNull(deger.kosul, 120) } : null
}

// A stored record → a profile, or null if it isn't a usable one.
export function isletmeKur(k: Pick<SosyalKayit, 'yazar' | 'veri'>): IsletmeProfili | null {
  const v = k.veri
  if (!nesneMi(v)) return null
  const ad = bosaNull(v.ad, 80)
  const kategori = bosaNull(v.kategori, 40)
  const adres = bosaNull(v.adres, 160)
  const enlem = sayiAl(v.enlem)
  const boylam = sayiAl(v.boylam)
  if (!ad || !kategori || !adres || enlem === null || boylam === null) return null
  if (Math.abs(enlem) > 90 || Math.abs(boylam) > 180) return null
  // The same rule as the feed: no alcohol, hookah, tobacco or betting.
  if (yasakliMi(`${kategori} ${ad}`)) return null
  const fotolar = Array.isArray(v.fotolar)
    ? v.fotolar.slice(0, AZAMI_ISLETME_FOTO).flatMap((f): IsletmeFotosu[] => {
        if (!nesneMi(f) || typeof f.id !== 'string' || !/^isletme-[A-Za-z0-9_-]{8,32}$/.test(f.id)) return []
        const bilgi = fotoBilgisiAl(f)
        return bilgi ? [{ id: f.id, bilgi }] : []
      })
    : []
  return {
    id: k.yazar,
    ad,
    kategori,
    aciklama: bosaNull(v.aciklama, 300),
    adres,
    enlem,
    boylam,
    telefon: telefonAl(v.telefon),
    web: webAdresiAl(v.web),
    instagram: instagramAl(v.instagram),
    saatler: bosaNull(v.saatler, 120),
    fotolar,
    indirim: indirimAl(v.indirim),
    guncelleme: sayiAl(v.guncelleme) ?? 0,
    onay: nesneMi(v.onay) ? (v.onay as unknown as EpostaOnayi) : null,
  }
}

export async function isletmemiGetir(): Promise<IsletmeProfili | null> {
  const m = motor()
  const k = await kanalAl()
  let kayit = await m.kayit(k, m.benimId, ISLETME_ANAHTARI)
  if (!kayit) {
    // Another device may have made it: ask the relays once.
    await m.kayitlariGetir(k, m.benimId, [ISLETME_ANAHTARI], k.konu).catch(() => {})
    kayit = await m.kayit(k, m.benimId, ISLETME_ANAHTARI)
  }
  return kayit ? isletmeKur(kayit) : null
}

// Saves my business profile. `yeniFotolar` replaces the photos when given
// (old ones are deleted); `fotolariKoru` keeps the ones already there.
export async function isletmemiKaydet(
  girdi: IsletmeGirdisi,
  fotolar: { koru: IsletmeFotosu[]; yeni: Blob[] },
): Promise<IsletmeProfili> {
  const ad = girdi.ad.trim()
  const kategori = girdi.kategori.trim()
  if (!ad || !kategori || !girdi.adres.trim()) throw new Error('Mekanın adı, türü ve adresi gerekli.')
  if (yasakliMi(`${kategori} ${ad}`)) throw new Error('Alkol, nargile, tütün ve bahis mekanları Sharloop\'ta yer alamaz.')
  if (!Number.isFinite(girdi.enlem) || !Number.isFinite(girdi.boylam)) throw new Error('Mekanın konumunu ekle.')

  const m = motor()
  const k = await kanalAl()
  const onceki = await isletmemiGetir()
  const korunan = fotolar.koru.slice(0, AZAMI_ISLETME_FOTO)
  const yeniler: IsletmeFotosu[] = []
  for (const dosya of fotolar.yeni.slice(0, AZAMI_ISLETME_FOTO - korunan.length)) {
    const id = `isletme-${rastgeleId(8)}`
    yeniler.push({ id, bilgi: await fotoYayinla(k, id, await fotoHazirla(dosya)) })
  }
  const sonFotolar = [...korunan, ...yeniler]
  const onay = (await benimProfilVerim())?.onay ?? null

  const kayit = await m.yayinla(k, TUR.isletme, ISLETME_ANAHTARI, {
    ad: ad.slice(0, 80),
    kategori: kategori.slice(0, 40),
    aciklama: girdi.aciklama?.trim().slice(0, 300) || null,
    adres: girdi.adres.trim().slice(0, 160),
    enlem: Math.round(girdi.enlem * 1e6) / 1e6,
    boylam: Math.round(girdi.boylam * 1e6) / 1e6,
    telefon: telefonAl(girdi.telefon),
    web: webAdresiAl(girdi.web),
    instagram: instagramAl(girdi.instagram),
    saatler: girdi.saatler?.trim().slice(0, 120) || null,
    fotolar: sonFotolar.map((f) => ({ id: f.id, ...f.bilgi })),
    indirim: girdi.indirim?.metin.trim() ? { metin: girdi.indirim.metin.trim().slice(0, 80), kosul: girdi.indirim.kosul?.trim().slice(0, 120) || null } : null,
    guncelleme: simdiMs(),
    onay,
  })

  // Photos that were taken out are deleted from the relays too.
  const kalan = new Set(sonFotolar.map((f) => f.id))
  for (const f of onceki?.fotolar ?? []) if (!kalan.has(f.id)) await fotoSil(k, f.id, f.bilgi).catch(() => {})
  return isletmeKur(kayit)!
}

// Closes my business profile and deletes its photos.
export async function isletmemiSil(): Promise<void> {
  const m = motor()
  const k = await kanalAl()
  const onceki = await isletmemiGetir()
  await m.yayinla(k, TUR.isletme, ISLETME_ANAHTARI, null)
  for (const f of onceki?.fotolar ?? []) await fotoSil(k, f.id, f.bilgi).catch(() => {})
}

// Business profiles near a spot, from verified accounts only (like
// Keşfet), minus anyone I blocked.
export async function yakindakiIsletmeler(konum: { enlem: number; boylam: number }): Promise<IsletmeProfili[]> {
  const m = motor()
  const kayitlar = await m.kanalSorgula(await kanalAl(), { limit: 500 })
  const engelli = await engellenenler()
  const profiller = kayitlar
    .filter((k) => k.tur === TUR.isletme && k.anahtar === ISLETME_ANAHTARI)
    .flatMap((k) => isletmeKur(k) ?? [])
    .filter((p) => !engelli.has(p.id) && mesafe(konum, p) <= ISLETME_YARICAPI)
  return onaylilariSec(profiller, (p) => ({ pk: p.id, onay: p.onay }))
}

export async function isletmeFotoUrl(isletme: IsletmeProfili, foto: IsletmeFotosu): Promise<string | null> {
  return fotoUrl(await kanalAl(), isletme.id, foto.id, foto.bilgi)
}
