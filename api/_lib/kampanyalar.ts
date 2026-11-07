// Businesses' live campaigns: sponsored places in the feed, and the
// discounts they give people who come through the app.
//
// First phase (business plan, 2026-11-01): campaigns are sold on the web
// and added here by hand, then deployed. Each entry needs the place's exact
// coordinates (from Google Maps: right click on the pin → the numbers).
// Rules a campaign must follow are in shared/yakinMekanlar.ts: no alcohol,
// hookah, tobacco or betting places; it shows only within `yaricapMetre`
// and between `baslangic` and `bitis` (inclusive, Turkey's time).
//
// To give the business its code-checking page, send them:
//   https://sharloop.vercel.app/isletme/dogrula.html?k=<id>

import type { Kampanya } from '../../shared/yakinMekanlar.js'

export const KAMPANYALAR: Kampanya[] = [
  // Example (copy, fill in, and remove the comment marks):
  // {
  //   id: 'moda-kahve-2026-11',
  //   mekanAdi: 'Moda Kahve',
  //   kategori: 'Kafe',
  //   adres: 'Caferağa Mah. Moda Cd. No:1, Kadıköy',
  //   enlem: 40.9869,
  //   boylam: 29.0256,
  //   yaricapMetre: 3000,
  //   baslangic: '2026-11-10',
  //   bitis: '2026-12-10',
  //   aciklama: 'Ders çalışmaya uygun, sessiz üst kat',
  //   indirim: { metin: 'Sharloop ile gelene %10 indirim', kosul: 'Kişi başı günde bir kez' },
  // },
]

export function kampanyaBul(id: string): Kampanya | null {
  return KAMPANYALAR.find((k) => k.id === id) ?? null
}
