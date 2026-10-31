import type { SosyalBolum } from './sekmeler'
import { SegmentedControl } from '../ui/SegmentedControl'

// The switch at the top of the Sohbet tab: chats on one side, friends on
// the other. It doubles as the page title, so each side gets an h1 for
// screen readers. Same width as the desktop chat list, so it stays in
// place when switching.
interface Props {
  secili: SosyalBolum
  onSec: (bolum: SosyalBolum) => void
  // Unread messages.
  sohbetRozeti?: number
  // Incoming friend requests and plan invites.
  arkadasRozeti?: number
}

const BOLUMLER: { id: SosyalBolum; etiket: string }[] = [
  { id: 'sohbetler', etiket: 'Sohbetler' },
  { id: 'arkadaslar', etiket: 'Arkadaşlar' },
]

export function SosyalSekmeler({ secili, onSec, sohbetRozeti = 0, arkadasRozeti = 0 }: Props) {
  const rozetler: Record<SosyalBolum, number> = { sohbetler: sohbetRozeti, arkadaslar: arkadasRozeti }
  const baslik = BOLUMLER.find((b) => b.id === secili)?.etiket

  return (
    <div className="flex-1 min-w-0 lg:flex-none lg:w-80">
      <h1 className="sr-only">{baslik}</h1>
      <SegmentedControl
        etiket="Sohbet bölümleri"
        secili={secili}
        onSec={onSec}
        segmentler={BOLUMLER.map((b) => ({ ...b, rozet: rozetler[b.id] }))}
      />
    </div>
  )
}
