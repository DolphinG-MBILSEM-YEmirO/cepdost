import { useSyncExternalStore } from 'react'
import { SosyalMotor, type SosyalKayit } from './nostr/motor'
import { dizinKanali, grupKanali, yayinKanali, yedekKanali, type Kanal } from './nostr/kanal'
import { hexe, hextenBayt, rastgeleBaytlar, type SifreliYedek } from './nostr/kodlama'
import type { SaatPenceresi } from '../../shared/bosluklar'

export type { SaatPenceresi }

// The social core: what records mean, which channels to follow, and the
// reactions that keep both sides of a relationship consistent.
//
// Record map (record type, logical key):
//
//   my own channel (only my devices)
//     profil  'profil'           my full profile and settings
//     yayin   'yayin'            the key of my broadcast channel
//     kisi    'kisi:<pk>'        someone I added (so I keep following them)
//     grupum  'grup:<id>'        a group I'm in, with its key
//     yedek   'yedek'            copy of my password backup (for keep-alive)
//
//   my broadcast channel (my friends)
//     profil  'profil'           public profile
//     musaitlik 'musaitlik'      busy time ranges, no titles
//
//   pair channel (me and one other person)
//     iliski  'iliski'           each side's view of the friendship
//     istek   'istek'            friend request, filed under the other's inbox
//     dm      'dm:<id>'          direct message
//     davet   'davet:<id>'       plan invite, by its sender
//     davet-yanit 'davet-yanit:<davetId>'  answer, by the invitee
//     okundu  'okundu'           when each side last read the chat
//     grup-davet 'grup-davet:<grupId>'     group key handed to a friend
//     ani     'ani:<id>'         memory shared between the two
//
//   group channel (the members)
//     grup    'grup'             name and look of the group
//     uye     'uye:<pk>'         membership (joined/left) with a profile snapshot
//     plan    'plan:<id>'        group plan, by its creator
//     yanit   'yanit:<planId>'   one member's answer to a plan
//     mesaj   'mesaj:<id>'       chat message
//     okundu  'okundu'           when each member last read the chat
//     ani     'ani:<id>'         memory
//     musaitlik 'musaitlik'      a copy of each member's busy ranges
//
// Photos travel as chunks ('foto:<aniId>:<n>') on the channel's photo topic.

export const TUR = {
  profil: 'profil',
  yayin: 'yayin',
  kisi: 'kisi',
  grupum: 'grupum',
  yedek: 'yedek',
  // My own plans, so my other devices have them too (planEsitleme.ts).
  kayit: 'kayit',
  musaitlik: 'musaitlik',
  iliski: 'iliski',
  istek: 'istek',
  dm: 'dm',
  davet: 'davet',
  davetYanit: 'davet-yanit',
  okundu: 'okundu',
  grupDavet: 'grup-davet',
  ani: 'ani',
  foto: 'foto',
  grup: 'grup',
  uye: 'uye',
  plan: 'plan',
  yanit: 'yanit',
  mesaj: 'mesaj',
  dizin: 'dizin',
} as const

export type Gizlilik = 'arkadaslar' | 'herkes'

// What other people get to see of someone: enough to recognise them.
export interface ProfilOzeti {
  ad: string
  kullanici_adi: string | null
  avatar: string | null
}

export interface BenimProfilVerim {
  ad: string
  kullanici_adi: string | null
  // When the account was created (ms); orders competing username claims.
  olusturulma: number
  musaitlik_paylas: boolean
  gizlilik: Gizlilik
  sifre_belirlendi: boolean
  avatar: string | null
  biyografi: string | null
  renk: string | null
  emoji: string | null
}

// The broadcast copy: everything but the private settings.
export type YayinProfilVerisi = Omit<BenimProfilVerim, 'sifre_belirlendi' | 'olusturulma'>

export function yayinProfili(profil: BenimProfilVerim): YayinProfilVerisi {
  const { sifre_belirlendi: _s, olusturulma: _o, ...yayin } = profil
  return yayin
}

