import { useState } from 'react'
import { Icon } from './Icon'
import { BugunView } from './BugunView'
import { RemindersView } from './RemindersView'
import { AniHatirlatici } from './AniHatirlatici'
import { FikirlerView } from './FikirlerView'
import type { Kayit } from '../db'
import { useMasaustu } from '../lib/useMasaustu'
import { useGeriAdimi } from '../lib/geriTusu'
import { fikirMi } from '../lib/fikirler'

// "Hatırlat" ayrı bir alt sekmeydi ama Bugün ile aynı veriye bakıyordu
// (tarihli, bekleyen kayıtlar) — alt bar kalabalığını azaltmak için ikisi
// tek sekmede birleştirildi.
// Masaüstünde ikisi yan yana duruyor: solda gün, sağda hatırlatmalar.
// Plans with no day yet have a third view, Fikirler (under the reminders on
// desktop).
type Gorunum = 'bugun' | 'hatirlat' | 'fikirler'

interface Props {
  kayitlar: Kayit[]
  loading: boolean
  onAddClick: () => void
  onRecordClick: (kayit: Kayit) => void
  onToggleStatus: (id: string) => void
  onDelete: (id: string) => void
}

export function PlanlarView({
  kayitlar,
  loading,
  onAddClick,
  onRecordClick,
  onToggleStatus,
  onDelete,
}: Props) {
  const [gorunum, setGorunum] = useState<Gorunum>('bugun')
  const masaustu = useMasaustu()
  useGeriAdimi(() => setGorunum('bugun'), !masaustu && gorunum !== 'bugun')

  // Geciken/bekleyen sayısı rozet olarak gösteriliyor ki "Hatırlat"
  // görünümü gizlendiğinde gözden kaçmasın.
  const bekleyen = kayitlar.filter((k) => k.durum === 'bekliyor' && k.tarih).length
  const fikirSayisi = kayitlar.filter(fikirMi).length

  const bugun = (
    <BugunView
      kayitlar={kayitlar}
      loading={loading}
      onAddClick={onAddClick}
      onRecordClick={onRecordClick}
      onToggleStatus={onToggleStatus}
    />
  )
  const hatirlat = (
    <RemindersView
      kayitlar={kayitlar}
      onToggleStatus={onToggleStatus}
      onDelete={onDelete}
      onAddClick={onAddClick}
      onRecordClick={onRecordClick}
      onFikirler={masaustu ? undefined : () => setGorunum('fikirler')}
    />
  )
  const fikirlerGorunumu = <FikirlerView kayitlar={kayitlar} onRecordClick={onRecordClick} />

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1.5 px-5 pt-[calc(1rem+var(--safe-top))] pb-2 shrink-0 overflow-x-auto no-scrollbar lg:hidden">
        <button
          onClick={() => setGorunum('bugun')}
          className={`chip shrink-0 ${
            gorunum === 'bugun' ? 'bg-gradient-orchid text-white' : 'bg-mist-50 text-ink-400 border border-ink-100'
          }`}
        >
          <Icon name="CalendarDays" className="w-4 h-4" />
          Takvim
        </button>
        <button
          onClick={() => setGorunum('hatirlat')}
          className={`chip shrink-0 ${
            gorunum === 'hatirlat' ? 'bg-gradient-orchid text-white' : 'bg-mist-50 text-ink-400 border border-ink-100'
          }`}
        >
          <Icon name="Bell" className="w-4 h-4" />
          Hatırlatmalar
          {bekleyen > 0 && (
            <span
              className={`ml-0.5 text-[10px] font-bold ${
                gorunum === 'hatirlat' ? 'text-white/80' : 'text-ink-300'
              }`}
            >
              {bekleyen}
            </span>
          )}
        </button>
        <button
          onClick={() => setGorunum('fikirler')}
          className={`chip shrink-0 ${
            gorunum === 'fikirler' ? 'bg-gradient-orchid text-white' : 'bg-mist-50 text-ink-400 border border-ink-100'
          }`}
        >
          <Icon name="Lightbulb" className="w-4 h-4" />
          Fikirler
          {fikirSayisi > 0 && (
            <span className={`ml-0.5 text-[10px] font-bold ${gorunum === 'fikirler' ? 'text-white/80' : 'text-ink-300'}`}>
              {fikirSayisi}
            </span>
          )}
        </button>
      </div>

      <AniHatirlatici kayitlar={kayitlar} />

      <div className="flex-1 min-h-0">
        {masaustu ? (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,400px)] gap-6 items-start">
            {bugun}
            <div className="space-y-6">
              <div className="card overflow-hidden">{hatirlat}</div>
              <div className="card overflow-hidden">{fikirlerGorunumu}</div>
            </div>
          </div>
        ) : gorunum === 'bugun' ? (
          bugun
        ) : gorunum === 'hatirlat' ? (
          hatirlat
        ) : (
          fikirlerGorunumu
        )}
      </div>
    </div>
  )
}
