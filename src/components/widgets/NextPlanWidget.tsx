import { Icon } from '../Icon'
import { Countdown } from './Countdown'
import { AvatarStack } from './WidgetAvatar'
import { useNow } from './useNow'
import { WidgetCard } from './WidgetCard'
import { countdownPhrase, planPhase, planWhenLabel } from '../../widgets/widgetData'
import type { WidgetPlan } from '../../widgets/types'

// Widget 1 — the next plan: its name and place, a live countdown, and who's
// coming. While the plan is on, the countdown turns into a progress bar.

interface Props {
  plan: WidgetPlan | null | undefined
  onOpen: (planId: string) => void
  onCreate: () => void
}

export function NextPlanWidget({ plan, onOpen, onCreate }: Props) {
  // Seconds only matter in the last day; otherwise a minute tick is enough.
  const coarseNow = useNow(60_000)
  const lastDay = !!plan && plan.startsAt - coarseNow < 24 * 60 * 60 * 1000
  const fineNow = useNow(lastDay ? 1000 : 60_000)
  const now = lastDay ? fineNow : coarseNow

  if (plan === undefined) return <WidgetCard tone="gradient" loading />

  if (!plan) {
    return (
      <WidgetCard tone="gradient" label="Sıradaki plan" icon="CalendarClock" onClick={onCreate}>
        <div className="flex-1 flex flex-col justify-end">
          <div className="text-5xl mb-3 animate-yuzen w-fit" aria-hidden>
            ✨
          </div>
          <p className="text-xl font-bold text-white leading-tight">Takvim bomboş</p>
          <p className="text-sm text-white/80 mt-1">Bir plan kur, geri sayım burada başlasın.</p>
          <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-white text-ink-800 text-sm font-semibold px-4 py-2 shadow-lg basinca">
            <Icon name="Plus" className="w-4 h-4" />
            Plan kur
          </span>
        </div>
      </WidgetCard>
    )
  }

  const phase = planPhase(plan, now)
  const progress = phase === 'live' ? Math.min(1, (now - plan.startsAt) / Math.max(1, plan.endsAt - plan.startsAt)) : 0

  return (
    <WidgetCard
      tone="gradient"
      label={phase === 'live' ? 'Şu an' : 'Sıradaki plan'}
      icon={phase === 'live' ? 'Flame' : 'CalendarClock'}
      onClick={() => onOpen(plan.id)}
      badge={
        phase === 'soon' ? (
          <span className="rounded-full bg-white text-[11px] font-bold text-rose-600 px-2 py-0.5 animate-nabiz">Az kaldı</span>
        ) : phase === 'live' ? (
          <span className="flex items-center gap-1.5 rounded-full bg-white/25 text-[11px] font-bold text-white px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            Canlı
          </span>
        ) : null
      }
    >
      <div className="flex items-start gap-3 mt-1">
        <div
          aria-hidden
          className="w-14 h-14 rounded-[1.25rem] bg-white/20 backdrop-blur-md ring-1 ring-white/30 flex items-center justify-center text-3xl shrink-0 animate-yuzen"
        >
          {plan.emoji ?? '📅'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold text-white leading-tight line-clamp-2">{plan.title}</p>
          <p className="text-sm text-white/85 mt-1 truncate">{planWhenLabel(plan, plan.time, now)}</p>
        </div>
      </div>

      {plan.place && (
        <p className="flex items-center gap-1.5 text-sm text-white/90 mt-3 truncate">
          <Icon name="MapPin" className="w-4 h-4 shrink-0" />
          <span className="truncate">{plan.place}</span>
        </p>
      )}

      <div className="mt-auto pt-4 flex items-end justify-between gap-3">
        {phase === 'live' ? (
          <div className="flex-1 min-w-0">
            <div className="h-2 rounded-full bg-white/25 overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-1000 ease-out"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="text-xs text-white/80 mt-1.5">Keyfini çıkar!</p>
          </div>
        ) : plan.startsAt - now < 7 * 24 * 60 * 60 * 1000 ? (
          <Countdown ms={plan.startsAt - now} />
        ) : (
          <p className="text-lg font-bold text-white">{countdownPhrase(plan.startsAt - now)}</p>
        )}
        {plan.attendees.length > 0 && <AvatarStack people={plan.attendees} max={3} />}
      </div>
      {plan.withLabel && plan.attendees.length === 0 && (
        <p className="text-xs text-white/75 mt-2 truncate">{plan.withLabel} ile</p>
      )}
    </WidgetCard>
  )
}
