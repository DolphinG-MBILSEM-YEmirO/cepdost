import { generateSecretKey } from 'nostr-tools/pure'
import { SosyalMotor } from './nostr/motor'
import { linkKanali } from './nostr/kanal'
import { base64Url, base64UrldenBayt, hexe, hextenBayt, rastgeleBaytlar } from './nostr/kodlama'
import { arkadasKodu, benimProfilVerim, metinAl, motor, nesneMi, sayiAl, TUR } from './cekirdek'
import { goruntulemeBasligi, kayitGuncelle, type Kayit } from '../db'

// Plan links: one of my plans shared as a link, so people who aren't on
// Sharloop (or aren't my friends) can see it and say whether they're coming.
//
// The link is `https://…/#plan=<key>.<host>`. Everything lives on a channel
// made from <key>; the #fragment never reaches the server that serves the
// page, and relays only see ciphertext. <host> is my public key: the plan is
// only believed when I signed it, so someone with the link can't swap it
// for another. Anyone with the link can leave one answer, signed with their
// account key, or with a key made for this browser if they have no account.

export interface PlanLinki {
  // base64url of the 32-byte channel key.
  anahtar: string
  // Hex public key of the person who shared the plan.
  sahip: string
}

export type LinkYaniti = 'geliyorum' | 'belki' | 'gelemiyorum'
export const LINK_YANITLARI: readonly LinkYaniti[] = ['geliyorum', 'belki', 'gelemiyorum']

export interface LinkPlani {
  baslik: string
  emoji: string | null
  tarih: string | null
  saat: string | null
  sure: number | null
  tum_gun: boolean
  konum: string | null
  not: string | null
  sahipAdi: string
  sahipKullaniciAdi: string | null
  // My friend code, so "join" can open the app with me found.
  sahipKodu: string
  iptal: boolean
}

export interface LinkKatilimcisi {
  id: string
  ad: string
  yanit: LinkYaniti
  // Seconds.
  zaman: number
}

export interface LinkDurumu {
  plan: LinkPlani | null
  katilimcilar: LinkKatilimcisi[]
}

const ANAHTAR_BOYU = 32
const GUN_SN = 24 * 60 * 60

// ---------- the link itself ----------

export function linkAdresi(link: PlanLinki, koken = globalThis.location?.origin ?? ''): string {
  return `${koken}/#plan=${link.anahtar}.${base64Url(hextenBayt(link.sahip))}`
}

