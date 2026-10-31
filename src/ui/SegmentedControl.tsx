import { useLayoutEffect, useRef, useState } from 'react'
import type { IconName } from '../components/Icon'
import { Icon } from '../components/Icon'
import { useBaslikIcinde } from './baslikBaglami'

// A row of two to four views of the same screen (Takvim / Hatırlatmalar /
// Fikirler, Sohbetler / Arkadaşlar ...). A white pill slides under the
// selected view. Inside a coloured screen header it draws light on colour;
// elsewhere it sits on a soft grey track. Maps to UISegmentedControl on iOS
// and SegmentedButton on Android.
//
// `sayi` is a quiet count shown next to the label (pending items); `rozet`
// is a badge for things that need attention (unread, requests).

export interface Segment<T extends string> {
  id: T
  etiket: string
  ikon?: IconName
  sayi?: number
  rozet?: number
}

interface Props<T extends string> {
  segmentler: Segment<T>[]
  secili: T
  onSec: (id: T) => void
  // Name of the group for screen readers ("Planlar görünümü").
  etiket: string
  className?: string
}

interface Gosterge {
  sol: number
  genislik: number
}

export function SegmentedControl<T extends string>({ segmentler, secili, onSec, etiket, className = '' }: Props<T>) {
  const renkli = useBaslikIcinde()
  const dugmeler = useRef(new Map<T, HTMLButtonElement>())
  const [gosterge, setGosterge] = useState<Gosterge | null>(null)

  // Measure the selected button so the pill can slide to it; labels have
  // different widths, so the segments are not equal.
  useLayoutEffect(() => {
    const olc = () => {
      const el = dugmeler.current.get(secili)
      if (el) setGosterge({ sol: el.offsetLeft, genislik: el.offsetWidth })
    }
    olc()
    window.addEventListener('resize', olc)
    return () => window.removeEventListener('resize', olc)
  }, [secili, segmentler])

  return (
    <div
      role="tablist"
      aria-label={etiket}
      className={`relative flex gap-0.5 rounded-2xl p-1 ${renkli ? 'bg-white/20' : 'bg-ink-100/80'} ${className}`}
    >
      {gosterge && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-xl bg-white shadow-soft transition-[left,width] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
          style={{ left: gosterge.sol, width: gosterge.genislik }}
        />
      )}
      {segmentler.map((s) => {
        const aktif = s.id === secili
        const rozet = s.rozet ?? 0
        const sayi = s.sayi ?? 0
        const ekBilgi = rozet > 0 ? `, ${rozet} yeni` : sayi > 0 ? `, ${sayi}` : ''
        const yazi = aktif ? 'text-ink-800' : renkli ? 'text-white/90 hover:text-white' : 'text-ink-500 hover:text-ink-700'
        return (
          <button
            key={s.id}
            ref={(el) => {
              if (el) dugmeler.current.set(s.id, el)
              else dugmeler.current.delete(s.id)
            }}
            type="button"
            role="tab"
            aria-selected={aktif}
            aria-label={`${s.etiket}${ekBilgi}`}
            onClick={() => onSec(s.id)}
            className={`relative z-10 flex-auto min-w-0 flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-semibold transition-colors duration-200 active:scale-95 ${yazi} ${
              gosterge ? '' : aktif ? 'bg-white' : ''
            }`}
          >
            {s.ikon && <Icon name={s.ikon} className="w-4 h-4 shrink-0" />}
            <span className="truncate">{s.etiket}</span>
            {sayi > 0 && rozet === 0 && (
              <span
                className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center tabular-nums ${
                  aktif ? 'bg-bolum text-white' : renkli ? 'bg-white/25 text-white' : 'bg-ink-200 text-ink-600'
                }`}
              >
                {sayi}
              </span>
            )}
            {rozet > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center tabular-nums animate-pop-in">
                {rozet > 9 ? '9+' : rozet}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
