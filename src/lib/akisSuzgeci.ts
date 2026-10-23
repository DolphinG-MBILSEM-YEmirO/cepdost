import type { Ani } from '../sosyal/gruplar'

// The friends feed narrowed to one person or one group, and which posts
// came in since I last looked.

export interface AkisSecimi {
  tur: 'kisi' | 'grup'
  id: string
}

export interface AkisSecenegi extends AkisSecimi {
  ad: string
  sayi: number
}

// Who and which groups the feed can be narrowed to, the busiest first. My
// own posts come last as "Sen". One option is nothing to choose from.
export function akisSecenekleri(
  anilar: Ani[],
  benimId: string,
  kisiAdi: (id: string) => string | null,
  grupAdi: (id: string) => string | null,
): AkisSecenegi[] {
  const say = (harita: Map<string, number>, id: string) => harita.set(id, (harita.get(id) ?? 0) + 1)
  const kisiler = new Map<string, number>()
  const gruplar = new Map<string, number>()
  for (const a of anilar) {
    say(kisiler, a.sahip_id)
    if (a.grup_id) say(gruplar, a.grup_id)
  }

  const secenekler: AkisSecenegi[] = []
  for (const [id, sayi] of gruplar) {
    const ad = grupAdi(id)
    if (ad) secenekler.push({ tur: 'grup', id, ad, sayi })
  }
  for (const [id, sayi] of kisiler) {
    if (id === benimId) continue
    const ad = kisiAdi(id)
    if (ad) secenekler.push({ tur: 'kisi', id, ad, sayi })
  }
  secenekler.sort((a, b) => b.sayi - a.sayi || a.ad.localeCompare(b.ad, 'tr'))
  const benim = kisiler.get(benimId)
  if (benim) secenekler.push({ tur: 'kisi', id: benimId, ad: 'Sen', sayi: benim })
  return secenekler.length >= 2 ? secenekler : []
}

export function secimdekiler(anilar: Ani[], secim: AkisSecimi | null): Ani[] {
  if (!secim) return anilar
  return anilar.filter((a) => (secim.tur === 'grup' ? a.grup_id === secim.id : a.sahip_id === secim.id))
}

// Someone else's post shared after my last look. With no last look (the
// first visit on this device) nothing is new, or everything would be.
export function yeniMi(ani: Ani, benimId: string, sonBakis: string | null): boolean {
  return !!sonBakis && ani.sahip_id !== benimId && ani.olusturulma > sonBakis
}
