import { useMemo } from 'react'
import { Icon } from '../Icon'
import { WidgetAvatar } from './WidgetAvatar'
import { WidgetCard } from './WidgetCard'
import { useNow } from './useNow'
import { freeFriendsAt, untilPhrase } from '../../widgets/widgetData'
import type { WidgetFriend } from '../../widgets/types'

// Widget 2 — friends free right now: their faces with a breathing green
// ring and until when they're free. Tapping one starts a plan invite for
// today. Worked out again every minute from the busy ranges they share.

const MAX_SHOWN = 4

interface Props {
  friends: WidgetFriend[] | undefined
  onPropose: (friendId: string) => void
  onFindFriends: () => void
}

export function FreeFriendsWidget({ friends, onPropose, onFindFriends }: Props) {
  const now = useNow(60_000)
  const free = useMemo(() => (friends ? freeFriendsAt(friends, new Date(now)) : []), [friends, now])

  if (friends === undefined) return <WidgetCard tone="light" loading />

  if (free.length === 0) {
    const nobodyShares = friends.length === 0
    return (
      <WidgetCard tone="light" label="Şu an boşta" icon="Users" onClick={nobodyShares ? onFindFriends : undefined}>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="relative mb-3">
            <div aria-hidden className="absolute inset-0 rounded-full bg-emerald-300/40 blur-xl" />
            <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center animate-yuzen">
              <Icon name={nobodyShares ? 'UserPlus' : 'Clock'} className="w-7 h-7 text-white" />
            </div>
          </div>
          <p className="text-base font-bold text-ink-800">{nobodyShares ? 'Kim boşta, burada gör' : 'Şu an herkes meşgul'}</p>
          <p className="text-xs text-ink-400 mt-1 max-w-[15rem] text-balance">
            {nobodyShares
              ? 'Müsaitliğini paylaşan arkadaşların boş oldukları an burada belirir.'
              : 'Biri boşalınca burada belirecek.'}
          </p>
        </div>
      </WidgetCard>
    )
  }

  const shown = free.slice(0, MAX_SHOWN)
  const rest = free.length - shown.length

  return (
    <WidgetCard
      tone="light"
      label="Şu an boşta"
      icon="Users"
      badge={
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold px-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {free.length} kişi
        </span>
      }
    >
      <div className="flex-1 flex items-center justify-around gap-1">
        {shown.map(({ friend, freeUntil }, i) => (
          <button
            key={friend.id}
            type="button"
            onClick={() => onPropose(friend.id)}
            className="group flex flex-col items-center gap-1.5 min-w-0 w-[4.5rem] basinca animate-pop-in"
            style={{ animationDelay: `${80 + i * 80}ms`, animationFillMode: 'both' }}
            aria-label={`${friend.name} ile plan öner`}
          >
            <div className="relative rounded-full animate-musait" style={{ animationDelay: `${i * 400}ms` }}>
              <WidgetAvatar person={friend} className="w-14 h-14 text-lg" ring="ring-[3px] ring-emerald-400" />
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-emerald-500 ring-2 ring-white flex items-center justify-center scale-0 group-hover:scale-100 group-focus-visible:scale-100 transition-transform">
                <Icon name="Plus" className="w-3 h-3 text-white" strokeWidth={3} />
              </span>
            </div>
            <span className="text-xs font-semibold text-ink-700 truncate max-w-full">{friend.name.split(' ')[0]}</span>
            <span className="text-[10px] font-medium text-emerald-600 -mt-1 truncate max-w-full">
              {freeUntil ? untilPhrase(freeUntil) : 'gün boyu'}
            </span>
          </button>
        ))}
        {rest > 0 && (
          <div className="flex flex-col items-center gap-1.5 w-12">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 font-bold flex items-center justify-center">+{rest}</div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-ink-400 text-center flex items-center justify-center gap-1">
        <Icon name="Send" className="w-3 h-3" />
        Birine dokun, hemen plan öner
      </p>
    </WidgetCard>
  )
}
