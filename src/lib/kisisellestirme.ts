// Personal touches people pick for themselves, their groups and plans: an
// accent colour and an emoji. Class names are spelled out in full so
// Tailwind keeps them in the build.

export interface RenkTanimi {
  ad: string
  // Soft background with matching text (avatars, chips).
  yumusak: string
  // Solid swatch (pickers, accents).
  dolu: string
  // Light tinted surface (cards, headers).
  zemin: string
  // Text in the accent colour.
  yazi: string
}

export const RENKLER = {
  orkide: { ad: 'Orkide', yumusak: 'bg-orchid-100 text-orchid-700', dolu: 'bg-orchid-500', zemin: 'bg-orchid-50', yazi: 'text-orchid-600' },
  mercan: { ad: 'Mercan', yumusak: 'bg-coral-100 text-coral-700', dolu: 'bg-coral-500', zemin: 'bg-coral-50', yazi: 'text-coral-600' },
  turkuaz: { ad: 'Turkuaz', yumusak: 'bg-teal-100 text-teal-700', dolu: 'bg-teal-500', zemin: 'bg-teal-50', yazi: 'text-teal-600' },
  gok: { ad: 'Gök', yumusak: 'bg-sky-100 text-sky-700', dolu: 'bg-sky-500', zemin: 'bg-sky-50', yazi: 'text-sky-600' },
  kehribar: { ad: 'Kehribar', yumusak: 'bg-amber-100 text-amber-700', dolu: 'bg-amber-500', zemin: 'bg-amber-50', yazi: 'text-amber-600' },
  gul: { ad: 'Gül', yumusak: 'bg-rose-100 text-rose-700', dolu: 'bg-rose-500', zemin: 'bg-rose-50', yazi: 'text-rose-600' },
  mor: { ad: 'Mor', yumusak: 'bg-violet-100 text-violet-700', dolu: 'bg-violet-500', zemin: 'bg-violet-50', yazi: 'text-violet-600' },
} satisfies Record<string, RenkTanimi>

export type RenkAnahtari = keyof typeof RENKLER

export const RENK_ANAHTARLARI = Object.keys(RENKLER) as RenkAnahtari[]

// Colours given to people who haven't picked one. Mercan stays out: it's
// the old warm look and stands out against the blue theme.
const TURETILEN_RENKLER = RENK_ANAHTARLARI.filter((k) => k !== 'mercan')

function adaGoreAnahtar(ad: string): RenkAnahtari {
  let toplam = 0
  for (let i = 0; i < ad.length; i++) toplam += ad.charCodeAt(i)
  return TURETILEN_RENKLER[toplam % TURETILEN_RENKLER.length]
}

// The chosen colour, or a stable one derived from the name.
export function renkAl(anahtar: string | null | undefined, ad = ''): RenkTanimi {
  return anahtar && anahtar in RENKLER ? RENKLER[anahtar as RenkAnahtari] : RENKLER[adaGoreAnahtar(ad)]
}

export const PROFIL_EMOJILERI = ['😎', '🌟', '☕', '🎧', '🎮', '📚', '🏃', '🎨', '🌿', '✈️', '⚽', '🍕']

export const GRUP_ACIKLAMA_MAKS = 120

export const GRUP_EMOJILERI = ['🎉', '🏠', '🎓', '💼', '⚽', '🎮', '🍻', '🏖️', '🎵', '👨‍👩‍👧', '🧗', '🍳']

export const ETKINLIK_EMOJILERI = ['☕', '🍽️', '🎬', '🎉', '⚽', '🏖️', '🎮', '🎵', '📚', '🛍️', '🏃', '🍻']
