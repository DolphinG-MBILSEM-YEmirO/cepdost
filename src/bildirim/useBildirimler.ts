import { useEffect, useRef } from 'react'
import { gitGecerliMi } from '../../shared/bildirim'
import { db } from '../db'
import { arkadaslariGetir } from '../sosyal/api'
import { adresimiKaydet, adresimiSil } from '../sosyal/bildirimler'
import { motor, motorVarMi, useSosyalSurum } from '../sosyal/cekirdek'
import { tumGrupUyeleri } from '../sosyal/gruplar'
import { adresiTazele, bildirimleriKapat, guncelAdres } from './cihaz'
import { bilinenleriSil, bilinenleriYaz } from './bilinenler'

// The app's side of notifications while someone is signed in: keeps this
// device's address published, keeps the list of people whose notifications
// may show text up to date for the service worker, and follows a tapped
// notification into the app.

const BILINENLER_GECIKME_MS = 1500

// Where a tapped notification leads (?git= on a fresh start, a message from
// the service worker when the app was already open). Read once at start.
function adrestekiGit(): string | null {
  const url = new URL(window.location.href)
  const git = url.searchParams.get('git')
  if (git === null) return null
  url.searchParams.delete('git')
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  return gitGecerliMi(git) ? git : null
}

let baslangicGit = typeof window === 'undefined' ? null : adrestekiGit()

export function useBildirimler(girisli: boolean, onGit: (git: string) => void) {
  const surum = useSosyalSurum()
  const onGitRef = useRef(onGit)
  useEffect(() => {
    onGitRef.current = onGit
  }, [onGit])

  // Publish this device's address (again) at start: a new server key or
  // a restored account means a new or missing entry.
  useEffect(() => {
    if (!girisli) return
    void adresiTazele()
      .then(({ adres, eski }) => (adres ? adresimiKaydet(adres, eski) : eski ? adresimiSil(eski) : undefined))
      .catch((err) => console.warn('bildirim adresi tazelenemedi', err))
  }, [girisli])

  // Friends, people I asked, group members, me (a test from the settings)
  // and my plan links (old ones and Davet invites).
  useEffect(() => {
    if (!girisli || !motorVarMi()) return
    const zamanlayici = setTimeout(() => {
      void (async () => {
        const arkadaslar = await arkadaslariGetir()
        const kisiler = arkadaslar.filter((a) => a.durum === 'kabul' || a.yon === 'giden').map((a) => a.profil.id)
        const uyeler = await tumGrupUyeleri()
        const linkler = (await db.kayitlar.filter((k) => !!k.planLinki || !!k.davetLinki).toArray()).flatMap((k) =>
          [k.planLinki, k.davetLinki].filter((x): x is string => !!x),
        )
        await bilinenleriYaz([...kisiler, ...uyeler, motor().benimId], linkler)
      })().catch(() => {})
    }, BILINENLER_GECIKME_MS)
    return () => clearTimeout(zamanlayici)
  }, [girisli, surum])

  // Following a notification: the one that opened the app, then any tapped
  // while it's open.
  useEffect(() => {
    if (!girisli) return
    if (baslangicGit) {
      onGitRef.current(baslangicGit)
      baslangicGit = null
    }
    if (!('serviceWorker' in navigator)) return
    const dinle = (e: MessageEvent) => {
      const veri = e.data as { tur?: unknown; git?: unknown } | null
      if (veri?.tur === 'bildirim-ac' && typeof veri.git === 'string' && gitGecerliMi(veri.git)) onGitRef.current(veri.git)
    }
    navigator.serviceWorker.addEventListener('message', dinle)
    return () => navigator.serviceWorker.removeEventListener('message', dinle)
  }, [girisli])
}

// Signing out: this device stops taking the account's notifications.
// Bounded, so a slow network never holds up signing out.
export async function cihaziBildirimlerdenCikar(): Promise<void> {
  const is = (async () => {
    const adres = await guncelAdres()
    if (adres && motorVarMi()) await adresimiSil(adres.endpoint).catch(() => {})
    await bildirimleriKapat()
    await bilinenleriSil()
  })()
  await Promise.race([is.catch(() => {}), new Promise((r) => setTimeout(r, 3000))])
}
