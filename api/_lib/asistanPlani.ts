// The assistant's planning side (used by api/chat.ts): who the user can
// plan with, when they are all free, and checking the plan the model hands
// back.
//
// The client sends its friends and groups under short handles (k1, g1) with
// only their BUSY time ranges, the same data the availability layer already
// shares with them; never what fills those ranges. The model refers to people
// by those handles and the client maps them back to accounts. Free slots are
// computed here by code (shared/bosluklar.ts), never by the model.

import {
  bosluklariHesapla,
  dakikaya,
  enAzDakikaSinirla,
  mesgulMu,
  saatliAralik,
  yolPayiSinirla,
  type DoluBlok,
  type SaatPenceresi,
} from '../../shared/bosluklar.js'

export interface AsistanKisisi {
  ref: string
  ad: string
  kullaniciAdi: string | null
  // Only friends can get an invite; other group members are reachable
  // through a group plan.
  arkadas: boolean
  // Someone who doesn't share availability arrives with no blocks: that is
  // "unknown", not "free".
  paylasiyor: boolean
  bloklar: DoluBlok[]
  // The hours they're usually free, when they set them.
  pencere: SaatPenceresi | null
}

export interface AsistanGrubu {
  ref: string
  ad: string
  uyeler: string[] // person handles, without the user
}

export interface AsistanBaglami {
  benimAdim: string
  benimBloklarim: DoluBlok[]
  benimPencerem: SaatPenceresi | null
  // The user's travel buffer, kept free around busy ranges in suggestions.
  yolPayiDk: number
  kisiler: AsistanKisisi[]
  gruplar: AsistanGrubu[]
  // The last date the busy ranges above cover; after it nobody's calendar
  // is known, so nobody may look free.
  sonGun: string | null
}

export interface Zaman {
  bugun: string // YYYY-MM-DD, the user's local date
  simdiSaat: string // HH:MM, the user's local time ('' when unknown)
}

const AZAMI_KISI = 80
const AZAMI_GRUP = 30
const AZAMI_UYE = 40
const AZAMI_BLOK = 400
// How far ahead relative dates are spelled out for the model.
export const TAKVIM_GUN_SAYISI = 14
// Upper bound for days in one availability lookup.
const AZAMI_ARAMA_GUNU = 21
// The coverage assumed when the client doesn't say (two weeks).
const VARSAYILAN_KAPSAM_GUNU = 14

const TARIH = /^\d{4}-\d{2}-\d{2}$/
const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/
const REF = /^[kg]\d{1,3}$/

function metin(v: unknown, uzunluk = 120): string {
  return typeof v === 'string' ? v.trim().slice(0, uzunluk) : ''
}

function pencereOku(ham: unknown): SaatPenceresi | null {
  if (typeof ham !== 'object' || ham === null) return null
  const { baslangic, bitis } = ham as Record<string, unknown>
  return SAAT.test(String(baslangic)) && SAAT.test(String(bitis)) && String(bitis) > String(baslangic)
    ? { baslangic: String(baslangic), bitis: String(bitis) }
    : null
}

function bloklariOku(ham: unknown): DoluBlok[] {
  if (!Array.isArray(ham)) return []
  return ham
    .slice(0, AZAMI_BLOK)
    .filter(
      (b): b is DoluBlok =>
        typeof b === 'object' &&
        b !== null &&
        TARIH.test(String(b.tarih)) &&
        SAAT.test(String(b.baslangic)) &&
        SAAT.test(String(b.bitis)),
    )
    .map((b) => ({ tarih: b.tarih, baslangic: b.baslangic, bitis: b.bitis }))
}

// Untrusted JSON to a context. Anything malformed is dropped, so a broken
// client still gets the plain assistant instead of an error.
export function baglamiOku(ham: unknown): AsistanBaglami {
  const g = typeof ham === 'object' && ham !== null ? (ham as Record<string, unknown>) : {}

  const kisiler: AsistanKisisi[] = (Array.isArray(g.kisiler) ? g.kisiler.slice(0, AZAMI_KISI) : [])
    .filter((k): k is Record<string, unknown> => typeof k === 'object' && k !== null)
    .map((k) => ({
      ref: metin(k.ref, 5),
      ad: metin(k.ad, 80),
      kullaniciAdi: metin(k.kullaniciAdi, 40) || null,
      arkadas: k.arkadas === true,
      paylasiyor: k.paylasiyor === true,
      bloklar: bloklariOku(k.bloklar),
      pencere: pencereOku(k.pencere),
    }))
    .filter((k) => REF.test(k.ref) && k.ref.startsWith('k') && k.ad)

  const kisiRefleri = new Set(kisiler.map((k) => k.ref))
  const gruplar: AsistanGrubu[] = (Array.isArray(g.gruplar) ? g.gruplar.slice(0, AZAMI_GRUP) : [])
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map((x) => ({
      ref: metin(x.ref, 5),
      ad: metin(x.ad, 80),
      uyeler: (Array.isArray(x.uyeler) ? x.uyeler.slice(0, AZAMI_UYE) : [])
        .map((u) => metin(u, 5))
        .filter((u) => kisiRefleri.has(u)),
    }))
    .filter((x) => REF.test(x.ref) && x.ref.startsWith('g') && x.ad)

  return {
    benimAdim: metin(g.benimAdim, 80) || 'Kullanıcı',
    benimBloklarim: bloklariOku(g.benimBloklarim),
    benimPencerem: pencereOku(g.benimPencerem),
    yolPayiDk: yolPayiSinirla(g.yolPayiDk),
    kisiler,
    gruplar,
    sonGun: TARIH.test(metin(g.sonGun, 10)) ? metin(g.sonGun, 10) : null,
  }
}

