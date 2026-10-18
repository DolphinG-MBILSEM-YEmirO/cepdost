import { db, type Kayit, type TakvimEtkinligi } from '../db'
import { TUR, kanalDurumu, motor, simdiMs, type MusaitlikVerisi } from './cekirdek'
import { planAyarlari } from '../lib/planAyarlari'

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

function saatStr(dakika: number): string {
  return `${String(Math.floor(dakika / 60)).padStart(2, '0')}:${String(dakika % 60).padStart(2, '0')}`
}

function ertesiGun(tarih: string): string {
  const [y, a, g] = tarih.split('-').map(Number)
  return tarihStr(new Date(y, a - 1, g + 1))
}

// A plan as one or two busy ranges: one that runs past midnight ("22:00,
// 4 hours") also fills the start of the next day. Days end at 23:59, the
// same convention the calendar import uses.
function plandanBloklar(tarih: string, baslangic: string, sureDk: number): Array<Omit<Blok, 'yerel_kayit_id'>> {
  const [s, d] = baslangic.split(':').map(Number)
  if (Number.isNaN(s) || Number.isNaN(d)) return []
  const bas = s * 60 + d
  const bit = bas + sureDk
  const GUN = 24 * 60
  if (bit < GUN) return [{ tarih, baslangic, bitis: saatStr(bit) }]
  const bloklar = [{ tarih, baslangic, bitis: '23:59' }]
  // Longer than a day is not a meeting worth blocking a second day for.
  const tasan = Math.min(bit - GUN, GUN - 1)
  if (tasan > 0) bloklar.push({ tarih: ertesiGun(tarih), baslangic: '00:00', bitis: saatStr(tasan) })
  return bloklar
}

interface Blok {
  yerel_kayit_id: string
  tarih: string
  baslangic: string
  bitis: string
}

// Yalnızca tarihi VE saati olan, henüz yapılmamış, tarih penceresindeki
// kayıtlar müsaitliğe dönüşür. Saatsiz bir plan ("bir ara kitapçıya
// uğra") kimseyi meşgul göstermemeli. The exception is a plan marked
// "all day": the person said the day is taken, so all of it is busy.
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
    if (!k.tarih) continue
    if (k.tarih < altStr || k.tarih > ustStr) continue
    if (k.tumGun) {
      bloklar.push({ yerel_kayit_id: k.id, tarih: k.tarih, baslangic: '00:00', bitis: '23:59' })
      continue
    }
    if (!k.saat) continue

    const baslangic = k.saat.slice(0, 5)
    for (const b of plandanBloklar(k.tarih, baslangic, k.sure && k.sure > 0 ? k.sure : VARSAYILAN_SURE_DK)) {
      if (b.bitis > b.baslangic) bloklar.push({ yerel_kayit_id: k.id, ...b })
    }
  }

  // F15: telefon takviminden içe aktarılanlar da "dolu" sayılır. Buradan da
  // yalnızca saat aralığı çıkıyor — etkinliğin başlığı/konumu sunucuya
  // GİTMİYOR, tıpkı SharOS planlarında olduğu gibi.
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

// How long an unchanged copy may go without a refresh. The refresh moves
// `guncelleme`, which friends see as "updated N hours ago".
const TAZELEME_MS = 12 * 60 * 60 * 1000

// Publishes my busy ranges and usual hours on my broadcast channel
// (friends); the sync copies them into each group. Re-published when
// something changed, or to confirm an unchanged copy is still current.
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

  const pencere = planAyarlari().pencere
  const onceki = mevcut?.veri as MusaitlikVerisi | null | undefined
  const ayni =
    onceki &&
    JSON.stringify(onceki.bloklar) === JSON.stringify(bloklar) &&
    JSON.stringify(onceki.pencere ?? null) === JSON.stringify(pencere)
  if (ayni && simdiMs() - (onceki.guncelleme ?? 0) < TAZELEME_MS) return
  await m.yayinla(durum.yayin, TUR.musaitlik, 'musaitlik', {
    bloklar,
    guncelleme: simdiMs(),
    pencere,
  } satisfies MusaitlikVerisi)
  void m.esitle().catch(() => {})
}
