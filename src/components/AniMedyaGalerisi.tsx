import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { AniGorseli } from './AniGorseli'
import { aniGorselUrl, aniMedyaUrl, type Ani, type AniMedyasi } from '../sosyal/gruplar'

// A post's photos and clips, swiped sideways with dots underneath. Older
// single-photo memories show just their photo (AniGorseli). Each item is
// fetched only when it comes into view, since media arrives in chunks.

export function AniMedyaGalerisi({ ani }: { ani: Ani }) {
  const [sira, setSira] = useState(0)
  const seritRef = useRef<HTMLDivElement>(null)

  if (ani.medya.length === 0) return <AniGorseli ani={ani} />

  const git = (i: number) => {
    const serit = seritRef.current
    if (serit) serit.scrollTo({ left: i * serit.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="relative w-full h-full">
      <div
        ref={seritRef}
        onScroll={(e) => {
          const s = e.currentTarget
          setSira(Math.round(s.scrollLeft / Math.max(1, s.clientWidth)))
        }}
        className="flex w-full h-full overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {ani.medya.map((m, i) => (
          <div key={m.id} className="w-full h-full shrink-0 snap-center">
            {/* Neighbours load early so a swipe doesn't land on a blank. */}
            <MedyaOgesi ani={ani} medya={m} etkin={Math.abs(i - sira) <= 1} gorunur={i === sira} />
          </div>
        ))}
      </div>

      {ani.medya.length > 1 && (
        <>
          <span className="absolute top-2.5 right-2.5 rounded-full bg-ink-900/55 text-white text-[11px] font-semibold px-2 py-0.5 tabular-nums">
            {sira + 1}/{ani.medya.length}
          </span>
          <div className="absolute bottom-2.5 inset-x-0 flex justify-center gap-1.5">
            {ani.medya.map((m, i) => (
              <button
                key={m.id}
                onClick={() => git(i)}
                aria-label={`${i + 1}. öğe`}
                className={`h-1.5 rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                  i === sira ? 'w-5 bg-white' : 'w-1.5 bg-white/60'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function MedyaOgesi({ ani, medya, etkin, gorunur }: { ani: Ani; medya: AniMedyasi; etkin: boolean; gorunur: boolean }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  // A clip shows the cover until it plays (and if it can't be played).
  const [kapak, setKapak] = useState<string | null>(null)
  const [oynatilamadi, setOynatilamadi] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!etkin || url !== undefined) return
    let iptal = false
    aniMedyaUrl(ani, medya)
      .catch(() => null)
      .then((u) => {
        if (!iptal) setUrl(u)
      })
    if (medya.tur === 'video') aniGorselUrl(ani).then((u) => !iptal && setKapak(u)).catch(() => {})
    return () => {
      iptal = true
    }
  }, [ani, medya, etkin, url])

  // Clips play muted while on screen, like any feed.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (gorunur) v.play().catch(() => {})
    else v.pause()
  }, [gorunur, url])

  if (url === undefined) return <div className="w-full h-full skeleton" />
  if (!url || (medya.tur === 'video' && oynatilamadi)) {
    if (kapak) return <img src={kapak} alt={ani.mekan_adi} className="w-full h-full object-cover" />
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Icon name={medya.tur === 'video' ? 'Video' : 'ImageIcon'} className="w-8 h-8 text-ink-200" />
      </div>
    )
  }
  if (medya.tur === 'foto') return <img src={url} alt={ani.mekan_adi} className="w-full h-full object-cover" loading="lazy" />
  return (
    <div className="relative w-full h-full bg-ink-900">
      <video
        ref={videoRef}
        src={url}
        poster={kapak ?? undefined}
        muted
        loop
        playsInline
        controls
        onError={() => setOynatilamadi(true)}
        className="w-full h-full object-cover"
      />
      <span className="pointer-events-none absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full bg-ink-900/55 text-white text-[11px] font-semibold px-2 py-0.5">
        <Icon name="Play" className="w-3 h-3" />
        Video
      </span>
    </div>
  )
}