// ---------- dates ----------

const GUN_ADLARI = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

// Calendar arithmetic on YYYY-MM-DD in UTC, so the server's own time zone
// never shifts a day.
export function tarihEkle(tarih: string, gun: number): string {
  const [y, a, g] = tarih.split('-').map(Number)
  return new Date(Date.UTC(y, a - 1, g + gun)).toISOString().slice(0, 10)
}

export function gunAdi(tarih: string): string {
  const [y, a, g] = tarih.split('-').map(Number)
  return GUN_ADLARI[new Date(Date.UTC(y, a - 1, g)).getUTCDay()]
}

// The last date availability can be judged for: what the client sent busy
// ranges for, and never beyond one lookup's reach.
export function musaitlikUfku(b: AsistanBaglami, z: Zaman): string {
  const kapsam = b.sonGun ?? tarihEkle(z.bugun, VARSAYILAN_KAPSAM_GUNU - 1)
  const sinir = tarihEkle(z.bugun, AZAMI_ARAMA_GUNU - 1)
  return kapsam < sinir ? kapsam : sinir
}

// One line per day, so "Saturday" or "next weekend" never needs date
// arithmetic from the model, which it often gets wrong.
export function takvimTablosu(bugun: string, gunSayisi = TAKVIM_GUN_SAYISI): string {
  return Array.from({ length: gunSayisi }, (_, i) => {
    const t = tarihEkle(bugun, i)
    const not = i === 0 ? ' (bugün)' : i === 1 ? ' (yarın)' : ''
    return `${t} ${gunAdi(t)}${not}`
  }).join('\n')
}

// ---------- prompt ----------

export function baglamMetni(b: AsistanBaglami): string {
  if (b.kisiler.length === 0 && b.gruplar.length === 0) {
    return '(Henüz arkadaşı ya da grubu yok; sadece kendi planlarını kurabilir.)'
  }
  const adlar = new Map(b.kisiler.map((k) => [k.ref, k]))
  const satirlar: string[] = []
  for (const k of b.kisiler.filter((x) => x.arkadas)) {
    const kadi = k.kullaniciAdi ? ` (@${k.kullaniciAdi})` : ''
    const durum = k.paylasiyor ? 'takvimini paylaşıyor' : 'takvimini paylaşmıyor, müsaitliği bilinmiyor'
    satirlar.push(`${k.ref}: ${k.ad}${kadi} — ${durum}`)
  }
  for (const g of b.gruplar) {
    const uyeler = g.uyeler.map((u) => {
      const k = adlar.get(u)!
      return k.arkadas ? `${k.ad} (${u})` : `${k.ad} (${u}, arkadaşın değil)`
    })
    satirlar.push(`${g.ref}: ${g.ad} grubu — üyeler: ${uyeler.join(', ') || 'yalnızca sen'}`)
  }
  return satirlar.join('\n')
}

// ---------- tools ----------

export const MUSAITLIK_FONKSIYONU = {
  name: 'musaitlik_bul',
  description:
    'Kullanıcının ve seçilen kişilerin (ya da grubun) HEPSİNİN boş olduğu zaman aralıklarını hesaplar. Başkalarıyla plan kurarken saat belli değilse plan_kur\'dan ÖNCE çağır ve saati dönen aralıklardan seç. Kişisiz çağrılırsa sadece kullanıcının boş zamanlarını verir.',
  parameters: {
    type: 'OBJECT',
    properties: {
      kisiler: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Kişi kodları (k1, k2...). Grup seçildiyse boş bırak.' },
      grup: { type: 'STRING', description: 'Grup kodu (g1...) ya da boş string' },
      gunler: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Bakılacak tarihler, YYYY-MM-DD. Boşsa önümüzdeki 7 gün.' },
      en_az_dakika: { type: 'STRING', description: 'Planın süresi, dakika (sayı, string olarak)' },
      en_erken: { type: 'STRING', description: 'Günün en erken saati HH:MM ya da boş string (ör. akşam için 18:00)' },
      en_gec: { type: 'STRING', description: 'Planın en geç bitebileceği saat HH:MM ya da boş string' },
    },
    required: ['kisiler', 'grup', 'gunler', 'en_az_dakika', 'en_erken', 'en_gec'],
  },
}

