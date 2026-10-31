import { Icon, type IconName } from './Icon'
import { useGeriIleKapat } from '../lib/geriTusu'

// What the "+" button opens: a small sheet with the two things a person can
// make. "Paylaşım" posts photos, clips, a rating and a note about a place;
// "Plan" is the existing plan flow. Each choice wears its own tab's colours
// (data-bolum), so a post looks like the feed and a plan like the calendar.

export type OlusturSecimi = 'paylasim' | 'plan'

interface Secenek {
  id: OlusturSecimi
  baslik: string
  aciklama: string
  ikon: IconName
  // The tab whose gradient the tile uses.
  bolum: 'akis' | 'planlar'
}

const SECENEKLER: Secenek[] = [
  {
    id: 'paylasim',
    baslik: 'Paylaşım',
    aciklama: 'Gittiğin yerden fotoğraf, video ve puan paylaş',
    ikon: 'Camera',
    bolum: 'akis',
  },
  {
    id: 'plan',
    baslik: 'Plan',
    aciklama: 'Bir yere gitmek için plan yap, arkadaşlarını çağır',
    ikon: 'CalendarPlus',
    bolum: 'planlar',
  },
]

export function OlusturMenusu({ onSec, onKapat }: { onSec: (secim: OlusturSecimi) => void; onKapat: () => void }) {
  useGeriIleKapat(onKapat)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center bg-ink-900/40 animate-fade-in"
      onClick={onKapat}
    >
      <div
        role="dialog"
        aria-label="Ne oluşturmak istersin?"
        className="card w-full max-w-md mx-3 mb-[calc(6rem+var(--safe-bottom))] lg:mb-0 p-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-lg font-extrabold text-ink-800">Ne oluşturalım?</h2>
          <button
            onClick={onKapat}
            aria-label="Kapat"
            className="w-9 h-9 rounded-full flex items-center justify-center text-ink-400 hover:bg-ink-50 basinca"
          >
            <Icon name="X" className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 kademeli">
          {SECENEKLER.map((s) => (
            <button
              key={s.id}
              data-bolum={s.bolum}
              onClick={() => onSec(s.id)}
              className="group relative overflow-hidden rounded-3xl bg-bolum-canli text-white text-left p-4 min-h-[9.5rem] flex flex-col justify-between shadow-glow basinca hover:brightness-110"
            >
              {/* Decoration: a soft light shape that drifts. */}
              <span
                aria-hidden
                className="pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full bg-white/20 animate-yuzen"
              />
              <span className="relative w-11 h-11 rounded-2xl bg-white/25 flex items-center justify-center transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 group-hover:-rotate-6">
                <Icon name={s.ikon} className="w-6 h-6" strokeWidth={2.25} />
              </span>
              <span className="relative">
                <span className="block text-lg font-extrabold leading-tight">{s.baslik}</span>
                <span className="block text-xs text-white/85 mt-1 leading-snug">{s.aciklama}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
