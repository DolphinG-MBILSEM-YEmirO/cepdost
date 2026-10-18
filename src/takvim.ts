import { db, type Kayit, type TakvimEtkinligi } from './db'

// F15 — telefon takvimi entegrasyonu.
//
// ÖNEMLİ KISIT: Web'de telefonun takvim uygulamasını doğrudan okuyan bir API
// YOK (iOS'ta da Android'de de). Bu yüzden erişim, kullanıcının kendi
// takviminden aldığı iCalendar (.ics) bağlantısıyla veya dosyayla oluyor —
// izni kullanıcı bilerek ve açıkça veriyor, istediğinde tek dokunuşla geri
// alıyor. Tersi yön (CepDost planını telefona ekleme) .ics indirmesiyle
// çalışıyor; bu her platformda destekleniyor.

const AYAR_ANAHTARI = 'cepdost_takvim'

export interface TakvimAyari {
  // Kullanıcının açık izni. false ise hiçbir şey içe aktarılmaz, saklanmaz.
  izin: boolean
  icsUrl: string | null
  sonSenkron: number | null
  sonHata: string | null
}

const VARSAYILAN: TakvimAyari = { izin: false, icsUrl: null, sonSenkron: null, sonHata: null }

export function takvimAyariOku(): TakvimAyari {
  try {
    const ham = localStorage.getItem(AYAR_ANAHTARI)
    if (!ham) return VARSAYILAN
    return { ...VARSAYILAN, ...(JSON.parse(ham) as Partial<TakvimAyari>) }
  } catch {
    return VARSAYILAN
  }
}

export function takvimAyariYaz(ayar: TakvimAyari): void {
  localStorage.setItem(AYAR_ANAHTARI, JSON.stringify(ayar))
}

// İzin kapatıldığında içe aktarılmış her şey silinir. "Kapattım ama veri
// duruyor" kabul edilebilir bir davranış değil — müsaitlik paylaşımında da
// aynı ilkeyi uyguluyoruz (bkz. musaitlikSenkron.ts).
export async function takvimBaglantisiniKaldir(): Promise<void> {
  await db.takvimEtkinlikleri.clear()
  takvimAyariYaz({ ...VARSAYILAN })
}

// ---------- ICS ayrıştırma ----------

// ICS satırları 75 oktetten sonra katlanıyor; devam satırları boşluk/tab ile
// başlıyor. Ayrıştırmadan önce geri açmak şart.
function satirlariAc(metin: string): string[] {
  const ham = metin.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const acik: string[] = []
  for (const satir of ham) {
    if ((satir.startsWith(' ') || satir.startsWith('\t')) && acik.length > 0) {
      acik[acik.length - 1] += satir.slice(1)
    } else {
      acik.push(satir)
    }
  }
  return acik
}