// Directory entry: lets someone with my code or username find my account.
export interface DizinVerisi {
  pk: string
  ad: string
  kullanici_adi: string | null
  arkadas_kodu: string
  // Only for public profiles.
  avatar: string | null
  alindi: number
}

export interface KisiVerisi {
  eklenme: number
  profil: ProfilOzeti | null
}

export interface GrupumVerisi {
  anahtar: string
  ad: string
  durum: 'aktif' | 'ayrildi'
  zaman: number
}

export interface YedekKopyasi {
  kullanici_adi: string
  yedek: SifreliYedek
}

export type IliskiTuru = 'istek' | 'kabul' | 'red' | 'silindi'

export interface IliskiVerisi {
  durum: IliskiTuru
  // Sent with 'kabul': the key of the sender's broadcast channel.
  yayinAnahtari?: string
  zaman: number
}

export interface IstekVerisi {
  profil: ProfilOzeti
  zaman: number
}

export interface GrupDavetVerisi {
  grupId: string
  anahtar: string
  ad: string
  zaman: number
}

export interface UyeVerisi {
  durum: 'aktif' | 'ayrildi'
  rol: 'yonetici' | 'uye'
  profil: ProfilOzeti | null
  ekleyen: string
  zaman: number
}

export interface MusaitlikVerisi {
  bloklar: Array<{ tarih: string; baslangic: string; bitis: string }>
  // When the owner's device last confirmed these ranges (ms). Refreshed
  // even when nothing changed, so friends can tell current from stale.
  guncelleme: number
  // The hours they're usually free for plans, when they set them.
  pencere?: SaatPenceresi | null
}

// ---------- engine registry ----------

let etkinMotor: SosyalMotor | null = null
let motorDinleyicisiniBirak: (() => void) | null = null
let surum = 0
const dinleyiciler = new Set<() => void>()

function degisti() {
  surum++
  dinleyiciler.forEach((d) => d())
}

export interface MotorSecenekleri {
  roleler?: string[]
  veritabaniAdi?: string
  // Tests drive syncing by hand.
  arkaPlan?: boolean
}

// An engine wired to the social core, not yet the active one.
export function motorOlustur(gizliAnahtar: Uint8Array, secenek: MotorSecenekleri = {}): SosyalMotor {
  return new SosyalMotor({
    gizliAnahtar,
    roleler: secenek.roleler,
    veritabaniAdi: secenek.veritabaniAdi,
    kanalKaynagi: async (m) => (await kanalDurumuHesapla(m)).takip,
    esitlemeSonrasi: uzlastir,
  })
}

export function motoruBaslat(gizliAnahtar: Uint8Array, secenek: MotorSecenekleri = {}): SosyalMotor {
  motoruKapat()
  const yeni = motorOlustur(gizliAnahtar, secenek)
  etkinMotoruAyarla(yeni)
  if (secenek.arkaPlan !== false) yeni.baslat()
  return yeni
}

// Makes an existing engine the one every social function uses (tests use
// this to act as different people in one process).
export function etkinMotoruAyarla(yeni: SosyalMotor | null) {
  motorDinleyicisiniBirak?.()
  etkinMotor = yeni
  motorDinleyicisiniBirak = yeni ? yeni.dinle(degisti) : null
  durumOnbellegi = null
  degisti()
}

export function motoruKapat() {
  const eski = etkinMotor
  etkinMotoruAyarla(null)
  eski?.kapat()
}

export function motor(): SosyalMotor {
  if (!etkinMotor) throw new Error('Oturum bulunamadı')
  return etkinMotor
}

export function motorVarMi(): boolean {
  return etkinMotor !== null
}

export function sosyalDinle(dinleyici: () => void): () => void {
  dinleyiciler.add(dinleyici)
  return () => dinleyiciler.delete(dinleyici)
}

export function sosyalSurum(): number {
  return surum
}

// Re-renders a component whenever social data changes. Screens put the
// returned number in their effect dependencies to reload from the local
// store.
export function useSosyalSurum(): number {
  return useSyncExternalStore(sosyalDinle, sosyalSurum, sosyalSurum)
}

