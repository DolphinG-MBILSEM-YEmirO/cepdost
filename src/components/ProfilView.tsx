import { useState } from 'react'
import { SegmentedControl } from '../ui/SegmentedControl'
import { EkranBasligi } from '../ui/EkranBasligi'
import { HesabimView } from './HesabimView'
import { ArchiveView } from './ArchiveView'
import { SettingsView } from './SettingsView'
import type { Kayit } from '../db'
import { useGeriAdimi } from '../lib/geriTusu'

// Alt barda ayrı sekme tutmak yerine hesapla ilgili her şey burada:
// profil + kayıt arşivi + uygulama ayarları. Arkadaşlar, kod ve istekler
// Sohbet sekmesinde (ArkadaslarView); profil sadece kişinin kendisi.
type Sekme = 'hesap' | 'arsiv' | 'ayarlar'

interface Props {
  kayitlar: Kayit[]
  loading: boolean
  onDegisti?: () => void
  // Opens Sohbet → Arkadaşlar (from the friend and group counts).
  onArkadaslar: () => void
  onRecordClick: (kayit: Kayit) => void
  onToggleStatus: (id: string) => void
  onDelete: (id: string) => void
}

const sekmeler: { id: Sekme; etiket: string }[] = [
  { id: 'hesap', etiket: 'Hesabım' },
  { id: 'arsiv', etiket: 'Arşiv' },
  { id: 'ayarlar', etiket: 'Ayarlar' },
]

export function ProfilView({
  kayitlar,
  loading,
  onDegisti,
  onArkadaslar,
  onRecordClick,
  onToggleStatus,
  onDelete,
}: Props) {
  const [sekme, setSekme] = useState<Sekme>('hesap')
  useGeriAdimi(() => setSekme('hesap'), sekme !== 'hesap')

  return (
    <div className="flex flex-col h-full">
      <EkranBasligi baslik="Profil">
        <div className="lg:max-w-md">
          <SegmentedControl etiket="Profil bölümleri" secili={sekme} onSec={setSekme} segmentler={sekmeler} />
        </div>
      </EkranBasligi>

      {/* key: each section slides in when picked. */}
      <div key={sekme} className="flex-1 min-h-0 animate-gecis">
        {sekme === 'hesap' && <HesabimView kayitlar={kayitlar} onArkadaslar={onArkadaslar} />}
        {sekme === 'arsiv' && (
          <ArchiveView
            kayitlar={kayitlar}
            loading={loading}
            onToggleStatus={onToggleStatus}
            onDelete={onDelete}
            onRecordClick={onRecordClick}
          />
        )}
        {sekme === 'ayarlar' && <SettingsView onDegisti={onDegisti} />}
      </div>
    </div>
  )
}
