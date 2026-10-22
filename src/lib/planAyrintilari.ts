import type { Kayit } from '../db'
import { localDateString } from './format'

// The parts of a plan that are only mine: its checklist, the reminder, and
// how much time is left. Pure functions, so the plan screen, the calendar
// export and the in-app reminders agree on the same numbers.

// ---------- checklist ----------

export interface YapilacakMaddesi {
  id: string
  metin: string
  tamam: boolean
}

export const YAPILACAK_AZAMI = 30
export const MADDE_AZAMI = 120

// A checklist read from storage or from another of my devices: bad entries
// are dropped, long ones cut, so a broken copy can't break the plan screen.
export function yapilacaklariOku(deger: unknown): YapilacakMaddesi[] {
  if (!Array.isArray(deger)) return []
  const liste: YapilacakMaddesi[] = []
  const gorulen = new Set<string>()
  for (const m of deger) {
    if (!m || typeof m !== 'object') continue
    const { id, metin, tamam } = m as Record<string, unknown>
    if (typeof id !== 'string' || !id || id.length > 40 || gorulen.has(id)) continue
    if (typeof metin !== 'string' || !metin.trim()) continue
    gorulen.add(id)
    liste.push({ id, metin: metin.trim().slice(0, MADDE_AZAMI), tamam: tamam === true })
    if (liste.length === YAPILACAK_AZAMI) break
  }
  return liste
}

export function maddeEkle(liste: readonly YapilacakMaddesi[], metin: string): YapilacakMaddesi[] {
  const temiz = metin.trim().slice(0, MADDE_AZAMI)
  if (!temiz || liste.length >= YAPILACAK_AZAMI) return [...liste]
  return [...liste, { id: crypto.randomUUID().slice(0, 8), metin: temiz, tamam: false }]
}

export function maddeyiIsaretle(liste: readonly YapilacakMaddesi[], id: string): YapilacakMaddesi[] {
  return liste.map((m) => (m.id === id ? { ...m, tamam: !m.tamam } : m))
}

export function maddeyiSil(liste: readonly YapilacakMaddesi[], id: string): YapilacakMaddesi[] {
  return liste.filter((m) => m.id !== id)
}

// ---------- start, end, countdown ----------

// A plan without a clock time starts the day at 09:00 for reminders; for
// "is it over" it lasts the whole day.
const SAATSIZ_BASLANGIC = '09:00'

type ZamanliPlan = Pick<Kayit, 'tarih' | 'saat' | 'sure' | 'tumGun'>

function saatli(plan: ZamanliPlan): boolean {
  return !plan.tumGun && !!plan.saat
}

export function planBaslangici(plan: ZamanliPlan): Date | null {
  if (!plan.tarih) return null
  const saat = saatli(plan) ? plan.saat!.slice(0, 5) : SAATSIZ_BASLANGIC
  const d = new Date(`${plan.tarih}T${saat}:00`)
  return isNaN(d.getTime()) ? null : d
}

export function planBitisi(plan: ZamanliPlan): Date | null {
  if (!plan.tarih) return null
  if (!saatli(plan)) {
    const d = new Date(`${plan.tarih}T00:00:00`)
    d.setDate(d.getDate() + 1)
    return isNaN(d.getTime()) ? null : d
  }
  const b = planBaslangici(plan)
  if (!b) return null
  return new Date(b.getTime() + (plan.sure && plan.sure > 0 ? plan.sure : 60) * 60_000)
}

export type GeriSayimDurumu = 'gelecek' | 'yakin' | 'suruyor' | 'gecti'

export interface GeriSayim {
  metin: string
  durum: GeriSayimDurumu
}

function gunFarki(tarih: string, simdi: Date): number {
  const a = new Date(`${tarih}T00:00:00`)
  const b = new Date(`${localDateString(simdi)}T00:00:00`)
  return Math.round((a.getTime() - b.getTime()) / 86_400_000)
}

function sureMetni(dk: number): string {
  if (dk < 60) return `${Math.max(1, dk)} dk`
  const sa = Math.floor(dk / 60)
  const kalan = dk % 60
  return kalan ? `${sa} sa ${kalan} dk` : `${sa} sa`
}