// Records arriving live (new messages), for screens that animate them in.
export function kayitlariDinle(dinleyici: (k: SosyalKayit) => void): () => void {
  return etkinMotor ? etkinMotor.kayitDinle(dinleyici) : () => {}
}

// ---------- small helpers ----------

export const simdiMs = () => Date.now()

export function isoZaman(ms: number): string {
  return new Date(ms).toISOString()
}

// Record payloads come from other people's devices: read them defensively.
export function metinAl(deger: unknown, azami = 2000): string | null {
  return typeof deger === 'string' && deger.length > 0 ? deger.slice(0, azami) : null
}

export function sayiAl(deger: unknown): number | null {
  return typeof deger === 'number' && Number.isFinite(deger) ? deger : null
}

export function nesneMi(deger: unknown): deger is Record<string, unknown> {
  return typeof deger === 'object' && deger !== null && !Array.isArray(deger)
}

// The time fields of a shared plan (an invite or a group plan). An all-day
// plan has no time or duration, whatever the payload says.
export function planZamani(veri: Record<string, unknown>): { saat: string | null; sure: number | null; tum_gun: boolean } {
  if (veri.tumGun === true) return { saat: null, sure: null, tum_gun: true }
  return { saat: metinAl(veri.saat, 5), sure: sayiAl(veri.sure), tum_gun: false }
}

// Milliseconds a record speaks for: its own `zaman` field when it has one
// (finer than the event's second resolution), else the event time.
export function kayitZamani(k: SosyalKayit): number {
  const z = nesneMi(k.veri) ? sayiAl(k.veri.zaman) : null
  return z ?? k.zaman * 1000
}

export function profilOzetiAl(deger: unknown): ProfilOzeti | null {
  if (!nesneMi(deger)) return null
  const ad = metinAl(deger.ad, 80)
  if (!ad) return null
  const avatar = metinAl(deger.avatar, 60_000)
  return {
    ad,
    kullanici_adi: metinAl(deger.kullanici_adi, 40),
    avatar: avatar?.startsWith('data:image/') ? avatar : null,
  }
}

// ---------- friend codes ----------

const KOD_ALFABESI = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

// An 8-character code made from the first 40 bits of the public key. Typed
// codes are checked against the key they lead to, so a code can't be
// pointed at someone else's account.
export function arkadasKodu(pk: string): string {
  let bitler = BigInt(`0x${pk.slice(0, 10)}`)
  let kod = ''
  for (let i = 0; i < 8; i++) {
    kod = KOD_ALFABESI[Number(bitler & 31n)] + kod
    bitler >>= 5n
  }
  return kod
}

// Accepts "abcd-1234", "ABCD 1234" and look-alike letters (O for 0...).
export function koduNormallestir(girdi: string): string | null {
  const temiz = girdi
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  return temiz.length === 8 && [...temiz].every((h) => KOD_ALFABESI.includes(h)) ? temiz : null
}

export function koduGoster(kod: string): string {
  return `${kod.slice(0, 4)}-${kod.slice(4)}`
}

// ---------- reading my own records ----------

export async function benKaydi(tur: string, anahtar: string): Promise<SosyalKayit | null> {
  const m = motor()
  const k = await m.kayit(await m.ben(), m.benimId, anahtar)
  return k && k.tur === tur && k.veri !== null ? k : null
}

export async function benimProfilVerim(): Promise<BenimProfilVerim | null> {
  const k = await benKaydi(TUR.profil, 'profil')
  return k ? profilVerisiAl(k.veri) : null
}

export function profilVerisiAl(deger: unknown): BenimProfilVerim | null {
  if (!nesneMi(deger)) return null
  const ozet = profilOzetiAl(deger)
  if (!ozet) return null
  return {
    ...ozet,
    olusturulma: sayiAl(deger.olusturulma) ?? 0,
    musaitlik_paylas: deger.musaitlik_paylas !== false,
    gizlilik: deger.gizlilik === 'herkes' ? 'herkes' : 'arkadaslar',
    sifre_belirlendi: deger.sifre_belirlendi === true,
    biyografi: metinAl(deger.biyografi, 160),
    renk: metinAl(deger.renk, 20),
    emoji: metinAl(deger.emoji, 16),
  }
}