function kacisiCoz(deger: string): string {
  return deger
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

interface HamEtkinlik {
  uid: string
  ozet: string
  konum: string | null
  baslangic: Date | null
  bitis: Date | null
  tumGun: boolean
  rrule: string | null
}

// DTSTART;TZID=Europe/Istanbul:20260810T190000 gibi satırlar.
// Not: TZID'yi yok sayıp yerel saat kabul ediyoruz. Doğru çözüm IANA saat
// dilimi veritabanı gerektirir; kullanıcıların takvimi neredeyse her zaman
// kendi saat diliminde olduğu için pratikte fark yaratmıyor. UTC ("Z" ekli)
// değerler ise doğru şekilde yerel saate çevriliyor.
function tarihCoz(ham: string): { tarih: Date | null; tumGun: boolean } {
  const sadeceTarih = /^(\d{4})(\d{2})(\d{2})$/.exec(ham)
  if (sadeceTarih) {
    const [, y, a, g] = sadeceTarih
    return { tarih: new Date(Number(y), Number(a) - 1, Number(g)), tumGun: true }
  }

  const tamZaman = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(ham)
  if (!tamZaman) return { tarih: null, tumGun: false }

  const [, y, a, g, ss, dd, sn, utc] = tamZaman
  const tarih = utc
    ? new Date(Date.UTC(Number(y), Number(a) - 1, Number(g), Number(ss), Number(dd), Number(sn)))
    : new Date(Number(y), Number(a) - 1, Number(g), Number(ss), Number(dd), Number(sn))
  return { tarih, tumGun: false }
}

function hamEtkinlikleriCikar(ics: string): HamEtkinlik[] {
  const satirlar = satirlariAc(ics)
  const etkinlikler: HamEtkinlik[] = []
  let mevcut: HamEtkinlik | null = null

  for (const satir of satirlar) {
    if (satir === 'BEGIN:VEVENT') {
      mevcut = { uid: '', ozet: '', konum: null, baslangic: null, bitis: null, tumGun: false, rrule: null }
      continue
    }
    if (satir === 'END:VEVENT') {
      if (mevcut?.baslangic) etkinlikler.push(mevcut)
      mevcut = null
      continue
    }
    if (!mevcut) continue

    const ayirac = satir.indexOf(':')
    if (ayirac < 0) continue
    const anahtarTam = satir.slice(0, ayirac)
    const deger = satir.slice(ayirac + 1)
    const anahtar = anahtarTam.split(';')[0].toUpperCase()

    switch (anahtar) {
      case 'UID':
        mevcut.uid = deger.trim()
        break
      case 'SUMMARY':
        mevcut.ozet = kacisiCoz(deger)
        break
      case 'LOCATION':
        mevcut.konum = kacisiCoz(deger) || null
        break
      case 'DTSTART': {
        const { tarih, tumGun } = tarihCoz(deger.trim())
        mevcut.baslangic = tarih
        mevcut.tumGun = tumGun || anahtarTam.toUpperCase().includes('VALUE=DATE')
        break
      }
      case 'DTEND': {
        mevcut.bitis = tarihCoz(deger.trim()).tarih
        break
      }
      case 'RRULE':
        mevcut.rrule = deger.trim()
        break
    }
  }

  return etkinlikler
}

// ---------- tekrar eden etkinlikler ----------

const GUN_KODLARI: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

// Tam RRULE desteği (BYSETPOS, BYMONTHDAY, EXDATE...) küçük bir kütüphane
// demek. Burada gerçek hayatta ezici çoğunluğu oluşturan basit kalıplar
// destekleniyor: günlük/haftalık/aylık/yıllık + INTERVAL + COUNT/UNTIL +
// haftalıkta BYDAY. Desteklenmeyen bir kural varsa etkinlik yalnızca ilk
// tarihiyle içe aktarılır — eksik göstermek, yanlış göstermekten iyidir.
// Occurrences before `windowStart` are still walked (COUNT counts from the
// first occurrence) but not returned, so a series that began years ago still
// yields its upcoming dates instead of running out of room in the past.
function tekrarlariUret(etkinlik: HamEtkinlik, pencereSonu: Date, windowStart: Date): Date[] {
  const ilk = etkinlik.baslangic!
  if (!etkinlik.rrule) return [ilk]

  const parcalar = new Map<string, string>()
  for (const p of etkinlik.rrule.split(';')) {
    const [k, v] = p.split('=')
    if (k && v) parcalar.set(k.toUpperCase(), v)
  }

  const sıklık = parcalar.get('FREQ')
  if (!sıklık || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(sıklık)) return [ilk]

  const aralik = Math.max(1, Number(parcalar.get('INTERVAL') ?? 1))
  const sayi = parcalar.get('COUNT') ? Number(parcalar.get('COUNT')) : null
  const untilHam = parcalar.get('UNTIL')
  const until = untilHam ? tarihCoz(untilHam).tarih : null
  const son = until && until < pencereSonu ? until : pencereSonu

  const gunler = parcalar.get('BYDAY')
    ? parcalar
        .get('BYDAY')!
        .split(',')
        .map((g) => GUN_KODLARI[g.slice(-2).toUpperCase()])
        .filter((g) => g !== undefined)
    : []

  const sonuc: Date[] = []
  // Sonsuz döngüye karşı sert üst sınır — bozuk bir RRULE tarayıcıyı kilitlemesin.
  const AZAMI = 400
  // Separate cap on steps walked, so old series can reach the window
  // (a daily event from ten years ago is ~3650 steps).
  const MAX_STEPS = 20000
  let occurrences = 0

  // Returns false once COUNT is used up.
  const add = (tarih: Date): boolean => {
    occurrences++
    if (tarih >= windowStart) sonuc.push(tarih)
    return !(sayi && occurrences >= sayi)
  }

  if (sıklık === 'WEEKLY' && gunler.length > 0) {
    const haftaBasi = new Date(ilk)
    haftaBasi.setDate(haftaBasi.getDate() - haftaBasi.getDay())
    let devam = true
    for (let h = 0, step = 0; devam && sonuc.length < AZAMI && step < MAX_STEPS; h += aralik, step++) {
      const hafta = new Date(haftaBasi)
      hafta.setDate(hafta.getDate() + h * 7)
      if (hafta > son) break
      for (const g of [...gunler].sort((a, b) => a - b)) {
        const tarih = new Date(hafta)
        tarih.setDate(tarih.getDate() + g)
        tarih.setHours(ilk.getHours(), ilk.getMinutes(), 0, 0)
        if (tarih < ilk || tarih > son) continue
        if (!add(tarih)) {
          devam = false
          break
        }
      }
    }
  } else {
    for (let i = 0; sonuc.length < AZAMI && i < MAX_STEPS; i++) {
      const tarih = new Date(ilk)
      if (sıklık === 'DAILY') tarih.setDate(tarih.getDate() + i * aralik)
      else if (sıklık === 'WEEKLY') tarih.setDate(tarih.getDate() + i * aralik * 7)
      else if (sıklık === 'MONTHLY') tarih.setMonth(tarih.getMonth() + i * aralik)
      else tarih.setFullYear(tarih.getFullYear() + i * aralik)

      if (tarih > son) break
      // RFC 5545: an occurrence that would fall on a day the month does not
      // have (the 31st in November, 29 February) is skipped, not moved to
      // the next month.
      if ((sıklık === 'MONTHLY' || sıklık === 'YEARLY') && tarih.getDate() !== ilk.getDate()) continue
      if (!add(tarih)) break
    }
  }

  return sonuc.sort((a, b) => a.getTime() - b.getTime())
}

// ---------- içe aktarma ----------

// Geçmişi almanın faydası yok; çok uzak gelecek de gereksiz veri.
const GECMIS_GUN = 1
const GELECEK_GUN = 90
// Upper bound for how many days one timed event may cover.
const AZAMI_GUN_SAYISI = 31

function tarihStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function saatStr(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function icsiEtkinliklereCevir(ics: string, bugun = new Date()): TakvimEtkinligi[] {
  const alt = new Date(bugun)
  alt.setDate(alt.getDate() - GECMIS_GUN)
  alt.setHours(0, 0, 0, 0)
  const ust = new Date(bugun)
  ust.setDate(ust.getDate() + GELECEK_GUN)
  ust.setHours(23, 59, 59, 999)

  const simdi = Date.now()
  const sonuc = new Map<string, TakvimEtkinligi>()

  for (const ham of hamEtkinlikleriCikar(ics)) {
    if (!ham.baslangic) continue

    // Süre ilk tekrardan hesaplanıyor; tekrar eden etkinliklerde tüm
    // örnekler aynı uzunlukta olur.
    const sureMs =
      ham.bitis && ham.bitis > ham.baslangic
        ? ham.bitis.getTime() - ham.baslangic.getTime()
        : 60 * 60 * 1000

    for (const baslangic of tekrarlariUret(ham, ust, alt)) {
      if (baslangic < alt || baslangic > ust) continue

      const bitis = new Date(baslangic.getTime() + sureMs)
      const anahtar = `takvim:${ham.uid || ham.ozet}:${baslangic.getTime()}`

      if (ham.tumGun) {
        sonuc.set(anahtar, {
          id: anahtar,
          baslik: ham.ozet || 'Takvim etkinliği',
          tarih: tarihStr(baslangic),
          baslangic: '00:00',
          bitis: '23:59',
          konum: ham.konum,
          tumGun: true,
          iceAktarma: simdi,
        })
        continue
      }

      // A timed event that runs past midnight becomes one row per day, so
      // every day it covers counts as busy (a weekend trip blocks Saturday
      // too, not just Friday evening).
      const gun = new Date(baslangic)
      gun.setHours(0, 0, 0, 0)
      for (let i = 0; i < AZAMI_GUN_SAYISI && gun <= bitis; i++, gun.setDate(gun.getDate() + 1)) {
        const tarih = tarihStr(gun)
        const ilkGun = tarih === tarihStr(baslangic)
        const sonGun = tarih === tarihStr(bitis)
        const bas = ilkGun ? saatStr(baslangic) : '00:00'
        const bit = sonGun ? saatStr(bitis) : '23:59'
        if (bit <= bas || gun < alt || gun > ust) continue
        const id = ilkGun ? anahtar : `${anahtar}:${tarih}`
        sonuc.set(id, {
          id,
          baslik: ham.ozet || 'Takvim etkinliği',
          tarih,
          baslangic: bas,
          bitis: bit,
          konum: ham.konum,
          tumGun: false,
          iceAktarma: simdi,
        })
      }
    }
  }

  return Array.from(sonuc.values())
}

// Dosyadan ya da URL'den gelen ICS metnini yerel tabloya yazar. Tam
// değiştirme: takvimden silinen bir etkinlik CepDost'ta da kalmamalı.
export async function icsiIceAktar(ics: string): Promise<number> {
  const etkinlikler = icsiEtkinliklereCevir(ics)
  await db.transaction('rw', db.takvimEtkinlikleri, async () => {
    await db.takvimEtkinlikleri.clear()
    if (etkinlikler.length > 0) await db.takvimEtkinlikleri.bulkPut(etkinlikler)
  })
  return etkinlikler.length
}

// Tarayıcı, başka bir sitedeki .ics dosyasını CORS yüzünden okuyamaz — bu
// yüzden çekme işi edge function'a yaptırılıyor (bkz. supabase/functions/takvim).
export async function icsUrldenIceAktar(url: string): Promise<number> {
  const { sb, sosyalAktif } = await import('./sosyal/supabase')
  if (!sosyalAktif) throw new Error('Sunucu bağlantısı yapılandırılmamış.')

  const { data, error } = await sb().functions.invoke('takvim', { body: { url } })
  if (error) throw new Error('Takvim alınamadı — bağlantıyı kontrol et.')
  const ics = (data as { ics?: string })?.ics
  if (!ics) throw new Error('Bu bağlantıdan takvim verisi gelmedi.')
  return icsiIceAktar(ics)
}

export async function takvimEtkinlikleriniGetir(): Promise<TakvimEtkinligi[]> {
  return db.takvimEtkinlikleri.orderBy('tarih').toArray()
}

// ---------- dışa aktarma ----------

function icsZaman(tarih: string, saat: string | null): string {
  const [y, a, g] = tarih.split('-')
  if (!saat) return `${y}${a}${g}`
  const [ss, dd] = saat.split(':')
  return `${y}${a}${g}T${ss}${dd}00`
}

function icsKacir(metin: string): string {
  return metin.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// Bir planı telefonun takvimine eklemek için .ics üretir. Tarayıcıdan takvime
// yazan bir API olmadığı için standart yol bu: dosya indirilir, telefon onu
// takvim uygulamasında açar.
export function planIcsOlustur(plan: {
  baslik: string
  tarih: string
  saat?: string | null
  sure?: number | null
  konum?: string | null
  notlar?: string | null
}): string {
  const baslangic = icsZaman(plan.tarih, plan.saat ?? null)

  let bitis: string
  if (plan.saat) {
    // Use the plan's real date so a plan that runs past midnight ends on the
    // next day instead of before it starts.
    const b = new Date(`${plan.tarih}T${plan.saat.slice(0, 5)}:00`)
    b.setMinutes(b.getMinutes() + (plan.sure && plan.sure > 0 ? plan.sure : 60))
    bitis = icsZaman(tarihStr(b), saatStr(b))
  } else {
    // Saatsiz plan = tüm gün etkinliği; DTEND ertesi gün olmalı.
    const g = new Date(`${plan.tarih}T00:00:00`)
    g.setDate(g.getDate() + 1)
    bitis = icsZaman(tarihStr(g), null)
  }

  const satirlar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CepDost//TR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@cepdost`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    plan.saat ? `DTSTART:${baslangic}` : `DTSTART;VALUE=DATE:${baslangic}`,
    plan.saat ? `DTEND:${bitis}` : `DTEND;VALUE=DATE:${bitis}`,
    `SUMMARY:${icsKacir(plan.baslik)}`,
    plan.konum ? `LOCATION:${icsKacir(plan.konum)}` : null,
    plan.notlar ? `DESCRIPTION:${icsKacir(plan.notlar)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((s): s is string => s !== null)

  return satirlar.join('\r\n')
}

export function planiTakvimeIndir(plan: Parameters<typeof planIcsOlustur>[0]): void {
  const ics = planIcsOlustur(plan)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${plan.baslik.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40) || 'plan'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Some browsers (iOS Safari, older Firefox) start the download after
  // click() returns; revoking right away can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Kayıt tipinden .ics'e köprü — çağrı yerlerinde alan eşlemesi tekrarlanmasın.
export function kayittanIcsIndir(kayit: Kayit): void {
  planiTakvimeIndir({
    // hamBaslik is '' (not null) for shared items, so ?? would keep it.
    baslik: kayit.baslik || kayit.hamBaslik || 'CepDost planı',
    tarih: kayit.tarih!,
    saat: kayit.saat,
    sure: kayit.sure,
    konum: kayit.konum,
    notlar: kayit.ozetNot,
  })
}
