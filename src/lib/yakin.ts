// The feed's "Yakınında" strip: asks the phone where it is (only after the
// person taps "Konumumu kullan" once), fetches nearby places and live
// campaigns, and sorts them with Sharloop's own ratings. Discount codes for
// sponsored places come from api/kupon.ts.

import {
  bugunTR,
  onerileriSirala,
  type Kampanya,
  type MekanOnerisi,
  type MekanPuani,
  type YakinMekan,
} from '../../shared/yakinMekanlar'

export interface Konum {
  enlem: number
  boylam: number
}

const IZIN_ANAHTARI = 'cepdost_yakin_izin'

// Whether the person already chose to see nearby places on this device.
export function yakinIzniVarMi(): boolean {
  try {
    return localStorage.getItem(IZIN_ANAHTARI) === '1'
  } catch {
    return false
  }
}

export function yakinIzniniKaydet(acik: boolean): void {
  try {
    if (acik) localStorage.setItem(IZIN_ANAHTARI, '1')
    else localStorage.removeItem(IZIN_ANAHTARI)
  } catch {
    // Private mode: asked again next time.
  }
}

export type KonumHatasi = 'izin-yok' | 'bulunamadi'

// The phone's position, or why there is none.
export function konumAl(zamanAsimiMs = 8000): Promise<Konum | KonumHatasi> {
  return new Promise((coz) => {
    if (!('geolocation' in navigator)) return coz('bulunamadi')
    navigator.geolocation.getCurrentPosition(
      (p) => coz({ enlem: p.coords.latitude, boylam: p.coords.longitude }),
      (e) => coz(e.code === e.PERMISSION_DENIED ? 'izin-yok' : 'bulunamadi'),
      { timeout: zamanAsimiMs, maximumAge: 5 * 60 * 1000 },
    )
  })
}

// About a kilometre: what leaves the phone.
export function yuvarla(konum: Konum): Konum {
  return { enlem: Math.round(konum.enlem * 100) / 100, boylam: Math.round(konum.boylam * 100) / 100 }
}

export async function yakinOnerileriGetir(konum: Konum, puanlar: Map<string, MekanPuani>): Promise<MekanOnerisi[]> {
  const { enlem, boylam } = yuvarla(konum)
  const res = await fetch(`/api/yakin?enlem=${enlem}&boylam=${boylam}`, { signal: AbortSignal.timeout(12_000) })
  if (!res.ok) throw new Error('Yakındaki yerler şu an yüklenemedi.')
  const veri = (await res.json()) as { mekanlar?: YakinMekan[]; kampanyalar?: Kampanya[] }
  // Distances use the exact position, which stays on the phone.
  return onerileriSirala(veri.mekanlar ?? [], veri.kampanyalar ?? [], puanlar, konum, bugunTR())
}

export interface IndirimKodu {
  kod: string
  tarih: string
  mekanAdi: string
  indirim: { metin: string; kosul: string | null }
}

export async function indirimKoduAl(kampanyaId: string, kullanici: string): Promise<IndirimKodu> {
  let res: Response
  try {
    res = await fetch('/api/kupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kampanya: kampanyaId, kullanici }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new Error('İnternet bağlantını kontrol edip tekrar dene.')
  }
  const veri = (await res.json().catch(() => null)) as (IndirimKodu & { error?: string }) | null
  if (!res.ok || !veri?.kod) throw new Error(veri?.error ?? 'Kod alınamadı. Biraz sonra tekrar dene.')
  return veri
}

// Directions in the phone's maps app (Google Maps opens on Android, the web
// version elsewhere).
export function yolTarifiAdresi(m: { enlem: number; boylam: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${m.enlem},${m.boylam}`
}
