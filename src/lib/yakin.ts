// The feed's "Yakınında" strip: asks the phone where it is (only after the
// person taps "Konumumu kullan" once), fetches nearby places and live
// campaigns, and sorts them with Sharloop's own ratings. Discount codes for
// sponsored places come from api/kupon.ts.

import {
  AYNI_MEKAN_METRE,
  bugunTR,
  dogrulamaAdresi,
  mekanAnahtari,
  mesafe,
  onerileriSirala,
  type Kampanya,
  type MekanOnerisi,
  type MekanPuani,
  type YakinMekan,
} from '../../shared/yakinMekanlar'
import { SITE_ADRESI } from '../../shared/marka'
import type { IsletmeProfili } from '../sosyal/isletme'

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

// The strip's last list, so switching feeds or coming back doesn't ask
// the phone and the relays again every time.
const ONBELLEK_MS = 10 * 60_000
let onbellek: { zaman: number; oneriler: YakinOneri[] } | null = null

export function tazeOnbellek(): YakinOneri[] | null {
  return onbellek && Date.now() - onbellek.zaman < ONBELLEK_MS ? onbellek.oneriler : null
}

export function yakinOnbellegeYaz(oneriler: YakinOneri[]): void {
  onbellek = { zaman: Date.now(), oneriler }
}

const YETISKIN_ANAHTARI = 'cepdost_yetiskin'

// Whether the person said, on this device, that they are 18 or older. Only
// then are alcohol, hookah and tobacco places shown (shared/yakinMekanlar).
export function yetiskinOnayiVarMi(): boolean {
  try {
    return localStorage.getItem(YETISKIN_ANAHTARI) === '1'
  } catch {
    return false
  }
}

export function yetiskinOnayiniKaydet(acik: boolean): void {
  try {
    if (acik) localStorage.setItem(YETISKIN_ANAHTARI, '1')
    else localStorage.removeItem(YETISKIN_ANAHTARI)
  } catch {
    // Private mode: off again next time.
  }
  // The list changes with this choice.
  onbellek = null
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

// One place in the strip, with the business's own profile when it has one.
export interface YakinOneri extends MekanOnerisi {
  isletme: IsletmeProfili | null
}

export function isletmedenMekan(p: IsletmeProfili): YakinMekan {
  return { id: `isletme:${p.id}`, ad: p.ad, kategori: p.kategori, adres: p.adres, enlem: p.enlem, boylam: p.boylam }
}

// Places from the map service, businesses that opened a profile, and paid
// campaigns, merged: a business's profile replaces the map service's entry
// for the same place, and a campaign shows the profile it points at.
export function yakinlariBirlestir(
  mekanlar: YakinMekan[],
  kampanyalar: Kampanya[],
  isletmeler: IsletmeProfili[],
  puanlar: Map<string, MekanPuani>,
  konum: Konum,
  bugun = bugunTR(),
  yetiskin = yetiskinOnayiVarMi(),
): YakinOneri[] {
  const ayniYer = (a: YakinMekan, b: { ad: string; enlem: number; boylam: number }) =>
    mekanAnahtari(a.ad) === mekanAnahtari(b.ad) && mesafe(a, b) <= AYNI_MEKAN_METRE
  const sponsorlular = new Set(kampanyalar.flatMap((k) => (k.isletme ? [k.isletme] : [])))
  // A sponsored business shows once, in the paid slot.
  const organikIsletmeler = isletmeler.filter((p) => !sponsorlular.has(p.id))
  const harita = mekanlar.filter((m) => !isletmeler.some((p) => ayniYer(m, p)))
  const liste = onerileriSirala([...organikIsletmeler.map(isletmedenMekan), ...harita], kampanyalar, puanlar, konum, bugun, yetiskin)
  const profil = new Map(isletmeler.map((p) => [p.id, p]))
  return liste.map((o) => {
    const id = o.kampanya?.isletme ?? (o.mekan.id.startsWith('isletme:') ? o.mekan.id.slice('isletme:'.length) : null)
    const isletme = id ? (profil.get(id) ?? null) : null
    // The profile's own name and address win over what the campaign was
    // sold with.
    return isletme && o.kampanya ? { ...o, mekan: { ...isletmedenMekan(isletme), id: o.mekan.id }, isletme } : { ...o, isletme }
  })
}

export async function yakinOnerileriGetir(
  konum: Konum,
  puanlar: Map<string, MekanPuani>,
  isletmeler: IsletmeProfili[],
): Promise<YakinOneri[]> {
  const { enlem, boylam } = yuvarla(konum)
  const res = await fetch(`/api/yakin?enlem=${enlem}&boylam=${boylam}`, { signal: AbortSignal.timeout(12_000) })
  if (!res.ok) throw new Error('Yakındaki yerler şu an yüklenemedi.')
  const veri = (await res.json()) as { mekanlar?: YakinMekan[]; kampanyalar?: Kampanya[] }
  // Distances use the exact position, which stays on the phone.
  return yakinlariBirlestir(veri.mekanlar ?? [], veri.kampanyalar ?? [], isletmeler, puanlar, konum)
}

export interface IndirimKodu {
  kod: string
  tarih: string
  // What the business's phone camera opens when it scans the QR.
  dogrulama: string
}

export async function indirimKoduAl(
  isletme: string,
  kullanici: string,
  ek: { isaretler?: string[]; odul?: string } = {},
): Promise<IndirimKodu> {
  let res: Response
  try {
    res = await fetch('/api/kupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isletme, kullanici }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new Error('İnternet bağlantını kontrol edip tekrar dene.')
  }
  const veri = (await res.json().catch(() => null)) as { kod?: string; tarih?: string; error?: string } | null
  if (!res.ok || !veri?.kod || !veri.tarih) throw new Error(veri?.error ?? 'Kod alınamadı. Biraz sonra tekrar dene.')
  return {
    kod: veri.kod,
    tarih: veri.tarih,
    dogrulama: dogrulamaAdresi(SITE_ADRESI, isletme, veri.kod, { kullanici, ...ek }),
  }
}

// The place on Google Maps, where its reviews, photos and opening hours
// are. A search by name and address lands on the place's own page.
export function googleAdresi(m: { ad: string; adres: string | null; enlem: number; boylam: number }): string {
  const sorgu = m.adres ? `${m.ad}, ${m.adres}` : `${m.ad} ${m.enlem},${m.boylam}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sorgu)}`
}

// Directions in the phone's maps app (Google Maps opens on Android, the web
// version elsewhere).
export function yolTarifiAdresi(m: { enlem: number; boylam: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${m.enlem},${m.boylam}`
}