// ---------- channels ----------

// Channel derivation costs a few HMACs; keys rarely change, so cache.
const kanalOnbellegi = new Map<string, Promise<Kanal>>()

function onbellekliKanal(anahtar: string, uret: () => Promise<Kanal>): Promise<Kanal> {
  let kanal = kanalOnbellegi.get(anahtar)
  if (!kanal) {
    kanal = uret()
    kanalOnbellegi.set(anahtar, kanal)
  }
  return kanal
}

export function yayinKanaliAl(anahtarHex: string, sahip: string): Promise<Kanal> {
  return onbellekliKanal(`yayin:${sahip}:${anahtarHex}`, () => yayinKanali(hextenBayt(anahtarHex), sahip))
}

export function grupKanaliAl(anahtarHex: string, grupId: string): Promise<Kanal> {
  return onbellekliKanal(`grup:${grupId}:${anahtarHex}`, () => grupKanali(hextenBayt(anahtarHex), grupId))
}

export async function benimYayinAnahtarim(): Promise<string | null> {
  const k = await benKaydi(TUR.yayin, 'yayin')
  const anahtar = nesneMi(k?.veri) ? metinAl(k.veri.anahtar, 64) : null
  return anahtar && /^[0-9a-f]{64}$/.test(anahtar) ? anahtar : null
}

export function yeniAnahtar(): string {
  return hexe(rastgeleBaytlar(32))
}

// ---------- friendship state ----------

export type ArkadaslikDurumu = 'bekliyor' | 'kabul' | 'red' | 'yok'

export interface IliskiDurumu {
  pk: string
  durum: ArkadaslikDurumu
  // Who asked first, for pending requests.
  yon: 'giden' | 'gelen'
  // Best known look of the person: their broadcast profile for friends,
  // otherwise the snapshot from the request.
  ozet: ProfilOzeti | null
  // Their broadcast key, once they accepted.
  yayinAnahtari: string | null
  benimKaydim: IliskiVerisi | null
  zaman: number
}

function iliskiVerisiAl(k: SosyalKayit | undefined): (IliskiVerisi & { _zaman: number }) | null {
  if (!k || !nesneMi(k.veri)) return null
  const durum = k.veri.durum
  if (durum !== 'istek' && durum !== 'kabul' && durum !== 'red' && durum !== 'silindi') return null
  const anahtar = metinAl(k.veri.yayinAnahtari, 64)
  return {
    durum,
    yayinAnahtari: anahtar && /^[0-9a-f]{64}$/.test(anahtar) ? anahtar : undefined,
    zaman: kayitZamani(k),
    _zaman: kayitZamani(k),
  }
}

// Both people keep their own 'iliski' record on the pair channel; the
// friendship is what the two records say together. Requests also land in
// the receiver's inbox so a stranger can find them.
//   - either side's newest word being 'red'/'silindi' ends it
//   - both asked, or one asked and the other accepted: friends
//   - only one asked: pending, in that direction
export function iliskiCoz(
  benim: (IliskiVerisi & { _zaman: number }) | null,
  onun: (IliskiVerisi & { _zaman: number }) | null,
): { durum: ArkadaslikDurumu; yon: 'giden' | 'gelen'; zaman: number } {
  const a = benim?.durum
  const b = onun?.durum
  const zaman = Math.max(benim?._zaman ?? 0, onun?._zaman ?? 0)
  const enYeni = (benim?._zaman ?? 0) >= (onun?._zaman ?? 0) ? benim : onun
  const yon = enYeni === benim ? 'giden' : 'gelen'

  if (enYeni?.durum === 'silindi') return { durum: 'yok', yon, zaman }
  if (enYeni?.durum === 'red') return { durum: 'red', yon, zaman }

  const istekVeyaKabul = (d: IliskiTuru | undefined) => d === 'istek' || d === 'kabul'
  if (istekVeyaKabul(a) && istekVeyaKabul(b) && (a === 'kabul' || b === 'kabul' || (a === 'istek' && b === 'istek'))) {
    return { durum: 'kabul', yon, zaman }
  }
  if (a === 'istek' || a === 'kabul') return { durum: 'bekliyor', yon: 'giden', zaman }
  if (b === 'istek' || b === 'kabul') return { durum: 'bekliyor', yon: 'gelen', zaman }
  return { durum: 'yok', yon, zaman }
}

