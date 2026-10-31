import type { ReactNode } from 'react'

// The top of every main screen: a large title, an optional one-line summary
// under it, up to two actions on the right, and an optional row below
// (usually a SegmentedControl). One component so every tab starts at the
// same height with the same spacing; maps to a large-title navigation bar on
// iOS and a large TopAppBar on Android.
interface Props {
  baslik: string
  altBaslik?: ReactNode
  // Icon buttons on the right (SimgeButonu).
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
    <header className={`px-4 pt-[calc(0.75rem+var(--safe-top))] pb-3 lg:px-0 lg:pt-8 ${className}`}>
      <div className={`flex items-center gap-3 ${basligiGizle ? '' : 'min-h-[44px]'}`}>
        <div className={`flex-1 min-w-0 ${basligiGizle ? 'sr-only' : ''}`}>
          <h1 className="text-display text-ink-800 tracking-tight truncate">{baslik}</h1>
          {altBaslik && <p className="text-callout font-normal text-ink-400 mt-0.5 truncate">{altBaslik}</p>}
        </div>
        {eylemler && <div className="flex items-center gap-2 shrink-0">{eylemler}</div>}
      </div>
      {children && <div className={basligiGizle ? '' : 'mt-3'}>{children}</div>}
    </header>
  )
}
