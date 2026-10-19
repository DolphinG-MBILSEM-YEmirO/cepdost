import { finalizeEvent, verifyEvent } from 'nostr-tools/pure'
import { goruntulemeBasligi, kayitGuncelle, type Kayit } from '../db'
import { bildirArkaplanda } from './bildirimler'
import { arkadasKodu, benimProfilVerim, metinAl, motor, motorVarMi, nesneMi, sayiAl } from './cekirdek'
import {
  aesAnahtari,
  base64Url,
  base64UrldenBayt,
  hexe,
  hextenBayt,
  hmac,
  jsonCoz,
  jsonSifrele,
  rastgeleBaytlar,
} from './nostr/kodlama'
import type { SosyalMotor } from './nostr/motor'
import type { NostrOlayi } from './nostr/role'
import { YANIT_METNI, type LinkDurumu, type LinkKaynagi, type LinkKatilimcisi, type LinkPlani, type LinkYaniti } from './planLinki'

// Plans shared as Davet invites. Davet is the invite page of the Sharloop
// family (a static site, github.com/DolphinG-MBILSEM-YEmirO/davet): people
// without the app open the link there, see the plan and answer, with no
// account. Sharloop writes and reads the invite directly in Davet's format,
// on the same relays, so nothing sits in between:
//
//   - link: <Davet>#/e/<secret>.<host>, the 16-byte secret and my account's
//     public key (base64url). The #fragment never reaches a server;
//   - from the secret: a public topic (HMAC "davet/topic") that relays index
//     events by, and an AES-GCM key (HMAC "davet/encryption") for every
//     event, so relays only see ciphertext;
//   - the invite is a kind 30078 event with d = topic, signed by the host
//     (my account key); each answer is d = "<topic>:rsvp", signed by whoever
//     answers. Davet only believes the invite from the key in the link.
//
// The invite also carries a few fields Davet reads for Sharloop's sake:
// allDay, emoji and durationMinutes for the plan itself, and `sharloop` (my
// friend code and username, for "Sharloop'ta aç" and "add as a friend").
// See js/shared/validate.js in Davet for how it reads them.
//
// Answers given in Davet don't notify me (only same-site pages may use
// api/bildir); answers given from Sharloop do, and every answer shows on
// the plan's page.

export const DAVET_ADRESI = 'https://dolphing-mbilsem-yemiro.github.io/davet/'

const OLAY_TURU = 30078
const GIZLI_BOYU = 16
const GUN_SN = 24 * 60 * 60
// Davet's own limits (js/shared/rules.js): longer text fails its checks.
const SINIR = { baslik: 80, yer: 120, aciklama: 1000, ad: 40 }
const TARIH_SAAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
const YANIT_DURUMU: Record<LinkYaniti, string> = { geliyorum: 'going', belki: 'maybe', gelemiyorum: 'declined' }

export interface DavetLinki {
  // base64url of the 16-byte secret.
  gizli: string
  // Hex public key of the host's account.
  sahip: string
}

// ---------- the link ----------

function linkKimligi(link: DavetLinki): string {
  return `${link.gizli}.${base64Url(hextenBayt(link.sahip))}`
}

export function davetAdresi(link: DavetLinki): string {
  return `${DAVET_ADRESI}#/e/${linkKimligi(link)}`
}

