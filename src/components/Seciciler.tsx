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
          className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all active:scale-90 ${
            secili === e ? 'bg-coral-100 ring-2 ring-coral-300' : 'bg-cream-100'
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
          className={`w-8 h-8 rounded-full ${RENKLER[r].dolu} flex items-center justify-center transition-transform active:scale-90 ${
            secili === r ? 'ring-2 ring-offset-2 ring-ink-300' : ''
          }`}
        >
          {secili === r && <Icon name="Check" className="w-4 h-4 text-white" />}
        </button>
      ))}
    </div>
  )
}
