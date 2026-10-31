import { useState } from 'react'
import { ChatButton } from './ChatButton'
import { SegmentedControl } from '../ui/SegmentedControl'
import { EkranBasligi } from '../ui/EkranBasligi'
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
  // Opens the assistant (phones; the desktop sidebar has its own entry).
  onAsistan?: () => void
}

export function PlanlarView({
  kayitlar,
  loading,
  onAddClick,
  onRecordClick,
  onToggleStatus,
  onDelete,
  onAsistan,
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
      <EkranBasligi
        baslik="Planlar"
        altBaslik={new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
        eylemler={onAsistan && <ChatButton onClick={onAsistan} />}
      >
        <div className="lg:hidden">
          <SegmentedControl
            etiket="Planlar görünümü"
            secili={gorunum}
            onSec={setGorunum}
            segmentler={[
              { id: 'bugun', etiket: 'Takvim' },
              { id: 'hatirlat', etiket: 'Hatırlatmalar', sayi: bekleyen },
              { id: 'fikirler', etiket: 'Fikirler', sayi: fikirSayisi },
            ]}
          />
        </div>
      </EkranBasligi>

      <AniHatirlatici kayitlar={kayitlar} />

      <div className="flex-1 min-h-0">
        {masaustu ? (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,400px)] gap-6 items-start kademeli">
            <div className="card p-5">{bugun}</div>
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
