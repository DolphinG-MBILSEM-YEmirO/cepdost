import { useState } from 'react'
import { Icon } from './Icon'
import { useAuth } from '../sosyal/auth'

// The gate before the app. A new account is created on the spot (no email,
// no waiting for a code); returning users sign in with username + password,
// or with their recovery code if they forgot the password.
type Asama = 'karsilama' | 'sifre' | 'kod'

interface Props {
  baslik?: string
  altBaslik?: string
  tanitimBaslik?: string
  tanitimMetin?: string
  altNot?: string
}

export function GirisEkrani({
  baslik = "CepDost'a hoş geldin",
  altBaslik = 'Başlamak için bir hesap aç ya da giriş yap',
  tanitimBaslik = 'Kaydettiğin şey işe yarasın',
  tanitimMetin = 'Paylaştığın linkleri ve görselleri otomatik planlara çevirir, arkadaşlarınla birlikte plan yapmanı sağlar.',
  altNot = 'Hesabın plan detaylarını telefonundan çıkarmaz. Arkadaşlarınla paylaştıkların uçtan uca şifrelenir.',
}: Props = {}) {
  const { hesapOlustur, girisSifre, girisKod, eskiHesapVardi } = useAuth()
  const [asama, setAsama] = useState<Asama>('karsilama')
  const [kullaniciAdi, setKullaniciAdi] = useState('')
  const [sifre, setSifre] = useState('')
  const [kod, setKod] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  async function calistir(is: () => Promise<void>) {
    setHata(null)
    setYukleniyor(true)
    try {
      // On success the gate moves on and this screen goes away.
      await is()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Giriş başarısız')
      setYukleniyor(false)
    }
  }

  function geri() {
    setAsama('karsilama')
    setHata(null)
  }

  const hataKutusu = hata && (
    <div className="mt-4 flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 animate-fade-in">
      <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
      <p className="text-sm text-rose-700">{hata}</p>
    </div>
  )

  if (asama === 'sifre') {
    return (
      <Cerceve baslik="Giriş yap" altBaslik="Kullanıcı adın ve şifrenle" onGeri={geri}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (kullaniciAdi.trim() && sifre) void calistir(() => girisSifre(kullaniciAdi, sifre))
          }}
          className="space-y-3"
        >
          <label htmlFor="giris-kullanici" className="sr-only">
            Kullanıcı adı
          </label>
          <div className="flex items-center bg-cream-50 border border-ink-100/40 rounded-2xl px-4">
            <span className="text-ink-300">@</span>
            <input
              id="giris-kullanici"
              value={kullaniciAdi}
              onChange={(e) => setKullaniciAdi(e.target.value)}
              placeholder="kullaniciadi"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              autoFocus
              className="flex-1 bg-transparent py-3 px-1 text-ink-700 placeholder:text-ink-300 focus:outline-none"
            />
          </div>
          <label htmlFor="giris-sifre" className="sr-only">
            Şifre
          </label>
          <input
            id="giris-sifre"
            type="password"
            value={sifre}
            onChange={(e) => setSifre(e.target.value)}
            placeholder="Şifren"
            autoComplete="current-password"
            className="input-field"
          />
          <button
            type="submit"
            disabled={yukleniyor || !kullaniciAdi.trim() || !sifre}
            className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {yukleniyor ? (
              <>
                <Icon name="Loader2" className="w-5 h-5 animate-spin" />
                Hesabın açılıyor...
              </>
            ) : (
              'Giriş yap'
            )}
          </button>
        </form>
        {hataKutusu}
        <button
          onClick={() => {
            setAsama('kod')
            setHata(null)
          }}
          className="w-full mt-5 text-sm font-semibold text-coral-600"
        >
          Şifreni mi unuttun? Kurtarma koduyla gir
        </button>
      </Cerceve>
    )
  }

  if (asama === 'kod') {
    return (
      <Cerceve baslik="Kurtarma koduyla gir" altBaslik="Ayarlar'da sakladığın kod" onGeri={geri}>
        <div className="card p-4 mb-4 bg-cream-50">
          <p className="text-xs text-ink-500 leading-relaxed">
            Kurtarma kodu <strong>nsec1</strong> ile başlayan uzun bir koddur. Hesabını açtığın
            telefonda <strong>Hesabım → Ayarlar → Hesap güvenliği</strong> bölümünde bulunur.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (kod.trim()) void calistir(() => girisKod(kod))
          }}
          className="space-y-3"
        >
          <label htmlFor="giris-kod" className="sr-only">
            Kurtarma kodu
          </label>
          <textarea
            id="giris-kod"
            value={kod}
            onChange={(e) => setKod(e.target.value)}
            placeholder="nsec1..."
            rows={3}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            className="input-field resize-none font-mono text-sm"
          />
          <button
            type="submit"
            disabled={yukleniyor || !kod.trim()}
            className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {yukleniyor ? <Icon name="Loader2" className="w-5 h-5 animate-spin" /> : 'Giriş yap'}
          </button>
        </form>
        {hataKutusu}
      </Cerceve>
    )
  }

  return (
    <Cerceve baslik={baslik} altBaslik={altBaslik}>
      <div className="card p-5 mb-5">
        <div className="w-14 h-14 rounded-2xl bg-coral-100 flex items-center justify-center mb-4">
          <Icon name="Users" className="w-7 h-7 text-coral-500" />
        </div>
        <h2 className="font-display text-lg font-bold text-ink-700 mb-2">{tanitimBaslik}</h2>
        <p className="text-sm text-ink-400 leading-relaxed">{tanitimMetin}</p>
      </div>

      {/* The privacy promise comes before signing up. */}
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

      {eskiHesapVardi && (
        <div className="card p-4 mb-6 bg-amber-50/70 border-amber-100">
          <div className="flex items-start gap-2.5">
            <Icon name="Info" className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              CepDost hesapları yenilendi: artık e-posta gerekmiyor ve sosyal veriler şifreli
              saklanıyor. Planların ve arşivin bu telefonda duruyor; arkadaşlarını yeni hesabınla
              tekrar eklemen yeterli.
            </p>
          </div>
        </div>
      )}

      <button
        onClick={() => void calistir(async () => hesapOlustur())}
        disabled={yukleniyor}
        className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Icon name="Sparkles" className="w-5 h-5" />
        Hesap oluştur
      </button>
      <button
        onClick={() => {
          setAsama('sifre')
          setHata(null)
        }}
        disabled={yukleniyor}
        className="w-full mt-3 btn-ghost border border-ink-100/40 disabled:opacity-50"
      >
        Zaten hesabım var
      </button>
      {hataKutusu}

      <p className="text-xs text-ink-300 text-center mt-6 leading-relaxed">{altNot}</p>
    </Cerceve>
  )
}

function Cerceve({
  baslik,
  altBaslik,
  onGeri,
  children,
}: {
  baslik: string
  altBaslik: string
  onGeri?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-[calc(1rem+var(--safe-top))] pb-3 flex items-start gap-3">
        {onGeri && (
          <button
            onClick={onGeri}
            aria-label="Geri"
            className="w-10 h-10 rounded-full bg-ink-50 flex items-center justify-center active:scale-90 transition-transform shrink-0"
          >
            <Icon name="ArrowLeft" className="w-5 h-5 text-ink-500" />
          </button>
        )}
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-700">{baslik}</h1>
          <p className="text-sm text-ink-400 mt-0.5">{altBaslik}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-24">{children}</div>
    </div>
  )
}
