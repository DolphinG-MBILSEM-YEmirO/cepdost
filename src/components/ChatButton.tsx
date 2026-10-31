import { Icon } from './Icon'

// The assistant's entry on phones: a quiet icon button at the end of the
// screen's top row (Planlar, Sohbetler, Akış). It used to float over the
// bottom right corner; the interface plan moved it into the header so it
// no longer covers content. On desktop the assistant lives in the sidebar
// and this button is hidden.
export function ChatButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Asistan: soru sor ya da plan kurdur"
      title="Asistan"
      className="lg:hidden shrink-0 w-10 h-10 rounded-xl bg-white border border-ink-100 text-ink-600 flex items-center justify-center transition-colors hover:bg-ink-50 active:bg-ink-100"
    >
      <Icon name="MessageCircle" className="w-5 h-5" />
    </button>
  )
}
