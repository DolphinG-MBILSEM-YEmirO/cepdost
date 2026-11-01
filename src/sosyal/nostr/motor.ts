import Dexie, { type Table } from 'dexie'
import { finalizeEvent, getPublicKey, verifyEvent } from 'nostr-tools/pure'
import { ciftKanali, dEtiketi, gelenKutusuKonusu, kendiKanali, type Kanal } from './kanal'
import { base64Url, base64UrldenBayt, jsonCoz, jsonSifrele } from './kodlama'
import { RoleHavuzu, ayarliRoleler, type Filtre, type NostrOlayi } from './role'

// The sync engine: a local-first store of decrypted records, kept in step
// with the relays.
//
// Every piece of social data is a "record": a replaceable Nostr event
// (kind 30078) identified by its author and a `d` tag. The engine signs and
// publishes records, fetches and live-subscribes to the channels the social
// layer asks for, verifies and decrypts what arrives, and keeps the newest
// version of each record in IndexedDB. Screens read from that local copy,
// so they open instantly and keep working offline.
//
// The engine knows nothing about friends or groups; which channels to follow
// and what records mean is decided in sosyal/cekirdek.ts.

export const OLAY_TURU = 30078

export const BAGLANTI_YOK = 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.'

export interface SosyalKayit {
  // `${yazar}:${d}` — the identity of a replaceable event.
  id: string
  konu: string
  tur: string
  anahtar: string
  yazar: string
  // Event created_at, in seconds.
  zaman: number
  olayId: string
  // null means the record was deleted (a tombstone).
  veri: unknown
}

interface Imlec {
  konu: string
  son: number
}

class SosyalVeritabani extends Dexie {
  kayitlar!: Table<SosyalKayit, string>
  imlecler!: Table<Imlec, string>

  constructor(ad: string) {
    super(ad)
    this.version(1).stores({
      kayitlar: 'id, konu, [konu+tur], yazar, anahtar',
      imlecler: 'konu',
    })
  }
}

export interface YayinSecenekleri {
  // Unix seconds after which relays may drop the record (NIP-40).
  sonaErme?: number
  // Publish under another `i` tag than the channel's own (inbox requests,
  // photo chunks).
  konu?: string
}

export interface MotorAyarlari {
  gizliAnahtar: Uint8Array
  roleler?: string[]
  veritabaniAdi?: string
  // Asked before every sync: which channels to follow right now.
  kanalKaynagi?: (motor: SosyalMotor) => Promise<Kanal[]>
  // Runs after every sync; the social layer reacts to what arrived here
  // (accepting confirmed friendships, joining groups...).
  esitlemeSonrasi?: (motor: SosyalMotor) => Promise<void>
}

const SAYFA = 500
const AZAMI_SAYFA = 10
const KONU_GRUBU = 40
// Authors' clocks drift; re-reading a window before the last seen event
// costs little because duplicates are dropped by id.
const GERI_PAY_SN = 2 * 60 * 60
const AZAMI_ICERIK = 60_000
const PERIYODIK_ESITLEME_MS = 3 * 60 * 1000

// Record types that can change which channels are followed.
const YENIDEN_ESITLETEN = new Set(['iliski', 'istek', 'grup-davet', 'kisi', 'grupum', 'yayin'])

interface KayitZarfi {
  t: string
  k: string
  v: unknown
}

function zarfMi(x: unknown): x is KayitZarfi {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as KayitZarfi).t === 'string' &&
    typeof (x as KayitZarfi).k === 'string' &&
    'v' in x
  )
}

function etiket(olay: NostrOlayi, ad: string): string | undefined {
  return olay.tags.find((t) => t[0] === ad)?.[1]
}

const simdiSn = () => Math.floor(Date.now() / 1000)

// NIP-09 deletion request kind, and how many records one request names.
const SILME_TURU = 5
const SILME_PARCASI = 400

export class SosyalMotor {
  readonly benimId: string
  readonly db: SosyalVeritabani
  private readonly sk: Uint8Array
  private readonly havuz: RoleHavuzu
  private readonly ayarlar: MotorAyarlari