export interface KanalDurumu {
  ben: Kanal
  yayin: Kanal | null
  yayinAnahtari: string | null
  iliskiler: Map<string, IliskiDurumu>
  cift: Map<string, Kanal>
  arkadasYayin: Map<string, Kanal>
  gruplar: Map<string, { kanal: Kanal; veri: GrupumVerisi }>
  // Every channel to follow.
  takip: Kanal[]
}

function grupumVerisiAl(deger: unknown): GrupumVerisi | null {
  if (!nesneMi(deger)) return null
  const anahtar = metinAl(deger.anahtar, 64)
  if (!anahtar || !/^[0-9a-f]{64}$/.test(anahtar)) return null
  return {
    anahtar,
    ad: metinAl(deger.ad, 80) ?? 'Grup',
    durum: deger.durum === 'ayrildi' ? 'ayrildi' : 'aktif',
    zaman: sayiAl(deger.zaman) ?? 0,
  }
}

export async function grupumKayitlari(m: SosyalMotor = motor()): Promise<Map<string, GrupumVerisi>> {
  const ben = await m.ben()
  const harita = new Map<string, GrupumVerisi>()
  for (const k of await m.kayitlar(ben.konu, TUR.grupum)) {
    const veri = grupumVerisiAl(k.veri)
    if (veri && k.anahtar.startsWith('grup:')) harita.set(k.anahtar.slice(5), veri)
  }
  return harita
}

// Works out every relationship and channel from the local store alone.
export async function kanalDurumuHesapla(m: SosyalMotor): Promise<KanalDurumu> {
  const ben = await m.ben()
  const benimId = m.benimId

  const yayinKaydi = await m.kayit(ben, benimId, 'yayin')
  const yayinAnahtari =
    yayinKaydi && nesneMi(yayinKaydi.veri) ? metinAl(yayinKaydi.veri.anahtar, 64) : null
  const yayin = yayinAnahtari ? await yayinKanaliAl(yayinAnahtari, benimId) : null

  // Everyone I have something to do with: people I added and people whose
  // request reached my inbox.
  const kisiler = new Map<string, KisiVerisi>()
  for (const k of await m.kayitlar(ben.konu, TUR.kisi)) {
    const pk = k.anahtar.slice(5)
    if (!/^[0-9a-f]{64}$/.test(pk) || pk === benimId) continue
    const veri = nesneMi(k.veri) ? k.veri : {}
    kisiler.set(pk, { eklenme: sayiAl(veri.eklenme) ?? 0, profil: profilOzetiAl(veri.profil) })
  }
  const gelenIstekler = new Map<string, SosyalKayit>()
  for (const k of await m.kayitlar(await m.gelenKutusu(), TUR.istek)) {
    if (k.yazar !== benimId) gelenIstekler.set(k.yazar, k)
  }

  const iliskiler = new Map<string, IliskiDurumu>()
  const cift = new Map<string, Kanal>()
  const arkadasYayin = new Map<string, Kanal>()

  for (const pk of new Set([...kisiler.keys(), ...gelenIstekler.keys()])) {
    const kanal = await m.ciftKanali(pk)
    cift.set(pk, kanal)

    const benimKaydim = iliskiVerisiAl(await m.kayit(kanal, benimId, 'iliski'))
    const onunIliskisi = iliskiVerisiAl(await m.kayit(kanal, pk, 'iliski'))
    const istek = gelenIstekler.get(pk)
    const onunKaydi =
      istek && (!onunIliskisi || kayitZamani(istek) > onunIliskisi._zaman)
        ? { durum: 'istek' as const, zaman: kayitZamani(istek), _zaman: kayitZamani(istek) }
        : onunIliskisi

    const { durum, yon, zaman } = iliskiCoz(benimKaydim, onunKaydi)
    // Their broadcast key comes with their 'kabul' record.
    const anahtar = durum === 'kabul' ? (onunIliskisi?.yayinAnahtari ?? null) : null

    let ozet: ProfilOzeti | null = null
    if (anahtar) {
      const onunYayini = await yayinKanaliAl(anahtar, pk)
      arkadasYayin.set(pk, onunYayini)
      const profil = await m.kayit(onunYayini, pk, 'profil')
      ozet = profilOzetiAl(profil?.veri)
    }
    ozet ??= profilOzetiAl(nesneMi(istek?.veri) ? istek.veri.profil : null) ?? kisiler.get(pk)?.profil ?? null

    iliskiler.set(pk, {
      pk,
      durum,
      yon,
      ozet,
      yayinAnahtari: anahtar,
      benimKaydim: benimKaydim ? { durum: benimKaydim.durum, yayinAnahtari: benimKaydim.yayinAnahtari, zaman: benimKaydim.zaman } : null,
      zaman,
    })
  }

  const gruplar = new Map<string, { kanal: Kanal; veri: GrupumVerisi }>()
  for (const [grupId, veri] of await grupumKayitlari(m)) {
    if (veri.durum !== 'aktif') continue
    gruplar.set(grupId, { kanal: await grupKanaliAl(veri.anahtar, grupId), veri })
  }

  const takip = [ben, ...(yayin ? [yayin] : []), ...cift.values(), ...arkadasYayin.values()]
  for (const g of gruplar.values()) takip.push(g.kanal)
  takip.forEach((k) => m.kanalKaydet(k))

  return { ben, yayin, yayinAnahtari, iliskiler, cift, arkadasYayin, gruplar, takip }
}

