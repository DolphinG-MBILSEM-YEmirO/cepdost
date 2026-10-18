import { sb } from './supabase'

// F14 — profil fotoğrafı. Kova özel; görüntüleme kısa ömürlü imzalı URL ile
// (bkz. profil_fotografi migration'ındaki not: "herkese açık" CepDost'ta
// "giriş yapmış CepDost kullanıcısı" demek, anonim internet değil).

// Telefondan gelen 4-12 MB'lık fotoğrafı olduğu gibi yüklemenin anlamı yok:
// avatar hiçbir yerde 44px'ten büyük görünmüyor. 256px + JPEG ile tipik
// dosya ~20 KB'a iniyor — mobil veriyi ve kotayı koruyor.
const KENAR = 256
const KALITE = 0.85

// Kareye ortalayarak kırp: avatar her yerde kare/yuvarlak gösteriliyor,
// kırpmayı yüklerken bir kez yapmak her gösterimde uğraşmaktan iyi.
async function kareyeKucult(dosya: File): Promise<Blob> {
  const bitmap = await createImageBitmap(dosya)
  const kenar = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - kenar) / 2
  const sy = (bitmap.height - kenar) / 2

  const tuval = document.createElement('canvas')
  tuval.width = KENAR
  tuval.height = KENAR
  const ctx = tuval.getContext('2d')
  if (!ctx) throw new Error('Görsel işlenemedi')
  ctx.drawImage(bitmap, sx, sy, kenar, kenar, 0, 0, KENAR, KENAR)
  bitmap.close()

  return new Promise((coz, red) => {
    tuval.toBlob(
      (blob) => (blob ? coz(blob) : red(new Error('Görsel işlenemedi'))),
      'image/jpeg',
      KALITE,
    )
  })
}

// Yeni dosya her seferinde yeni bir ada yazılıyor (zaman damgası). Aynı yolu
// üzerine yazmak, tarayıcı ve CDN önbelleği yüzünden kullanıcıya eski
// fotoğrafı göstermeye devam ederdi.
export async function avatarYukle(dosya: File): Promise<string> {
  const { data: oturum } = await sb().auth.getUser()
  const benimId = oturum.user?.id
  if (!benimId) throw new Error('Oturum bulunamadı')

  const kucuk = await kareyeKucult(dosya)
  const yol = `${benimId}/${Date.now()}.jpg`

  const { error: yuklemeHata } = await sb()
    .storage.from('avatarlar')
    .upload(yol, kucuk, { contentType: 'image/jpeg' })
  if (yuklemeHata) throw new Error(`Fotoğraf yüklenemedi: ${yuklemeHata.message}`)

  const { error: profilHata } = await sb()
    .from('profiller')
    .update({ avatar_yol: yol })
    .eq('id', benimId)
  if (profilHata) {
    // Profil satırı güncellenemediyse dosya sahipsiz kalmasın.
    await sb().storage.from('avatarlar').remove([yol])
    throw new Error(profilHata.message)
  }

  await eskiAvatarlariTemizle(benimId, yol)
  return yol
}

export async function avatarSil(): Promise<void> {
  const { data: oturum } = await sb().auth.getUser()
  const benimId = oturum.user?.id
  if (!benimId) throw new Error('Oturum bulunamadı')

  const { error } = await sb().from('profiller').update({ avatar_yol: null }).eq('id', benimId)
  if (error) throw new Error(error.message)
  await eskiAvatarlariTemizle(benimId, null)
}

// Kendi klasörümdeki güncel olmayan dosyaları siler. Başarısız olursa
// sessiz geçiyoruz — kullanıcı için önemli olan işlem (fotoğrafın
// değişmesi) zaten tamamlandı, bu sadece temizlik.
async function eskiAvatarlariTemizle(benimId: string, korunacak: string | null): Promise<void> {
  try {
    const { data } = await sb().storage.from('avatarlar').list(benimId)
    const silinecek = (data ?? [])
      .map((d) => `${benimId}/${d.name}`)
      .filter((y) => y !== korunacak)
    if (silinecek.length > 0) await sb().storage.from('avatarlar').remove(silinecek)
  } catch {
    /* temizlik başarısızlığı kullanıcıya yansımasın */
  }
}

// ---------- imzalı URL önbelleği ----------

// İmzalı URL'ler 1 saat geçerli; 50 dakika sonra yenileniyor. Önbellek
// olmadan arkadaş listesi her render'da onlarca imza isteği atardı.
const GECERLILIK_SN = 3600
const ONBELLEK_MS = 50 * 60 * 1000

const onbellek = new Map<string, { url: string; sonKullanma: number }>()

// Aynı anda birden fazla bileşen aynı yolu isteyince tek istek atılsın.
const bekleyen = new Map<string, Promise<Map<string, string>>>()

export async function avatarUrlleri(yollar: (string | null | undefined)[]): Promise<Map<string, string>> {
  const simdi = Date.now()
  const sonuc = new Map<string, string>()
  const eksik: string[] = []

  for (const yol of new Set(yollar.filter((y): y is string => !!y))) {
    const kayit = onbellek.get(yol)
    if (kayit && kayit.sonKullanma > simdi) sonuc.set(yol, kayit.url)
    else eksik.push(yol)
  }
  if (eksik.length === 0) return sonuc

  const anahtar = eksik.slice().sort().join('|')
  let istek = bekleyen.get(anahtar)
  if (!istek) {
    istek = (async () => {
      const yeni = new Map<string, string>()
      const { data } = await sb().storage.from('avatarlar').createSignedUrls(eksik, GECERLILIK_SN)
      for (const d of data ?? []) {
        if (d.signedUrl && d.path) {
          yeni.set(d.path, d.signedUrl)
          onbellek.set(d.path, { url: d.signedUrl, sonKullanma: Date.now() + ONBELLEK_MS })
        }
      }
      return yeni
    })().finally(() => bekleyen.delete(anahtar))
    bekleyen.set(anahtar, istek)
  }

  for (const [yol, url] of await istek) sonuc.set(yol, url)
  return sonuc
}

export async function avatarUrl(yol: string | null | undefined): Promise<string | null> {
  if (!yol) return null
  const harita = await avatarUrlleri([yol])
  return harita.get(yol) ?? null
}

// Fotoğraf değişince eski imzalı URL'i tutma.
export function avatarOnbelleginiBosalt(): void {
  onbellek.clear()
}
