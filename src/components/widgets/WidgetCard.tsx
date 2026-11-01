import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'

// The frame every home widget shares, shaped like a phone home-screen
// widget: big rounded corners, a small label row at the top and the content
// below. Three looks:
//   gradient  the tab's flowing gradient with floating light blobs
//   light     a frosted white card
//   photo     a full-bleed image (passed as `background`) under a dark fade
// A soft light sweeps across now and then; the whole card springs when
// pressed.

export type WidgetTone = 'gradient' | 'light' | 'photo'

interface Props {
  tone: WidgetTone
  label?: string
  icon?: IconName
  badge?: ReactNode
  onClick?: () => void
  loading?: boolean
  background?: ReactNode
  children?: ReactNode
  className?: string
}

const TONE: Record<WidgetTone, string> = {
  gradient: 'bg-bolum-canli text-white shadow-glow',
  light: 'bg-white/90 backdrop-blur-xl text-ink-800 shadow-card ring-1 ring-ink-100',
  photo: 'bg-ink-800 text-white shadow-card',
}

export function WidgetCard({ tone, label, icon, badge, onClick, loading, background, children, className = '' }: Props) {
  const onDark = tone !== 'light'

  if (loading) {
    return (
      <div className={`relative h-[13.5rem] rounded-[1.75rem] overflow-hidden ${TONE[tone]} ${className}`} aria-busy>
        <div className={`absolute inset-0 ${onDark ? 'bg-white/10' : 'skeleton'}`} />
      </div>
    )
  }

  const content = (
    <>
      {background && <div className="absolute inset-0">{background}</div>}
      {tone === 'gradient' && (
        <>
          <div aria-hidden className="absolute -top-10 -right-8 w-36 h-36 rounded-full bg-white/15 blur-2xl animate-yuzen" />
          <div aria-hidden className="absolute -bottom-12 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl animate-yuzen-yavas" />
        </>
      )}
      {/* The sweeping light. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <div className={`absolute inset-y-0 -left-1/3 w-1/3 animate-parilti ${onDark ? 'bg-white/15' : 'bg-white/70'} blur-md`} />
      </div>

      <div className="relative h-full flex flex-col p-4">
        {(label || badge) && (
          <div className="flex items-center justify-between gap-2 mb-2">
            {label && (
              <span className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] ${onDark ? 'text-white/85' : 'text-ink-400'}`}>
                {icon && <Icon name={icon} className="w-3.5 h-3.5" />}
                {label}
              </span>
            )}
            {badge}
          </div>
        )}
        {children}
      </div>
    </>
  )

  const frame = `relative h-[13.5rem] rounded-[1.75rem] overflow-hidden text-left isolate animate-pop-in ${TONE[tone]} ${className}`

  return onClick ? (
    <button type="button" onClick={onClick} className={`${frame} w-full basinca`}>
      {content}
    </button>
  ) : (
    <div className={frame}>{content}</div>
  )
}
