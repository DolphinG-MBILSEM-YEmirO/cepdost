import { useEffect, useRef } from 'react'

// Opening a chat on a message (from the chat list's search): once the chat
// has loaded, the message comes into view and flashes.
export function useMesajaOdaklan(odakMesajId: string | null | undefined, hazir: boolean, git: (mesajId: string) => void) {
  const yapildi = useRef(false)
  useEffect(() => {
    if (!odakMesajId || !hazir || yapildi.current) return
    // After the chat's own jump to its last message.
    const t = window.setTimeout(() => {
      yapildi.current = true
      git(odakMesajId)
    }, 120)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [odakMesajId, hazir])
}
