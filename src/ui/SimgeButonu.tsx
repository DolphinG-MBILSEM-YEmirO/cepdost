import { Icon, type IconName } from '../components/Icon'

// A 40px square icon button for screen headers and toolbars. `ana` is the
// one primary action of a screen (solid accent); `sade` is everything else.
// The label is required: it is what screen readers say and the tooltip.
interface Props {
  ikon: IconName
  etiket: string
  onClick: () => void
  tur?: 'sade' | 'ana'
  secili?: boolean
  className?: string
}

export function SimgeButonu({ ikon, etiket, onClick, tur = 'sade', secili, className = '' }: Props) {
  const renk =
    tur === 'ana'
      ? 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800'
      : secili
        ? 'bg-brand-50 text-brand-700 border border-brand-200'
        : 'bg-white text-ink-600 border border-ink-100 hover:bg-ink-50 active:bg-ink-100'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiket}
      aria-pressed={secili === undefined ? undefined : secili}
      title={etiket}
      className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition-colors duration-150 ${renk} ${className}`}
    >
      <Icon name={ikon} className="w-5 h-5" />
    </button>
  )
}
