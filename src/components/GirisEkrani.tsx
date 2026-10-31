import { useState } from 'react'
import { Icon } from './Icon'
import { useAuth } from '../sosyal/auth'
import { useGeriAdimi } from '../lib/geriTusu'
import { SLOGAN, UYGULAMA_ADI } from '../../shared/marka'

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
  baslik = 'Aramıza hoş geldin',
  altBaslik = `${UYGULAMA_ADI} için bir hesap aç ya da giriş yap`,
  tanitimBaslik = SLOGAN,
  tanitimMetin = 'Paylaştığın linkleri ve görselleri plana çevirir, arkadaşlarınla herkese uyan zamanı bulmanı sağlar.',
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
  useGeriAdimi(geri, asama !== 'karsilama')

  const hataKutusu = hata && (
    <div className="mt-4 flex items-start gap-2 bg-white border border-rose-200 rounded-xl px-4 py-3 animate-fade-in">
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
          <div className="flex items-center bg-white border border-ink-200 rounded-xl px-4">
            <span className="text-ink-400">@</span>
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
          className="w-full mt-5 text-sm font-semibold text-brand-600"
        >
          Şifreni mi unuttun? Kurtarma koduyla gir
        </button>
      </Cerceve>
    )
  }

  if (asama === 'kod') {
    return (
      <Cerceve baslik="Kurtarma koduyla gir" altBaslik="Ayarlar'da sakladığın kod" onGeri={geri}>
        <div className="card p-4 mb-4 bg-mist-50">
          <p className="text-xs text-ink-500 leading-relaxed">
            Kurtarma kodu <strong>nsec1</strong> ile başlayan uzun bir koddur. Hesabını açtığın
            telefonda <strong>Profil → Ayarlar → Hesap güvenliği</strong> bölümünde bulunur.
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
      <div className="mb-6">
        <h2 className="text-title text-ink-800 mb-1.5">{tanitimBaslik}</h2>
        <p className="text-callout font-normal text-ink-500 leading-relaxed">{tanitimMetin}</p>
      </div>

      {/* What the app does, then the privacy promise, before signing up. */}
      <ul className="bg-white rounded-2xl border border-ink-100 divide-y divide-ink-100 mb-6">
        {[
          { ikon: 'Users' as const, baslik: 'Arkadaşlarınla planla', metin: 'Kullanıcı adıyla ekle, planı gönder, kimin geldiğini gör.' },
          { ikon: 'CalendarClock' as const, baslik: 'Herkese uyan saati bul', metin: 'Boş saatler karşılaştırılır, uygun aralık önerilir.' },
          {
            ikon: 'ShieldCheck' as const,
            baslik: 'Planların sende kalır',
            metin: 'Arkadaşların yalnızca dolu saatlerini görür; ne yaptığın ve notların telefonundan çıkmaz.',
          },
        ].map((m) => (
          <li key={m.baslik} className="flex items-start gap-3 px-4 py-3">
            <span className="w-8 h-8 rounded-lg bg-ink-50 flex items-center justify-center shrink-0">
              <Icon name={m.ikon} className="w-[18px] h-[18px] text-ink-500" />
            </span>
            <span className="min-w-0">
              <span className="block text-body font-medium text-ink-800">{m.baslik}</span>
              <span className="block text-caption font-normal text-ink-400 mt-0.5">{m.metin}</span>
            </span>
          </li>
        ))}
      </ul>

      {eskiHesapVardi && (
        <div className="rounded-2xl p-4 mb-6 bg-white border border-amber-200">
          <div className="flex items-start gap-2.5">
            <Icon name="Info" className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              {UYGULAMA_ADI} hesapları yenilendi: sosyal veriler artık şifreli saklanıyor ve giriş
              kullanıcı adı ile şifreyle yapılıyor. Planların ve arşivin bu telefonda duruyor; arkadaşlarını yeni hesabınla
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
        <Icon name="UserPlus" className="w-5 h-5" />
        Hesap oluştur
      </button>
      <button
        onClick={() => {
          setAsama('sifre')
          setHata(null)
        }}
        disabled={yukleniyor}
        className="w-full mt-3 btn-ghost border border-ink-200 bg-white text-ink-700 disabled:opacity-50"
      >
        Zaten hesabım var
      </button>
      {hataKutusu}

      <p className="text-xs text-ink-400 text-center mt-6 leading-relaxed">{altNot}</p>
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
      <div className="px-4 pt-[calc(1.5rem+var(--safe-top))] pb-5 flex items-start gap-3">
        {onGeri && (
          <button
            onClick={onGeri}
            aria-label="Geri"
            className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-ink-50 active:bg-ink-100 shrink-0"
          >
            <Icon name="ArrowLeft" className="w-5 h-5 text-ink-500" />
          </button>
        )}
        <div>
          {!onGeri && <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-xl mb-5 lg:hidden" />}
          <h1 className="text-display text-ink-800 tracking-tight">{baslik}</h1>
          <p className="text-callout font-normal text-ink-400 mt-1">{altBaslik}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-24">{children}</div>
    </div>
  )
}