export const PLAN_KUR_FONKSIYONU = {
  name: 'plan_kur',
  description:
    'Kullanıcı bir plan kurmak/eklemek istediğinde bütün planı tek seferde hazırlar: ne, ne zaman, nerede, kimle. Kullanıcı bunu ekranda tek dokunuşla onaylar; davetler ve grup planı ancak o zaman gider. Kullanıcı sadece soru soruyorsa çağırma.',
  parameters: {
    type: 'OBJECT',
    properties: {
      kategori: { type: 'STRING', enum: ['mekan', 'tarif', 'urun', 'etkinlik', 'not'] },
      baslik: { type: 'STRING', description: 'Kısa, okunabilir başlık (max 60 karakter), kişi ya da grup adı olmadan' },
      emoji: { type: 'STRING', description: 'Plana uyan tek bir emoji (☕ 🍽️ 🎬 ⚽ 🎉 ...)' },
      tarih: { type: 'STRING', description: 'YYYY-MM-DD, takvim tablosundan; bilinmiyorsa boş string' },
      saat: { type: 'STRING', description: 'HH:MM ya da boş string' },
      sure: { type: 'STRING', description: 'Dakika (sayı, string olarak)' },
      tum_gun: {
        type: 'BOOLEAN',
        description: 'Plan bütün günü kaplıyorsa (kamp, gezi, festival, taşınma, düğün) true; o zaman saat ve süre boş string',
      },
      konum: { type: 'STRING', description: 'Yalnızca kullanıcı söylediyse yer adı, yoksa boş string — uydurma' },
      oncelik: { type: 'STRING', enum: ['dusuk', 'orta', 'yuksek'] },
      not: { type: 'STRING', description: 'Davete eklenecek kısa not ya da boş string' },
      kisiler: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Davet edilecek arkadaş kodları (k1...). Grup planıysa boş.' },
      grup: { type: 'STRING', description: 'Grup planıysa grup kodu (g1...), değilse boş string' },
    },
    required: ['kategori', 'baslik', 'emoji', 'tarih', 'saat', 'sure', 'tum_gun', 'konum', 'oncelik', 'not', 'kisiler', 'grup'],
  },
}

interface Secim {
  kisiler: AsistanKisisi[]
  grup: AsistanGrubu | null
}

// Handles the model gave, to people. A group wins over a person list (a
// group plan reaches every member); outside a group only friends count.
function kimlerOku(b: AsistanBaglami, kisilerHam: unknown, grupHam: unknown): Secim {
  const grup = b.gruplar.find((g) => g.ref === metin(grupHam, 5)) ?? null
  if (grup) {
    return { grup, kisiler: b.kisiler.filter((k) => grup.uyeler.includes(k.ref)) }
  }
  const refler = new Set((Array.isArray(kisilerHam) ? kisilerHam : []).map((r) => metin(r, 5)))
  return { grup: null, kisiler: b.kisiler.filter((k) => k.arkadas && refler.has(k.ref)) }
}

