// Businesses' paid campaigns: the sponsored place in the feed.
//
// First phase (business plan, 2026-11-01): campaigns are sold on the web
// and added here by hand, then deployed. The business first opens its free
// profile in the app (Ayarlar → İşletme hesabı) and sends us its account
// key from there (`isletme`): its photos, contact, hours and discount then
// show on the sponsored card. Each entry needs the place's exact
// coordinates (from Google Maps: right click on the pin → the numbers).
// Rules a campaign must follow are in shared/yakinMekanlar.ts: no alcohol,
// hookah, tobacco or betting places; it shows only within `yaricapMetre`
// and between `baslangic` and `bitis` (inclusive, Turkey's time).

import type { Kampanya } from '../../shared/yakinMekanlar.js'

export const KAMPANYALAR: Kampanya[] = [
  // Example (copy, fill in, and remove the comment marks):
  // {
  //   id: 'moda-kahve-2026-11',
  //   isletme: '<the 64-character key from the business panel>',
  //   mekanAdi: 'Moda Kahve',
  //   kategori: 'Kafe',
  //   adres: 'Caferağa Mah. Moda Cd. No:1, Kadıköy',
  //   enlem: 40.9869,
  //   boylam: 29.0256,
  //   yaricapMetre: 3000,
  //   baslangic: '2026-11-10',
  //   bitis: '2026-12-10',
  //   aciklama: 'Ders çalışmaya uygun, sessiz üst kat',
  // },
]
