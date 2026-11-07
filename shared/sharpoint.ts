import { sha256Hex } from './kodlama.js'

// SharPoint: points people earn by actually going to the places Sharloop
// suggests, and spend on rewards the businesses choose (a discount, a free
// drink, reservation priority...). Shared by the server, which writes every
// earning and spending (api/sharpoint.ts), and the app, which shows them.
//
// Only the server can write points: each movement is a record signed with
// the server's key on a channel only the person and the server can read
// (the pair channel of the two keys). Nobody else learns where someone went.
//
// How points are earned (user idea, 2026-11-07): the till scans the
// customer's Sharloop QR, which proves the visit.
//   - a visit to a business with a Sharloop discount:            +10
//   - the business is sponsored (live campaign) right now:        +40
//   - the visit was a Sharloop plan for this place:               +20
//   - a friend from the same plan was scanned there the same day: +30 each
// Each kind counts once per business per day.

export const SHARPOINT_ADI = 'SharPoint'

export const PUANLAR = {
  ziyaret: 10,
  oneCikan: 40,
  plan: 20,
  grup: 30,
} as const

export type KazancNedeni = 'ziyaret' | 'one-cikan' | 'plan' | 'grup'

export const NEDEN_METINLERI: Record<KazancNedeni, string> = {
  ziyaret: 'Sharloop indirimiyle ziyaret',
  'one-cikan': 'Öne çıkan mekan',
  plan: 'Planına uydun',
  grup: 'Arkadaşlarınla gittin',
}

// Levels by points ever earned (spending doesn't lower them). The till
// sees the level, so a business can give regulars priority.
export const SEVIYELER = [
  { ad: 'Yeni', esik: 0 },
  { ad: 'Bronz', esik: 250 },
  { ad: 'Gümüş', esik: 1000 },
  { ad: 'Altın', esik: 2500 },
] as const

export type SeviyeAdi = (typeof SEVIYELER)[number]['ad']

export function seviyeBul(kazanilan: number): { ad: SeviyeAdi; sonraki: { ad: SeviyeAdi; esik: number } | null } {
  let i = 0
  while (i + 1 < SEVIYELER.length && kazanilan >= SEVIYELER[i + 1].esik) i++
  const sonraki = SEVIYELER[i + 1] ?? null
  return { ad: SEVIYELER[i].ad, sonraki: sonraki ? { ad: sonraki.ad, esik: sonraki.esik } : null }
}

// ---------- rewards a business offers ----------

export const AZAMI_ODUL = 3
export const ODUL_EN_AZ = 50
export const ODUL_EN_COK = 5000

export interface IsletmeOdulu {
  id: string
  metin: string
  puan: number
}

// A business's reward list from its stored profile. `urunYasakliMi`
// rejects rewards on alcohol or tobacco (see shared/yakinMekanlar.ts).
export function odulleriAl(deger: unknown, urunYasakliMi: (metin: string) => boolean): IsletmeOdulu[] {
  if (!Array.isArray(deger)) return []
  const gorulen = new Set<string>()
  return deger.slice(0, 10).flatMap((o): IsletmeOdulu[] => {
    if (typeof o !== 'object' || o === null) return []
    const { id, metin, puan } = o as Record<string, unknown>
    if (typeof id !== 'string' || !/^[a-z0-9]{4,12}$/.test(id) || gorulen.has(id)) return []
    if (typeof metin !== 'string' || !metin.trim() || urunYasakliMi(metin)) return []
    if (typeof puan !== 'number' || !Number.isInteger(puan) || puan < ODUL_EN_AZ || puan > ODUL_EN_COK) return []
    gorulen.add(id)
    return [{ id, metin: metin.trim().slice(0, 80), puan }]
  }).slice(0, AZAMI_ODUL)
}

// ---------- the ledger ----------

// The record type on the person's channel with the server.
export const SHARPOINT_TURU = 'sharpoint'

export interface SharpointHareketi {
  tur: 'kazanc' | 'harcama'
  puan: number
  isletme: string
  isletmeAdi: string | null
  nedenler: KazancNedeni[]
  // The reward spent on (harcama only).
  odul: string | null
  // YYYY-MM-DD, Turkey's time.
  gun: string
  zaman: number
}

