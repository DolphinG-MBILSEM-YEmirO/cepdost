import {
  TUR,
  arkadasKodu,
  benimProfilVerim,
  ciftKanaliAl,
  isoZaman,
  kanalBilgisi,
  kanalDurumu,
  kayitZamani,
  koduNormallestir,
  metinAl,
  motor,
  nesneMi,
  planZamani,
  profilOzetiAl,
  profilVerisiAl,
  sayiAl,
  simdiMs,
  yayinKanaliAl,
  yayinProfili,
  yeniAnahtar,
  type ArkadaslikDurumu,
  type BenimProfilVerim,
  type Gizlilik,
  type IliskiDurumu,
  type KanalDurumu,
  type MusaitlikVerisi,
  type ProfilOzeti,
  type SaatPenceresi,
} from './cekirdek'
import type { EpostaOnayi } from './epostaImzacisi'
import { onaylilariSec } from './epostaImzacisi'
import { bildirArkaplanda } from './bildirimler'
import { ENGEL_ONEKI, engellenenler } from './engel'
import { kullaniciAdiAlinmisMi, kullaniciAdiHatasi, kullaniciAdiniTasi } from './hesap'
import { davetAnahtarindanKimlik } from './kimlik'
import { dizinKanali, gelenKutusuKonusu } from './nostr/kanal'
import { rastgeleId } from './nostr/kodlama'
import type { SosyalKayit } from './nostr/motor'
import { localDateString } from '../lib/format'
import { UYGULAMA_ADI } from '../../shared/marka'

// Profiles, friendships, availability and plan invites, on top of the
// encrypted record store (see cekirdek.ts). Who can read what is decided
// by who holds which channel key, not by checks in this file.

export type { ArkadaslikDurumu, Gizlilik }

export interface Profil {
  id: string
  ad: string
  kullanici_adi: string | null
  arkadas_kodu: string
  musaitlik_paylas: boolean
  // 'arkadaslar': name and photo only for friends and people I send a
  // request to. 'herkes': also in search results and Keşfet.
  gizlilik: Gizlilik
  // Whether the password backup exists (sign-in from other devices).
  sifre_belirlendi: boolean
  // Small JPEG data URL.
  avatar: string | null
  biyografi: string | null
  // Accent colour key (see lib/kisisellestirme.ts) and a profile emoji.
  renk: string | null
  emoji: string | null
  // My verified address (null on other people's profiles) and the server's
  // attestation for it.
  eposta: string | null
  onay: EpostaOnayi | null
}

export interface AramaSonucu {
  id: string
  ad: string
  kullanici_adi: string | null
  arkadas_kodu: string
  avatar: string | null
}

// Friend list entry: the other person's profile and the direction of a
// pending request. arkadaslikId is the other person's id.
export interface Arkadas {
  arkadaslikId: string
  profil: Profil
  durum: ArkadaslikDurumu
  // 'giden': I asked, they haven't answered. 'gelen': they asked me.
  yon: 'giden' | 'gelen'
}

export interface MusaitlikBlogu {
  id: string
  kullanici_id: string
  tarih: string
  baslangic: string
  bitis: string
}

export type DavetDurumu = 'bekliyor' | 'kabul' | 'red' | 'iptal'

export interface PlanDaveti {
  id: string
  gonderen_id: string
  alan_id: string
  baslik: string
  tarih: string
  saat: string | null
  sure: number | null
  // All-day plan: saat and sure are null.
  tum_gun: boolean
  konum: string | null
  mesaj: string | null
  emoji: string | null
  durum: DavetDurumu
  olusturulma: string
}

// ---------- profiles ----------

function profilKur(id: string, veri: Partial<BenimProfilVerim> & { ad: string }): Profil {
  return {
    id,
    ad: veri.ad,
    kullanici_adi: veri.kullanici_adi ?? null,
    arkadas_kodu: arkadasKodu(id),
    musaitlik_paylas: veri.musaitlik_paylas ?? false,
    gizlilik: veri.gizlilik ?? 'arkadaslar',
    sifre_belirlendi: veri.sifre_belirlendi ?? true,
    avatar: veri.avatar ?? null,
    biyografi: veri.biyografi ?? null,
    renk: veri.renk ?? null,
    emoji: veri.emoji ?? null,
    eposta: veri.eposta ?? null,
    onay: veri.onay ?? null,
  }
}

