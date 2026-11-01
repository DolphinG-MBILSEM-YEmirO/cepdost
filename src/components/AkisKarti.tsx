import { useState } from 'react'
import { Icon } from './Icon'
import { SikayetSayfasi } from './SikayetSayfasi'
import { Avatar } from './Avatar'
import { AniMedyaGalerisi } from './AniMedyaGalerisi'
import { AZAMI_PUAN, type Ani } from '../sosyal/gruplar'
import type { Profil } from '../sosyal/api'
import { formatDate } from '../lib/format'
import { UYGULAMA_ADI } from '../../shared/marka'

// A memory as a card: who shared it (and in which group), the photos and
// clips, the place, the rating, the day and the note. Its answers go in as
// children.

export function AkisKarti({
  ani,
  sahip,
  grupAdi,
  yeni = false,
  benimId,
  onEngellendi,
  children,
}: {
  ani: Ani
  sahip: Profil | null
  // The group it was shared in, when it was.
  grupAdi?: string | null
  // Shared since I last looked at the feed.
  yeni?: boolean
  // With it, someone else's memory gets a "Report" button.
  benimId?: string
  // The owner was blocked from the report sheet.
  onEngellendi?: (kisiId: string) => void
  children?: React.ReactNode
}) {
  const [sikayetAcik, setSikayetAcik] = useState(false)
  const sikayetEdilebilir = !!benimId && ani.sahip_id !== benimId
  // Fotoğrafını herkese açmış ama profili kapalı biri olabilir — o zaman
  // profili okuyamayız, isim yerine nötr bir etiket gösteriyoruz.
  const ad = sahip?.ad ?? `${UYGULAMA_ADI} kullanıcısı`

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 p-3">
        <Avatar ad={ad} foto={sahip?.avatar} emoji={sahip?.emoji} renk={sahip?.renk} boyut="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-700 truncate">{ad}</p>
          {(sahip?.kullanici_adi || grupAdi) && (
            <p className="text-xs text-ink-400 truncate">
              {[sahip?.kullanici_adi && `@${sahip.kullanici_adi}`, grupAdi].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        {yeni && <span className="text-caption font-semibold text-brand-700 shrink-0">Yeni</span>}
        {sikayetEdilebilir && (
          <button
            type="button"
            onClick={() => setSikayetAcik(true)}
            aria-label="Bu paylaşımı şikâyet et"
            title="Şikâyet et"
            className="w-8 h-8 rounded-full flex items-center justify-center text-ink-300 hover:text-rose-500 hover:bg-ink-50 shrink-0 transition-colors"
          >
            <Icon name="Flag" className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="aspect-square bg-mist-100">
        <AniMedyaGalerisi ani={ani} />
      </div>

      <div className="p-4">
        <div className="flex items-center gap-1.5">
          <Icon name="MapPin" className="w-4 h-4 text-ink-500 shrink-0" />
          <p className="text-body font-semibold text-ink-800 truncate flex-1">{ani.mekan_adi}</p>
          {ani.puan && <Yildizlar puan={ani.puan} />}
        </div>
        <p className="text-xs text-ink-400 mt-0.5">{formatDate(ani.tarih) ?? ani.tarih}</p>
        {ani.notlar && <p className="text-sm text-ink-500 mt-2">{ani.notlar}</p>}
      </div>
      {children}
      {sikayetAcik && (
        <SikayetSayfasi
          hedef={{
            tur: 'ani',
            kisiId: ani.sahip_id,
            ad: sahip?.ad ?? null,
            kullaniciAdi: sahip?.kullanici_adi ?? null,
            metin: [ani.mekan_adi, ani.notlar].filter(Boolean).join(' — '),
            icerikId: ani.id,
          }}
          onKapat={() => setSikayetAcik(false)}
          onEngellendi={() => onEngellendi?.(ani.sahip_id)}
        />
      )}
    </div>
  )
}

// The sharer's rating as small filled stars.
function Yildizlar({ puan }: { puan: number }) {
  return (
    <span className="flex items-center gap-0.5 shrink-0" aria-label={`${puan} / ${AZAMI_PUAN} yıldız`}>
      {Array.from({ length: AZAMI_PUAN }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden>
          <path
            d="M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.15 6.38 20.1l1.07-6.27L2.9 9.4l6.3-.9z"
            fill={i < puan ? '#FBBF24' : '#E5E7EB'}
          />
        </svg>
      ))}
    </span>
  )
}
