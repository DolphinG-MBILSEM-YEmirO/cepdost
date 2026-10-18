import { db, type Kayit, type TakvimEtkinligi } from '../db'
import { TUR, kanalDurumu, motor, simdiMs, type MusaitlikVerisi } from './cekirdek'

// Shares ONLY time ranges from local plans with friends and groups.
//
// The published blocks have no title, place, category or notes, and must
// never get them: all a friend sees is "this range is busy". The record is
// built from these blocks alone (see musaitligiSenkronla), so a slip
// elsewhere can't leak plan details.

const VARSAYILAN_SURE_DK = 60

// Ne kadar ileri/geri senkronlanacak. Geçmişi paylaşmanın bir faydası yok,
// çok uzak geleceği paylaşmak da gereksiz veri demek.
const GECMIS_GUN = 1
const GELECEK_GUN = 60

function tarihStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const g = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${g}`
}

function saatEkle(saat: string, dakika: number): string {
  const [s, d] = saat.split(':').map(Number)
  if (Number.isNaN(s) || Number.isNaN(d)) return '23:59'
  const toplam = s * 60 + d + dakika
  // Gece yarısını aşan planlar için günü bölmek yerine 23:59'a sabitliyoruz —
  // müsaitlik göstermek için bu yeterli, veri modelini karmaşıklaştırmıyor.
  if (toplam >= 24 * 60) return '23:59'
  const ss = String(Math.floor(toplam / 60)).padStart(2, '0')
  const dd = String(toplam % 60).padStart(2, '0')
  return `${ss}:${dd}`
}

interface Blok {
  yerel_kayit_id: string
  tarih: string
  baslangic: string
  bitis: string
}

// Yalnızca tarihi VE saati olan, henüz yapılmamış, tarih penceresindeki
// kayıtlar müsaitliğe dönüşür. Saatsiz bir plan ("bir ara kitapçıya
// uğra") kimseyi meşgul göstermemeli.
export function bloklariCikar(
  kayitlar: Kayit[],
  bugun = new Date(),
  takvimEtkinlikleri: TakvimEtkinligi[] = [],
): Blok[] {
  const alt = new Date(bugun)
  alt.setDate(alt.getDate() - GECMIS_GUN)
  const ust = new Date(bugun)
  ust.setDate(ust.getDate() + GELECEK_GUN)

  const altStr = tarihStr(alt)
  const ustStr = tarihStr(ust)

  const bloklar: Blok[] = []
  for (const k of kayitlar) {
    if (k.durum === 'yapildi') continue
    if (!k.tarih || !k.saat) continue
    if (k.tarih < altStr || k.tarih > ustStr) continue

    const baslangic = k.saat.length === 5 ? k.saat : k.saat.slice(0, 5)
    const bitis = saatEkle(baslangic, k.sure && k.sure > 0 ? k.sure : VARSAYILAN_SURE_DK)
    if (bitis <= baslangic) continue

    bloklar.push({ yerel_kayit_id: k.id, tarih: k.tarih, baslangic, bitis })
  }

  // F15: telefon takviminden içe aktarılanlar da "dolu" sayılır. Buradan da
  // yalnızca saat aralığı çıkıyor — etkinliğin başlığı/konumu sunucuya
  // GİTMİYOR, tıpkı CepDost planlarında olduğu gibi.
  for (const e of takvimEtkinlikleri) {
    // Tüm gün etkinlikleri (doğum günü, bayram, "izinliyim") kişiyi bütün
    // gün meşgul göstermemeli — bunlar bilgi amaçlı kayıtlar.
    if (e.tumGun) continue
    if (e.tarih < altStr || e.tarih > ustStr) continue
    if (e.bitis <= e.baslangic) continue

    bloklar.push({
      yerel_kayit_id: e.id,
      tarih: e.tarih,
      baslangic: e.baslangic,
      bitis: e.bitis,
    })
  }

  return bloklar
}

// Publishes my busy ranges on my broadcast channel (friends); the sync
// copies them into each group. Only re-published when something changed.
//
// paylasimAcik=false deletes the shared copy: turning sharing off should
// mean the data is gone, not just hidden.
export async function musaitligiSenkronla(_kullaniciId: string, paylasimAcik: boolean): Promise<void> {
  const m = motor()
  const durum = await kanalDurumu()
  if (!durum.yayin) return
  const mevcut = await m.kayit(durum.yayin, m.benimId, 'musaitlik')

  if (!paylasimAcik) {
    if (mevcut && mevcut.veri !== null) await m.yayinla(durum.yayin, TUR.musaitlik, 'musaitlik', null)
    return
  }

  const [kayitlar, takvim] = await Promise.all([db.kayitlar.toArray(), db.takvimEtkinlikleri.toArray()])
  const bloklar = bloklariCikar(kayitlar, new Date(), takvim)
    .map(({ tarih, baslangic, bitis }) => ({ tarih, baslangic, bitis }))
    .sort((a, b) => (a.tarih + a.baslangic).localeCompare(b.tarih + b.baslangic))

  const onceki = (mevcut?.veri as MusaitlikVerisi | null | undefined)?.bloklar
  if (onceki && JSON.stringify(onceki) === JSON.stringify(bloklar)) return
  await m.yayinla(durum.yayin, TUR.musaitlik, 'musaitlik', { bloklar, guncelleme: simdiMs() } satisfies MusaitlikVerisi)
  void m.esitle().catch(() => {})
}