export function ozettenProfil(id: string, ozet: ProfilOzeti | null): Profil {
  return profilKur(id, ozet ?? { ad: `${UYGULAMA_ADI} kullanıcısı` })
}

export async function profilimiGetir(): Promise<Profil | null> {
  const veri = await benimProfilVerim()
  return veri ? profilKur(motor().benimId, veri) : null
}

// A friend's full profile, read from their broadcast channel.
async function arkadasProfili(durum: KanalDurumu, iliski: IliskiDurumu): Promise<Profil> {
  const kanal = durum.arkadasYayin.get(iliski.pk)
  if (kanal) {
    const kayit = await motor().kayit(kanal, iliski.pk, 'profil')
    const veri = profilVerisiAl(kayit?.veri)
    if (veri) return profilKur(iliski.pk, veri)
  }
  return ozettenProfil(iliski.pk, iliski.ozet)
}

export type ProfilDegisikligi = Partial<
  Pick<
    Profil,
    | 'ad'
    | 'kullanici_adi'
    | 'musaitlik_paylas'
    | 'gizlilik'
    | 'sifre_belirlendi'
    | 'avatar'
    | 'biyografi'
    | 'renk'
    | 'emoji'
    | 'eposta'
    | 'onay'
  >
>

export async function profilGuncelle(degisiklik: ProfilDegisikligi): Promise<void> {
  const m = motor()
  const mevcut = await benimProfilVerim()
  if (!mevcut) throw new Error('Oturum bulunamadı')

  const yeni: BenimProfilVerim = { ...mevcut, ...degisiklik }
  yeni.ad = yeni.ad.trim().slice(0, 80) || mevcut.ad
  yeni.biyografi = yeni.biyografi?.trim().slice(0, 160) || null

  if (degisiklik.kullanici_adi !== undefined && degisiklik.kullanici_adi !== mevcut.kullanici_adi) {
    const ad = degisiklik.kullanici_adi
    if (!ad) throw new Error('Kullanıcı adı boş olamaz.')
    const hata = kullaniciAdiHatasi(ad)
    if (hata) throw new Error(hata)
    if (await kullaniciAdiAlinmisMi(ad)) throw new Error('Bu kullanıcı adı zaten alınmış.')
    await kullaniciAdiniTasi(mevcut.kullanici_adi, ad)
  }

  await m.yayinla(await m.ben(), TUR.profil, 'profil', yeni)
  // Friends see the change right away; directory entries, group cards and
  // availability follow in the sync that this triggers.
  const durum = await kanalDurumu()
  if (durum.yayin) await m.yayinla(durum.yayin, TUR.profil, 'profil', yayinProfili(yeni)).catch(() => {})
  void m.esitle().catch(() => {})
}

// Exact lookup by friend code, @username or invite key. There's no partial
// search on purpose: finding someone needs something they gave you.
export async function profilAra(aranan: string): Promise<AramaSonucu | null> {
  const m = motor()
  const girdi = aranan.trim()
  if (!girdi) return null

  const pk = davetAnahtarindanKimlik(girdi)
  const kod = pk ? arkadasKodu(pk) : koduNormallestir(girdi)
  if (kod) {
    const kayitlar = await m.kanalSorgula(await dizinKanali('kod', kod))
    const bulunan = (await dizinSonuclari(kayitlar)).find(
      (s) => arkadasKodu(s.id) === kod && (!pk || s.id === pk),
    )
    if (bulunan) return bulunan
    if (pk) return null
  }

  const kullaniciAdi = girdi.replace(/^@/, '').toLowerCase()
  if (kullaniciAdiHatasi(kullaniciAdi)) return null
  const kayitlar = await m.kanalSorgula(await dizinKanali('kullanici', kullaniciAdi))
  // Several accounts could claim a name; the earliest claim wins.
  return (
    (await dizinSonuclari(kayitlar))
      .filter((s) => s.kullanici_adi === kullaniciAdi)
      .sort((a, b) => a.alindi - b.alindi)[0] ?? null
  )
}