// "2 sa 15 dk sonra", "Yarın 20:30", "3 gün sonra", "Şu an sürüyor"...
export function geriSayim(plan: ZamanliPlan, simdi = new Date()): GeriSayim | null {
  if (!plan.tarih) return null
  const bitis = planBitisi(plan)
  if (!bitis) return null
  const gun = gunFarki(plan.tarih, simdi)

  if (!saatli(plan)) {
    if (gun === 0) return plan.tumGun ? { metin: 'Bugün, tüm gün', durum: 'suruyor' } : { metin: 'Bugün', durum: 'yakin' }
    if (gun < 0) return { metin: gun === -1 ? 'Dün' : `${-gun} gün önce`, durum: 'gecti' }
  } else {
    const baslangic = planBaslangici(plan)!
    const kalanDk = Math.ceil((baslangic.getTime() - simdi.getTime()) / 60_000)
    if (simdi >= bitis) {
      if (gun === 0) return { metin: 'Bugün bitti', durum: 'gecti' }
      return { metin: gun === -1 ? 'Dün' : `${-gun} gün önce`, durum: 'gecti' }
    }
    if (kalanDk <= 0) return { metin: 'Şu an sürüyor', durum: 'suruyor' }
    if (kalanDk < 120) return { metin: `${sureMetni(kalanDk)} sonra başlıyor`, durum: 'yakin' }
    if (gun === 0) return { metin: `${sureMetni(kalanDk)} sonra`, durum: 'gelecek' }
    if (gun === 1) return { metin: `Yarın ${plan.saat!.slice(0, 5)}`, durum: 'gelecek' }
  }
  if (gun === 1) return { metin: 'Yarın', durum: 'gelecek' }
  if (gun < 7) return { metin: `${gun} gün sonra`, durum: 'gelecek' }
  if (gun < 30) {
    const hafta = Math.round(gun / 7)
    return { metin: hafta === 1 ? 'Haftaya' : `${hafta} hafta sonra`, durum: 'gelecek' }
  }
  const ay = Math.round(gun / 30)
  return { metin: ay <= 1 ? '1 ay sonra' : `${ay} ay sonra`, durum: 'gelecek' }
}

// ---------- reminder ----------

export interface HatirlatmaSecenegi {
  dk: number
  etiket: string
}

// Minutes before the start. A plan without a clock time "starts" at 09:00,
// so its choices are that morning or the morning before.
export function hatirlatmaSecenekleri(plan: ZamanliPlan): HatirlatmaSecenegi[] {
  if (!saatli(plan)) {
    return [
      { dk: 0, etiket: `O gün ${SAATSIZ_BASLANGIC}` },
      { dk: 1440, etiket: `Bir gün önce ${SAATSIZ_BASLANGIC}` },
    ]
  }
  return [
    { dk: 0, etiket: 'Başlarken' },
    { dk: 15, etiket: '15 dk önce' },
    { dk: 60, etiket: '1 saat önce' },
    { dk: 1440, etiket: '1 gün önce' },
  ]
}

export function hatirlatmaEtiketi(plan: ZamanliPlan & Pick<Kayit, 'hatirlatma'>): string | null {
  if (plan.hatirlatma == null) return null
  return hatirlatmaSecenekleri(plan).find((s) => s.dk === plan.hatirlatma)?.etiket ?? `${sureMetni(plan.hatirlatma)} önce`
}

export function hatirlatmaOku(deger: unknown): number | null {
  return typeof deger === 'number' && Number.isInteger(deger) && deger >= 0 && deger <= 10_080 ? deger : null
}

export function hatirlatmaZamani(plan: ZamanliPlan & Pick<Kayit, 'hatirlatma'>): Date | null {
  if (plan.hatirlatma == null) return null
  const b = planBaslangici(plan)
  return b ? new Date(b.getTime() - plan.hatirlatma * 60_000) : null
}

// The .ics alarm line. A timed event counts from its start; a date-only
// event starts at midnight, so the 09:00 morning is added back.
export function icsTetikleyici(plan: ZamanliPlan, dk: number): string {
  const fark = saatli(plan) ? -dk : 9 * 60 - dk
  return fark >= 0 ? `TRIGGER:PT${fark}M` : `TRIGGER:-PT${-fark}M`
}

export interface YaklasanHatirlatma {
  kayit: Kayit
  zaman: number
  // Changes with the plan's time or the reminder, so a moved plan reminds
  // again.
  anahtar: string
}

// Reminders due between `geriMs` ago and `ileriMs` from now, for plans
// still waiting to be done. The late window catches a reminder that came
// due while the app was closed and was opened soon after.
export function yaklasanHatirlatmalar(
  kayitlar: readonly Kayit[],
  simdi: number,
  geriMs: number,
  ileriMs: number,
): YaklasanHatirlatma[] {
  const liste: YaklasanHatirlatma[] = []
  for (const kayit of kayitlar) {
    if (kayit.durum !== 'bekliyor') continue
    const zaman = hatirlatmaZamani(kayit)?.getTime()
    if (zaman === undefined || zaman < simdi - geriMs || zaman > simdi + ileriMs) continue
    liste.push({ kayit, zaman, anahtar: `${kayit.id}@${zaman}` })
  }
  return liste.sort((a, b) => a.zaman - b.zaman)
}