let durumOnbellegi: { motor: SosyalMotor; surum: number; durum: Promise<KanalDurumu> } | null = null

// Cached per data version: screens call this freely.
export function kanalDurumu(): Promise<KanalDurumu> {
  const m = motor()
  if (durumOnbellegi && durumOnbellegi.motor === m && durumOnbellegi.surum === m.surum) {
    return durumOnbellegi.durum
  }
  const durum = kanalDurumuHesapla(m)
  durumOnbellegi = { motor: m, surum: m.surum, durum }
  durum.catch(() => {
    if (durumOnbellegi?.durum === durum) durumOnbellegi = null
  })
  return durum
}

export async function ciftKanaliAl(pk: string): Promise<Kanal> {
  return motor().ciftKanali(pk)
}

export async function grupKanaliBul(grupId: string): Promise<Kanal> {
  const g = (await kanalDurumu()).gruplar.get(grupId)
  if (!g) throw new Error('Bu grubun üyesi değilsin.')
  return g.kanal
}

// The pair partner or group behind a topic, for records found by key.
export function kanalBilgisi(konu: string): Kanal | undefined {
  return motor().kanal(konu)
}

// ---------- reconciliation ----------

const ESKI_MS = 21 * 24 * 60 * 60 * 1000

function eskiMi(k: SosyalKayit | undefined): boolean {
  return !k || simdiMs() - k.zaman * 1000 > ESKI_MS
}