// Directory entries as search results. Accounts without a verified email
// don't come up (see epostaImzacisi.ts), so bots can't be found and added.
async function dizinSonuclari(kayitlar: SosyalKayit[]): Promise<Array<AramaSonucu & { alindi: number }>> {
  const sonuclar = kayitlar.flatMap((k) => {
    if (k.tur !== TUR.dizin || !nesneMi(k.veri) || k.veri.pk !== k.yazar) return []
    const ozet = profilOzetiAl(k.veri)
    if (!ozet) return []
    return [
      {
        id: k.yazar,
        ad: ozet.ad,
        kullanici_adi: ozet.kullanici_adi,
        arkadas_kodu: arkadasKodu(k.yazar),
        avatar: ozet.avatar,
        alindi: sayiAl(k.veri.alindi) ?? Number.MAX_SAFE_INTEGER,
        onay: ozet.onay ?? null,
      },
    ]
  })
  return (await onaylilariSec(sonuclar, (s) => ({ pk: s.id, onay: s.onay }))).map(({ onay: _o, ...s }) => s)
}

// ---------- friendships ----------

async function benimOzetim(): Promise<ProfilOzeti> {
  const profil = await benimProfilVerim()
  if (!profil) throw new Error('Oturum bulunamadı')
  return { ad: profil.ad, kullanici_adi: profil.kullanici_adi, avatar: profil.avatar, onay: profil.onay ?? null }
}

// `kim` is the search result the request starts from; it's kept so the
// pending request shows a name before the other side answers.
export async function arkadaslikIsteGonder(hedefId: string, kim?: AramaSonucu | null): Promise<void> {
  const m = motor()
  if (hedefId === m.benimId) throw new Error('Kendine istek gönderemezsin.')
  const durum = await kanalDurumu()
  const mevcut = durum.iliskiler.get(hedefId)
  if (mevcut?.durum === 'kabul') throw new Error('Zaten arkadaşsınız.')
  if (mevcut?.durum === 'bekliyor' && mevcut.yon === 'giden') throw new Error('Bu kişiye zaten istek gönderdin.')
  // They already asked me: sending a request back is accepting.
  if (mevcut?.durum === 'bekliyor' && mevcut.yon === 'gelen') return arkadaslikYanitla(hedefId, true)

  const kanal = await ciftKanaliAl(hedefId)
  const zaman = simdiMs()
  const ozet = kim ? { ad: kim.ad, kullanici_adi: kim.kullanici_adi, avatar: kim.avatar } : null
  await m.yayinla(await m.ben(), TUR.kisi, `kisi:${hedefId}`, { eklenme: zaman, profil: ozet })
  await m.yayinla(kanal, TUR.iliski, 'iliski', { durum: 'istek', zaman })
  // The request also goes to their inbox, which is how they find out.
  const benim = await benimOzetim()
  await m.yayinla(kanal, TUR.istek, 'istek', { profil: benim, zaman }, { konu: await gelenKutusuKonusu(hedefId) })
  void m.esitle().catch(() => {})
  bildirArkaplanda(
    [hedefId],
    {
      tur: 'istek',
      baslik: 'Yeni arkadaşlık isteği',
      govde: `${benim.ad}${benim.kullanici_adi ? ` (@${benim.kullanici_adi})` : ''} seni arkadaş olarak eklemek istiyor.`,
      git: 'arkadaslar',
      etiket: 'istek',
    },
    { dizinden: true },
  )
}

