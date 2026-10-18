import { useEffect, useState } from 'react'
import { localDateString } from '../lib/format'

// Today's local date (YYYY-MM-DD) that moves on by itself. An installed PWA
// can stay in memory overnight; screens that computed "today" once on mount
// would keep showing yesterday when reopened in the morning.
export function useBugun(): string {
  const [bugun, setBugun] = useState(() => localDateString())

  useEffect(() => {
    let zamanlayici: ReturnType<typeof setTimeout>

    function guncelle() {
      setBugun(localDateString())
      clearTimeout(zamanlayici)
      const yarin = new Date()
      yarin.setHours(24, 0, 1, 0)
      zamanlayici = setTimeout(guncelle, yarin.getTime() - Date.now())
    }

    function gorunurlukDegisti() {
      if (document.visibilityState === 'visible') guncelle()
    }

    guncelle()
    document.addEventListener('visibilitychange', gorunurlukDegisti)
    return () => {
      clearTimeout(zamanlayici)
      document.removeEventListener('visibilitychange', gorunurlukDegisti)
    }
  }, [])

  return bugun
}