function ayniMi(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

// Runs after every sync. Each device brings its own side up to date with
// what it has learned, so the other side never has to wait for a person
// to press a button:
//   - a friendship both sides asked for (or one accepted) gets my 'kabul',
//     carrying my current broadcast key
//   - group keys friends handed me become memberships
//   - my membership card in each group stays current
//   - my availability copy in each group follows my broadcast one
//   - long-lived records are re-published before relays forget them
async function uzlastir(m: SosyalMotor): Promise<void> {
  // Account not set up yet (or not synced yet on a new device): nothing to
  // reconcile, and nothing must be created from an incomplete picture.
  const ben = await m.ben()
  const profil = profilVerisiAl((await m.kayit(ben, m.benimId, 'profil'))?.veri)
  if (!profil) return

  const isler: Array<() => Promise<unknown>> = []
  const yayinla = (kanal: Kanal, tur: string, anahtar: string, veri: unknown) =>
    isler.push(() => m.yayinla(kanal, tur, anahtar, veri))

  // A broadcast channel is created with the account; an interrupted setup
  // gets one here.
  if (!(await m.kayit(ben, m.benimId, 'yayin'))) {
    await m.yayinla(ben, TUR.yayin, 'yayin', { anahtar: yeniAnahtar() })
  }
  const durum = await kanalDurumuHesapla(m)
  const yayin = durum.yayin!

  const yayinProfilKaydi = await m.kayit(yayin, m.benimId, 'profil')
  if (!ayniMi(yayinProfilKaydi?.veri, yayinProfili(profil)) || eskiMi(yayinProfilKaydi)) {
    yayinla(yayin, TUR.profil, 'profil', yayinProfili(profil))
  }

  // Friendships.
  for (const iliski of durum.iliskiler.values()) {
    const kanal = durum.cift.get(iliski.pk)!
    const benim = await m.kayit(kanal, m.benimId, 'iliski')
    if (iliski.durum !== 'kabul') continue
    if (iliski.benimKaydim?.durum !== 'kabul' || iliski.benimKaydim.yayinAnahtari !== durum.yayinAnahtari || eskiMi(benim)) {
      yayinla(kanal, TUR.iliski, 'iliski', { durum: 'kabul', yayinAnahtari: durum.yayinAnahtari, zaman: simdiMs() })
    }
  }

  // Groups friends added me to.
  const grupumlar = await grupumKayitlari(m)
  for (const iliski of durum.iliskiler.values()) {
    if (iliski.durum !== 'kabul') continue
    const kanal = durum.cift.get(iliski.pk)!
    for (const k of await m.kayitlar(kanal.konu, TUR.grupDavet)) {
      if (k.yazar !== iliski.pk || !nesneMi(k.veri)) continue
      const grupId = metinAl(k.veri.grupId, 40)
      const anahtar = metinAl(k.veri.anahtar, 64)
      if (!grupId || !anahtar || !/^[0-9a-f]{64}$/.test(anahtar)) continue
      const mevcut = grupumlar.get(grupId)
      // Re-adding someone who left brings them back; an old invite doesn't.
      if (mevcut && (mevcut.durum === 'aktif' || mevcut.zaman >= kayitZamani(k))) continue
      const veri: GrupumVerisi = { anahtar, ad: metinAl(k.veri.ad, 80) ?? 'Grup', durum: 'aktif', zaman: simdiMs() }
      grupumlar.set(grupId, veri)
      yayinla(ben, TUR.grupum, `grup:${grupId}`, veri)
    }
  }

  // My card, the group card and my availability in each group.
  const ozet: ProfilOzeti = { ad: profil.ad, kullanici_adi: profil.kullanici_adi, avatar: profil.avatar }
  const yayinMusaitlik = await m.kayit(yayin, m.benimId, 'musaitlik')
  for (const [grupId, veri] of grupumlar) {
    if (veri.durum !== 'aktif') continue
    const kanal = await grupKanaliAl(veri.anahtar, grupId)
    m.kanalKaydet(kanal)

    const uye = await m.kayit(kanal, m.benimId, `uye:${m.benimId}`)
    const uyeVerisi = nesneMi(uye?.veri) ? uye.veri : null
    if (uyeVerisi?.durum !== 'aktif' || !ayniMi(profilOzetiAl(uyeVerisi.profil), ozet) || eskiMi(uye)) {
      yayinla(kanal, TUR.uye, `uye:${m.benimId}`, {
        durum: 'aktif',
        rol: uyeVerisi?.rol === 'yonetici' ? 'yonetici' : 'uye',
        profil: ozet,
        ekleyen: metinAl(uyeVerisi?.ekleyen, 64) ?? m.benimId,
        zaman: simdiMs(),
      } satisfies UyeVerisi)
    }

    const kartlar = await m.kayitlar(kanal.konu, TUR.grup)
    const kart = kartlar.sort((a, b) => b.zaman - a.zaman)[0]
    if (kart && eskiMi(kart)) yayinla(kanal, TUR.grup, 'grup', kart.veri)

    const kopya = await m.kayit(kanal, m.benimId, 'musaitlik')
    const istenen = profil.musaitlik_paylas ? (yayinMusaitlik?.veri ?? null) : null
    if ((kopya || istenen) && !ayniMi(kopya?.veri, istenen)) yayinla(kanal, TUR.musaitlik, 'musaitlik', istenen)
  }

  // Keep-alive: public relays drop old events. Re-publish what the account
  // can't live without well before that happens.
  for (const k of await m.kayitlar(ben.konu)) {
    if ([TUR.profil, TUR.yayin, TUR.kisi, TUR.grupum, TUR.yedek].includes(k.tur as never) && eskiMi(k)) {
      yayinla(ben, k.tur, k.anahtar, k.veri)
    }
  }
  if (yayinMusaitlik?.veri && eskiMi(yayinMusaitlik)) yayinla(yayin, TUR.musaitlik, 'musaitlik', yayinMusaitlik.veri)

  // Each task on its own: one failing publish must not stop the rest.
  for (const is of isler) {
    try {
      await is()
    } catch (err) {
      console.warn('sosyal uzlaştırma adımı başarısız', err)
    }
  }

  try {
    await hesapKayitlariniTazele(m, profil)
  } catch (err) {
    console.warn('hesap kayıtları tazelenemedi', err)
  }
}

// ---------- directory and password backup ----------

export function dizinVerisi(pk: string, profil: BenimProfilVerim): DizinVerisi {
  return {
    pk,
    ad: profil.ad,
    kullanici_adi: profil.kullanici_adi,
    arkadas_kodu: arkadasKodu(pk),
    avatar: profil.gizlilik === 'herkes' ? profil.avatar : null,
    alindi: profil.olusturulma,
  }
}

export async function benimYedegim(m: SosyalMotor = motor()): Promise<YedekKopyasi | null> {
  const k = await m.kayit(await m.ben(), m.benimId, 'yedek')
  if (!nesneMi(k?.veri) || !nesneMi(k.veri.yedek)) return null
  const kullaniciAdi = metinAl(k.veri.kullanici_adi, 40)
  return kullaniciAdi ? { kullanici_adi: kullaniciAdi, yedek: k.veri.yedek as unknown as SifreliYedek } : null
}

// The directory entries and the public password backup sit on channels
// nobody follows, so they're checked against the local copy kept when they
// were last published, and re-published when missing, changed or old.
export async function hesapKayitlariniTazele(m: SosyalMotor, profil: BenimProfilVerim): Promise<void> {
  const dizin = dizinVerisi(m.benimId, profil)
  const kanallar = [await dizinKanali('kod', dizin.arkadas_kodu)]
  if (profil.kullanici_adi) kanallar.push(await dizinKanali('kullanici', profil.kullanici_adi))
  for (const kanal of kanallar) {
    m.kanalKaydet(kanal)
    const mevcut = await m.kayit(kanal, m.benimId, 'dizin')
    if (!ayniMi(mevcut?.veri, dizin) || eskiMi(mevcut)) await m.yayinla(kanal, TUR.dizin, 'dizin', dizin)
  }

  const yedek = await benimYedegim(m)
  if (yedek && yedek.kullanici_adi === profil.kullanici_adi) {
    const kanal = await yedekKanali(yedek.kullanici_adi)
    m.kanalKaydet(kanal)
    const veri = { pk: m.benimId, yedek: yedek.yedek }
    const mevcut = await m.kayit(kanal, m.benimId, 'yedek')
    if (!ayniMi(mevcut?.veri, veri) || eskiMi(mevcut)) await m.yayinla(kanal, TUR.yedek, 'yedek', veri)
  }
}