  private hazirlik: Promise<void>
  private benKanali!: Kanal
  private gelenKonu = ''
  // konu (and fotoKonu) -> channel, for decrypting incoming events.
  private kanallar = new Map<string, Kanal>()
  private ciftOnbellegi = new Map<string, Promise<Kanal>>()
  private takipEdilen: Kanal[] = []

  private abonelikBirak: (() => void) | null = null
  private abonelikImzasi = ''
  private esitlemeSuruyor: Promise<void> | null = null
  private yenidenEsitle = false
  private periyodik: ReturnType<typeof setInterval> | null = null
  private kapatildi = false

  private dinleyiciler = new Set<() => void>()
  private kayitDinleyicileri = new Set<(k: SosyalKayit) => void>()
  private bildirimBekliyor = false
  surum = 0

  constructor(ayarlar: MotorAyarlari) {
    this.ayarlar = ayarlar
    this.sk = ayarlar.gizliAnahtar
    this.benimId = getPublicKey(this.sk)
    this.havuz = new RoleHavuzu(ayarlar.roleler ?? ayarliRoleler())
    this.db = new SosyalVeritabani(ayarlar.veritabaniAdi ?? `cepdost-sosyal-${this.benimId.slice(0, 16)}`)
    this.hazirlik = this.hazirla()
  }

  private async hazirla() {
    this.benKanali = await kendiKanali(this.sk)
    this.gelenKonu = await gelenKutusuKonusu(this.benimId)
    this.kanalKaydet(this.benKanali)
  }

  hazir(): Promise<void> {
    return this.hazirlik
  }

  // Needed to write the password backup; never leaves the device in clear.
  gizliAnahtar(): Uint8Array {
    return this.sk
  }

  async ben(): Promise<Kanal> {
    await this.hazirlik
    return this.benKanali
  }

  async gelenKutusu(): Promise<string> {
    await this.hazirlik
    return this.gelenKonu
  }

  ciftKanali(karsi: string): Promise<Kanal> {
    let kanal = this.ciftOnbellegi.get(karsi)
    if (!kanal) {
      kanal = ciftKanali(this.sk, karsi).then((k) => {
        this.kanalKaydet(k)
        return k
      })
      this.ciftOnbellegi.set(karsi, kanal)
    }
    return kanal
  }

  kanalKaydet(kanal: Kanal) {
    this.kanallar.set(kanal.konu, kanal)
    this.kanallar.set(kanal.fotoKonu, kanal)
  }

  // ---------- change notifications ----------

  dinle(dinleyici: () => void): () => void {
    this.dinleyiciler.add(dinleyici)
    return () => this.dinleyiciler.delete(dinleyici)
  }

  // Called for every record that is new or newer than the stored copy.
  kayitDinle(dinleyici: (k: SosyalKayit) => void): () => void {
    this.kayitDinleyicileri.add(dinleyici)
    return () => this.kayitDinleyicileri.delete(dinleyici)
  }

  private bildir() {
    if (this.bildirimBekliyor) return
    this.bildirimBekliyor = true
    setTimeout(() => {
      this.bildirimBekliyor = false
      this.surum++
      this.dinleyiciler.forEach((d) => d())
    }, 30)
  }

  // ---------- reading the local copy ----------

  async kayitId(kanal: Kanal, yazar: string, anahtar: string): Promise<string> {
    return `${yazar}:${await dEtiketi(kanal, anahtar)}`
  }

  async kayit(kanal: Kanal, yazar: string, anahtar: string): Promise<SosyalKayit | undefined> {
    return this.db.kayitlar.get(await this.kayitId(kanal, yazar, anahtar))
  }

  // Live (non-deleted) records of one type on a topic.
  async kayitlar(konu: string, tur?: string): Promise<SosyalKayit[]> {
    const liste = tur
      ? await this.db.kayitlar.where('[konu+tur]').equals([konu, tur]).toArray()
      : await this.db.kayitlar.where('konu').equals(konu).toArray()
    return liste.filter((k) => k.veri !== null)
  }

