import Dexie, { type Table } from 'dexie'

// Veri modeli — bkz. proje planı Bölüm 4 + "Hallet" tasarım taşıması
// (2026-08-05). F2 (otomatik sınıflandırma) kategori/baslik/tarih/saat/
// konum/oncelik/sure/ozetNot alanlarını dolduruyor; paylaşım anında bunlar
// null/varsayılan gelir, sınıflandırma arka planda bitince güncellenir —
// id'ler bu yüzden şimdiden stabil, aynı kayıt yerinde güncellenir.

export type Kategori = 'mekan' | 'tarif' | 'urun' | 'etkinlik' | 'not'
export type KaynakTipi = 'gorsel' | 'link' | 'metin'
export type Durum = 'bekliyor' | 'yapildi'
export type Oncelik = 'dusuk' | 'orta' | 'yuksek'

export interface KayitGorsel {
  name: string
  type: string
  blob: Blob
}

// F7 öneri katmanı (Google Places API, 2026-08-06) — sadece kategori
// "mekan" olan kayıtlarda dolabilir. mekanOnerisi: belirli bir mekan adı
// verilmişse gerçek Google yorumlarından çıkarılan özet (Gemini yorumları
// UYDURMUYOR, gerçek metni özetliyor). yakinOneriler: mekan adı
// verilmemişse (sadece "akşam yemeği" gibi bir fikir) kullanıcının konumuna
// göre önerilen birkaç gerçek mekan.
export interface YakinOneri {
  isim: string
  adres: string | null
  puan: number | null
  mesafeMetre: number | null
}

export interface Kayit {
  id: string

  // F2 alanları (paylaşım anında null/varsayılan, sınıflandırma sonrası dolar)
  kategori: Kategori | null
  baslik: string | null
  tarih: string | null // YYYY-MM-DD
  saat: string | null // HH:MM
  // Takes the whole day (a trip, a festival, moving house): no time or
  // duration, and the day counts as busy for friends.
  tumGun?: boolean
  konum: string | null
  oncelik: Oncelik
  sure: number | null // dakika
  ozetNot: string | null
  mekanOnerisi: string | null
  yakinOneriler: YakinOneri[] | null

  // Paylaşımdan/manuel girişten gelen ham veri — sınıflandırma olmasa da
  // arşivde aranabilir/gösterilebilir olsun diye ayrıca saklanıyor
  kaynakTipi: KaynakTipi
  hamBaslik: string
  hamMetin: string
  hamLink: string
  gorseller: KayitGorsel[]

  durum: Durum
  olusturulmaTarihi: number

  // F20: bu plan kiminle yapıldı. Tarihi geçince "anı ekle" çağrısını doğru
  // arşive (gruba ya da arkadaşa) yönlendirmek için tutuluyor. Opsiyonel —
  // tek başına planlarda ve paylaşımdan gelen kayıtlarda boş kalır.
  grupId?: string | null
  grupAdi?: string | null
  arkadasId?: string | null
  arkadasAdi?: string | null
  // Bu kayıt hangi grup planından geldi. Aynı plana ikinci bir kayıt
  // açılmasın ve yanıt "geliyorum"dan çıkınca kayıt kaldırılabilsin diye.
  grupPlanId?: string | null
  // Same for a friend's plan invite: set when I accepted it, so declining
  // later (or the sender cancelling) can take it off my calendar.
  davetId?: string | null
  // The emoji picked for the plan (☕, 🎬...), shown before its title here
  // and on the cards friends see.
  emoji?: string | null
  // Anı eklendiyse tekrar tekrar sorulmasın.
  aniEklendi?: boolean
}

// F15 — telefon takviminden içe aktarılan etkinlikler. CepDost kayıtlarından
// ayrı bir tabloda duruyorlar: kullanıcının yazdığı planlar ile dışarıdan
// gelen veriyi karıştırmak istemiyoruz — "takvim bağlantısını kaldır"
// dendiğinde tek seferde silinebilmeli ve arşivde plan gibi görünmemeli.
export interface TakvimEtkinligi {
  // ICS'teki UID'den türetilen kararlı anahtar; tekrar içe aktarımda aynı
  // etkinlik ikinci kez eklenmesin diye.
  id: string
  baslik: string
  tarih: string // YYYY-MM-DD
  baslangic: string // HH:MM
  bitis: string // HH:MM
  konum: string | null
  // Tüm gün süren etkinlikler müsaitliğe çevrilmiyor (bkz. takvim.ts).
  tumGun: boolean
  iceAktarma: number
}

