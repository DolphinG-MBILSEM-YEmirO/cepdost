import { useEffect, useState } from 'react'
import { DavetModal } from '../components/ArkadasMusaitlik'
import { profilleriGetir } from '../sosyal/gruplar'
import { localDateString } from '../lib/format'
import type { Kayit } from '../db'
import type { Profil } from '../sosyal/api'
import { hasNativeWidgets } from './nativeBridge'
import { useHomeWidgets } from './useHomeWidgets'

// Keeps the phone's home-screen widgets (next plan, friends free now, on
// this day) fed while the app runs. The widgets live only on the home
// screen, never inside the app, so this draws nothing except the plan
// invite a tap on the "free now" widget opens. Outside the native app
// there are no widgets and it does nothing at all.

interface Props {
  kayitlar: Kayit[]
  // A friend to invite right away (a tap on the "free now" widget).
  inviteFriendId: string | null
  onInviteHandled: () => void
}

export function WidgetSync(props: Props) {
  // Fixed for the page's life: the native bridge is there from the start.
  const [native] = useState(hasNativeWidgets)
  return native ? <NativeWidgetSync {...props} /> : null
}

function NativeWidgetSync({ kayitlar, inviteFriendId, onInviteHandled }: Props) {
  // Gathers the data and hands the widgets a fresh snapshot as it changes.
  useHomeWidgets(kayitlar, true)
  const [inviting, setInviting] = useState<Profil | null>(null)

  useEffect(() => {
    if (!inviteFriendId) return
    let cancelled = false
    void profilleriGetir([inviteFriendId])
      .then((profiles) => {
        const profil = profiles.get(inviteFriendId)
        if (!cancelled && profil) setInviting(profil)
      })
      .catch(() => {})
      .finally(onInviteHandled)
    return () => {
      cancelled = true
    }
  }, [inviteFriendId, onInviteHandled])

  return inviting ? <DavetModal arkadas={inviting} tarih={localDateString()} onClose={() => setInviting(null)} /> : null
}
