import { type Kayit, type Kategori, goruntulemeBasligi } from '../db'
import { CATEGORIES, CATEGORY_LABELS } from './format'
import { eslesiyor, eslesmeOzeti } from './arama'
import { ayBasligi } from './takvimIzgarasi'

// The archive list laid out: searched the way people type, filtered by
// where a record stands, and cut into sections for the chosen order.

// Where a record stands: still ahead (or with no day), done, or its day
// passed while it was still pending.
export type DurumSuzgeci = 'hepsi' | 'bekleyen' | 'yapildi' | 'kacti'
export type Siralama = 'recent' | 'date' | 'category'

export function kayitDurumu(kayit: Kayit, bugun: string): Exclude<DurumSuzgeci, 'hepsi'> {
  if (kayit.durum === 'yapildi') return 'yapildi'
  return kayit.tarih && kayit.tarih < bugun ? 'kacti' : 'bekleyen'
}

export function durumSayilari(kayitlar: Kayit[], bugun: string): Record<DurumSuzgeci, number> {
  const sayilar = { hepsi: kayitlar.length, bekleyen: 0, yapildi: 0, kacti: 0 }
  for (const k of kayitlar) sayilar[kayitDurumu(k, bugun)]++
  return sayilar
}

// The text a search looks through, the title first.
function aranacakAlanlar(kayit: Kayit): string[] {
  return [goruntulemeBasligi(kayit), kayit.konum ?? '', kayit.ozetNot ?? '', kayit.hamMetin, kayit.hamLink]
}

export function kayitEslesiyor(kayit: Kayit, sorgu: string): boolean {
  return aranacakAlanlar(kayit).some((a) => eslesiyor(a, sorgu))
}

// When the match is somewhere the card doesn't show (the note, the shared
// text or link), the line around it, so it's clear why the record came up.
export function gizliEslesme(kayit: Kayit, sorgu: string): string | null {
  const [baslik, konum, ...digerleri] = aranacakAlanlar(kayit)
  if (eslesiyor(baslik, sorgu) || eslesiyor(konum, sorgu)) return null
  const alan = digerleri.find((a) => eslesiyor(a, sorgu))
  return alan ? eslesmeOzeti(alan, sorgu, 20, 60) : null
}

export interface ArsivBolumu {
  anahtar: string
  baslik: string
  kayitlar: Kayit[]
}

const yeniOnce = (a: Kayit, b: Kayit) => b.olusturulmaTarihi - a.olusturulmaTarihi

function ayAnahtari(yil: number, ay: number): string {
  return `${yil}-${String(ay + 1).padStart(2, '0')}`
}

// Consecutive records with the same key share a section.
function boleBol(kayitlar: Kayit[], bolum: (k: Kayit) => { anahtar: string; baslik: string }): ArsivBolumu[] {
  const bolumler: ArsivBolumu[] = []
  for (const k of kayitlar) {
    const { anahtar, baslik } = bolum(k)
    let son = bolumler[bolumler.length - 1]
    if (son?.anahtar !== anahtar) {
      son = { anahtar, baslik, kayitlar: [] }
      bolumler.push(son)
    }
    son.kayitlar.push(k)
  }
  return bolumler
}

// "En yeni": by the month each was saved. "Tarihe göre": by the plan's month,
// the earliest first, those with no day last. "Kategori": in the app's
// category order, the newest first in each.
export function arsivBolumleri(kayitlar: Kayit[], siralama: Siralama): ArsivBolumu[] {
  if (siralama === 'recent') {
    return boleBol([...kayitlar].sort(yeniOnce), (k) => {
      const d = new Date(k.olusturulmaTarihi)
      return { anahtar: ayAnahtari(d.getFullYear(), d.getMonth()), baslik: ayBasligi(d.getFullYear(), d.getMonth()) }
    })
  }
  if (siralama === 'date') {
    const sirali = [...kayitlar].sort(
      (a, b) =>
        Number(!a.tarih) - Number(!b.tarih) ||
        `${a.tarih ?? ''}${a.saat ?? '99'}`.localeCompare(`${b.tarih ?? ''}${b.saat ?? '99'}`) ||
        yeniOnce(a, b),
    )
    return boleBol(sirali, (k) => {
      if (!k.tarih) return { anahtar: 'tarihsiz', baslik: 'Tarihsiz' }
      const [yil, ay] = k.tarih.split('-').map(Number)
      return { anahtar: ayAnahtari(yil, ay - 1), baslik: ayBasligi(yil, ay - 1) }
    })
  }
  const sira = (k: Kategori | null) => (k ? CATEGORIES.indexOf(k) : CATEGORIES.length)
  const sirali = [...kayitlar].sort((a, b) => sira(a.kategori) - sira(b.kategori) || yeniOnce(a, b))
  return boleBol(sirali, (k) => ({
    anahtar: k.kategori ?? 'yok',
    baslik: k.kategori ? CATEGORY_LABELS[k.kategori] : 'Sınıflandırılmamış',
  }))
}

// What a bulk delete's "Geri al" bar says.
export function silmeMesaji(kayitlar: Kayit[]): string {
  return kayitlar.length === 1 ? `“${goruntulemeBasligi(kayitlar[0])}” silindi` : `${kayitlar.length} kayıt silindi`
}
