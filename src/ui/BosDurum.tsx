import type { ReactNode } from 'react'
import { Icon, type IconName } from '../components/Icon'

// What a list shows when it has nothing yet: a neutral icon, a short title,
// one sentence on how to fill it, and at most one action. Same shape on
// every screen so empty states read as part of the product, not as
// decoration.
interface Props {
  ikon: IconName
  baslik: string
  aciklama?: ReactNode
  eylem?: { etiket: string; ikon?: IconName; onClick: () => void }
  // Inside a card the block is tighter.
  sikisik?: boolean
  className?: string
}

export function BosDurum({ ikon, baslik, aciklama, eylem, sikisik, className = '' }: Props) {
  return (
    <div className={`flex flex-col items-center text-center animate-fade-in ${sikisik ? 'py-8 px-4' : 'py-14 px-6'} ${className}`}>
      <div className="w-12 h-12 rounded-2xl bg-ink-50 border border-ink-100 flex items-center justify-center mb-4">
        <Icon name={ikon} className="w-6 h-6 text-ink-400" />
      </div>
      <p className="text-headline text-ink-800">{baslik}</p>
      {aciklama && <p className="text-callout font-normal text-ink-400 mt-1 max-w-xs text-balance">{aciklama}</p>}
      {eylem && (
        <button
          type="button"
          onClick={eylem.onClick}
          className="mt-5 inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white border border-ink-200 text-callout text-ink-700 transition-colors hover:bg-ink-50 active:bg-ink-100"
        >
          {eylem.ikon && <Icon name={eylem.ikon} className="w-4 h-4" />}
          {eylem.etiket}
        </button>
      )}
    </div>
  )
}
