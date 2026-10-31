import type { SosyalBolum } from './sekmeler'
import { SegmentedControl } from '../ui/SegmentedControl'

// The switch at the top of the Sohbet tab: chats on one side, friends on
// the other. Same width as the desktop chat list, so it stays in place when
// switching.
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
  return (
    <div className="lg:w-80">
      <SegmentedControl
        etiket="Sohbet bölümleri"
        secili={secili}
        onSec={onSec}
        segmentler={BOLUMLER.map((b) => ({ ...b, rozet: rozetler[b.id] }))}
      />
    </div>
  )
}