  // Same, including tombstones (needed to tell "deleted" from "never seen").
  async tumKayitlar(konu: string, tur: string): Promise<SosyalKayit[]> {
    return this.db.kayitlar.where('[konu+tur]').equals([konu, tur]).toArray()
  }

  // Live records with any of the given logical keys, on any channel. Ids
  // are random, so a key like "plan:<id>" finds its record wherever it is.
  async anahtarIle(anahtarlar: string[]): Promise<SosyalKayit[]> {
    if (anahtarlar.length === 0) return []
    const liste = await this.db.kayitlar.where('anahtar').anyOf(anahtarlar).toArray()
    return liste.filter((k) => k.veri !== null)
  }

  // The channel registered for a topic (pair, group, broadcast...).
  kanal(konu: string): Kanal | undefined {
    return this.kanallar.get(konu)
  }

  // ---------- publishing ----------

  async yayinla(
    kanal: Kanal,
    tur: string,
    anahtar: string,
    veri: unknown,
    secenek: YayinSecenekleri = {},
  ): Promise<SosyalKayit> {
    await this.hazirlik
    const d = await dEtiketi(kanal, anahtar)
    const konu = secenek.konu ?? kanal.konu
    const zarf: KayitZarfi = { t: tur, k: anahtar, v: veri }
    const icerik = kanal.sifre ? await jsonSifrele(kanal.sifre, zarf) : JSON.stringify(zarf)
    if (icerik.length > AZAMI_ICERIK) throw new Error('Gönderilecek veri çok büyük.')

    const id = `${this.benimId}:${d}`
    // Replaceable events are ordered by their second-resolution timestamp,
    // so a new version must always be strictly newer than the stored one.
    const onceki = await this.db.kayitlar.get(id)
    const zaman = Math.max(simdiSn(), (onceki?.zaman ?? 0) + 1)

    const etiketler = [
      ['d', d],
      ['i', konu],
    ]
    if (secenek.sonaErme) etiketler.push(['expiration', String(Math.floor(secenek.sonaErme))])

    const olay = finalizeEvent({ kind: OLAY_TURU, created_at: zaman, tags: etiketler, content: icerik }, this.sk)
    const { kabul } = await this.havuz.yayinla(olay as NostrOlayi)
    if (kabul === 0) throw new Error(BAGLANTI_YOK)

    const kayit: SosyalKayit = { id, konu, tur, anahtar, yazar: this.benimId, zaman, olayId: olay.id, veri }
    await this.db.kayitlar.put(kayit)
    this.kayitDinleyicileri.forEach((d) => d(kayit))
    this.bildir()
    return kayit
  }

  // Asks every relay to drop every event this account published (NIP-09),
  // for account deletion. Relays may ignore the request, so the records
  // that make the account findable are also overwritten with tombstones
  // (see hesabiKaliciSil in hesap.ts); this covers everything else.
  async silmeIstegiGonder(): Promise<void> {
    await this.hazirlik
    const benimkiler = await this.db.kayitlar.where('yazar').equals(this.benimId).toArray()
    const etiketler: string[][] = []
    for (const k of benimkiler) {
      const d = k.id.slice(this.benimId.length + 1)
      etiketler.push(['a', `${OLAY_TURU}:${this.benimId}:${d}`])
      if (k.olayId) etiketler.push(['e', k.olayId])
    }
    for (let i = 0; i < etiketler.length; i += SILME_PARCASI) {
      const olay = finalizeEvent(
        {
          kind: SILME_TURU,
          created_at: simdiSn(),
          tags: [...etiketler.slice(i, i + SILME_PARCASI), ['k', String(OLAY_TURU)]],
          content: 'account deleted',
        },
        this.sk,
      )
      const { kabul } = await this.havuz.yayinla(olay as NostrOlayi)
      if (kabul === 0) throw new Error(BAGLANTI_YOK)
    }
  }

