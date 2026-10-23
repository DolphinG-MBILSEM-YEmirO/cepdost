import { Icon, type IconName } from './Icon'
import type { SosyalBolum } from './sekmeler'

// The switch at the top of the Sohbet tab: chats on one side, friends on
// the other. It doubles as the page title, so each side gets an h1 for
// screen readers. Same width as the desktop chat list, so it stays in
// place when switching.
interface Props {
  secili: SosyalBolum
  onSec: (bolum: SosyalBolum) => void
  // Unread messages.
  sohbetRozeti?: number
  // Incoming friend requests and plan invites.
  arkadasRozeti?: number
}

const BOLUMLER: { id: SosyalBolum; etiket: string; ikon: IconName }[] = [
  { id: 'sohbetler', etiket: 'Sohbetler', ikon: 'MessagesSquare' },
  { id: 'arkadaslar', etiket: 'Arkadaşlar', ikon: 'Users' },
]

export function SosyalSekmeler({ secili, onSec, sohbetRozeti = 0, arkadasRozeti = 0 }: Props) {
  const rozetler: Record<SosyalBolum, number> = { sohbetler: sohbetRozeti, arkadaslar: arkadasRozeti }
  const baslik = BOLUMLER.find((b) => b.id === secili)?.etiket

  return (
    <div className="lg:w-80">
      <h1 className="sr-only">{baslik}</h1>
      <div role="tablist" aria-label="Sohbet bölümleri" className="flex gap-1 rounded-2xl bg-ink-100/60 p-1">
        {BOLUMLER.map((b) => {
          const aktif = secili === b.id
          const rozet = rozetler[b.id]
          return (
            <button
              key={b.id}
              role="tab"
              aria-selected={aktif}
              aria-label={rozet > 0 ? `${b.etiket}, ${rozet} yeni` : b.etiket}
              onClick={() => onSec(b.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-all active:scale-[0.97] ${
                aktif ? 'bg-mist-50 text-orchid-700 shadow-soft' : 'text-ink-400 hover:text-ink-600'
              }`}
            >
              <Icon name={b.ikon} className="w-4 h-4" />
              {b.etiket}
              {rozet > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {rozet > 9 ? '9+' : rozet}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
