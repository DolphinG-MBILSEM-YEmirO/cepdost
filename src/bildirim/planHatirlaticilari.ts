import { useEffect, useState } from 'react'
import { goruntulemeBasligi, type Kayit } from '../db'
import { geriSayim, yaklasanHatirlatmalar, type YaklasanHatirlatma } from '../lib/planAyrintilari'

// Plan reminders while the app is open (or still in memory on the phone).
// There is no server to wake a closed app at the right minute for free, so
// the dependable alarm is the one in the phone's calendar (see the plan
// screen); this covers the times the app is already running.

// A reminder that came due at most this long ago still shows (the app was
// opened, or the phone woke up, just after).
const GECIKME_MS = 15 * 60_000
// Timers are set this far ahead; the rest wait for the next pass.
const ILERI_MS = 24 * 60 * 60_000
// Reminders already shown, so a reload doesn't show them again.
const GOSTERILENLER_ANAHTARI = 'cepdost_hatirlatilanlar'
const SAKLAMA_MS = 3 * 24 * 60 * 60_000

function gosterilenleriOku(): Record<string, number> {
  try {
    const ham = JSON.parse(localStorage.getItem(GOSTERILENLER_ANAHTARI) ?? '{}') as unknown
    return ham && typeof ham === 'object' ? (ham as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function gosterildiIsaretle(anahtar: string): void {
  const simdi = Date.now()
  const kayitli = Object.fromEntries(
    Object.entries(gosterilenleriOku()).filter(([, zaman]) => typeof zaman === 'number' && simdi - zaman < SAKLAMA_MS),
  )
  kayitli[anahtar] = simdi
  try {
    localStorage.setItem(GOSTERILENLER_ANAHTARI, JSON.stringify(kayitli))
  } catch {
    // Storage full or blocked: at worst the reminder shows again.
  }
}

export function bildirimIzniVar(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted' && 'serviceWorker' in navigator
}

async function goster({ kayit, anahtar }: YaklasanHatirlatma): Promise<void> {
  if (gosterilenleriOku()[anahtar]) return
  gosterildiIsaretle(anahtar)
  const kayitci = await navigator.serviceWorker.ready
  const kalan = geriSayim(kayit)?.metin
  const govde = [kalan, kayit.konum].filter(Boolean).join(' · ')
  await kayitci.showNotification(`${kayit.emoji ? `${kayit.emoji} ` : ''}${goruntulemeBasligi(kayit)}`.slice(0, 80), {
    body: govde || 'Planın yaklaşıyor.',
    tag: `plan-hatirlat:${kayit.id}`,
    icon: '/icons/icon-192.png',
    data: { git: `plan:${kayit.id}` },
  })
}

export function usePlanHatirlaticilari(kayitlar: readonly Kayit[]): void {
  // Timers are throttled or frozen while the phone sleeps; coming back to
  // the app re-checks what came due meanwhile. An hourly pass arms the
  // reminders that move into the window while the app stays open.
  const [uyanis, setUyanis] = useState(0)
  useEffect(() => {
    const uyan = () => setUyanis((n) => n + 1)
    const gorunurlukDegisti = () => {
      if (document.visibilityState === 'visible') uyan()
    }
    const saatlik = setInterval(uyan, 60 * 60_000)
    document.addEventListener('visibilitychange', gorunurlukDegisti)
    return () => {
      clearInterval(saatlik)
      document.removeEventListener('visibilitychange', gorunurlukDegisti)
    }
  }, [])

  useEffect(() => {
    if (!bildirimIzniVar()) return
    const simdi = Date.now()
    const gosterilenler = gosterilenleriOku()
    const zamanlayicilar = yaklasanHatirlatmalar(kayitlar, simdi, GECIKME_MS, ILERI_MS)
      .filter((h) => !gosterilenler[h.anahtar])
      .map((h) =>
        setTimeout(() => {
          void goster(h).catch((err) => console.warn('hatırlatma gösterilemedi', err))
        }, Math.max(0, h.zaman - simdi)),
      )
    return () => zamanlayicilar.forEach(clearTimeout)
  }, [kayitlar, uyanis])
}
