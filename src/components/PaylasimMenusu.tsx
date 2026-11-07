import { Icon, type IconName } from './Icon'
import { useGeriIleKapat } from '../lib/geriTusu'
import { Katman } from '../ui/Katman'

// The "⋯" sheet of a post: what I can do with it. The card decides which
// rows there are (mine or someone else's, tagged or not).

export interface MenuSecenegi {
  anahtar: string
  ikon: IconName
  etiket: string
  aciklama?: string
  tehlikeli?: boolean
  onSec: () => void
}

export function PaylasimMenusu({
  baslik,
  secenekler,
  onKapat,
}: {
  baslik: string
  secenekler: MenuSecenegi[]
  onKapat: () => void
}) {
  useGeriIleKapat(onKapat)
  return (
    <Katman>
      <div className="fixed inset-0 z-[85] flex items-end justify-center bg-ink-900/40 animate-fade-in" onClick={onKapat}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${baslik} seçenekleri`}
          className="w-full max-w-md bg-mist-50 rounded-t-3xl p-3 pb-[calc(0.75rem+var(--safe-bottom))] animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-10 h-1 rounded-full bg-ink-200 mx-auto mb-2" />
          <p className="text-xs font-semibold text-ink-400 text-center truncate px-6 mb-2">{baslik}</p>
          <ul className="space-y-1 kademeli">
            {secenekler.map((s) => (
              <li key={s.anahtar}>
                <button
                  type="button"
                  onClick={() => {
                    onKapat()
                    s.onSec()
                  }}
                  className={`w-full flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors active:opacity-80 ${
                    s.tehlikeli ? 'text-rose-600 hover:bg-rose-50' : 'text-ink-700 hover:bg-white'
                  }`}
                >
                  <span
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      s.tehlikeli ? 'bg-rose-50' : 'bg-bolum-soluk text-bolum-koyu'
                    }`}
                  >
                    <Icon name={s.ikon} className="w-[18px] h-[18px]" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold">{s.etiket}</span>
                    {s.aciklama && <span className="block text-xs text-ink-400">{s.aciklama}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Katman>
  )
}
