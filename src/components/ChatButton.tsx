import { Icon } from './Icon'

// The assistant's entry on phones: a frosted icon button in the coloured
// header of Planlar, Sohbetler and Akış, with a soft pulse so it is found.
// On desktop the assistant lives in the sidebar and this button is hidden.
export function ChatButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Asistan: soru sor ya da plan kurdur"
      title="Asistan"
      className="lg:hidden shrink-0 w-10 h-10 rounded-2xl bg-white/20 text-white flex items-center justify-center basinca transition-colors hover:bg-white/30"
    >
      <Icon name="MessageCircle" className="w-5 h-5" />
    </button>
  )
}