export async function arkadaslikYanitla(arkadaslikId: string, kabul: boolean): Promise<void> {
  const m = motor()
  const durum = await kanalDurumu()
  const kanal = await ciftKanaliAl(arkadaslikId)
  const zaman = simdiMs()
  // Remember them either way, so a later change from their side is seen.
  if (!(await m.kayit(durum.ben, m.benimId, `kisi:${arkadaslikId}`))) {
    const ozet = durum.iliskiler.get(arkadaslikId)?.ozet ?? null
    await m.yayinla(durum.ben, TUR.kisi, `kisi:${arkadaslikId}`, { eklenme: zaman, profil: ozet })
  }
  await m.yayinla(
    kanal,
    TUR.iliski,
    'iliski',
    kabul ? { durum: 'kabul', yayinAnahtari: durum.yayinAnahtari, zaman } : { durum: 'red', zaman },
  )
  void m.esitle().catch(() => {})
  if (kabul) {
    const ad = (await benimProfilVerim())?.ad ?? UYGULAMA_ADI
    bildirArkaplanda(
      [arkadaslikId],
      {
        tur: 'kabul',
        baslik: `${ad} isteğini kabul etti`,
        govde: 'Artık arkadaşsınız. Boş saatlerinizi görüp bir plan kurabilirsiniz.',
        git: `dm:${m.benimId}`,
        etiket: `dm:${m.benimId}`,
      },
      // Their copy of my broadcast key may not have arrived yet.
      { dizinden: true },
    )
  }
}

// Ending a friendship (or withdrawing a request). The other person still
// holds my broadcast key, so it's replaced and handed to everyone else.
export async function arkadasliktanCik(arkadaslikId: string): Promise<void> {
  const m = motor()
  const durum = await kanalDurumu()
  const iliski = durum.iliskiler.get(arkadaslikId)
  const kanal = await ciftKanaliAl(arkadaslikId)
  await m.yayinla(kanal, TUR.iliski, 'iliski', { durum: 'silindi', zaman: simdiMs() })
  if (iliski?.yon === 'giden' && iliski.durum === 'bekliyor') {
    await m.yayinla(kanal, TUR.istek, 'istek', null, { konu: await gelenKutusuKonusu(arkadaslikId) }).catch(() => {})
  }
  if (iliski?.durum === 'kabul') await yayinAnahtariniYenile(durum)
  void m.esitle().catch(() => {})
}

// Blocks someone: their messages, memories and requests stop showing, and
// a friendship or request between us ends (which also takes them off my
// broadcast channel). They are not told.
export async function engelle(kisiId: string): Promise<void> {
  const m = motor()
  if (kisiId === m.benimId) throw new Error('Kendini engelleyemezsin.')
  await m.yayinla(await m.ben(), TUR.engel, `${ENGEL_ONEKI}${kisiId}`, { zaman: simdiMs() })
  const iliski = (await kanalDurumu()).iliskiler.get(kisiId)
  if (iliski && (iliski.durum === 'kabul' || iliski.durum === 'bekliyor')) await arkadasliktanCik(kisiId)
}

export async function engeliKaldir(kisiId: string): Promise<void> {
  const m = motor()
  await m.yayinla(await m.ben(), TUR.engel, `${ENGEL_ONEKI}${kisiId}`, null)
}

async function yayinAnahtariniYenile(durum: KanalDurumu): Promise<void> {
  const m = motor()
  const eskiKanal = durum.yayin
  const anahtar = yeniAnahtar()
  const yeniKanal = await yayinKanaliAl(anahtar, m.benimId)
  m.kanalKaydet(yeniKanal)

  // New channel first, so friends never find an empty one.
  const eskiler = eskiKanal ? await m.kayitlar(eskiKanal.konu) : []
  for (const k of eskiler) {
    if (k.yazar === m.benimId) await m.yayinla(yeniKanal, k.tur, k.anahtar, k.veri)
  }
  await m.yayinla(durum.ben, TUR.yayin, 'yayin', { anahtar })
  // The reconcile step sends every remaining friend a 'kabul' with the new
  // key; the old channel is emptied once that's done.
  await m.esitle().catch(() => {})
  if (eskiKanal) {
    for (const k of eskiler) {
      if (k.yazar === m.benimId) await m.yayinla(eskiKanal, k.tur, k.anahtar, null).catch(() => {})
    }
  }
}

