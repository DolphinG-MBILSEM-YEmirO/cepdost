import { db, type Kayit, type TakvimEtkinligi } from '../db'
import { sb } from './supabase'

// F10: yerel planlardan SADECE zaman bilgisini sunucuya taşır.
//
// Buradan çıkan nesnede başlık, konum, kategori, not YOKTUR ve olmamalıdır —
// arkadaşın göreceği tek şey "bu aralık dolu". Sunucudaki tabloda zaten bu
// alanlar tanımlı değil (bkz. musaitlik_bloklari migration'ı), yani bir
// hata yapılsa bile detay sızamaz. Bu, tek katmana güvenmemek için bilinçli
// bir çift savunma.

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

// Yerel durumu sunucuya yansıtır: eklenenleri yazar, silinen/artık uygun
// olmayanları sunucudan kaldırır. Tekilleştirme yerel_kayit_id üzerinden,
// böylece aynı plan iki kez blok oluşturmaz.
//
// paylasimAcik=false ise sunucudaki TÜM bloklar silinir — "paylaşmayı
// kapattım" demek "verim orada durmasın" demek olmalı, sadece gizlenmesi
// değil.
export async function musaitligiSenkronla(kullaniciId: string, paylasimAcik: boolean): Promise<void> {
  const istemci = sb()

  const { data: mevcutSatirlar, error: okumaHata } = await istemci
    .from('musaitlik_bloklari')
    .select('id, yerel_kayit_id, tarih, baslangic, bitis')
    .eq('kullanici_id', kullaniciId)
  if (okumaHata) throw new Error(okumaHata.message)

  const mevcut = (mevcutSatirlar ?? []) as Array<{
    id: string
    yerel_kayit_id: string | null
    tarih: string
    baslangic: string
    bitis: string
  }>

  if (!paylasimAcik) {
    if (mevcut.length > 0) {
      const { error } = await istemci
        .from('musaitlik_bloklari')
        .delete()
        .eq('kullanici_id', kullaniciId)
      if (error) throw new Error(error.message)
    }
    return
  }

  const [kayitlar, takvim] = await Promise.all([
    db.kayitlar.toArray(),
    db.takvimEtkinlikleri.toArray(),
  ])
  const istenen = bloklariCikar(kayitlar, new Date(), takvim)
  const istenenHarita = new Map(istenen.map((b) => [b.yerel_kayit_id, b]))

  const silinecekIdler: string[] = []
  const mevcutHarita = new Map<string, (typeof mevcut)[number]>()

  for (const satir of mevcut) {
    if (!satir.yerel_kayit_id || !istenenHarita.has(satir.yerel_kayit_id)) {
      silinecekIdler.push(satir.id)
    } else {
      mevcutHarita.set(satir.yerel_kayit_id, satir)
    }
  }

  if (silinecekIdler.length > 0) {
    const { error } = await istemci.from('musaitlik_bloklari').delete().in('id', silinecekIdler)
    if (error) throw new Error(error.message)
  }

  // Yalnızca gerçekten değişmiş/yeni olanları yaz — her açılışta tüm
  // tabloyu yeniden yazmak gereksiz yazma trafiği demek.
  const yazilacak = istenen.filter((b) => {
    const eski = mevcutHarita.get(b.yerel_kayit_id)
    if (!eski) return true
    return (
      eski.tarih !== b.tarih ||
      eski.baslangic.slice(0, 5) !== b.baslangic ||
      eski.bitis.slice(0, 5) !== b.bitis
    )
  })

  if (yazilacak.length > 0) {
    const { error } = await istemci.from('musaitlik_bloklari').upsert(
      yazilacak.map((b) => ({ ...b, kullanici_id: kullaniciId })),
      { onConflict: 'kullanici_id,yerel_kayit_id' },
    )
    if (error) throw new Error(error.message)
  }
}
