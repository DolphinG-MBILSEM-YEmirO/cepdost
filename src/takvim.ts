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
function tekrarlariUret(etkinlik: HamEtkinlik, pencereSonu: Date): Date[] {
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

  if (sıklık === 'WEEKLY' && gunler.length > 0) {
    const haftaBasi = new Date(ilk)
    haftaBasi.setDate(haftaBasi.getDate() - haftaBasi.getDay())
    for (let h = 0; sonuc.length < AZAMI; h += aralik) {
      const hafta = new Date(haftaBasi)
      hafta.setDate(hafta.getDate() + h * 7)
      if (hafta > son) break
      for (const g of gunler) {
        const tarih = new Date(hafta)
        tarih.setDate(tarih.getDate() + g)
        tarih.setHours(ilk.getHours(), ilk.getMinutes(), 0, 0)
        if (tarih >= ilk && tarih <= son) sonuc.push(tarih)
        if (sayi && sonuc.length >= sayi) break
      }
      if (sayi && sonuc.length >= sayi) break
    }
  } else {
    for (let i = 0; sonuc.length < AZAMI; i++) {
      const tarih = new Date(ilk)
      if (sıklık === 'DAILY') tarih.setDate(tarih.getDate() + i * aralik)
      else if (sıklık === 'WEEKLY') tarih.setDate(tarih.getDate() + i * aralik * 7)
      else if (sıklık === 'MONTHLY') tarih.setMonth(tarih.getMonth() + i * aralik)
      else tarih.setFullYear(tarih.getFullYear() + i * aralik)

      if (tarih > son) break
      sonuc.push(tarih)
      if (sayi && sonuc.length >= sayi) break
    }
  }

  return sonuc.length > 0 ? sonuc.sort((a, b) => a.getTime() - b.getTime()) : [ilk]
}

// ---------- içe aktarma ----------

// Geçmişi almanın faydası yok; çok uzak gelecek de gereksiz veri.
const GECMIS_GUN = 1
const GELECEK_GUN = 90

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

    for (const baslangic of tekrarlariUret(ham, ust)) {
      if (baslangic < alt || baslangic > ust) continue

      const bitis = new Date(baslangic.getTime() + sureMs)
      // Gece yarısını aşanları güne sabitliyoruz — müsaitlik göstermek için
      // yeterli, veri modelini bölmeye değmez (musaitlikSenkron ile aynı yaklaşım).
      const ayniGun = tarihStr(bitis) === tarihStr(baslangic)

      const anahtar = `takvim:${ham.uid || ham.ozet}:${baslangic.getTime()}`
      sonuc.set(anahtar, {
        id: anahtar,
        baslik: ham.ozet || 'Takvim etkinliği',
        tarih: tarihStr(baslangic),
        baslangic: ham.tumGun ? '00:00' : saatStr(baslangic),
        bitis: ham.tumGun ? '23:59' : ayniGun ? saatStr(bitis) : '23:59',
        konum: ham.konum,
        tumGun: ham.tumGun,
        iceAktarma: simdi,
      })
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
    const [ss, dd] = plan.saat.split(':').map(Number)
    const b = new Date(2000, 0, 1, ss, dd)
    b.setMinutes(b.getMinutes() + (plan.sure && plan.sure > 0 ? plan.sure : 60))
    bitis = icsZaman(plan.tarih, `${String(b.getHours()).padStart(2, '0')}:${String(b.getMinutes()).padStart(2, '0')}`)
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
  URL.revokeObjectURL(url)
}

// Kayıt tipinden .ics'e köprü — çağrı yerlerinde alan eşlemesi tekrarlanmasın.
export function kayittanIcsIndir(kayit: Kayit): void {
  planiTakvimeIndir({
    baslik: kayit.baslik ?? kayit.hamBaslik ?? 'CepDost planı',
    tarih: kayit.tarih!,
    saat: kayit.saat,
    sure: kayit.sure,
    konum: kayit.konum,
    notlar: kayit.ozetNot,
  })
}