const NEDENLER = new Set<string>(Object.keys(NEDEN_METINLERI))

export function hareketAl(veri: unknown): SharpointHareketi | null {
  if (typeof veri !== 'object' || veri === null) return null
  const v = veri as Record<string, unknown>
  if (v.tur !== 'kazanc' && v.tur !== 'harcama') return null
  if (typeof v.puan !== 'number' || !Number.isInteger(v.puan) || v.puan <= 0 || v.puan > ODUL_EN_COK) return null
  if (typeof v.isletme !== 'string' || !/^[0-9a-f]{64}$/.test(v.isletme)) return null
  if (typeof v.gun !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.gun)) return null
  return {
    tur: v.tur,
    puan: v.puan,
    isletme: v.isletme,
    isletmeAdi: typeof v.isletmeAdi === 'string' ? v.isletmeAdi.slice(0, 80) : null,
    nedenler: Array.isArray(v.nedenler) ? v.nedenler.filter((n): n is KazancNedeni => typeof n === 'string' && NEDENLER.has(n)) : [],
    odul: typeof v.odul === 'string' ? v.odul.slice(0, 80) : null,
    gun: v.gun,
    zaman: typeof v.zaman === 'number' ? v.zaman : 0,
  }
}

export interface SharpointOzeti {
  bakiye: number
  kazanilan: number
  harcanan: number
  seviye: SeviyeAdi
  sonrakiSeviye: { ad: SeviyeAdi; esik: number } | null
}

export function ozetle(hareketler: SharpointHareketi[]): SharpointOzeti {
  let kazanilan = 0
  let harcanan = 0
  for (const h of hareketler) {
    if (h.tur === 'kazanc') kazanilan += h.puan
    else harcanan += h.puan
  }
  const seviye = seviyeBul(kazanilan)
  return { bakiye: Math.max(0, kazanilan - harcanan), kazanilan, harcanan, seviye: seviye.ad, sonrakiSeviye: seviye.sonraki }
}

// Record keys: one per kind, business and day, so a second scan the same
// day replaces instead of adding.
export const ziyaretAnahtari = (isletme: string, gun: string) => `sp:ziyaret:${isletme}:${gun}`
export const grupAnahtari = (isletme: string, gun: string) => `sp:grup:${isletme}:${gun}`
export const odulAnahtari = (isletme: string, gun: string, odulId: string) => `sp:odul:${isletme}:${gun}:${odulId}`

// What a visit earns.
export function ziyaretKazanci(secenek: { oneCikan: boolean; plan: boolean }): { puan: number; nedenler: KazancNedeni[] } {
  const nedenler: KazancNedeni[] = ['ziyaret']
  if (secenek.oneCikan) nedenler.push('one-cikan')
  if (secenek.plan) nedenler.push('plan')
  const puan = nedenler.reduce((t, n) => t + (n === 'ziyaret' ? PUANLAR.ziyaret : n === 'one-cikan' ? PUANLAR.oneCikan : PUANLAR.plan), 0)
  return { puan, nedenler }
}

// ---------- plans ----------
//
// The customer's QR carries short hashes of the plan it belongs to (the
// plan, the group plan, the invites), never the plan itself. Two people
// whose QRs share a hash were on the same plan.

export const AZAMI_PLAN_ISARETI = 8

export async function planIsareti(id: string): Promise<string> {
  return (await sha256Hex(`sharloop-plan/${id}`)).slice(0, 16)
}

export function isaretleriTemizle(deger: unknown): string[] {
  const liste = typeof deger === 'string' ? deger.split(',') : Array.isArray(deger) ? deger : []
  const temiz = liste.filter((x): x is string => typeof x === 'string' && /^[0-9a-f]{16}$/.test(x))
  return [...new Set(temiz)].slice(0, AZAMI_PLAN_ISARETI)
}

// ---------- the till ----------

// A business proves it is the account behind a profile with a request
// signed by that account (this kind), and gets back the till key its
// verify page keeps. Only scans made with the till key earn points, so a
// customer can't earn by opening their own QR.
export const KASA_ISTEK_TURU = 27_003
export const KASA_ZAMAN_PAYI_SN = 5 * 60
