import { useCallback, useEffect, useState } from 'react'
import { finalizeEvent } from 'nostr-tools/pure'
import { motor, motorVarMi, useSosyalSurum } from './cekirdek'
import { db, type Kayit } from '../db'
import {
  KASA_ISTEK_TURU,
  LOOPPOINT_TURU,
  hareketAl,
  ozetle,
  planIsareti,
  type LooppointHareketi,
  type LooppointOzeti,
} from '../../shared/looppoint'
import { bugunTR, mekanAnahtari } from '../../shared/yakinMekanlar'

// The app's side of LoopPoint (rules in shared/looppoint.ts): reads the
// points the server wrote for me, finds the plans a QR should mention,
// and gets a business's till key.

const IMZACI_ANAHTARI = 'cepdost_looppoint_imzacisi'

function kayitliImzaci(): string | null {
  try {
    const deger = localStorage.getItem(IMZACI_ANAHTARI)
    return deger && /^[0-9a-f]{64}$/.test(deger) ? deger : null
  } catch {
    return null
  }
}

let imzaci: Promise<string | null> | null = null

// Tests (and only tests) set the key directly.
export function looppointImzacisiniAyarla(anahtar: string | null): void {
  imzaci = Promise.resolve(anahtar)
}

// The server key every points record must be signed with; null when this
// deployment has LoopPoint off. Remembered for offline use.
export function looppointImzacisi(): Promise<string | null> {
  imzaci ??= (async () => {
    try {
      const res = await fetch('/api/looppoint', { signal: AbortSignal.timeout(6000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const veri = (await res.json()) as { imzaci?: unknown }
      const anahtar = typeof veri.imzaci === 'string' && /^[0-9a-f]{64}$/.test(veri.imzaci) ? veri.imzaci : null
      try {
        if (anahtar) localStorage.setItem(IMZACI_ANAHTARI, anahtar)
      } catch {
        /* memory only */
      }
      return anahtar
    } catch {
      imzaci = null
      return kayitliImzaci()
    }
  })()
  return imzaci
}

// My points, newest first. `yenile` asks the relays first; otherwise the
// copy on this device answers.
export async function looppointHareketleri(yenile = false): Promise<LooppointHareketi[]> {
  if (!motorVarMi()) return []
  const anahtar = await looppointImzacisi()
  if (!anahtar) return []
  const m = motor()
  const kanal = await m.ciftKanali(anahtar)
  if (yenile) await m.kanalSorgula(kanal, { authors: [anahtar] }).catch(() => {})
  const kayitlar = await m.kayitlar(kanal.konu, LOOPPOINT_TURU)
  return kayitlar
    // Only what the server wrote counts; I could write here too.
    .filter((k) => k.yazar === anahtar)
    .flatMap((k) => hareketAl(k.veri) ?? [])
    .sort((a, b) => b.zaman - a.zaman)
}

export interface LooppointDurumu {
  ozet: LooppointOzeti
  hareketler: LooppointHareketi[]
  yukleniyor: boolean
  yenile: () => void
}

export function useLooppoint(): LooppointDurumu {
  const surum = useSosyalSurum()
  const [hareketler, setHareketler] = useState<LooppointHareketi[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [istek, setIstek] = useState(0)

  useEffect(() => {
    let iptal = false
    // The stored copy first, then the relays once per mount or refresh.
    void looppointHareketleri(false).then((h) => !iptal && setHareketler(h))
    void looppointHareketleri(true)
      .then((h) => !iptal && setHareketler(h))
      .finally(() => !iptal && setYukleniyor(false))
    return () => {
      iptal = true
    }
  }, [istek])

  useEffect(() => {
    // Records synced in the background (another device, a scan).
    if (surum === 0) return
    let iptal = false
    void looppointHareketleri(false).then((h) => !iptal && setHareketler(h))
    return () => {
      iptal = true
    }
  }, [surum])

  const yenile = useCallback(() => setIstek((n) => n + 1), [])
  return { ozet: ozetle(hareketler), hareketler, yukleniyor, yenile }
}

// Plans of mine for this place today (or not yet dated), as the short
// hashes a QR carries. Friends on the same plan carry a shared one.
export function bugunkuPlanMi(k: Pick<Kayit, 'durum' | 'konum' | 'baslik' | 'tarih'>, mekanAdi: string, bugun = bugunTR()): boolean {
  if (k.durum !== 'bekliyor' || (k.tarih !== null && k.tarih !== bugun)) return false
  const hedef = mekanAnahtari(mekanAdi)
  return !!hedef && [k.konum, k.baslik].some((m) => !!m && mekanAnahtari(m) === hedef)
}

export async function planIsaretleri(mekanAdi: string): Promise<string[]> {
  const planlar = (await db.kayitlar.toArray()).filter((k) => bugunkuPlanMi(k, mekanAdi))
  const idler = new Set<string>()
  for (const p of planlar) {
    for (const id of [p.id, p.grupPlanId, p.davetId, p.linkAnahtari, ...(p.gidenDavetler ?? [])]) if (id) idler.add(id)
  }
  return Promise.all([...idler].slice(0, 8).map(planIsareti))
}

// The key a business's till page keeps, so its scans earn customers
// points. Asked with a request signed by the business account.
export async function kasaAnahtariAl(): Promise<string> {
  const istek = finalizeEvent(
    { kind: KASA_ISTEK_TURU, created_at: Math.floor(Date.now() / 1000), tags: [], content: 'sharloop-kasa' },
    motor().gizliAnahtar(),
  )
  let res: Response
  try {
    res = await fetch('/api/looppoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ islem: 'kasa', istek }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new Error('İnternet bağlantını kontrol edip tekrar dene.')
  }
  const veri = (await res.json().catch(() => null)) as { kasa?: string; error?: string } | null
  if (!res.ok || !veri?.kasa) throw new Error(veri?.error ?? 'Kasa bağlantısı alınamadı.')
  return veri.kasa
}
