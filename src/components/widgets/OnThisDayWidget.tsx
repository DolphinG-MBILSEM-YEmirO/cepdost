import { Icon } from '../Icon'
import { WidgetCard } from './WidgetCard'
import { formatDate } from '../../lib/format'
import type { HomeMemory } from '../../widgets/useHomeWidgets'

// Widget 3 — "on this day": a memory photo from this day in an earlier year
// (or month), drifting slowly behind its place and date. Tapping it opens
// the chat the memory lives in.

interface Props {
  memory: HomeMemory | null | undefined
  onOpen: (target: string | null) => void
}

export function OnThisDayWidget({ memory, onOpen }: Props) {
  if (memory === undefined) return <WidgetCard tone="photo" loading />

  if (!memory) {
    return (
      <WidgetCard tone="light" label="Bugün geçmişte" icon="Camera">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="relative w-20 h-16 mb-3" aria-hidden>
            <div className="absolute inset-0 rounded-2xl bg-bolum opacity-30 rotate-[-8deg] animate-yuzen-yavas" />
            <div className="absolute inset-0 rounded-2xl bg-bolum flex items-center justify-center rotate-[6deg] animate-yuzen">
              <Icon name="ImageIcon" className="w-7 h-7 text-white" />
            </div>
          </div>
          <p className="text-base font-bold text-ink-800">Anılar birikiyor</p>
          <p className="text-xs text-ink-400 mt-1 max-w-[15rem] text-balance">
            Planlardan sonra fotoğraf ekle; bir gün burada karşına çıksın.
          </p>
        </div>
      </WidgetCard>
    )
  }

  const { ani, label, kind } = memory.picked

  return (
    <WidgetCard
      tone="photo"
      onClick={() => onOpen(memory.target)}
      background={
        <>
          {memory.photoUrl ? (
            <img src={memory.photoUrl} alt="" className="w-full h-full object-cover animate-ken-burns" />
          ) : (
            <div className="w-full h-full bg-bolum-canli" />
          )}
          {/* A fade at top and bottom keeps the text readable on any photo. */}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/75" />
        </>
      }
    >
      <div className="relative flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-md ring-1 ring-white/30 text-[11px] font-bold text-white px-2.5 py-1">
          <Icon name={kind === 'recent' ? 'Star' : 'Clock'} className="w-3.5 h-3.5" />
          {label}
        </span>
      </div>
      <div className="relative mt-auto">
        <p className="text-xl font-bold text-white leading-tight line-clamp-2 drop-shadow">{ani.mekan_adi}</p>
        <p className="text-xs text-white/85 mt-1 flex items-center gap-1.5">
          <Icon name="CalendarDays" className="w-3.5 h-3.5" />
          {formatDate(ani.tarih) ?? ani.tarih}
          {ani.notlar && <span className="truncate">· {ani.notlar}</span>}
        </p>
      </div>
    </WidgetCard>
  )
}
