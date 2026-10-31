import { Icon, type IconName } from '../components/Icon'
import { useBaslikIcinde } from './baslikBaglami'

// A 40px icon button for screen headers and toolbars. `ana` is the one
// primary action of a screen (the tab's gradient); `sade` is everything
// else. Inside a coloured header (EkranBasligi) it turns to frosted white.
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
  const renkli = useBaslikIcinde()
  const renk =
    tur === 'ana'
      ? 'bg-bolum text-white shadow-glow hover:brightness-110'
      : renkli
        ? secili
          ? 'bg-white text-bolum-koyu'
          : 'bg-white/20 text-white hover:bg-white/30'
        : secili
          ? 'bg-bolum-soluk text-bolum-koyu'
          : 'bg-white text-ink-600 shadow-soft hover:bg-ink-50'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiket}
      aria-pressed={secili === undefined ? undefined : secili}
      title={etiket}
      className={`w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center basinca transition-colors duration-200 ${renk} ${className}`}
    >
      <Icon name={ikon} className="w-5 h-5" />
    </button>
  )
}
