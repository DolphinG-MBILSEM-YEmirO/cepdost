import { db, type Kayit, type Kategori, type Oncelik, type YakinOneri } from './db'
import { localDateString } from './lib/format'

export interface SiniflandirmaSonucu {
  kategori: Kategori
  baslik: string | null
  tarih: string | null
  saat: string | null
  konum: string | null
  oncelik: Oncelik
  sure: number | null
  ozetNot: string | null
  mekanOnerisi: string | null
  yakinOneriler: YakinOneri[] | null
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(new Error('Görsel okunamadı'))
    reader.readAsDataURL(blob)
  })
}

// Vercel refuses request bodies over 4.5 MB and base64 adds a third on top of
// the image, so a phone photo can easily be too big to classify. Large images
// are scaled down first; the model reads a 1600 px image just as well. Runs
// in the service worker too (share target), hence OffscreenCanvas. Where the
// APIs are missing or decoding fails, the original goes as before.
const KUCULTME_ESIGI_BAYT = 1024 * 1024
const AZAMI_KENAR_PX = 1600

async function gorseliHazirla(blob: Blob): Promise<Blob> {
  if (blob.size <= KUCULTME_ESIGI_BAYT) return blob
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return blob
  try {
    const bitmap = await createImageBitmap(blob)
    const oran = Math.min(1, AZAMI_KENAR_PX / Math.max(bitmap.width, bitmap.height))
    const genislik = Math.max(1, Math.round(bitmap.width * oran))
    const yukseklik = Math.max(1, Math.round(bitmap.height * oran))
    const tuval = new OffscreenCanvas(genislik, yukseklik)
    const ctx = tuval.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return blob
    }
    // JPEG has no alpha; without a fill transparent areas turn black.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, genislik, yukseklik)
    ctx.drawImage(bitmap, 0, 0, genislik, yukseklik)
    bitmap.close()
    const kucuk = await tuval.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
    return kucuk.size < blob.size ? kucuk : blob
  } catch {
    return blob
  }
}

interface SiniflandirGirdi {
  hamBaslik?: string
  hamMetin?: string
  hamLink?: string
  gorselBlob?: Blob
  gorselMime?: string
  // F7 — sadece manuel yakalama (CaptureModal) foreground'da çalıştığı için
  // navigator.geolocation'a erişebiliyor. Servis çalışanı (sw.ts) içinden
  // gelen otomatik paylaşım akışında bu API yok, o yüzden orada hep boş
  // geçilir — "yakın öneri" o durumda üretilmez, "mekanOnerisi" (isim
  // verilmişse) yine de çalışır.
  enlem?: number
  boylam?: number
}

// Calls /api/classify and returns the raw result without writing to Dexie.
// Used by both the automatic background flow (kayitSiniflandir) and the
// preview step of the manual capture modal (CaptureModal).
export async function siniflandirOnizleme(girdi: SiniflandirGirdi): Promise<SiniflandirmaSonucu> {
  const body: Record<string, unknown> = {
    hamBaslik: girdi.hamBaslik,
    hamMetin: girdi.hamMetin,
    hamLink: girdi.hamLink,
    enlem: girdi.enlem,
    boylam: girdi.boylam,
    // Lets the function resolve "yarın", "cuma" etc. against the user's date.
    bugun: localDateString(),
  }
  if (girdi.gorselBlob) {
    const gorsel = await gorseliHazirla(girdi.gorselBlob)
    body.gorselBase64 = await blobToBase64(gorsel)
    body.gorselMime =
      gorsel === girdi.gorselBlob ? girdi.gorselMime || girdi.gorselBlob.type || 'image/jpeg' : gorsel.type
  }

  const res = await fetch('/api/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Sunucu hatası ${res.status}` }))
    throw new Error(err.error ?? `Sunucu hatası ${res.status}`)
  }

  return (await res.json()) as SiniflandirmaSonucu
}

// F2: paylaşımdan otomatik oluşan bir kaydı arka planda sınıflandırıp aynı
// Dexie kaydını günceller. Başarısız olursa (ağ hatası, env eksik,
// GEMINI_API_KEY henüz set edilmemiş, vs.) kayıt sessizce
// "sınıflandırılmamış" kalır — arşivde ham veriyle görünmeye devam eder,
// kullanıcıyı bloklamaz. Bilerek "fire and forget": çağıran taraf
// (sw.ts / App.tsx) bunu beklemeden paylaşım akışına devam edebilir.
export async function kayitSiniflandir(kayit: Kayit): Promise<void> {
  try {
    const sonuc = await siniflandirOnizleme({
      hamBaslik: kayit.hamBaslik,
      hamMetin: kayit.hamMetin,
      hamLink: kayit.hamLink,
      gorselBlob: kayit.gorseller[0]?.blob,
      gorselMime: kayit.gorseller[0]?.type,
    })

    await db.kayitlar.update(kayit.id, {
      kategori: sonuc.kategori,
      baslik: sonuc.baslik,
      tarih: sonuc.tarih,
      saat: sonuc.saat,
      konum: sonuc.konum,
      oncelik: sonuc.oncelik,
      sure: sonuc.sure,
      ozetNot: sonuc.ozetNot,
      mekanOnerisi: sonuc.mekanOnerisi,
      yakinOneriler: sonuc.yakinOneriler,
    })
  } catch (err) {
    console.warn('kayitSiniflandir: sınıflandırma başarısız', err)
  }
}