class CepDostDB extends Dexie {
  kayitlar!: Table<Kayit, string>
  takvimEtkinlikleri!: Table<TakvimEtkinligi, string>

  constructor() {
    super('cepdost')
    // Sadece sorgulanacak/filtrelenecek alanlar indekslenir; id primary key.
    this.version(1).stores({
      kayitlar: 'id, olusturulmaTarihi, kategori, durum, tarih',
    })
    this.version(2).stores({
      kayitlar: 'id, olusturulmaTarihi, kategori, durum, tarih',
      takvimEtkinlikleri: 'id, tarih',
    })
  }
}

export const db = new CepDostDB()

function kaynakTipiBelirle(hamLink: string, gorselSayisi: number): KaynakTipi {
  if (gorselSayisi > 0) return 'gorsel'
  if (hamLink) return 'link'
  return 'metin'
}

export interface YeniKayitGirdi {
  hamBaslik?: string
  hamMetin?: string
  hamLink?: string
  gorseller?: KayitGorsel[]
}

// Paylaşım akışı (Android POST / iOS GET) için: ham veriyle hemen bir kayıt
// oluşturur, sınıflandırma alanları henüz boş — F2 arka planda bunu
// güncelleyecek (bkz. classify.ts).
export async function kayitEkle(girdi: YeniKayitGirdi): Promise<Kayit> {
  const hamBaslik = girdi.hamBaslik ?? ''
  const hamMetin = girdi.hamMetin ?? ''
  const hamLink = girdi.hamLink ?? ''
  const gorseller = girdi.gorseller ?? []

  const kayit: Kayit = {
    id: crypto.randomUUID(),
    kategori: null,
    baslik: null,
    tarih: null,
    saat: null,
    konum: null,
    oncelik: 'orta',
    sure: null,
    ozetNot: null,
    mekanOnerisi: null,
    yakinOneriler: null,
    kaynakTipi: kaynakTipiBelirle(hamLink, gorseller.length),
    hamBaslik,
    hamMetin,
    hamLink,
    gorseller,
    durum: 'bekliyor',
    olusturulmaTarihi: Date.now(),
  }

  await db.kayitlar.add(kayit)
  return kayit
}

// Manuel yakalama (CaptureModal) için: kullanıcı sınıflandırma sonucunu
// görüp düzenledikten sonra tam dolu bir kayıt olarak eklenir.
export type YeniTamKayit = Omit<Kayit, 'id' | 'olusturulmaTarihi' | 'durum'> &
  Partial<Pick<Kayit, 'durum'>>

export async function kayitOlustur(girdi: YeniTamKayit): Promise<Kayit> {
  const kayit: Kayit = {
    ...girdi,
    id: crypto.randomUUID(),
    durum: girdi.durum ?? 'bekliyor',
    olusturulmaTarihi: Date.now(),
  }
  await db.kayitlar.add(kayit)
  return kayit
}

export async function tumKayitlar(): Promise<Kayit[]> {
  return db.kayitlar.orderBy('olusturulmaTarihi').reverse().toArray()
}

export async function kayitGuncelle(id: string, degisiklik: Partial<Kayit>): Promise<void> {
  await db.kayitlar.update(id, degisiklik)
}

export async function kayitSil(id: string): Promise<void> {
  await db.kayitlar.delete(id)
}

export async function kayitDurumDegistir(id: string, durum: Durum): Promise<void> {
  await db.kayitlar.update(id, { durum })
}

// Arşivde gösterilecek başlık — F2 henüz kategori/baslik doldurmadıysa ham
// veriden makul bir tanesini seçer.
export function goruntulemeBasligi(kayit: Kayit): string {
  if (kayit.baslik) return kayit.baslik
  if (kayit.hamBaslik) return kayit.hamBaslik
  if (kayit.hamMetin) return kayit.hamMetin.slice(0, 80)
  if (kayit.hamLink) return kayit.hamLink
  return '(başlıksız kayıt)'
}