// The response to a musaitlik_bul call.
export function musaitlikBul(args: Record<string, unknown>, b: AsistanBaglami, z: Zaman): Record<string, unknown> {
  const secim = kimlerOku(b, args.kisiler, args.grup)
  const ufuk = musaitlikUfku(b, z)
  const istenen = (Array.isArray(args.gunler) ? args.gunler : [])
    .map((t) => metin(t, 10))
    .filter((t) => TARIH.test(t) && t >= z.bugun)
  let gunler = [...new Set(istenen.filter((t) => t <= ufuk))].sort()
  const katilimcilar = [b.benimAdim, ...secim.kisiler.map((k) => k.ad)]
  const bilinmeyenler = secim.kisiler.filter((k) => !k.paylasiyor).map((k) => k.ad)

  // Only dates past what anyone's calendar covers: saying "free" there
  // would be a guess.
  if (istenen.length > 0 && gunler.length === 0) {
    return {
      katilimcilar,
      takvimi_bilinmeyenler: bilinmeyenler,
      bosluklar: [],
      not: `Müsaitlik yalnızca ${ufuk} tarihine kadar biliniyor. Bu tarih için saati kullanıcının söylediğine göre koy ya da boş bırak; kimsenin boş olduğunu iddia etme.`,
    }
  }
  if (gunler.length === 0) {
    gunler = Array.from({ length: 7 }, (_, i) => tarihEkle(z.bugun, i)).filter((t) => t <= ufuk)
  }
  const bosluklar = bosluklariHesapla({
    gunler,
    katilimcilar: [
      { bloklar: b.benimBloklarim, pencere: b.benimPencerem },
      ...secim.kisiler.map((k) => ({ bloklar: k.bloklar, pencere: k.pencere })),
    ],
    enErken: SAAT.test(metin(args.en_erken, 5)) ? metin(args.en_erken, 5) : undefined,
    enGec: SAAT.test(metin(args.en_gec, 5)) ? metin(args.en_gec, 5) : undefined,
    enAzDakika: enAzDakikaSinirla(args.en_az_dakika),
    yolPayiDk: b.yolPayiDk,
    simdiTarih: z.bugun,
    simdiSaat: z.simdiSaat,
  })

  return {
    katilimcilar,
    takvimi_bilinmeyenler: bilinmeyenler,
    bosluklar: bosluklar.slice(0, 30).map((a) => ({ ...saatliAralik(a), gun: gunAdi(a.tarih) })),
    not:
      bosluklar.length === 0
        ? 'Bu günlerde herkesin birden boş olduğu yeterli bir aralık yok. Kullanıcıya söyle, başka gün ya da daha kısa süre öner.'
        : 'Saati SADECE bu aralıkların içinden seç.',
  }
}

export interface AsistanPlani {
  kategori: string
  baslik: string
  emoji: string | null
  tarih: string | null
  saat: string | null
  // Takes the whole day: saat and sure are null.
  tumGun: boolean
  konum: string | null
  oncelik: string
  sure: number | null
  ozetNot: string | null
  // Handles; the client maps them back to accounts.
  kisiler: string[]
  grup: string | null
  // Checked by code for the chosen time: who is busy then, whose calendar
  // is unknown. null when there is no time to check, or the date is past
  // what the busy ranges cover.
  uygunluk: { mesgul: string[]; bilinmiyor: string[] } | null
}

const KATEGORILER = ['mekan', 'tarif', 'urun', 'etkinlik', 'not']
const ONCELIKLER = ['dusuk', 'orta', 'yuksek']

function emojiOku(v: unknown): string | null {
  const e = metin(v, 16)
  return e && /\p{Extended_Pictographic}/u.test(e) && !/[\p{L}\p{N}]/u.test(e) ? e : null
}

export function planiDogrula(args: Record<string, unknown>, b: AsistanBaglami, z: Zaman): AsistanPlani | null {
  const baslik = metin(args.baslik, 60)
  if (!baslik) return null

  const tarihHam = metin(args.tarih, 10)
  const tarih = TARIH.test(tarihHam) && tarihHam >= z.bugun ? tarihHam : null
  // An all-day plan needs a day; without one the flag means nothing.
  const tumGun = (args.tum_gun === true || args.tum_gun === 'true') && tarih !== null
  const saatHam = metin(args.saat, 5)
  const saat = !tumGun && SAAT.test(saatHam) ? saatHam : null

  let sure: number | null = null
  const sureSayi = Number(args.sure)
  if (!tumGun && !Number.isNaN(sureSayi) && sureSayi > 0) sure = Math.min(Math.round(sureSayi), 1440)

  const secim = kimlerOku(b, args.kisiler, args.grup)

  let uygunluk: AsistanPlani['uygunluk'] = null
  if (tarih && (saat || tumGun) && tarih <= musaitlikUfku(b, z)) {
    // All day: anything busy that day is a clash.
    const bas = saat ? dakikaya(saat) : 0
    const bit = saat ? bas + (sure ?? 60) : 24 * 60
    const mesgul = secim.kisiler.filter((k) => k.paylasiyor && mesgulMu(k, tarih, bas, bit)).map((k) => k.ad)
    if (mesgulMu({ bloklar: b.benimBloklarim }, tarih, bas, bit)) mesgul.unshift('Sen')
    uygunluk = { mesgul, bilinmiyor: secim.kisiler.filter((k) => !k.paylasiyor).map((k) => k.ad) }
  }

  return {
    kategori: KATEGORILER.includes(String(args.kategori)) ? String(args.kategori) : 'etkinlik',
    baslik,
    emoji: emojiOku(args.emoji),
    tarih,
    saat,
    tumGun,
    konum: metin(args.konum, 120) || null,
    oncelik: ONCELIKLER.includes(String(args.oncelik)) ? String(args.oncelik) : 'orta',
    sure,
    ozetNot: metin(args.not ?? args.ozet_not, 300) || null,
    kisiler: secim.grup ? [] : secim.kisiler.map((k) => k.ref),
    grup: secim.grup?.ref ?? null,
    uygunluk,
  }
}
