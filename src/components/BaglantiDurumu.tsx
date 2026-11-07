import { useEffect, useState } from 'react'
import { Icon } from './Icon'

// A small bar at the top of every screen that says when the device is
// offline, and briefly when the connection comes back. Plans and the
// archive keep working offline (they live on the device); sending messages,
// adding friends and syncing need the network, and those actions already
// show their own error, so this bar only explains why. It sits over the
// screen's header, so it can be closed; the next outage shows it again.
type Durum = 'cevrimici' | 'cevrimdisi' | 'geri-geldi' | 'kapatildi'

const GERI_GELDI_SURESI_MS = 2500

export function BaglantiDurumu() {
  const [durum, setDurum] = useState<Durum>(() =>
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'cevrimdisi' : 'cevrimici',
  )

  useEffect(() => {
    let zamanlayici: ReturnType<typeof setTimeout> | undefined
    function cevrimdisi() {
      clearTimeout(zamanlayici)
      setDurum('cevrimdisi')
    }
    function cevrimici() {
      clearTimeout(zamanlayici)
      // Only announce a comeback if we had announced the outage.
      setDurum((onceki) => (onceki === 'cevrimdisi' || onceki === 'kapatildi' ? 'geri-geldi' : 'cevrimici'))
      zamanlayici = setTimeout(() => setDurum('cevrimici'), GERI_GELDI_SURESI_MS)
    }
    window.addEventListener('offline', cevrimdisi)
    window.addEventListener('online', cevrimici)
    return () => {
      clearTimeout(zamanlayici)
      window.removeEventListener('offline', cevrimdisi)
      window.removeEventListener('online', cevrimici)
    }
  }, [])

  if (durum === 'cevrimici' || durum === 'kapatildi') return null

  const cevrimdisi = durum === 'cevrimdisi'
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[90] flex justify-center px-3 pt-[calc(0.5rem+var(--safe-top))] pointer-events-none"
    >
      <div
        className={`pointer-events-auto max-w-md w-full flex items-start gap-2.5 rounded-2xl px-4 py-2.5 shadow-float text-sm animate-slide-down ${
          cevrimdisi ? 'bg-ink-900 text-white' : 'bg-teal-600 text-white'
        }`}
      >
        <Icon name={cevrimdisi ? 'WifiOff' : 'Check'} className="w-4 h-4 shrink-0 mt-0.5" />
        <p className="flex-1 leading-snug">
          {cevrimdisi ? (
            <>
              <strong className="font-semibold">İnternet bağlantın yok.</strong> Planların ve arşivin açık; mesaj
              göndermek, arkadaş eklemek ve eşitleme için bağlantı gerekiyor.
            </>
          ) : (
            <strong className="font-semibold">Bağlantı geri geldi.</strong>
          )}
        </p>
        {cevrimdisi && (
          <button
            onClick={() => setDurum('kapatildi')}
            aria-label="Uyarıyı kapat"
            className="-mr-1.5 -my-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 hover:bg-white/15"
          >
            <Icon name="X" className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