  // ---------- other apps' records ----------
  // Davet invites (sosyal/davet.ts) live on the same relays in Davet's own
  // format: signed and read by the caller, not stored or decrypted here.

  async hamYayinla(olay: NostrOlayi): Promise<void> {
    const { kabul } = await this.havuz.yayinla(olay)
    if (kabul === 0) throw new Error(BAGLANTI_YOK)
  }

  async hamSorgula(filtre: Filtre): Promise<NostrOlayi[]> {
    const { ulasilan, olaylar } = await this.havuz.sorgula([filtre])
    if (ulasilan === 0) throw new Error(BAGLANTI_YOK)
    return olaylar
  }

  // ---------- receiving ----------

  private async kanalCozumle(olay: NostrOlayi, konu: string): Promise<Kanal | null> {
    const kanal = this.kanallar.get(konu)
    if (kanal) return kanal
    // Friend requests: encrypted for the pair channel, filed under my inbox.
    if (konu === this.gelenKonu && olay.pubkey !== this.benimId) return this.ciftKanali(olay.pubkey)
    return null
  }

  private yazarUygunMu(kanal: Kanal, yazar: string, konu: string): boolean {
    if (konu === this.gelenKonu) return yazar !== this.benimId
    switch (kanal.tur) {
      case 'ben':
        return yazar === this.benimId
      case 'cift':
        return yazar === this.benimId || yazar === kanal.karsi
      case 'yayin':
        return yazar === kanal.sahip
      default:
        return true
    }
  }

  // Verifies, decrypts and stores one event. Returns the record when it was
  // new or newer than the stored copy.
  async olayIsle(olay: NostrOlayi): Promise<SosyalKayit | null> {
    if (olay.kind !== OLAY_TURU || typeof olay.content !== 'string') return null
    const d = etiket(olay, 'd')
    const konu = etiket(olay, 'i')
    if (!d || !konu) return null

    const id = `${olay.pubkey}:${d}`
    const onceki = await this.db.kayitlar.get(id)
    if (onceki && (onceki.zaman > olay.created_at || (onceki.zaman === olay.created_at && onceki.olayId <= olay.id))) {
      return null
    }

    const kanal = await this.kanalCozumle(olay, konu)
    if (!kanal || !this.yazarUygunMu(kanal, olay.pubkey, konu)) return null
    // Relays are not trusted: anything that isn't signed by its author is
    // dropped before it can touch the store.
    if (!verifyEvent(olay)) return null

    let zarf: unknown
    if (kanal.sifre) {
      zarf = await jsonCoz(kanal.sifre, olay.content)
    } else {
      try {
        zarf = JSON.parse(olay.content)
      } catch {
        return null
      }
    }
    if (!zarfMi(zarf)) return null
    // The d tag must be the one this logical key maps to; otherwise one
    // record could masquerade as another.
    if ((await dEtiketi(kanal, zarf.k)) !== d) return null

    const kayit: SosyalKayit = {
      id,
      konu,
      tur: zarf.t,
      anahtar: zarf.k,
      yazar: olay.pubkey,
      zaman: olay.created_at,
      olayId: olay.id,
      veri: zarf.v,
    }
    await this.db.kayitlar.put(kayit)
    this.kayitDinleyicileri.forEach((dinleyici) => dinleyici(kayit))
    return kayit
  }

  private async olaylariIsle(olaylar: NostrOlayi[]): Promise<number> {
    let degisen = 0
    // Oldest first, so listeners see events in a natural order.
    for (const olay of olaylar.sort((a, b) => a.created_at - b.created_at)) {
      if (await this.olayIsle(olay)) degisen++
    }
    if (degisen > 0) this.bildir()
    return degisen
  }

  // ---------- fetching ----------

