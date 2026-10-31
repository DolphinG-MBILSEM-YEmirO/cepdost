import type { ReactNode } from 'react'
import { BaslikBaglami } from './baslikBaglami'

// The top of every main screen: a coloured hero in the current tab's
// gradient (data-bolum on a parent) with a large white title, an optional
// summary line, up to two actions on the right and an optional row below
// (usually a SegmentedControl, which switches to its light-on-colour look
// through BaslikBaglami). Soft shapes float
// in the background. One component so every tab starts the same way.
interface Props {
  baslik: string
  altBaslik?: ReactNode
  // Icon buttons on the right (SimgeButonu with tur="cam").
  eylemler?: ReactNode
  // A row under the title, e.g. a SegmentedControl.
  children?: ReactNode
  // The title is hidden visually when the screen already names itself
  // another way (kept for screen readers).
  basligiGizle?: boolean
  className?: string
}

export function EkranBasligi({ baslik, altBaslik, eylemler, children, basligiGizle, className = '' }: Props) {
  return (
    <header
      className={`relative overflow-hidden bg-bolum-canli text-white rounded-b-[2rem] px-4 pt-[calc(1rem+var(--safe-top))] pb-5 mb-4 lg:mt-6 lg:rounded-[2rem] lg:px-6 lg:pt-6 ${className}`}
    >
      {/* Decoration: two soft light shapes drifting slowly. */}
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 w-48 h-48 rounded-full bg-white/15 blur-sm animate-yuzen" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-12 w-44 h-44 rounded-[2.5rem] bg-white/10 rotate-12 animate-yuzen-yavas" />

      <BaslikBaglami.Provider value>
        <div className={`relative flex items-center gap-3 ${basligiGizle ? '' : 'min-h-[44px]'}`}>
        <div className={`flex-1 min-w-0 ${basligiGizle ? 'sr-only' : ''}`}>
          <h1 className="text-[2rem] leading-[2.375rem] font-extrabold tracking-tight truncate animate-slide-up">{baslik}</h1>
          {altBaslik && <p className="text-callout text-white/85 mt-0.5 truncate animate-fade-in">{altBaslik}</p>}
        </div>
        {eylemler && <div className="flex items-center gap-2 shrink-0">{eylemler}</div>}
      </div>
      {children && <div className={`relative ${basligiGizle ? '' : 'mt-4'}`}>{children}</div>}
      </BaslikBaglami.Provider>
    </header>
  )
}
