import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { AkisKarti } from './AkisKarti'
import { AniYanitlari } from './AniYanitlari'
import type { Ani } from '../sosyal/gruplar'
import { ozettenProfil, type Profil } from '../sosyal/api'
import { BOS_ETKILESIM, type AniEtkilesimi } from '../sosyal/aniEtkilesimi'
import { useGeriIleKapat } from '../lib/geriTusu'

// A set of memories opened one at a time, large, with their reactions and
// comments; the arrows (or the arrow keys) step through the set.

interface Props {
  anilar: Ani[]
  baslangicId: string
  // What the set is, above the place's name: the plan's title, say.
  baslik: string
  etkilesimler: Map<string, AniEtkilesimi>
  profiller: Map<string, Profil>
  benimId: string
  onKapat: () => void
}

export function AniPenceresi({ anilar, baslangicId, baslik, etkilesimler, profiller, benimId, onKapat }: Props) {
  useGeriIleKapat(onKapat)
  const [acikId, setAcikId] = useState(baslangicId)
  // The open one can be deleted elsewhere; then the set starts over.
  const sira = Math.max(0, anilar.findIndex((a) => a.id === acikId))
  const ani = anilar[sira] as Ani | undefined

  const git = (yon: 1 | -1) => {
    const hedef = anilar[sira + yon]
    if (hedef) setAcikId(hedef.id)
  }

  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      const yazilan = e.target instanceof HTMLElement && e.target.closest('input, textarea')
      if (yazilan || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
      const hedef = anilar[sira + (e.key === 'ArrowRight' ? 1 : -1)]
      if (hedef) setAcikId(hedef.id)
    }
    window.addEventListener('keydown', tus)
    return () => window.removeEventListener('keydown', tus)
  }, [anilar, sira])

  useEffect(() => {
    if (!ani) onKapat()
  }, [ani, onKapat])

  if (!ani) return null
  const sahip = profiller.get(ani.sahip_id) ?? (ani.sahip ? ozettenProfil(ani.sahip_id, ani.sahip) : null)

  return (
    <div className="panel-tam z-[70]" role="dialog" aria-label={`Anı: ${ani.mekan_adi}`}>
      <div className="flex items-center gap-3 px-4 pt-[calc(1rem+var(--safe-top))] pb-3 shrink-0">
        <button
          onClick={onKapat}
          aria-label="Geri"
          className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-ink-50 active:bg-ink-100 shrink-0"
        >
          <Icon name="ArrowLeft" className="w-5 h-5 text-ink-500" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-400 truncate">{baslik}</p>
          <p className="text-sm font-semibold text-ink-700 truncate">{ani.mekan_adi}</p>
        </div>
        {anilar.length > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => git(-1)}
              disabled={sira === 0}
              aria-label="Önceki anı"
              className="w-9 h-9 rounded-full flex items-center justify-center text-ink-500 hover:bg-ink-50 disabled:opacity-30"
            >
              <Icon name="ChevronLeft" className="w-5 h-5" />
            </button>
            <span className="text-xs text-ink-400 tabular-nums" aria-live="polite">
              {sira + 1}/{anilar.length}
            </span>
            <button
              onClick={() => git(1)}
              disabled={sira === anilar.length - 1}
              aria-label="Sonraki anı"
              className="w-9 h-9 rounded-full flex items-center justify-center text-ink-500 hover:bg-ink-50 disabled:opacity-30"
            >
              <Icon name="ChevronRight" className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-[calc(2rem+var(--safe-bottom))]">
        <div className="max-w-md mx-auto">
          {/* Keyed, so a half-written comment doesn't follow to the next photo. */}
          <AkisKarti key={ani.id} ani={ani} sahip={sahip}>
            <AniYanitlari
              ani={ani}
              etkilesim={etkilesimler.get(ani.id) ?? BOS_ETKILESIM}
              profiller={profiller}
              benimId={benimId}
              yanitlanabilir
            />
          </AkisKarti>
        </div>
      </div>
    </div>
  )
}