// Blocked people are left out (their requests, mainly).
export async function arkadaslariGetir(): Promise<Arkadas[]> {
  const durum = await kanalDurumu()
  const engelli = await engellenenler()
  const liste: Array<Arkadas & { zaman: number }> = []
  for (const iliski of durum.iliskiler.values()) {
    if (iliski.durum !== 'kabul' && iliski.durum !== 'bekliyor') continue
    if (engelli.has(iliski.pk)) continue
    liste.push({
      arkadaslikId: iliski.pk,
      profil: await arkadasProfili(durum, iliski),
      durum: iliski.durum,
      yon: iliski.yon,
      zaman: iliski.zaman,
    })
  }
  return liste.sort((a, b) => b.zaman - a.zaman).map(({ zaman: _z, ...a }) => a)
}

// Everyone I can see a profile of: friends (full profile) and fellow group
// members (the card they keep in the group).
export async function bilinenProfiller(): Promise<Map<string, Profil>> {
  const m = motor()
  const durum = await kanalDurumu()
  const harita = new Map<string, Profil>()
  for (const g of durum.gruplar.values()) {
    for (const k of await m.kayitlar(g.kanal.konu, TUR.uye)) {
      const pk = k.anahtar.slice(4)
      const veri = nesneMi(k.veri) ? k.veri : {}
      const ozet = profilOzetiAl(veri.profil)
      if (ozet && !harita.has(pk)) harita.set(pk, ozettenProfil(pk, ozet))
    }
  }
  for (const iliski of durum.iliskiler.values()) {
    if (iliski.durum === 'kabul') harita.set(iliski.pk, await arkadasProfili(durum, iliski))
  }
  const ben = await profilimiGetir()
  if (ben) harita.set(ben.id, ben)
  return harita
}

// ---------- availability ----------

function musaitlikVerisiAl(deger: unknown): MusaitlikVerisi | null {
  if (!nesneMi(deger) || !Array.isArray(deger.bloklar)) return null
  const SAAT = /^\d{2}:\d{2}$/
  const TARIH = /^\d{4}-\d{2}-\d{2}$/
  const bloklar = deger.bloklar.flatMap((b: unknown) => {
    if (!nesneMi(b)) return []
    const { tarih, baslangic, bitis } = b
    if (typeof tarih !== 'string' || !TARIH.test(tarih)) return []
    if (typeof baslangic !== 'string' || !SAAT.test(baslangic)) return []
    if (typeof bitis !== 'string' || !SAAT.test(bitis) || bitis <= baslangic) return []
    return [{ tarih, baslangic, bitis }]
  })
  return { bloklar, guncelleme: sayiAl(deger.guncelleme) ?? 0, pencere: pencereAl(deger.pencere) }
}

export function pencereAl(deger: unknown): SaatPenceresi | null {
  if (!nesneMi(deger)) return null
  const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/
  const { baslangic, bitis } = deger
  if (typeof baslangic !== 'string' || !SAAT.test(baslangic)) return null
  if (typeof bitis !== 'string' || !SAAT.test(bitis) || bitis <= baslangic) return null
  return { baslangic, bitis }
}

// The newest availability someone shares with me: on their broadcast
// channel if we're friends, or in a group we're both in.
export async function musaitlikKaydi(kisiId: string): Promise<MusaitlikVerisi | null> {
  const m = motor()
  const durum = await kanalDurumu()
  const adaylar: SosyalKayit[] = []
  const yayin = durum.arkadasYayin.get(kisiId)
  if (yayin) {
    const k = await m.kayit(yayin, kisiId, 'musaitlik')
    if (k) adaylar.push(k)
  }
  for (const g of durum.gruplar.values()) {
    const k = await m.kayit(g.kanal, kisiId, 'musaitlik')
    if (k) adaylar.push(k)
  }
  const enYeni = adaylar.sort((a, b) => b.zaman - a.zaman)[0]
  return enYeni ? musaitlikVerisiAl(enYeni.veri) : null
}

