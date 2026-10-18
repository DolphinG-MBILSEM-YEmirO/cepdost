import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { KodKutulari } from './KodKutulari'
import { useAuth } from '../sosyal/auth'
import { girisSaglayicilariniGetir, type GirisSaglayicilari } from '../sosyal/supabase'

// Supabase'in OTP uzunluğu proje ayarında (Email OTP Length) belirleniyor.
// Kutu sayısı buradan geliyor; ayar değişirse tek yeri güncellemek yeter.
const KOD_UZUNLUK = 6

// Üç aşama: şifreyle giriş (dönen kullanıcı), kod isteme (yeni kullanıcı
// veya şifresini unutan), kod girme.
type Asama = 'sifre' | 'kodIstek' | 'kodGir'

interface Props {
  baslik?: string
  altBaslik?: string
  tanitimBaslik?: string
  tanitimMetin?: string
  // Uygulama girişinde (kapıda) gösterilirken "istersen giriş yapmadan
  // devam et" demek yanlış olur — o metin duruma göre değişmeli.
  altNot?: string
}

export function GirisEkrani({
  baslik = 'Arkadaşlar',
  altBaslik = 'Birlikte plan yapmak için',
  tanitimBaslik = 'Arkadaşlarınla planla',
  tanitimMetin = 'Arkadaşlarının hangi saatlerinin dolu olduğunu gör, müsait oldukları bir ana plan daveti gönder.',
  altNot = 'Giriş yapmadan da CepDost\'un tamamını kullanmaya devam edebilirsin — hesap sadece arkadaşlık özellikleri için gerekiyor.',
}: Props = {}) {
  const { girisGoogle, girisSifre, girisEposta, kodDogrula } = useAuth()
  const [asama, setAsama] = useState<Asama>('sifre')
  const [eposta, setEposta] = useState('')
  const [sifre, setSifre] = useState('')
  const [kod, setKod] = useState('')
  const [yukleniyor, setYukleniyor] = useState<'google' | 'sifre' | 'kodGonder' | 'kodDogrula' | null>(
    null,
  )
  const [hata, setHata] = useState<string | null>(null)
  const [saglayicilar, setSaglayicilar] = useState<GirisSaglayicilari | null>(null)

  useEffect(() => {
    let iptal = false
    girisSaglayicilariniGetir().then((s) => {
      if (!iptal) setSaglayicilar(s)
    })
    return () => {
      iptal = true
    }
  }, [])

  async function googleTikla() {
    setHata(null)
    setYukleniyor('google')
    try {
      await girisGoogle()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Giriş başarısız')
      setYukleniyor(null)
    }
  }

  async function sifreyleGir(e: React.FormEvent) {
    e.preventDefault()
    if (!eposta.trim() || !sifre) return
    setHata(null)
    setYukleniyor('sifre')
    try {
      // Başarılıysa oturum açılır ve bu ekran kaldırılır.
      await girisSifre(eposta, sifre)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Giriş başarısız')
      setYukleniyor(null)
    }
  }

  async function kodGonder() {
    if (!eposta.trim()) {
      setHata('Önce e-posta adresini gir.')
      return
    }
    setHata(null)
    setYukleniyor('kodGonder')
    try {
      await girisEposta(eposta)
      setKod('')
      setAsama('kodGir')
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Kod gönderilemedi')
    } finally {
      setYukleniyor(null)
    }
  }

  async function kodDogrulaVeGir(tamKod: string) {
    setHata(null)
    setYukleniyor('kodDogrula')
    try {
      await kodDogrula(eposta, tamKod)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Doğrulama başarısız')
      setYukleniyor(null)
    }
  }

  // ---------- kod girme ----------
  if (asama === 'kodGir') {
    return (
      <div className="flex flex-col h-full">
        <div className="px-5 pt-[calc(1rem+var(--safe-top))] pb-3">
          <h1 className="font-display text-2xl font-bold text-ink-700">Kodu gir</h1>
          <p className="text-sm text-ink-400 mt-0.5">E-postana bir giriş kodu gönderdim</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-24">
          <div className="card p-5 mb-5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-teal-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="Mail" className="w-7 h-7 text-teal-600" />
            </div>
            <p className="text-sm text-ink-400">
              <strong className="text-ink-600 break-all">{eposta}</strong> adresine gönderildi.
            </p>
          </div>

          <KodKutulari
            uzunluk={KOD_UZUNLUK}
            deger={kod}
            onDegisim={setKod}
            onTamamlandi={(tam) => void kodDogrulaVeGir(tam)}
            devreDisi={yukleniyor === 'kodDogrula'}
          />

          {yukleniyor === 'kodDogrula' && (
            <div className="flex items-center justify-center gap-2 mt-4 text-sm text-ink-400">
              <Icon name="Loader2" className="w-4 h-4 animate-spin" />
              Doğrulanıyor...
            </div>
          )}

          {hata && (
            <div className="mt-5 flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 animate-fade-in">
              <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-700">{hata}</p>
            </div>
          )}

          <div className="flex flex-col items-center gap-2 mt-6">
            <button
              onClick={() => void kodGonder()}
              disabled={yukleniyor !== null}
              className="text-sm font-medium text-coral-600 disabled:opacity-50"
            >
              Kod gelmedi, tekrar gönder
            </button>
            <button
              onClick={() => {
                setAsama('sifre')
                setKod('')
                setHata(null)
              }}
              className="text-xs text-ink-400"
            >
              Geri dön
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---------- kod isteme ----------
  if (asama === 'kodIstek') {
    return (
      <div className="flex flex-col h-full">
        <div className="px-5 pt-[calc(1rem+var(--safe-top))] pb-3">
          <h1 className="font-display text-2xl font-bold text-ink-700">Kod ile giriş</h1>
          <p className="text-sm text-ink-400 mt-0.5">Şifre gerekmez</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-24">
          <p className="text-sm text-ink-400 mb-4 leading-relaxed">
            E-posta adresine tek kullanımlık bir kod göndereceğim. İlk kez giriyorsan hesabın bu
            adımda oluşur.
          </p>

          <input
            type="email"
            value={eposta}
            onChange={(e) => setEposta(e.target.value)}
            placeholder="ornek@eposta.com"
            autoComplete="email"
            autoFocus
            className="input-field mb-3"
          />

          <button
            onClick={() => void kodGonder()}
            disabled={yukleniyor !== null || !eposta.trim()}
            className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {yukleniyor === 'kodGonder' ? (
              <>
                <Icon name="Loader2" className="w-5 h-5 animate-spin" />
                Gönderiliyor...
              </>
            ) : (
              <>
                <Icon name="Mail" className="w-5 h-5" />
                Kod gönder
              </>
            )}
          </button>

          {hata && (
            <div className="mt-4 flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
              <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-700">{hata}</p>
            </div>
          )}

          <button
            onClick={() => {
              setAsama('sifre')
              setHata(null)
            }}
            className="w-full text-sm text-ink-400 mt-5"
          >
            Şifremle giriş yapacağım
          </button>
        </div>
      </div>
    )
  }

  // ---------- şifreyle giriş (varsayılan) ----------
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-[calc(1rem+var(--safe-top))] pb-3">
        <h1 className="font-display text-2xl font-bold text-ink-700">{baslik}</h1>
        <p className="text-sm text-ink-400 mt-0.5">{altBaslik}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-24">
        <div className="card p-5 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-coral-100 flex items-center justify-center mb-4">
            <Icon name="Users" className="w-7 h-7 text-coral-500" />
          </div>
          <h2 className="font-display text-lg font-bold text-ink-700 mb-2">{tanitimBaslik}</h2>
          <p className="text-sm text-ink-400 leading-relaxed">{tanitimMetin}</p>
        </div>

        {/* Gizlilik vaadi giriş yapmadan ÖNCE söyleniyor. */}
        <div className="card p-4 mb-6 bg-teal-50/60 border-teal-100">
          <div className="flex items-start gap-2.5">
            <Icon name="ShieldCheck" className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-teal-800 mb-1">Planların sende kalır</p>
              <p className="text-xs text-teal-700/90 leading-relaxed">
                Arkadaşların sadece <strong>dolu saatlerini</strong> görür — ne yaptığını, nereye
                gittiğini, notlarını değil. Bunlar hiçbir zaman telefonundan çıkmıyor.
              </p>
            </div>
          </div>
        </div>

        {saglayicilar?.google && (
          <>
            <button
              onClick={googleTikla}
              disabled={yukleniyor !== null}
              className="w-full bg-cream-50 border border-ink-100/60 text-ink-700 font-semibold rounded-2xl px-5 py-3.5 flex items-center justify-center gap-3 active:scale-[0.97] transition-all disabled:opacity-50 shadow-soft"
            >
              {yukleniyor === 'google' ? (
                <Icon name="Loader2" className="w-5 h-5 animate-spin" />
              ) : (
                <GoogleLogo />
              )}
              Google ile devam et
            </button>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-ink-100" />
              <span className="text-xs text-ink-300 font-medium">veya</span>
              <div className="flex-1 h-px bg-ink-100" />
            </div>
          </>
        )}

        <form onSubmit={sifreyleGir} className="space-y-3">
          <input
            type="email"
            value={eposta}
            onChange={(e) => setEposta(e.target.value)}
            placeholder="ornek@eposta.com"
            autoComplete="email"
            className="input-field"
          />
          <input
            type="password"
            value={sifre}
            onChange={(e) => setSifre(e.target.value)}
            placeholder="Şifren"
            autoComplete="current-password"
            className="input-field"
          />
          <button
            type="submit"
            disabled={yukleniyor !== null || !eposta.trim() || !sifre}
            className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {yukleniyor === 'sifre' ? (
              <>
                <Icon name="Loader2" className="w-5 h-5 animate-spin" />
                Giriş yapılıyor...
              </>
            ) : (
              'Giriş yap'
            )}
          </button>
        </form>

        {hata && (
          <div className="mt-4 flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 animate-fade-in">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        <button
          onClick={() => {
            setAsama('kodIstek')
            setHata(null)
          }}
          className="w-full mt-5 text-sm font-semibold text-coral-600"
        >
          İlk kez mi giriyorsun ya da şifreni mi unuttun? Kod ile devam et
        </button>

        <p className="text-xs text-ink-300 text-center mt-6 leading-relaxed">{altNot}</p>
      </div>
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.14 6.16-4.14Z"
      />
    </svg>
  )
}
