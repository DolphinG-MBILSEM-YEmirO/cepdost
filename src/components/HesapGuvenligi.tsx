import { useState } from 'react'
import { Icon } from './Icon'
import { ConfirmDialog } from './ConfirmDialog'
import { SifreBelirle } from './SifreBelirle'
import { useAuth } from '../sosyal/auth'

// Settings card for the account itself: the recovery code (the account's
// key, the last resort if the password is forgotten), changing the
// password, and signing out of this device.
export function HesapGuvenligi() {
  const { kurtarmaKodunuGetir, cikis } = useAuth()
  const [kodGorunur, setKodGorunur] = useState(false)
  const [kopyalandi, setKopyalandi] = useState(false)
  const [sifreAcik, setSifreAcik] = useState(false)
  const [cikisOnay, setCikisOnay] = useState(false)
  const kod = kurtarmaKodunuGetir()

  async function kopyala() {
    if (!kod) return
    try {
      await navigator.clipboard.writeText(kod)
      setKopyalandi(true)
      setTimeout(() => setKopyalandi(false), 2000)
    } catch {
      // Clipboard can be blocked (http, permissions); the code is visible
      // and selectable, so the user can still copy it by hand.
      setKodGorunur(true)
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-coral-100 flex items-center justify-center">
          <Icon name="KeyRound" className="w-5 h-5 text-coral-600" />
        </div>
        <h2 className="font-semibold text-ink-700">Hesap güvenliği</h2>
      </div>

      <p className="text-sm text-ink-500 mb-1 font-medium">Kurtarma kodu</p>
      <p className="text-xs text-ink-400 leading-relaxed mb-3">
        Şifreni unutursan hesabına bu kodla girersin. Kimseyle paylaşma: kodu bilen hesabına girebilir.
      </p>
      {kod ? (
        <>
          <div className="relative rounded-2xl bg-cream-100 border border-ink-100/40 px-3 py-2.5 mb-3">
            <p
              className={`font-mono text-xs text-ink-600 break-all select-all transition-all ${
                kodGorunur ? '' : 'blur-sm select-none'
              }`}
              aria-hidden={!kodGorunur}
            >
              {kod}
            </p>
            {!kodGorunur && (
              <button
                onClick={() => setKodGorunur(true)}
                className="absolute inset-0 flex items-center justify-center gap-1.5 text-xs font-semibold text-ink-600"
              >
                <Icon name="Eye" className="w-4 h-4" />
                Göstermek için dokun
              </button>
            )}
          </div>
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => void kopyala()}
              className="flex-1 chip justify-center bg-cream-50 border border-ink-100/40 text-ink-600"
            >
              <Icon name={kopyalandi ? 'Check' : 'Copy'} className="w-4 h-4" />
              {kopyalandi ? 'Kopyalandı' : 'Kopyala'}
            </button>
            {kodGorunur && (
              <button
                onClick={() => setKodGorunur(false)}
                className="flex-1 chip justify-center bg-cream-50 border border-ink-100/40 text-ink-600"
              >
                <Icon name="EyeOff" className="w-4 h-4" />
                Gizle
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="text-xs text-ink-400 mb-5">Bu cihazda oturum yok.</p>
      )}

      <div className="flex flex-col gap-2">
        <button
          onClick={() => setSifreAcik(true)}
          className="w-full btn-ghost border border-ink-100/40 flex items-center justify-center gap-2 text-sm"
        >
          <Icon name="ShieldCheck" className="w-4 h-4" />
          Şifreni değiştir
        </button>
        <button
          onClick={() => setCikisOnay(true)}
          className="w-full rounded-2xl py-3 text-sm font-semibold bg-cream-50 text-rose-600 border border-rose-100 flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
        >
          <Icon name="LogOut" className="w-4 h-4" />
          Çıkış yap
        </button>
      </div>

      {sifreAcik && (
        <div className="fixed inset-0 z-[60] bg-cream-100 animate-slide-up">
          <div className="max-w-md mx-auto h-full">
            <SifreBelirle
              degistir
              onVazgec={() => setSifreAcik(false)}
              onTamamlandi={async () => setSifreAcik(false)}
            />
          </div>
        </div>
      )}

      {cikisOnay && (
        <ConfirmDialog
          title="Çıkış yapılsın mı?"
          message="Planların ve arşivin bu telefonda kalır. Tekrar girmek için kullanıcı adın ve şifren ya da kurtarma kodun gerekecek."
          confirmLabel="Çıkış yap"
          onConfirm={() => {
            setCikisOnay(false)
            void cikis()
          }}
          onCancel={() => setCikisOnay(false)}
        />
      )}
    </div>
  )
}
