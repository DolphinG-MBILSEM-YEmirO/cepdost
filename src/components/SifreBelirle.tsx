import { useState } from 'react'
import { Icon } from './Icon'
import { useAuth } from '../sosyal/auth'
import { SIFRE_MIN } from '../sosyal/hesap'

// Second setup step: a password that encrypts the account key, so the
// user can sign in on another phone with username + password. The
// recovery code (Settings) is the fallback if the password is forgotten.
// Also used from Settings to change the password (`degistir`).
export function SifreBelirle({
  onTamamlandi,
  degistir = false,
  onVazgec,
}: {
  onTamamlandi: () => Promise<void>
  degistir?: boolean
  onVazgec?: () => void
}) {
  const { sifreBelirle } = useAuth()
  const [sifre, setSifre] = useState('')
  const [tekrar, setTekrar] = useState('')
  const [gorunur, setGorunur] = useState(false)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  const yeterliUzunluk = sifre.length >= SIFRE_MIN
  const eslesiyor = sifre.length > 0 && sifre === tekrar

  async function kaydet(e: React.FormEvent) {
    e.preventDefault()
    if (!yeterliUzunluk) {
      setHata(`Şifre en az ${SIFRE_MIN} karakter olmalı.`)
      return
    }
    if (!eslesiyor) {
      setHata('İki şifre aynı değil.')
      return
    }
    setKaydediliyor(true)
    setHata(null)
    try {
      // Also marks the profile, but only after the backup is published:
      // in the other order a failed upload would leave no password.
      await sifreBelirle(sifre)
      await onTamamlandi()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Şifre kaydedilemedi')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-[calc(1rem+var(--safe-top))] pb-3 flex items-start gap-3">
        {onVazgec && (
          <button
            onClick={onVazgec}
            aria-label="Geri"
            className="w-10 h-10 rounded-full bg-ink-50 flex items-center justify-center active:scale-90 transition-transform shrink-0"
          >
            <Icon name="ArrowLeft" className="w-5 h-5 text-ink-500" />
          </button>
        )}
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-700">{degistir ? 'Şifreni değiştir' : 'Şifre belirle'}</h1>
          <p className="text-sm text-ink-400 mt-0.5">Başka bir telefondan bununla gireceksin</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-24">
        <div className="card p-4 mb-4 bg-teal-50/60 border-teal-100">
          <div className="flex items-start gap-2.5">
            <Icon name="ShieldCheck" className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
            <p className="text-xs text-teal-800 leading-relaxed">
              Başka bir cihazda kullanıcı adın ve bu şifreyle girersin. Şifren telefonundan çıkmaz;
              sadece hesabının şifreli yedeğini açar. Unutursan Ayarlar'daki kurtarma koduyla
              girebilirsin.
            </p>
          </div>
        </div>

        <form onSubmit={kaydet}>
          <label className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
            Şifren
          </label>
          <div className="relative mb-2">
            <input
              type={gorunur ? 'text' : 'password'}
              value={sifre}
              onChange={(e) => setSifre(e.target.value)}
              placeholder="En az 8 karakter"
              autoComplete="new-password"
              autoFocus
              className="input-field pr-16"
            />
            <button
              type="button"
              onClick={() => setGorunur((g) => !g)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-coral-600"
            >
              {gorunur ? 'Gizle' : 'Göster'}
            </button>
          </div>

          <div className="flex items-center gap-1.5 mb-4">
            <Icon
              name={yeterliUzunluk ? 'CheckCircle2' : 'Circle'}
              className={`w-3.5 h-3.5 ${yeterliUzunluk ? 'text-teal-600' : 'text-ink-300'}`}
            />
            <span className={`text-xs ${yeterliUzunluk ? 'text-teal-700' : 'text-ink-400'}`}>
              En az {SIFRE_MIN} karakter
            </span>
          </div>

          <label className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
            Şifren (tekrar)
          </label>
          <input
            type={gorunur ? 'text' : 'password'}
            value={tekrar}
            onChange={(e) => setTekrar(e.target.value)}
            placeholder="Aynısını tekrar yaz"
            autoComplete="new-password"
            className="input-field mb-2"
          />
          {tekrar.length > 0 && (
            <div className="flex items-center gap-1.5 mb-4">
              <Icon
                name={eslesiyor ? 'CheckCircle2' : 'AlertCircle'}
                className={`w-3.5 h-3.5 ${eslesiyor ? 'text-teal-600' : 'text-amber-500'}`}
              />
              <span className={`text-xs ${eslesiyor ? 'text-teal-700' : 'text-amber-600'}`}>
                {eslesiyor ? 'Şifreler eşleşiyor' : 'Şifreler henüz aynı değil'}
              </span>
            </div>
          )}

          {hata && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 mb-4">
              <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-700">{hata}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={kaydediliyor || !yeterliUzunluk || !eslesiyor}
            className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          >
            {kaydediliyor ? (
              <>
                <Icon name="Loader2" className="w-5 h-5 animate-spin" />
                Kaydediliyor...
              </>
            ) : (
              <>
                <Icon name="Check" className="w-5 h-5" />
                Devam et
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
