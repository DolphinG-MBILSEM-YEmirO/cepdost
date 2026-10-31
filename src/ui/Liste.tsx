import type { ReactNode } from 'react'
import { Icon, type IconName } from '../components/Icon'

// Grouped list, the backbone of settings, friends and account screens:
// a white rounded group with hairline dividers, an optional caption above
// and a footnote below. Maps to an inset grouped list on iOS and a list in
// a card on Android.

export function ListeGrubu({
  baslik,
  dipnot,
  children,
  className = '',
}: {
  baslik?: ReactNode
  dipnot?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      {baslik && <h2 className="text-label text-ink-500 px-1 mb-2">{baslik}</h2>}
      <div className="bg-white rounded-2xl border border-ink-100 divide-y divide-ink-100 overflow-hidden">{children}</div>
      {dipnot && <p className="text-caption font-normal text-ink-400 px-1 mt-2">{dipnot}</p>}
    </section>
  )
}

interface SatirProps {
  baslik: ReactNode
  aciklama?: ReactNode
  // Leading icon (neutral tile) or any node (an avatar).
  ikon?: IconName
  bas?: ReactNode
  // Trailing value text, control or badge.
  son?: ReactNode
  onClick?: () => void
  // Shows a chevron: the row opens another page.
  ileri?: boolean
  tehlikeli?: boolean
}

export function ListeSatiri({ baslik, aciklama, ikon, bas, son, onClick, ileri, tehlikeli }: SatirProps) {
  const icerik = (
    <>
      {bas ??
        (ikon && (
          <span className="w-8 h-8 rounded-lg bg-ink-50 flex items-center justify-center shrink-0">
            <Icon name={ikon} className={`w-[18px] h-[18px] ${tehlikeli ? 'text-rose-600' : 'text-ink-500'}`} />
          </span>
        ))}
      <span className="flex-1 min-w-0">
        <span className={`block text-body font-medium truncate ${tehlikeli ? 'text-rose-600' : 'text-ink-800'}`}>{baslik}</span>
        {aciklama && <span className="block text-caption font-normal text-ink-400 mt-0.5">{aciklama}</span>}
      </span>
      {son && <span className="shrink-0 text-callout font-normal text-ink-400">{son}</span>}
      {ileri && <Icon name="ChevronRight" className="w-4 h-4 text-ink-300 shrink-0" />}
    </>
  )
  const sinif = 'w-full min-h-[52px] flex items-center gap-3 px-4 py-2.5 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} className={`${sinif} transition-colors hover:bg-ink-50 active:bg-ink-100`}>
      {icerik}
    </button>
  ) : (
    <div className={sinif}>{icerik}</div>
  )
}
