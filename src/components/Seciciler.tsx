import { Icon } from './Icon'
import { RENKLER, RENK_ANAHTARLARI } from '../lib/kisisellestirme'

// Small pickers shared by the profile, group and plan editors, so a
// person's, a group's and a plan's look are chosen the same way.

// Tapping the chosen emoji again clears it.
export function EmojiSecici({
  secenekler,
  secili,
  onSec,
  etiket = 'Simge',
}: {
  secenekler: readonly string[]
  secili: string | null
  onSec: (emoji: string | null) => void
  etiket?: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {secenekler.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onSec(secili === e ? null : e)}
          aria-label={`${etiket} ${e}`}
          aria-pressed={secili === e}
          className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all active:opacity-80 ${
            secili === e ? 'bg-orchid-100 ring-2 ring-orchid-300' : 'bg-mist-100'
          }`}
        >
          {e}
        </button>
      ))}
    </div>
  )
}

export function RenkSecici({ secili, onSec }: { secili: string | null; onSec: (renk: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {RENK_ANAHTARLARI.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onSec(r)}
          aria-label={RENKLER[r].ad}
          aria-pressed={secili === r}
          className={`w-8 h-8 rounded-full ${RENKLER[r].dolu} flex items-center justify-center transition-transform active:opacity-80 ${
            secili === r ? 'ring-2 ring-offset-2 ring-ink-300' : ''
          }`}
        >
          {secili === r && <Icon name="Check" className="w-4 h-4 text-white" />}
        </button>
      ))}
    </div>
  )
}

// "Takes the whole day" switch for the plan forms. While it is on the form
// hides its time and duration fields.
export function TumGunAnahtari({ acik, onDegistir }: { acik: boolean; onDegistir: (acik: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={acik}
      onClick={() => onDegistir(!acik)}
      className="w-full flex items-center gap-3 text-left active:opacity-80 transition-transform"
    >
      <span
        className={`w-11 h-6 rounded-full transition-colors shrink-0 relative ${acik ? 'bg-orchid-600' : 'bg-ink-200'}`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-soft transition-all ${
            acik ? 'left-[1.375rem]' : 'left-0.5'
          }`}
        />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-ink-600">Tüm gün</span>
        <span className="block text-xs text-ink-400">Saati yok; arkadaşların o günü dolu görür.</span>
      </span>
    </button>
  )
}
