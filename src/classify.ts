import { db, type Kayit, type Kategori, type Oncelik, type YakinOneri } from './db'
import { localDateString } from './lib/format'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

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

// Edge Function'ı çağırıp ham sonucu döner — Dexie'ye yazmaz. Hem arka
// plan otomatik akış (kayitSiniflandir) hem de manuel yakalama modalının
// önizleme adımı (CaptureModal) bunu kullanır.
export async function siniflandirOnizleme(girdi: SiniflandirGirdi): Promise<SiniflandirmaSonucu> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase env değişkenleri eksik')
  }

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
    body.gorselBase64 = await blobToBase64(girdi.gorselBlob)
    body.gorselMime = girdi.gorselMime || girdi.gorselBlob.type || 'image/jpeg'
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/classify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
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
