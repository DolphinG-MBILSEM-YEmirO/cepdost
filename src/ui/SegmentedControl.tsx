import type { IconName } from '../components/Icon'
import { Icon } from '../components/Icon'

// A row of two to four views of the same screen (Takvim / Hatırlatmalar /
// Fikirler, Sohbetler / Arkadaşlar ...). Replaces the coloured pills each
// screen used to draw itself; maps to UISegmentedControl on iOS and
// SegmentedButton on Android.
//
// `sayi` is a quiet count shown next to the label (pending items); `rozet`
// is a red badge for things that need attention (unread, requests).

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

export function SegmentedControl<T extends string>({ segmentler, secili, onSec, etiket, className = '' }: Props<T>) {
  return (
    <div role="tablist" aria-label={etiket} className={`flex gap-0.5 rounded-xl bg-ink-100/70 p-0.5 ${className}`}>
      {segmentler.map((s) => {
        const aktif = s.id === secili
        const rozet = s.rozet ?? 0
        const sayi = s.sayi ?? 0
        const ekBilgi = rozet > 0 ? `, ${rozet} yeni` : sayi > 0 ? `, ${sayi}` : ''
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={aktif}
            aria-label={`${s.etiket}${ekBilgi}`}
            onClick={() => onSec(s.id)}
            className={`flex-auto min-w-0 flex items-center justify-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-sm font-semibold transition-colors duration-150 ${
              aktif ? 'bg-white text-ink-800 shadow-card' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {s.ikon && <Icon name={s.ikon} className="w-4 h-4 shrink-0" />}
            <span className="truncate">{s.etiket}</span>
            {sayi > 0 && rozet === 0 && (
              <span className="text-xs font-medium text-ink-400 tabular-nums">{sayi}</span>
            )}
            {rozet > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {rozet > 9 ? '9+' : rozet}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