export interface ArkadasTakvimi {
  // null when nothing is known: sharing is off, or their ranges haven't
  // reached this device yet. Never the same as "free all day".
  bloklar: MusaitlikBlogu[] | null
  // When their device last confirmed the ranges (ms).
  guncelleme: number | null
  pencere: SaatPenceresi | null
}

// Someone's BUSY time ranges between two dates. Only when they are busy,
// never what they're doing.
export async function arkadasTakvimi(
  arkadasId: string,
  baslangicTarih: string,
  bitisTarih: string,
): Promise<ArkadasTakvimi> {
  const veri = await musaitlikKaydi(arkadasId)
  if (!veri) return { bloklar: null, guncelleme: null, pencere: null }
  return {
    bloklar: veri.bloklar
      .filter((b) => b.tarih >= baslangicTarih && b.tarih <= bitisTarih)
      .sort((a, b) => (a.tarih + a.baslangic).localeCompare(b.tarih + b.baslangic))
      .map((b, i) => ({ id: `${arkadasId}:${i}`, kullanici_id: arkadasId, ...b })),
    guncelleme: veri.guncelleme || null,
    pencere: veri.pencere ?? null,
  }
}

// The busy ranges alone, empty when unknown.
export async function arkadasMusaitligi(
  arkadasId: string,
  baslangicTarih: string,
  bitisTarih: string,
): Promise<MusaitlikBlogu[]> {
  return (await arkadasTakvimi(arkadasId, baslangicTarih, bitisTarih)).bloklar ?? []
}

// ---------- plan invites ----------

export interface YeniDavet {
  alanId: string
  baslik: string
  tarih: string
  saat?: string | null
  sure?: number | null
  tumGun?: boolean
  konum?: string | null
  mesaj?: string | null
  emoji?: string | null
}

async function arkadasKanali(pk: string, hata: string) {
  const durum = await kanalDurumu()
  if (durum.iliskiler.get(pk)?.durum !== 'kabul') throw new Error(hata)
  return durum.cift.get(pk)!
}

// Returns the invite id, so the caller can drop it into the chat as a card.
export async function davetGonder(davet: YeniDavet): Promise<string> {
  const kanal = await arkadasKanali(davet.alanId, 'Bu kişiye davet gönderemezsin — önce arkadaş olmanız gerekiyor.')
  const id = rastgeleId()
  await motor().yayinla(kanal, TUR.davet, `davet:${id}`, {
    baslik: davet.baslik.trim().slice(0, 120),
    tarih: davet.tarih,
    saat: davet.tumGun ? null : davet.saat || null,
    sure: davet.tumGun ? null : davet.sure ?? null,
    tumGun: davet.tumGun === true,
    konum: davet.konum?.trim() || null,
    mesaj: davet.mesaj?.trim() || null,
    emoji: davet.emoji || null,
    zaman: simdiMs(),
  })
  return id
}

async function davetKur(k: SosyalKayit): Promise<PlanDaveti | null> {
  const m = motor()
  const kanal = kanalBilgisi(k.konu)
  if (!kanal?.karsi || !nesneMi(k.veri)) return null
  const baslik = metinAl(k.veri.baslik, 120)
  const tarih = metinAl(k.veri.tarih, 10)
  if (!baslik || !tarih) return null

  const id = k.anahtar.slice('davet:'.length)
  const gonderen = k.yazar
  const alan = gonderen === m.benimId ? kanal.karsi : m.benimId
  const yanit = await m.kayit(kanal, alan, `davet-yanit:${id}`)
  const yanitDurumu = nesneMi(yanit?.veri) ? yanit.veri.durum : null
  const durum: DavetDurumu =
    k.veri.iptal === true ? 'iptal' : yanitDurumu === 'kabul' ? 'kabul' : yanitDurumu === 'red' ? 'red' : 'bekliyor'

  return {
    id,
    gonderen_id: gonderen,
    alan_id: alan,
    baslik,
    tarih,
    ...planZamani(k.veri),
    konum: metinAl(k.veri.konum, 200),
    mesaj: metinAl(k.veri.mesaj, 500),
    emoji: metinAl(k.veri.emoji, 16),
    durum,
    olusturulma: isoZaman(kayitZamani(k)),
  }
}

