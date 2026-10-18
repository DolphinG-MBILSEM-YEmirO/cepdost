import { useEffect, useRef } from 'react'

// Escape closes the topmost open sheet or dialog (mostly for desktop).
// Sheets can stack (a group, then the plan wizard on top of it), so only
// the most recently opened one reacts.
const yigin: Array<{ kapat: () => void }> = []

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || yigin.length === 0) return
    e.preventDefault()
    yigin[yigin.length - 1].kapat()
  })
}

export function useEscapeIleKapat(kapat: () => void, etkin = true) {
  const kapatRef = useRef(kapat)
  useEffect(() => {
    kapatRef.current = kapat
  })

  useEffect(() => {
    if (!etkin) return
    const kayit = { kapat: () => kapatRef.current() }
    yigin.push(kayit)
    return () => {
      const i = yigin.indexOf(kayit)
      if (i >= 0) yigin.splice(i, 1)
    }
  }, [etkin])
}
