import { useState } from 'react'
import { Icon, type IconName } from './Icon'
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

const sekmeler: { id: Sekme; etiket: string; ikon: IconName }[] = [
  { id: 'hesap', etiket: 'Hesabım', ikon: 'UserRound' },
  { id: 'arsiv', etiket: 'Arşiv', ikon: 'Archive' },
  { id: 'ayarlar', etiket: 'Ayarlar', ikon: 'Settings' },
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
      <div className="flex gap-1.5 px-5 pt-[calc(1rem+var(--safe-top))] pb-2 shrink-0">
        {sekmeler.map((s) => (
          <button
            key={s.id}
            onClick={() => setSekme(s.id)}
            className={`chip ${
              sekme === s.id ? 'bg-gradient-orchid text-white' : 'bg-mist-50 text-ink-400 border border-ink-100'
            }`}
          >
            <Icon name={s.ikon} className="w-4 h-4" />
            {s.etiket}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        {sekme === 'hesap' && <HesabimView onArkadaslar={onArkadaslar} />}
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