// "Sharloop'ta aç" on a Davet page leads to #davet=<secret>.<host>.
export function davetLinkiCoz(hash: string): DavetLinki | null {
  const deger = new URLSearchParams(hash.replace(/^#/, '')).get('davet')
  const [gizli, sahipB64] = deger?.split('.') ?? []
  if (!gizli || !sahipB64) return null
  try {
    const sahip = base64UrldenBayt(sahipB64)
    if (base64UrldenBayt(gizli).length !== GIZLI_BOYU || sahip.length !== 32) return null
    return { gizli, sahip: hexe(sahip) }
  } catch {
    return null
  }
}

async function anahtarlar(gizli: string): Promise<{ konu: string; sifre: CryptoKey }> {
  const ham = base64UrldenBayt(gizli)
  return {
    konu: hexe(await hmac(ham, 'davet/topic')),
    sifre: await aesAnahtari(await hmac(ham, 'davet/encryption')),
  }
}

// ---------- writing ----------

// Relays drop an invite and its answers 60 days after the plan, as Davet does.
function sonaErme(baslangic: string): number {
  const simdi = Math.floor(Date.now() / 1000)
  const gun = Math.floor(Date.parse(`${baslangic}:00+03:00`) / 1000) || simdi
  return Math.max(gun + 60 * GUN_SN, simdi + 7 * GUN_SN)
}

// Replaceable events are ordered by their second-resolution timestamp, so
// two saves within one second must still get increasing times.
const sonZaman = new Map<string, number>()

function zamanVer(d: string): number {
  const zaman = Math.max(Math.floor(Date.now() / 1000), (sonZaman.get(d) ?? 0) + 1)
  sonZaman.set(d, zaman)
  return zaman
}

async function yayinla(m: SosyalMotor, gizli: string, d: string, icerik: unknown, sonaErmeSn: number): Promise<void> {
  const { konu, sifre } = await anahtarlar(gizli)
  const olay = finalizeEvent(
    {
      kind: OLAY_TURU,
      created_at: zamanVer(`${konu}:${d}`),
      tags: [
        ['d', d === '' ? konu : `${konu}:${d}`],
        ['i', konu],
        ['expiration', String(sonaErmeSn)],
        ['alt', 'Davet: şifreli davet verisi'],
      ],
      content: await jsonSifrele(sifre, icerik),
    },
    m.gizliAnahtar(),
  )
  await m.hamYayinla(olay as NostrOlayi)
}

function kisalt(metin: string | null | undefined, azami: number): string {
  const tek = (metin ?? '').trim()
  return tek.length > azami ? `${tek.slice(0, azami - 1).trimEnd()}…` : tek
}

function tekSatir(metin: string | null | undefined, azami: number): string {
  return kisalt((metin ?? '').replace(/\s+/g, ' '), azami)
}

// Davet's cover themes, picked from the plan's emoji.
const TEMALAR: [string, string[]][] = [
  ['coffee', ['☕', '🫖', '🥐', '🍳', '🥞']],
  ['movie', ['🎬', '🍿', '🎥', '📺', '🎭']],
  ['sport', ['⚽', '🏀', '🎾', '🏐', '🏃', '💪', '🏋️', '🚴', '🏊', '🧘', '⛹️']],
  ['study', ['📚', '✏️', '📖', '🎓', '💻', '📝']],
  ['outdoor', ['🏕️', '⛺', '🌲', '⛰️', '🏔️', '🏖️', '🌊', '🧺', '🚶', '🥾']],
  ['music', ['🎸', '🎵', '🎶', '🎤', '🎧', '🎹', '🥁']],
  ['food', ['🍕', '🍔', '🍽️', '🍝', '🥘', '🍣', '🌮', '🍜', '🥗', '🍰', '🍦', '🍻', '🍷']],
]

function temaSec(emoji: string | null | undefined): string {
  if (!emoji) return 'party'
  return TEMALAR.find(([, emojiler]) => emojiler.some((e) => emoji.startsWith(e)))?.[0] ?? 'party'
}

async function davetIcerigi(kayit: Kayit): Promise<Record<string, unknown>> {
  const profil = await benimProfilVerim()
  if (!profil) throw new Error('Oturum bulunamadı')
  if (!kayit.tarih) throw new Error('Linkle paylaşmak için plana bir tarih ekle.')
  const tumGun = kayit.tumGun === true || !kayit.saat
  const m = motor()
  return {
    title: tekSatir(goruntulemeBasligi(kayit), SINIR.baslik) || 'Plan',
    startsAt: `${kayit.tarih}T${tumGun ? '00:00' : kayit.saat!.slice(0, 5)}`,
    timeOptions: [],
    pollOpen: false,
    location: tekSatir(kayit.konum, SINIR.yer),
    description: kisalt(kayit.ozetNot, SINIR.aciklama),
    hostName: tekSatir(profil.ad, SINIR.ad) || 'Bir arkadaşın',
    theme: temaSec(kayit.emoji),
    hiddenComments: [],
    allDay: tumGun,
    emoji: kayit.emoji ?? null,
    durationMinutes: !tumGun && kayit.sure ? kayit.sure : null,
    sharloop: {
      kod: arkadasKodu(m.benimId),
      kullaniciAdi: profil.kullanici_adi ?? null,
    },
  }
}

async function davetiYayinla(kayit: Kayit, gizli: string): Promise<void> {
  const icerik = await davetIcerigi(kayit)
  await yayinla(motor(), gizli, '', icerik, sonaErme(icerik.startsAt as string))
}

// Shares one of my plans as a Davet invite (the same link every time) and
// returns its address. The secret is kept on the plan, so my other devices
// show the answers and keep the invite up to date.
export async function planiDavetlePaylas(kayit: Kayit): Promise<string> {
  const gizli = kayit.davetLinki ?? base64Url(rastgeleBaytlar(GIZLI_BOYU))
  await davetiYayinla(kayit, gizli)
  if (!kayit.davetLinki) await kayitGuncelle(kayit.id, { davetLinki: gizli })
  return davetAdresi({ gizli, sahip: motor().benimId })
}

// After I edit a shared plan: the invite shows the new time and place.
export async function davetiGuncelle(kayit: Kayit): Promise<void> {
  if (kayit.davetLinki && kayit.tarih) await davetiYayinla(kayit, kayit.davetLinki)
}

// After I delete a shared plan: Davet shows the invite as deleted, the way
// it does when a host deletes one there. Only the date stays, for expiry.
export async function davetiSil(kayit: Kayit): Promise<void> {
  if (!kayit.davetLinki || !kayit.tarih) return
  const baslangic = `${kayit.tarih}T00:00`
  await yayinla(motor(), kayit.davetLinki, '', { deleted: true, startsAt: baslangic }, sonaErme(baslangic))
}

export function benimDavetim(kayit: Kayit): DavetLinki | null {
  return kayit.davetLinki && motorVarMi() ? { gizli: kayit.davetLinki, sahip: motor().benimId } : null
}

// ---------- reading, and answering from Sharloop ----------

// Keep only the newest event for each (author, d tag), like relays do.
function enYeniler(olaylar: NostrOlayi[]): (NostrOlayi & { d: string })[] {
  const enYeni = new Map<string, NostrOlayi & { d: string }>()
  for (const o of olaylar) {
    const d = o.tags.find((t) => t[0] === 'd')?.[1]
    if (!d) continue
    const anahtar = `${o.pubkey}:${d}`
    const mevcut = enYeni.get(anahtar)
    if (!mevcut || o.created_at > mevcut.created_at) enYeni.set(anahtar, { ...o, d })
  }
  return [...enYeni.values()]
}

const YANITLAR: Record<string, LinkYaniti> = { going: 'geliyorum', maybe: 'belki', declined: 'gelemiyorum' }

// The invite as Davet would show it; null when it isn't one.
function davetPlani(v: Record<string, unknown>, sahip: string): LinkPlani | null {
  const baslik = metinAl(v.title, SINIR.baslik)?.trim()
  const baslangic = typeof v.startsAt === 'string' && TARIH_SAAT.test(v.startsAt) ? v.startsAt : null
  if (!baslik || !baslangic) return null
  const tumGun = v.allDay === true
  const sharloop = nesneMi(v.sharloop) ? v.sharloop : null
  const kod = metinAl(sharloop?.kod, 8)
  const sure = sayiAl(v.durationMinutes)
  return {
    baslik,
    emoji: metinAl(v.emoji, 16),
    tarih: baslangic.slice(0, 10),
    saat: tumGun ? null : baslangic.slice(11, 16),
    sure: !tumGun && sure && sure > 0 && sure <= 24 * 60 ? Math.round(sure) : null,
    tum_gun: tumGun,
    konum: metinAl(v.location, SINIR.yer),
    not: metinAl(v.description, SINIR.aciklama),
    sahipAdi: metinAl(v.hostName, SINIR.ad) ?? 'Bir arkadaşın',
    sahipKullaniciAdi: metinAl(sharloop?.kullaniciAdi, 20),
    // The host's account is in the link, so its code can be checked.
    sahipKodu: kod && kod === arkadasKodu(sahip) ? kod : null,
    iptal: false,
  }
}

async function davetiOku(m: SosyalMotor, link: DavetLinki): Promise<LinkDurumu> {
  const { konu, sifre } = await anahtarlar(link.gizli)
  const olaylar = await m.hamSorgula({ kinds: [OLAY_TURU], '#i': [konu] })
  // Relays are untrusted: anything with a bad signature or that won't
  // decrypt is dropped.
  const okunan = await Promise.all(
    enYeniler(olaylar.filter((o) => verifyEvent(o))).map(async (o) => ({ o, veri: await jsonCoz(sifre, o.content) })),
  )
  const davet = okunan.find(({ o }) => o.pubkey === link.sahip && o.d === konu)
  const plan = davet && nesneMi(davet.veri) && davet.veri.deleted !== true ? davetPlani(davet.veri, link.sahip) : null
  if (!plan) return { plan: null, katilimcilar: [] }

  const katilimcilar = okunan.flatMap(({ o, veri }): LinkKatilimcisi[] => {
    if (o.d !== `${konu}:rsvp` || o.pubkey === link.sahip || !nesneMi(veri)) return []
    const ad = metinAl(veri.name, SINIR.ad)?.trim()
    const yanit = typeof veri.status === 'string' ? YANITLAR[veri.status] : undefined
    return ad && yanit ? [{ id: o.pubkey, ad, yanit, zaman: o.created_at }] : []
  })
  katilimcilar.sort((a, b) => a.zaman - b.zaman)
  return { plan, katilimcilar }
}

// Answering from Sharloop writes a Davet answer signed with my account, so
// it shows in Davet too. (Invites open in Sharloop only once the account is
// set up; people without one answer in Davet.)
async function davetiYanitla(
  m: SosyalMotor,
  link: DavetLinki,
  plan: LinkPlani,
  ad: string,
  yanit: LinkYaniti,
): Promise<void> {
  const temizAd = tekSatir(ad, SINIR.ad)
  if (!temizAd) throw new Error('Adını yaz, kim olduğunu bilsinler.')
  const baslangic = `${plan.tarih}T${plan.saat ?? '00:00'}`
  await yayinla(m, link.gizli, 'rsvp', { name: temizAd, status: YANIT_DURUMU[yanit], note: '' }, sonaErme(baslangic))
  bildirArkaplanda(
    [link.sahip],
    {
      tur: 'link',
      baslik: `${temizAd} ${YANIT_METNI[yanit]}`,
      govde: plan.baslik,
      git: `davet:${link.gizli}`,
      etiket: `davet:${link.gizli}`,
    },
    { motor: m, dizinden: true },
  )
}

export function davetKaynagi(link: DavetLinki): LinkKaynagi {
  return {
    tur: 'davet',
    id: link.gizli,
    sahip: link.sahip,
    oku: (m) => davetiOku(m, link),
    yanitVer: (m, plan, ad, yanit) => davetiYanitla(m, link, plan, ad, yanit),
  }
}
