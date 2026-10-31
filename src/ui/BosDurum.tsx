import type { ReactNode } from 'react'
import { Icon, type IconName } from '../components/Icon'

// What a list shows when it has nothing yet: a floating tile in the tab's
// gradient, a short title, one sentence on how to fill it, and at most one
// action. Same shape on every screen.
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
      <div className="relative mb-5 animate-pop-in">
        <div aria-hidden className="absolute inset-0 rounded-[1.75rem] bg-bolum blur-xl opacity-40 scale-90 translate-y-2" />
        <div className={`relative rounded-[1.75rem] bg-bolum flex items-center justify-center animate-yuzen ${sikisik ? 'w-14 h-14' : 'w-[72px] h-[72px]'}`}>
          <Icon name={ikon} className={`text-white ${sikisik ? 'w-7 h-7' : 'w-9 h-9'}`} strokeWidth={2} />
        </div>
      </div>
      <p className="text-title text-ink-800">{baslik}</p>
      {aciklama && <p className="text-callout font-normal text-ink-400 mt-1 max-w-xs text-balance">{aciklama}</p>}
      {eylem && (
        <button
          type="button"
          onClick={eylem.onClick}
          className="mt-5 btn-primary inline-flex items-center gap-2 h-11 px-5 py-0 text-callout font-semibold"
        >
          {eylem.ikon && <Icon name={eylem.ikon} className="w-4 h-4" />}
          {eylem.etiket}
        </button>
      )}
    </div>
  )
}
