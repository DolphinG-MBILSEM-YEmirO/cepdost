import { useState } from 'react'
import { Icon } from './Icon'
import {
  YOL_PAYI_SECENEKLERI,
  planAyarlariniKaydet,
  usePlanAyarlari,
} from '../lib/planAyarlari'

// The user's planning preferences: the hours they're usually free (shared
// with friends next to the busy ranges) and the travel buffer used when a
// time is suggested. Saved on change; the availability sync picks up the
// hours by itself (see App.tsx).
export function PlanTercihleri({ paylasimAcik }: { paylasimAcik: boolean }) {
  const ayar = usePlanAyarlari()
  const [baslangic, setBaslangic] = useState(ayar.pencere?.baslangic ?? '')
  const [bitis, setBitis] = useState(ayar.pencere?.bitis ?? '')
  const [hata, setHata] = useState<string | null>(null)

  function saatleriKaydet(yeniBas: string, yeniBit: string) {
    setBaslangic(yeniBas)
    setBitis(yeniBit)
    if (!yeniBas && !yeniBit) {
      setHata(null)
      planAyarlariniKaydet({ ...ayar, pencere: null })
      return
    }
    // Half-filled: wait for the other end.
    if (!yeniBas || !yeniBit) return
    if (yeniBit <= yeniBas) {
      setHata('Bitiş saati başlangıçtan sonra olmalı.')
      return
    }
    setHata(null)
    planAyarlariniKaydet({ ...ayar, pencere: { baslangic: yeniBas, bitis: yeniBit } })
  }

  return (
    <div className="bg-mist-100 rounded-2xl p-4 space-y-4">
      <div>
        <p className="text-sm font-medium text-ink-600 flex items-center gap-1.5">
          <Icon name="Clock" className="w-4 h-4 text-ink-400" />
          Genelde müsait olduğum saatler
        </p>
        <p className="text-xs text-ink-400 mt-0.5 mb-2">
          {paylasimAcik
            ? 'Sana saat önerilirken bu aralığın dışı önerilmez. Boş bırakırsan 09:00–23:00 sayılır.'
            : 'Kendi önerilerinde kullanılır. Arkadaşların görmesi için müsaitlik paylaşımını aç.'}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="time"
            aria-label="En erken saat"
            value={baslangic}
            onChange={(e) => saatleriKaydet(e.target.value, bitis)}
            className="input-field flex-1 min-w-0 px-3 text-sm"
          />
          <span className="text-ink-400" aria-hidden="true">–</span>
          <input
            type="time"
            aria-label="En geç saat"
            value={bitis}
            onChange={(e) => saatleriKaydet(baslangic, e.target.value)}
            className="input-field flex-1 min-w-0 px-3 text-sm"
          />
          {(baslangic || bitis) && (
            <button
              onClick={() => saatleriKaydet('', '')}
              aria-label="Saat aralığını temizle"
              className="w-9 h-9 rounded-xl bg-mist-50 flex items-center justify-center active:opacity-80 transition-transform shrink-0"
            >
              <Icon name="X" className="w-4 h-4 text-ink-400" />
            </button>
          )}
        </div>
        {hata && <p className="text-xs text-rose-600 mt-1.5">{hata}</p>}
      </div>

      <div>
        <p className="text-sm font-medium text-ink-600 flex items-center gap-1.5">
          <Icon name="MapPin" className="w-4 h-4 text-ink-400" />
          Planlar arasında yol payı
        </p>
        <p className="text-xs text-ink-400 mt-0.5 mb-2">Saat önerilirken dolu saatlerin önünde ve arkasında bu kadar boşluk bırakılır.</p>
        <div className="flex gap-2" role="group" aria-label="Yol payı">
          {YOL_PAYI_SECENEKLERI.map((dk) => (
            <button
              key={dk}
              onClick={() => planAyarlariniKaydet({ ...ayar, yolPayiDk: dk })}
              aria-pressed={ayar.yolPayiDk === dk}
              className={`chip flex-1 justify-center ${
                ayar.yolPayiDk === dk ? 'bg-orchid-600 text-white' : 'bg-mist-50 text-ink-500 border border-ink-100'
              }`}
            >
              {dk === 0 ? 'Yok' : `${dk} dk`}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
