import { useEffect, useState } from 'react'

// The current time, ticking every `stepMs`, aligned to the step so a
// seconds countdown and the clock change together. Pauses while the page is
// hidden and catches up when it's shown again.
export function useNow(stepMs: number): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      clearTimeout(timer)
      if (document.visibilityState !== 'visible') return
      timer = setTimeout(
        () => {
          setNow(Date.now())
          schedule()
        },
        stepMs - (Date.now() % stepMs) + 5,
      )
    }
    const onVisibility = () => {
      setNow(Date.now())
      schedule()
    }
    schedule()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [stepMs])

  return now
}
