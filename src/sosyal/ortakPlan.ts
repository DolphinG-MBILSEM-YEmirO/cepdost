import { arkadasMusaitligi, type Profil } from './api'
import { bloklariCikar } from './musaitlikSenkron'
import { db } from '../db'

// Joint planning with AI. Collects everyone's busy ranges and sends them to
// the server, which finds the shared free slots and asks the model for a
// suggestion (see api/ortak-plan.ts).
//
// Buradan çıkan veride yine SADECE saat aralıkları var — arkadaşların
// planlarının başlığı/konumu bu istemcide zaten yok, sunucudan da hiç
// gelmiyor.

export interface OnerilenPlan {
  baslik: string
  tarih: string
  saat: string
  sure: number
  konum: string | null
  gerekce: string | null
}

export interface BosAralik {
  tarih: string
  baslangic: string
  bitis: string
}

export interface OrtakPlanYaniti {
  // İlk seçenek = birincil öneri. Tek öneri isteyen çağrı yerleri için ayrı
  // tutuluyor, `secenekler` ise "başka fikir ver" akışını besliyor.
  plan: OnerilenPlan | null
  secenekler: OnerilenPlan[]
  bosluklar: BosAralik[]
  mesaj?: string
}

function tarihStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function gunleriUret(gunSayisi: number, baslangic = new Date()): string[] {
  return Array.from({ length: gunSayisi }, (_, i) => {
    const d = new Date(baslangic)
    d.setDate(d.getDate() + i)
    return tarihStr(d)
  })
}

// Kendi dolu saatlerim: yerel planlar + (izin verilmişse) içe aktarılmış
// takvim. Sunucudaki kopyayı okumak yerine yereli kullanıyoruz — müsaitlik
// paylaşımını kapatmış biri de kendi planını yapabilmeli.
export async function kendiBloklarim(gunler: string[]): Promise<Array<{ tarih: string; baslangic: string; bitis: string }>> {
  const [kayitlar, takvim] = await Promise.all([
    db.kayitlar.toArray(),
    db.takvimEtkinlikleri.toArray(),
  ])
  const kume = new Set(gunler)
  return bloklariCikar(kayitlar, new Date(), takvim)
    .filter((b) => kume.has(b.tarih))
    .map((b) => ({ tarih: b.tarih, baslangic: b.baslangic, bitis: b.bitis }))
}

const ZAMAN_ASIMI_MS = 45000

export interface OrtakPlanIstegi {
  istek: string
  benimAdim: string
  katilimcilar: Profil[]
  gunler: string[]
  enErken?: string
  enGec?: string
  enAzDakika?: number
}

export async function ortakPlanOner(girdi: OrtakPlanIstegi): Promise<OrtakPlanYaniti> {
  const ilkGun = girdi.gunler[0]
  const sonGun = girdi.gunler[girdi.gunler.length - 1]

  const [benim, ...digerleri] = await Promise.all([
    kendiBloklarim(girdi.gunler),
    ...girdi.katilimcilar.map(async (p) => {
      // An empty list from someone who doesn't share means "unknown", not
      // "free"; the server shows that difference to the user.
      if (!p.musaitlik_paylas) return []
      try {
        const bloklar = await arkadasMusaitligi(p.id, ilkGun, sonGun)
        return bloklar.map((b) => ({
          tarih: b.tarih,
          baslangic: b.baslangic.slice(0, 5),
          bitis: b.bitis.slice(0, 5),
        }))
      } catch {
        return []
      }
    }),
  ])

  const katilimcilar = [
    { ad: girdi.benimAdim, bloklar: benim, paylasiyor: true },
    ...girdi.katilimcilar.map((p, i) => ({
      ad: p.ad,
      bloklar: digerleri[i] ?? [],
      paylasiyor: p.musaitlik_paylas,
    })),
  ]

  // Sunucu UTC çalışıyor; "bugün geçmiş saatleri önerme" kontrolü için
  // kullanıcının yerel saatini biz söylüyoruz.
  const simdi = new Date()

  // Normalde 1-2 saniye sürüyor, ama canlı testte Gemini'nin bir kez 80+
  // saniye takıldığı görüldü. Zaman aşımı olmadan kullanıcı sonsuza kadar
  // "bakıyorum" ekranında kalıyordu.
  let res: Response
  try {
    res = await fetch('/api/ortak-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        istek: girdi.istek,
        katilimcilar,
        gunler: girdi.gunler,
        enErken: girdi.enErken,
        enGec: girdi.enGec,
        enAzDakika: girdi.enAzDakika,
        simdiTarih: tarihStr(simdi),
        simdiSaat: `${String(simdi.getHours()).padStart(2, '0')}:${String(simdi.getMinutes()).padStart(2, '0')}`,
      }),
      signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error('Öneri gecikti — tekrar dener misin?')
    }
    throw new Error('Öneri alınamadı — birazdan tekrar dene.')
  }

  const yanit = (await res.json().catch(() => null)) as (OrtakPlanYaniti & { error?: string }) | null
  if (yanit?.error) throw new Error(yanit.error)
  if (!res.ok) throw new Error('Öneri alınamadı — birazdan tekrar dene.')

  const secenekler = yanit?.secenekler?.length
    ? yanit.secenekler
    : yanit?.plan
      ? [yanit.plan]
      : []

  return {
    // Listedeki İLK nesnenin kendisini veriyoruz (sunucunun ayrıca yolladığı
    // `plan` kopyasını değil): UI seçili öneriyi listeden referansla eliyor,
    // kopya olsaydı birincil öneri "başka fikirler"de tekrar görünürdü.
    plan: secenekler[0] ?? null,
    secenekler,
    bosluklar: yanit?.bosluklar ?? [],
    mesaj: yanit?.mesaj,
  }
}
