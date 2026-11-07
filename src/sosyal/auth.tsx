import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { motor, motoruBaslat, motoruKapat } from './cekirdek'
import { hesabiKaliciSil, sifreyiKaydet, sifreyleGiris } from './hesap'
import { db } from '../db'
import { cihaziBildirimlerdenCikar } from '../bildirim/useBildirimler'
import {
  acikAnahtar,
  eskiOturumVarMi,
  kayitliKimlik,
  kimlikKaydet,
  kimlikSil,
  kurtarmaKodu,
  kurtarmaKodundanKimlik,
  yeniKimlik,
} from './kimlik'

// Sign-in state for the whole app. The account is a key pair on the device
// (see kimlik.ts); signing in means getting that key onto this device, by
// creating a new one, by username + password, or by the recovery code.

interface Kullanici {
  id: string
}

interface AuthDurumu {
  kullanici: Kullanici | null
  yukleniyor: boolean
  // True right after creating an account on this device: there is nothing
  // to download yet, so setup can start without waiting for a sync.
  yeniHesap: boolean
  // This device had an account in the old (pre-2026-10) system.
  eskiHesapVardi: boolean
  hesapOlustur: () => void
  girisSifre: (kullaniciAdi: string, sifre: string) => Promise<void>
  girisKod: (kod: string) => Promise<void>
  // Creates or replaces the password backup.
  sifreBelirle: (sifre: string) => Promise<void>
  kurtarmaKodunuGetir: () => string | null
  cikis: () => Promise<void>
  // Deletes the account everywhere and everything of it on this device,
  // then starts the app afresh.
  hesabiSil: () => Promise<void>
}

// How long account deletion waits for this device's database to be
// deleted before reloading anyway.
const SILME_BEKLEME_MS = 3000

const AuthContext = createContext<AuthDurumu | null>(null)

export function AuthSaglayici({ children }: { children: ReactNode }) {
  const [kullanici, setKullanici] = useState<Kullanici | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [yeniHesap, setYeniHesap] = useState(false)
  const [eskiHesapVardi] = useState(eskiOturumVarMi)

  const oturumAc = useCallback((gizliAnahtar: Uint8Array) => {
    kimlikKaydet(gizliAnahtar)
    motoruBaslat(gizliAnahtar)
    setKullanici({ id: acikAnahtar(gizliAnahtar) })
  }, [])

  useEffect(() => {
    const sk = kayitliKimlik()
    if (sk) oturumAc(sk)
    setYukleniyor(false)
    return () => motoruKapat()
  }, [oturumAc])

  const deger = useMemo<AuthDurumu>(
    () => ({
      kullanici,
      yukleniyor,
      yeniHesap,
      eskiHesapVardi,
      hesapOlustur() {
        setYeniHesap(true)
        oturumAc(yeniKimlik())
      },
      async girisSifre(kullaniciAdi: string, sifre: string) {
        oturumAc(await sifreyleGiris(kullaniciAdi, sifre))
      },
      async girisKod(kod: string) {
        const sk = kurtarmaKodundanKimlik(kod)
        if (!sk) throw new Error('Kurtarma kodu geçersiz. "nsec1" ile başlayan kodun tamamını yapıştır.')
        oturumAc(sk)
      },
      async sifreBelirle(sifre: string) {
        await sifreyiKaydet(sifre)
      },
      kurtarmaKodunuGetir() {
        const sk = kayitliKimlik()
        return sk ? kurtarmaKodu(sk) : null
      },
      async cikis() {
        // This device stops taking the account's notifications first, while
        // the account can still say so.
        await cihaziBildirimlerdenCikar()
        // The local copy of messages and friends goes with the account; the
        // relays keep it for the next sign-in.
        try {
          await motor().yerelVeriyiSil()
        } catch {
          /* already closed */
        }
        motoruKapat()
        kimlikSil()
        setYeniHesap(false)
        setKullanici(null)
      },
      async hesabiSil() {
        // The account goes from the relays first: if that fails nothing
        // on this device is touched and the user can try again.
        await cihaziBildirimlerdenCikar()
        await hesabiKaliciSil()
        try {
          await motor().yerelVeriyiSil()
        } catch {
          /* already closed */
        }
        motoruKapat()
        kimlikSil()
        // Signed out at once, so the screen never shows the deleted account
        // (or its half-empty setup step) while the rest is cleared.
        setKullanici(null)
        // Plans, the archive and the settings kept on this device go too.
        // Another open connection (the service worker uses this database
        // too) can hold the delete back until it lets go; the page doesn't
        // wait for that, the browser finishes the delete on its own.
        await Promise.race([db.delete().catch(() => {}), new Promise((coz) => setTimeout(coz, SILME_BEKLEME_MS))])
        try {
          localStorage.clear()
        } catch {
          /* storage blocked */
        }
        window.location.replace('/')
      },
    }),
    [kullanici, yukleniyor, yeniHesap, eskiHesapVardi, oturumAc],
  )

  return <AuthContext.Provider value={deger}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthDurumu {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth, AuthSaglayici içinde kullanılmalı')
  return ctx
}
