import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { sb, sosyalAktif, supabase } from './supabase'

// Oturum durumu tüm uygulamada tek yerden okunuyor. ÖNEMLİ: oturum yokluğu
// bir hata değil, normal bir durum — CepDost'un çekirdek işlevi (yakala,
// sınıflandır, planla) hesapsız çalışmaya devam eder. Sadece arkadaşlık
// katmanı giriş ister.

interface AuthDurumu {
  oturum: Session | null
  kullanici: User | null
  yukleniyor: boolean
  girisGoogle: () => Promise<void>
  // Dönen kullanıcıların hızlı yolu.
  girisSifre: (eposta: string, sifre: string) => Promise<void>
  // E-postaya kod gönderir (link DEĞİL — bkz. kodDogrula).
  girisEposta: (eposta: string) => Promise<void>
  kodDogrula: (eposta: string, kod: string) => Promise<void>
  // Kod doğrulandıktan sonra hesaba şifre atar.
  sifreBelirle: (sifre: string) => Promise<void>
  cikis: () => Promise<void>
}

export const SIFRE_MIN = 8

const AuthContext = createContext<AuthDurumu | null>(null)

export function AuthSaglayici({ children }: { children: ReactNode }) {
  const [oturum, setOturum] = useState<Session | null>(null)
  const [yukleniyor, setYukleniyor] = useState(sosyalAktif)

  useEffect(() => {
    if (!sosyalAktif || !supabase) {
      setYukleniyor(false)
      return
    }

    let iptal = false

    supabase.auth.getSession().then(({ data }) => {
      if (iptal) return
      setOturum(data.session)
      setYukleniyor(false)
    })

    const { data: abone } = supabase.auth.onAuthStateChange((_olay, yeniOturum) => {
      setOturum(yeniOturum)
      setYukleniyor(false)
    })

    return () => {
      iptal = true
      abone.subscription.unsubscribe()
    }
  }, [])

  const deger = useMemo<AuthDurumu>(
    () => ({
      oturum,
      kullanici: oturum?.user ?? null,
      yukleniyor,
      async girisGoogle() {
        const { error } = await sb().auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        })
        if (error) throw new Error(googleHatasiCevir(error.message))
      },
      // Link yerine kod: emailRedirectTo BİLEREK verilmiyor. Böylece
      // yönlendirme diye bir şey olmuyor ve Supabase'deki "Site URL"
      // yanlış olsa bile giriş bozulmuyor (link localhost'a düşüyordu).
      // Kullanıcının koda ulaşması için e-posta şablonunda
      // {{ .ConfirmationURL }} yerine {{ .Token }} olmalı.
      async girisEposta(eposta: string) {
        const { error } = await sb().auth.signInWithOtp({
          email: eposta.trim(),
          options: { shouldCreateUser: true },
        })
        if (error) throw new Error(epostaHatasiCevir(error.message))
      },
      async kodDogrula(eposta: string, kod: string) {
        const { error } = await sb().auth.verifyOtp({
          email: eposta.trim(),
          token: kod.replace(/\D/g, ''),
          type: 'email',
        })
        if (error) throw new Error(kodHatasiCevir(error.message))
      },
      async girisSifre(eposta: string, sifre: string) {
        const { error } = await sb().auth.signInWithPassword({
          email: eposta.trim(),
          password: sifre,
        })
        if (error) throw new Error(sifreGirisHatasiCevir(error.message))
      },
      async sifreBelirle(sifre: string) {
        const { error } = await sb().auth.updateUser({ password: sifre })
        if (error) throw new Error(sifreBelirlemeHatasiCevir(error.message))
      },
      async cikis() {
        await sb().auth.signOut()
      },
    }),
    [oturum, yukleniyor],
  )

  return <AuthContext.Provider value={deger}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthDurumu {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth, AuthSaglayici içinde kullanılmalı')
  return ctx
}

// Supabase hataları İngilizce ve teknik geliyor — kullanıcıya ne yapması
// gerektiğini söyleyen Türkçe karşılıklar. Tanımadığımız hataları olduğu
// gibi geçiriyoruz ki hata ayıklarken bilgi kaybolmasın.
function googleHatasiCevir(mesaj: string): string {
  if (/provider is not enabled|Unsupported provider/i.test(mesaj)) {
    return 'Google ile giriş henüz açılmamış. Şimdilik e-posta ile giriş yapabilirsin.'
  }
  return mesaj
}

function epostaHatasiCevir(mesaj: string): string {
  if (/rate limit|too many|only request this after/i.test(mesaj)) {
    return 'Çok fazla deneme oldu, biraz bekleyip tekrar dene.'
  }
  if (/invalid|valid email/i.test(mesaj)) {
    return 'Geçerli bir e-posta adresi gir.'
  }
  return mesaj
}

function sifreGirisHatasiCevir(mesaj: string): string {
  if (/invalid login credentials/i.test(mesaj)) {
    // Supabase "yanlış şifre" ile "böyle bir hesap yok"u bilerek ayırt
    // etmiyor (hesap sızdırmamak için) — mesaj da ayırt etmemeli.
    return 'E-posta veya şifre hatalı. Şifreni hatırlamıyorsan aşağıdan kod ile giriş yapabilirsin.'
  }
  if (/email not confirmed/i.test(mesaj)) {
    return 'Bu e-posta henüz doğrulanmamış. Aşağıdan kod ile giriş yap.'
  }
  if (/rate limit|too many/i.test(mesaj)) {
    return 'Çok fazla deneme oldu, biraz bekleyip tekrar dene.'
  }
  return mesaj
}

function sifreBelirlemeHatasiCevir(mesaj: string): string {
  if (/at least|should be at least|weak|short/i.test(mesaj)) {
    return `Şifre en az ${SIFRE_MIN} karakter olmalı.`
  }
  if (/different from the old/i.test(mesaj)) {
    return 'Yeni şifre eskisiyle aynı olamaz.'
  }
  return mesaj
}

function kodHatasiCevir(mesaj: string): string {
  if (/rate limit|too many/i.test(mesaj)) {
    return 'Çok fazla deneme oldu, biraz bekleyip tekrar dene.'
  }
  // Supabase yanlış kod için de süresi dolmuş kod için de aynı yanıtı
  // veriyor ("Token has expired or is invalid" / otp_expired) — canlı
  // testte doğrulandı. İkisini ayırt edemediğimiz için mesaj her iki
  // ihtimali de kapsamalı, yoksa doğru kodu yanlış yazan kullanıcıya
  // "süresi doldu" demiş oluruz.
  if (/expired|invalid|incorrect/i.test(mesaj)) {
    return 'Kod geçersiz ya da süresi dolmuş. Haneleri kontrol et, gerekirse yeni kod iste.'
  }
  return mesaj
}