  // Fetches everything new on the given topics, page by page.
  async konulariCek(konular: string[]): Promise<void> {
    await this.hazirlik
    const imlecler = new Map((await this.db.imlecler.bulkGet(konular)).flatMap((i) => (i ? [[i.konu, i.son]] : [])))

    // Topics never fetched before get their whole history; known ones only
    // what's new since the last sync.
    const yeni = konular.filter((k) => !imlecler.has(k))
    const bilinen = konular.filter((k) => imlecler.has(k))
    const gruplar: Array<{ konular: string[]; since?: number }> = []
    for (let i = 0; i < yeni.length; i += KONU_GRUBU) gruplar.push({ konular: yeni.slice(i, i + KONU_GRUBU) })
    for (let i = 0; i < bilinen.length; i += KONU_GRUBU) {
      const parca = bilinen.slice(i, i + KONU_GRUBU)
      const since = Math.min(...parca.map((k) => imlecler.get(k) ?? 0)) - GERI_PAY_SN
      gruplar.push({ konular: parca, since: Math.max(0, since) })
    }

    await Promise.all(
      gruplar.map(async (g) => {
        const enYeni = new Map<string, number>()
        let until: number | undefined
        for (let sayfa = 0; sayfa < AZAMI_SAYFA; sayfa++) {
          const filtre: Filtre = { kinds: [OLAY_TURU], '#i': g.konular, limit: SAYFA }
          if (g.since) filtre.since = g.since
          if (until) filtre.until = until
          const { ulasilan, olaylar } = await this.havuz.sorgula([filtre])
          if (ulasilan === 0) throw new Error(BAGLANTI_YOK)
          for (const o of olaylar) {
            const konu = etiket(o, 'i')
            if (konu) enYeni.set(konu, Math.max(enYeni.get(konu) ?? 0, o.created_at))
          }
          await this.olaylariIsle(olaylar)
          if (olaylar.length < SAYFA) break
          until = Math.min(...olaylar.map((o) => o.created_at)) - 1
        }
        // A topic with no events yet still gets a cursor, so the next sync
        // doesn't treat it as new again.
        const simdi = simdiSn()
        await this.db.imlecler.bulkPut(
          g.konular.map((konu) => ({
            konu,
            son: Math.max(enYeni.get(konu) ?? 0, imlecler.get(konu) ?? 0, g.since === undefined ? simdi - GERI_PAY_SN : 0),
          })),
        )
      }),
    )
  }

  // One-off read of a channel that isn't followed (directory lookups,
  // Keşfet). Returns the live records found.
  async kanalSorgula(kanal: Kanal, ek: Omit<Filtre, 'kinds'> = {}): Promise<SosyalKayit[]> {
    await this.hazirlik
    this.kanalKaydet(kanal)
    const { ulasilan, olaylar } = await this.havuz.sorgula([{ kinds: [OLAY_TURU], '#i': [kanal.konu], ...ek }])
    if (ulasilan === 0) throw new Error(BAGLANTI_YOK)
    await this.olaylariIsle(olaylar)
    return this.kayitlar(kanal.konu)
  }

  // Fetches specific records by author and logical key (photo chunks).
  async kayitlariGetir(kanal: Kanal, yazar: string, anahtarlar: string[], konu: string): Promise<void> {
    await this.hazirlik
    this.kanalKaydet(kanal)
    const dler = await Promise.all(anahtarlar.map((a) => dEtiketi(kanal, a)))
    const { ulasilan, olaylar } = await this.havuz.sorgula([
      { kinds: [OLAY_TURU], authors: [yazar], '#d': dler, '#i': [konu] },
    ])
    if (ulasilan === 0) throw new Error(BAGLANTI_YOK)
    await this.olaylariIsle(olaylar)
  }

  // ---------- syncing ----------

  // Full sync: asks the social layer which channels to follow, fetches them
  // (repeating while new channels turn up, e.g. a new friend's broadcast),
  // then keeps a live subscription on all of them.
  esitle(): Promise<void> {
    if (this.esitlemeSuruyor) {
      this.yenidenEsitle = true
      return this.esitlemeSuruyor
    }
    this.esitlemeSuruyor = (async () => {
      try {
        do {
          this.yenidenEsitle = false
          await this.esitlemeTuru()
        } while (this.yenidenEsitle && !this.kapatildi)
      } finally {
        this.esitlemeSuruyor = null
      }
    })()
    return this.esitlemeSuruyor
  }

