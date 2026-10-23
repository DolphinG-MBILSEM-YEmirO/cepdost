import { Icon } from './Icon'
import { Avatar } from './Avatar'
import { AniGorseli } from './AniGorseli'
import type { Ani } from '../sosyal/gruplar'
import type { Profil } from '../sosyal/api'
import { formatDate } from '../lib/format'
import { UYGULAMA_ADI } from '../../shared/marka'

// A memory as a card: who shared it, the photo, the place, the day and the
// note. Its answers go in as children.

export function AkisKarti({ ani, sahip, children }: { ani: Ani; sahip: Profil | null; children?: React.ReactNode }) {
  // Fotoğrafını herkese açmış ama profili kapalı biri olabilir — o zaman
  // profili okuyamayız, isim yerine nötr bir etiket gösteriyoruz.
  const ad = sahip?.ad ?? `${UYGULAMA_ADI} kullanıcısı`

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 p-3">
        <Avatar ad={ad} foto={sahip?.avatar} emoji={sahip?.emoji} renk={sahip?.renk} boyut="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-700 truncate">{ad}</p>
          {sahip?.kullanici_adi && <p className="text-xs text-ink-400 truncate">@{sahip.kullanici_adi}</p>}
        </div>
      </div>

      <div className="aspect-square bg-mist-100">
        <AniGorseli ani={ani} />
      </div>

      <div className="p-4">
        <div className="flex items-center gap-1.5">
          <Icon name="MapPin" className="w-4 h-4 text-orchid-500 shrink-0" />
          <p className="text-sm font-semibold text-ink-700 truncate">{ani.mekan_adi}</p>
        </div>
        <p className="text-xs text-ink-400 mt-0.5">{formatDate(ani.tarih) ?? ani.tarih}</p>
        {ani.notlar && <p className="text-sm text-ink-500 mt-2">{ani.notlar}</p>}
      </div>
      {children}
    </div>
  )
}
