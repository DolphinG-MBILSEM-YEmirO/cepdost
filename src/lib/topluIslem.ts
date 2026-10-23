import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Kayit, db, goruntulemeBasligi } from '../db'
import { localDateString } from './format'
import { paylasimlariGuncelle, planiSil } from './planPaylasimi'
import { goreceGun, gunEkle } from './takvimIzgarasi'
import { silmeMesaji } from './arsivListesi'

// Moving several plans to another day, or marking them done, in one go,
// with a short window to take it back.

export type TopluIslem = { tur: 'tasi'; tarih: string } | { tur: 'yapildi' }

// What a plan looked like before, enough to put it back.
export type OncekiHal = Pick<Kayit, 'id' | 'tarih' | 'durum'>

// How long "Geri al" stays on screen.
export const GERI_AL_MS = 6000

// All the plans change in one write, so the screen changes in one go. Moves
// then reach each plan's link and invite as planiGuncelle's do.
export async function topluUygula(kayitlar: Kayit[], islem: TopluIslem): Promise<OncekiHal[]> {
  const degisecek = kayitlar.filter((k) => (islem.tur === 'tasi' ? k.tarih !== islem.tarih : k.durum !== 'yapildi'))
  const degisiklik: Partial<Kayit> = islem.tur === 'tasi' ? { tarih: islem.tarih } : { durum: 'yapildi' }
  await db.transaction('rw', db.kayitlar, async () => {
    for (const k of degisecek) await db.kayitlar.update(k.id, degisiklik)
  })
  if (islem.tur === 'tasi') for (const k of degisecek) paylasimlariGuncelle(k, degisiklik)
  return degisecek.map((k) => ({ id: k.id, tarih: k.tarih, durum: k.durum }))
}

// Puts plans back as they were. A plan deleted in the meantime stays deleted.
export async function geriAl(onceki: OncekiHal[]): Promise<void> {
  const tasinanlar: Array<[Kayit, Partial<Kayit>]> = []
  await db.transaction('rw', db.kayitlar, async () => {
    for (const eski of onceki) {
      const k = await db.kayitlar.get(eski.id)
      if (!k) continue
      const degisiklik: Partial<Kayit> = {}
      if (k.tarih !== eski.tarih) degisiklik.tarih = eski.tarih
      if (k.durum !== eski.durum) degisiklik.durum = eski.durum
      if (Object.keys(degisiklik).length === 0) continue
      await db.kayitlar.update(k.id, degisiklik)
      if ('tarih' in degisiklik) tasinanlar.push([k, degisiklik])
    }
  })
  for (const [k, degisiklik] of tasinanlar) paylasimlariGuncelle(k, degisiklik)
}

export function islemMesaji(kayitlar: Kayit[], islem: TopluIslem, bugun: string): string {
  const ozne = kayitlar.length === 1 ? `“${goruntulemeBasligi(kayitlar[0])}”` : `${kayitlar.length} plan`
  if (islem.tur === 'yapildi') return `${ozne} yapıldı olarak işaretlendi`
  // Ideas get their first day rather than being moved.
  if (kayitlar.every((k) => !k.tarih)) return `${ozne} için gün seçildi: ${goreceGun(islem.tarih, bugun)}`
  if (islem.tarih === bugun) return `${ozne} bugüne alındı`
  if (islem.tarih === gunEkle(bugun, 1)) return `${ozne} yarına ertelendi`
  return `${ozne} taşındı: ${goreceGun(islem.tarih, bugun)}`
}

export interface GeriAlinabilir {
  mesaj: string
  onceki: OncekiHal[]
}

// The state behind a screen's bulk actions and its "Geri al" bar.
export function useTopluIslem() {
  const [sonIslem, setSonIslem] = useState<GeriAlinabilir | null>(null)
  const [mesgul, setMesgul] = useState(false)

  useEffect(() => {
    if (!sonIslem) return
    const zamanlayici = setTimeout(() => setSonIslem(null), GERI_AL_MS)
    return () => clearTimeout(zamanlayici)
  }, [sonIslem])

  async function uygula(kayitlar: Kayit[], islem: TopluIslem) {
    if (kayitlar.length === 0 || mesgul) return
    setMesgul(true)
    try {
      const onceki = await topluUygula(kayitlar, islem)
      const degisen = kayitlar.filter((k) => onceki.some((o) => o.id === k.id))
      if (degisen.length > 0) setSonIslem({ mesaj: islemMesaji(degisen, islem, localDateString()), onceki })
    } finally {
      setMesgul(false)
    }
  }

  async function sonIslemiGeriAl() {
    if (!sonIslem) return
    setSonIslem(null)
    await geriAl(sonIslem.onceki)
  }

  return { uygula, mesgul, sonIslem, geriAl: sonIslemiGeriAl, kapat: () => setSonIslem(null) }
}

interface BekleyenSilme {
  mesaj: string
  kayitlar: Kayit[]
}

// Deleting several records waits out the "Geri al" window: until then they
// are only hidden, so taking it back loses nothing (a plan's link and
// invite included). Closing the bar, a new delete or leaving the screen
// deletes them at once.
export function useGeriAlinabilirSilme() {
  const [bekleyen, setBekleyen] = useState<BekleyenSilme | null>(null)
  const bekleyenRef = useRef<BekleyenSilme | null>(null)

  const tamamla = useCallback(() => {
    const silinecek = bekleyenRef.current
    if (!silinecek) return
    bekleyenRef.current = null
    setBekleyen(null)
    for (const k of silinecek.kayitlar) void planiSil(k)
  }, [])

  const baslat = useCallback(
    (kayitlar: Kayit[]) => {
      if (kayitlar.length === 0) return
      tamamla()
      const yeni = { mesaj: silmeMesaji(kayitlar), kayitlar }
      bekleyenRef.current = yeni
      setBekleyen(yeni)
    },
    [tamamla],
  )

  const geriAl = useCallback(() => {
    bekleyenRef.current = null
    setBekleyen(null)
  }, [])

  useEffect(() => {
    if (!bekleyen) return
    const zamanlayici = setTimeout(tamamla, GERI_AL_MS)
    return () => clearTimeout(zamanlayici)
  }, [bekleyen, tamamla])

  // Leaving the screen keeps the delete.
  useEffect(() => tamamla, [tamamla])

  const gizli = useMemo(() => new Set(bekleyen?.kayitlar.map((k) => k.id)), [bekleyen])
  return { bekleyen, gizli, baslat, geriAl, kapat: tamamla }
}