// Reads `#plan=<key>.<host>` from a location hash; null for anything else.
export function linkiCoz(hash: string): PlanLinki | null {
  const deger = new URLSearchParams(hash.replace(/^#/, '')).get('plan')
  const [anahtar, sahipB64] = deger?.split('.') ?? []
  if (!anahtar || !sahipB64) return null
  try {
    const anahtarBaytlari = base64UrldenBayt(anahtar)
    const sahip = base64UrldenBayt(sahipB64)
    if (anahtarBaytlari.length !== ANAHTAR_BOYU || sahip.length !== 32) return null
    return { anahtar, sahip: hexe(sahip) }
  } catch {
    return null
  }
}

function kanal(link: Pick<PlanLinki, 'anahtar'>) {
  return linkKanali(base64UrldenBayt(link.anahtar))
}

// Relays may drop the plan and its answers a month after the day (or three
// months after sharing, for a plan without a date).
function sonaErme(tarih: string | null): number {
  const simdi = Math.floor(Date.now() / 1000)
  if (!tarih) return simdi + 90 * GUN_SN
  const gun = Math.floor(new Date(`${tarih}T23:59:59`).getTime() / 1000)
  return Math.max(simdi, Number.isFinite(gun) ? gun : simdi) + 30 * GUN_SN
}

// ---------- the host ----------

async function planiYayinla(kayit: Kayit, anahtar: string, iptal: boolean): Promise<void> {
  const m = motor()
  const profil = await benimProfilVerim()
  if (!profil) throw new Error('Oturum bulunamadı')
  const tumGun = kayit.tumGun === true
  const plan: LinkPlani = {
    baslik: goruntulemeBasligi(kayit),
    emoji: kayit.emoji ?? null,
    tarih: kayit.tarih,
    saat: tumGun ? null : kayit.saat,
    sure: tumGun ? null : kayit.sure,
    tum_gun: tumGun,
    konum: kayit.konum,
    not: kayit.ozetNot,
    sahipAdi: profil.ad,
    sahipKullaniciAdi: profil.kullanici_adi,
    sahipKodu: arkadasKodu(m.benimId),
    iptal,
  }
  await m.yayinla(await kanal({ anahtar }), TUR.linkPlan, 'plan', plan, { sonaErme: sonaErme(kayit.tarih) })
}

// Shares one of my plans as a link (the same link every time) and returns
// its address. The key is kept on the plan, so my other devices get it too.
export async function planiLinklePaylas(kayit: Kayit): Promise<string> {
  const anahtar = kayit.planLinki ?? base64Url(rastgeleBaytlar(ANAHTAR_BOYU))
  await planiYayinla(kayit, anahtar, false)
  if (!kayit.planLinki) await kayitGuncelle(kayit.id, { planLinki: anahtar })
  return linkAdresi({ anahtar, sahip: motor().benimId })
}

// After I edit a shared plan: the link shows the new time and place.
export async function linkPlaniniGuncelle(kayit: Kayit): Promise<void> {
  if (kayit.planLinki) await planiYayinla(kayit, kayit.planLinki, false)
}

// After I delete a shared plan: the link says it's off instead of going dark.
export async function linkPlaniniIptalEt(kayit: Kayit): Promise<void> {
  if (kayit.planLinki) await planiYayinla(kayit, kayit.planLinki, true)
}

export function benimLinkim(kayit: Kayit): PlanLinki | null {
  return kayit.planLinki ? { anahtar: kayit.planLinki, sahip: motor().benimId } : null
}

// ---------- everyone with the link ----------

function linkPlaniAl(v: unknown): LinkPlani | null {
  if (!nesneMi(v)) return null
  const baslik = metinAl(v.baslik, 300)
  const sahipKodu = metinAl(v.sahipKodu, 8)
  if (!baslik || !sahipKodu) return null
  const tumGun = v.tum_gun === true
  return {
    baslik,
    emoji: metinAl(v.emoji, 16),
    tarih: metinAl(v.tarih, 10),
    saat: tumGun ? null : metinAl(v.saat, 5),
    sure: tumGun ? null : sayiAl(v.sure),
    tum_gun: tumGun,
    konum: metinAl(v.konum, 300),
    not: metinAl(v.not, 2000),
    sahipAdi: metinAl(v.sahipAdi, 80) ?? 'Bir arkadaşın',
    sahipKullaniciAdi: metinAl(v.sahipKullaniciAdi, 20),
    sahipKodu,
    iptal: v.iptal === true,
  }
}

function yanitAl(v: unknown): LinkYaniti | null {
  return LINK_YANITLARI.includes(v as LinkYaniti) ? (v as LinkYaniti) : null
}

// Fetches the plan and every answer. The plan only counts when the host in
// the link signed it; the host's own answer isn't listed (they're coming).
export async function linkiOku(m: SosyalMotor, link: PlanLinki): Promise<LinkDurumu> {
  const kayitlar = await m.kanalSorgula(await kanal(link))
  const planKaydi = kayitlar.find((k) => k.tur === TUR.linkPlan && k.anahtar === 'plan' && k.yazar === link.sahip)
  const katilimcilar = kayitlar.flatMap((k): LinkKatilimcisi[] => {
    if (k.tur !== TUR.linkYanit || k.anahtar !== 'yanit' || k.yazar === link.sahip || !nesneMi(k.veri)) return []
    const ad = metinAl(k.veri.ad, 60)?.trim()
    const yanit = yanitAl(k.veri.yanit)
    return ad && yanit ? [{ id: k.yazar, ad, yanit, zaman: k.zaman }] : []
  })
  katilimcilar.sort((a, b) => a.zaman - b.zaman)
  return { plan: planKaydi ? linkPlaniAl(planKaydi.veri) : null, katilimcilar }
}

// One answer per person; answering again replaces it.
export async function linkeYanitVer(
  m: SosyalMotor,
  link: PlanLinki,
  plan: LinkPlani,
  ad: string,
  yanit: LinkYaniti,
): Promise<void> {
  const temizAd = ad.trim().slice(0, 60)
  if (!temizAd) throw new Error('Adını yaz, kim olduğunu bilsinler.')
  await m.yayinla(await kanal(link), TUR.linkYanit, 'yanit', { ad: temizAd, yanit }, { sonaErme: sonaErme(plan.tarih) })
}

// ---------- visitors without an account ----------

const MISAFIR_ANAHTARI = 'cepdost_misafir_anahtari'
const MISAFIR_ADI = 'cepdost_misafir_adi'
let misafir: SosyalMotor | null = null

function depo(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

// An engine with a key made for this browser, so someone without an
// account can answer and later change their answer. It never syncs in the
// background; it only reads and writes the link's channel.
export function misafirMotoru(roleler?: string[]): SosyalMotor {
  if (misafir) return misafir
  let sk: Uint8Array
  const kayitli = depo()?.getItem(MISAFIR_ANAHTARI)
  try {
    sk = kayitli ? hextenBayt(kayitli) : generateSecretKey()
    if (sk.length !== 32) sk = generateSecretKey()
  } catch {
    sk = generateSecretKey()
  }
  depo()?.setItem(MISAFIR_ANAHTARI, hexe(sk))
  misafir = new SosyalMotor({ gizliAnahtar: sk, roleler, veritabaniAdi: 'cepdost-misafir' })
  return misafir
}

export function misafirAdi(): string {
  return depo()?.getItem(MISAFIR_ADI) ?? ''
}

export function misafirAdiniKaydet(ad: string) {
  depo()?.setItem(MISAFIR_ADI, ad.trim())
}
