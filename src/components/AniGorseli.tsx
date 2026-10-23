import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { aniGorselUrl, type Ani } from '../sosyal/gruplar'

// A memory's photo. Photos are fetched in pieces on demand, so this shows a
// placeholder while loading and a quiet icon if the photo can't be found
// (for example, the relays have dropped it).
export function AniGorseli({ ani }: { ani: Ani }) {
  const [durum, setDurum] = useState<{ id: string; url: string | null } | null>(null)

  useEffect(() => {
    let iptal = false
    aniGorselUrl(ani)
      .catch(() => null)
      .then((url) => {
        if (!iptal) setDurum({ id: ani.id, url })
      })
    return () => {
      iptal = true
    }
  }, [ani])

  if (!durum || durum.id !== ani.id) return <div className="w-full h-full skeleton" />
  if (!durum.url) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Icon name="ImageIcon" className="w-8 h-8 text-ink-200" />
      </div>
    )
  }
  return <img src={durum.url} alt={ani.mekan_adi} className="w-full h-full object-cover" loading="lazy" />
}