async function tumDavetler(): Promise<PlanDaveti[]> {
  const m = motor()
  const durum = await kanalDurumu()
  const liste: PlanDaveti[] = []
  for (const kanal of durum.cift.values()) {
    for (const k of await m.kayitlar(kanal.konu, TUR.davet)) {
      const d = await davetKur(k)
      if (d) liste.push(d)
    }
  }
  return liste.sort((a, b) => b.olusturulma.localeCompare(a.olusturulma))
}

// For drawing invite cards in a chat: id → invite.
export async function davetleriIdyeGoreGetir(idler: string[]): Promise<Map<string, PlanDaveti>> {
  await kanalDurumu()
  const harita = new Map<string, PlanDaveti>()
  const kayitlar = await motor().anahtarIle([...new Set(idler.filter(Boolean))].map((id) => `davet:${id}`))
  for (const k of kayitlar) {
    if (k.tur !== TUR.davet) continue
    const d = await davetKur(k)
    if (d) harita.set(d.id, d)
  }
  return harita
}

export async function davetleriGetir(): Promise<{ gelen: PlanDaveti[]; giden: PlanDaveti[] }> {
  const benimId = motor().benimId
  const hepsi = await tumDavetler()
  return {
    gelen: hepsi.filter((d) => d.alan_id === benimId),
    giden: hepsi.filter((d) => d.gonderen_id === benimId),
  }
}

// Badge on the profile tab: friend requests and invites waiting for me.
export async function bekleyenSayisi(): Promise<number> {
  const durum = await kanalDurumu()
  const engelli = await engellenenler()
  const istekler = [...durum.iliskiler.values()].filter(
    (i) => i.durum === 'bekliyor' && i.yon === 'gelen' && !engelli.has(i.pk),
  ).length
  const { gelen } = await davetleriGetir()
  const bugun = localDateString()
  return istekler + gelen.filter((d) => d.durum === 'bekliyor' && d.tarih >= bugun).length
}

// The sender withdraws an invite; the card turns into "cancelled" for both.
export async function davetiIptalEt(davetId: string): Promise<void> {
  const m = motor()
  const [k] = (await m.anahtarIle([`davet:${davetId}`])).filter((x) => x.tur === TUR.davet && x.yazar === m.benimId)
  await kanalDurumu()
  const kanal = k ? kanalBilgisi(k.konu) : undefined
  if (!k || !kanal || !nesneMi(k.veri)) throw new Error('Davet bulunamadı.')
  await m.yayinla(kanal, TUR.davet, `davet:${davetId}`, { ...k.veri, iptal: true, zaman: simdiMs() })
}

export async function davetYanitla(davetId: string, kabul: boolean): Promise<void> {
  const m = motor()
  const [k] = (await m.anahtarIle([`davet:${davetId}`])).filter((x) => x.tur === TUR.davet)
  await kanalDurumu()
  const kanal = k ? kanalBilgisi(k.konu) : undefined
  if (!k || !kanal) throw new Error('Davet bulunamadı.')
  await m.yayinla(kanal, TUR.davetYanit, `davet-yanit:${davetId}`, { durum: kabul ? 'kabul' : 'red', zaman: simdiMs() })
  if (k.yazar !== m.benimId) {
    const ad = (await benimProfilVerim())?.ad ?? UYGULAMA_ADI
    const baslik = (nesneMi(k.veri) && metinAl(k.veri.baslik, 120)) || 'Plan'
    bildirArkaplanda([k.yazar], {
      tur: 'davet',
      baslik: ad,
      govde: `${kabul ? 'Geliyor' : 'Gelemiyor'}: ${baslik}`,
      git: `dm:${m.benimId}`,
      etiket: `dm:${m.benimId}`,
    })
  }
}
