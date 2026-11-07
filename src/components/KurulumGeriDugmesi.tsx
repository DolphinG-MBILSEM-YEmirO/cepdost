import { useState } from 'react'
import { Icon } from './Icon'
import { ConfirmDialog } from './ConfirmDialog'
import { useGeriAdimi } from '../lib/geriTusu'

// The way back out of an account setup step (username, password, email):
// back to the welcome screen by signing out. Someone who tapped "Hesap
// oluştur" by mistake is never stuck in setup. The phone's back button does
// the same, so it doesn't close the app on these screens.
//
// When leaving would cost something (the account can then only be opened
// with its recovery code), `onay` asks first.
interface Props {
  onCikis: () => void
  onay?: { baslik: string; mesaj: string }
  /** Light button for a coloured header. */
  acik?: boolean
}

export function KurulumGeriDugmesi({ onCikis, onay, acik = false }: Props) {
  const [soruluyor, setSoruluyor] = useState(false)

  function geri() {
    if (onay) setSoruluyor(true)
    else onCikis()
  }
  // While the question is open it takes the back press itself (it closes).
  useGeriAdimi(geri, !soruluyor)

  return (
    <>
      <button
        type="button"
        onClick={geri}
        aria-label="Geri"
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 basinca ${
          acik ? 'bg-white/20 hover:bg-white/30 text-white' : 'hover:bg-ink-50 active:bg-ink-100 text-ink-500'
        }`}
      >
        <Icon name="ArrowLeft" className="w-5 h-5" />
      </button>
      {soruluyor && onay && (
        <ConfirmDialog
          title={onay.baslik}
          message={onay.mesaj}
          confirmLabel="Çık"
          cancelLabel="Kurulumda kal"
          onConfirm={() => {
            setSoruluyor(false)
            onCikis()
          }}
          onCancel={() => setSoruluyor(false)}
        />
      )}
    </>
  )
}
