import { useEffect, useRef, useState } from 'react'
import { NextPlanWidget } from './NextPlanWidget'
import { FreeFriendsWidget } from './FreeFriendsWidget'
import { OnThisDayWidget } from './OnThisDayWidget'
import { DavetModal } from '../ArkadasMusaitlik'
import { useHomeWidgets } from '../../widgets/useHomeWidgets'
import { profilleriGetir } from '../../sosyal/gruplar'
import { localDateString } from '../../lib/format'
import type { Kayit } from '../../db'
import type { Profil } from '../../sosyal/api'

// The three home widgets at the top of Planlar, the in-app twins of the
// phone home-screen widgets: next plan, friends free now, on this day.
// On phones they sit in a swipeable row with page dots; on wide screens
// side by side.

interface Props {
  kayitlar: Kayit[]
  signedIn: boolean
  onOpenPlan: (kayit: Kayit) => void
  onCreatePlan: () => void
  // Opens a chat ('grup:<id>' / 'dm:<id>'), or the feed for null.
  onOpenChat: (target: string | null) => void
  onFindFriends: () => void
  // A friend to invite right away (a tap on the phone's "free now" widget).
  inviteFriendId?: string | null
  onInviteHandled?: () => void
}

export function HomeWidgets({
  kayitlar,
  signedIn,
  onOpenPlan,
  onCreatePlan,
  onOpenChat,
  onFindFriends,
  inviteFriendId,
  onInviteHandled,
}: Props) {
  const { plans, friends, memory } = useHomeWidgets(kayitlar, signedIn)
  const [inviting, setInviting] = useState<Profil | null>(null)
  const [page, setPage] = useState(0)
  const rowRef = useRef<HTMLDivElement>(null)

  async function propose(friendId: string) {
    const profil = (await profilleriGetir([friendId]).catch(() => null))?.get(friendId)
    if (profil) setInviting(profil)
  }

  useEffect(() => {
    if (!inviteFriendId || !signedIn) return
    void propose(inviteFriendId).finally(() => onInviteHandled?.())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteFriendId, signedIn])

  function openPlan(id: string) {
    const kayit = kayitlar.find((k) => k.id === id)
    if (kayit) onOpenPlan(kayit)
  }

  function onScroll() {
    const row = rowRef.current
    if (!row) return
    const card = row.firstElementChild as HTMLElement | null
    const width = card ? card.offsetWidth + 12 : row.clientWidth
    setPage(Math.round(row.scrollLeft / width))
  }

  function goTo(index: number) {
    const row = rowRef.current
    const card = row?.children[index] as HTMLElement | undefined
    if (row && card) row.scrollTo({ left: card.offsetLeft - row.offsetLeft - 16, behavior: 'smooth' })
  }

  const cards = [
    <NextPlanWidget key="plan" plan={plans === undefined ? undefined : (plans[0] ?? null)} onOpen={openPlan} onCreate={onCreatePlan} />,
    <FreeFriendsWidget key="friends" friends={friends} onPropose={(id) => void propose(id)} onFindFriends={onFindFriends} />,
    <OnThisDayWidget key="memory" memory={memory} onOpen={onOpenChat} />,
  ]

  return (
    <section aria-label="Senin için" className="pb-3">
      <div
        ref={rowRef}
        onScroll={onScroll}
        className="flex lg:grid lg:grid-cols-3 gap-3 overflow-x-auto lg:overflow-visible snap-x snap-mandatory scroll-px-4 px-4 lg:px-0 pt-1 pb-4 -mb-2 no-scrollbar kademeli"
      >
        {cards.map((card, i) => (
          <div key={i} className="snap-start shrink-0 w-[86%] sm:w-[60%] lg:w-auto">
            {card}
          </div>
        ))}
      </div>

      {/* Page dots (phones): the current one stretches into a pill. */}
      <div className="flex lg:hidden justify-center gap-1.5 mt-2.5" role="tablist" aria-label="Kartlar">
        {cards.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={page === i}
            aria-label={`${i + 1}. kart`}
            onClick={() => goTo(i)}
            className={`h-1.5 rounded-full transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
              page === i ? 'w-5 bg-bolum' : 'w-1.5 bg-ink-200'
            }`}
          />
        ))}
      </div>

      {inviting && <DavetModal arkadas={inviting} tarih={localDateString()} onClose={() => setInviting(null)} />}
    </section>
  )
}