  private async esitlemeTuru() {
    await this.hazirlik
    let oncekiImza = ''
    for (let tur = 0; tur < 4 && !this.kapatildi; tur++) {
      const kanallar = await this.kanallariBelirle()
      const konular = [this.gelenKonu, ...kanallar.map((k) => k.konu)]
      const imza = konular.slice().sort().join(',')
      if (imza === oncekiImza) break
      await this.konulariCek(konular)
      oncekiImza = imza
      if (this.ayarlar.esitlemeSonrasi) await this.ayarlar.esitlemeSonrasi(this)
    }
    this.aboneligiGuncelle()
  }

  private async kanallariBelirle(): Promise<Kanal[]> {
    const kanallar = this.ayarlar.kanalKaynagi ? await this.ayarlar.kanalKaynagi(this) : [this.benKanali]
    kanallar.forEach((k) => this.kanalKaydet(k))
    this.takipEdilen = kanallar
    return kanallar
  }

  private aboneligiGuncelle() {
    if (this.kapatildi) return
    const konular = [this.gelenKonu, ...this.takipEdilen.map((k) => k.konu)]
    const imza = konular.slice().sort().join(',')
    if (imza === this.abonelikImzasi) return
    this.abonelikBirak?.()
    this.abonelikImzasi = imza

    const filtreler: Filtre[] = []
    for (let i = 0; i < konular.length; i += KONU_GRUBU) {
      filtreler.push({ kinds: [OLAY_TURU], '#i': konular.slice(i, i + KONU_GRUBU), since: simdiSn() - GERI_PAY_SN })
    }

    // Live events are processed one at a time, in arrival order.
    let kuyruk = Promise.resolve()
    const gorulen = new Set<string>()
    this.abonelikBirak = this.havuz.abone(filtreler, (olay) => {
      if (gorulen.has(olay.id)) return
      gorulen.add(olay.id)
      kuyruk = kuyruk.then(async () => {
        const kayit = await this.olayIsle(olay).catch(() => null)
        if (!kayit) return
        this.bildir()
        // Something that may change what we follow (a new friend, a group
        // invite) triggers a sync, which also runs the social reactions.
        if (YENIDEN_ESITLETEN.has(kayit.tur)) {
          void this.esitle().catch(() => {})
        }
      })
    })
  }

  // Starts background syncing: once now, then periodically and whenever the
  // app comes back to the foreground.
  baslat() {
    const calistir = () => void this.esitle().catch((err) => console.warn('sosyal eşitleme başarısız', err))
    calistir()
    this.periyodik = setInterval(calistir, PERIYODIK_ESITLEME_MS)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.gorunurlukDegisti)
    }
  }

  private gorunurlukDegisti = () => {
    if (document.visibilityState === 'visible') void this.esitle().catch(() => {})
  }

  kapat() {
    this.kapatildi = true
    if (this.periyodik) clearInterval(this.periyodik)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.gorunurlukDegisti)
    }
    this.abonelikBirak?.()
    this.havuz.kapat()
    this.dinleyiciler.clear()
    this.kayitDinleyicileri.clear()
  }

  // Deletes this account's local copy (sign-out).
  async yerelVeriyiSil() {
    this.db.close()
    await Dexie.delete(this.db.name)
  }
}

// Photo bytes travel as base64 inside records; these helpers keep the
// chunking in one place.
export function baytiParcala(bayt: Uint8Array, parcaBoyu: number): string[] {
  const metin = base64Url(bayt)
  const parcalar: string[] = []
  for (let i = 0; i < metin.length; i += parcaBoyu) parcalar.push(metin.slice(i, i + parcaBoyu))
  return parcalar
}

export function parcalariBirlestir(parcalar: string[]): Uint8Array {
  return base64UrldenBayt(parcalar.join(''))
}
