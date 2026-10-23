import { Icon } from './Icon'
import { type Kayit, goruntulemeBasligi } from '../db'
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  CATEGORY_ICON_NAME,
  PRIORITY_COLORS,
  formatDate,
  formatPlanTime,
  formatDuration,
  formatRelativeTime,
  isPast,
  mapUrl,
} from '../lib/format'
import { tiklanabilir } from '../lib/a11y'
import { geriSayim } from '../lib/planAyrintilari'
import { PlanRozetleri } from './PlanRozetleri'
import { Vurgulu } from './Vurgulu'
import { gizliEslesme } from '../lib/arsivListesi'

interface KayitCardProps {
  kayit: Kayit
  onToggleStatus: () => void
  onDelete: () => void
  onClick?: () => void
  // A search to highlight (as folded by aramaSorgusu).
  sorgu?: string | null
  // In selection mode a tap selects the card instead of opening it.
  secim?: { secili: boolean; onSec: () => void }
}

export function KayitCard({ kayit, onToggleStatus, onDelete, onClick, sorgu = null, secim }: KayitCardProps) {
  const colors = CATEGORY_COLORS[kayit.kategori ?? 'not']
  const dateLabel = formatDate(kayit.tarih)
  const timeLabel = formatPlanTime(kayit.saat, kayit.tumGun)
  const durLabel = formatDuration(kayit.sure)
  const past = isPast(kayit.tarih)
  const mapsLink = mapUrl(kayit)
  const done = kayit.durum === 'yapildi'
  const baslik = goruntulemeBasligi(kayit)
  // How long is left says more than when it was saved; undated notes and
  // finished plans keep the saved time.
  const kalan = !done && kayit.tarih ? geriSayim(kayit) : null
  // A search that matched the note or the shared text, not what's shown.
  const gizliOzet = sorgu ? gizliEslesme(kayit, sorgu) : null
  const tiklama = secim
    ? { ...tiklanabilir(secim.onSec), role: 'checkbox' as const, 'aria-checked': secim.secili, 'aria-label': baslik }
    : onClick
      ? tiklanabilir(onClick)
      : {}

  return (
    <div
      {...tiklama}
      className={`card p-4 ${onClick || secim ? 'cursor-pointer' : ''} transition-all duration-200 active:scale-[0.98] ${
        done && !secim?.secili ? 'opacity-60' : ''
      } ${secim?.secili ? 'ring-2 ring-orchid-300' : ''}`}
    >
      <div className="flex items-start gap-3">
        {secim ? (
          <span
            aria-hidden="true"
            className={`shrink-0 mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
              secim.secili ? 'bg-orchid-500 border-orchid-500 text-white' : 'border-ink-200'
            }`}
          >
            {secim.secili && <Icon name="Check" className="w-4 h-4" />}
          </span>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleStatus() }}
            aria-label={done ? 'Bekliyor olarak işaretle' : 'Yapıldı olarak işaretle'}
            className={`shrink-0 mt-0.5 transition-transform active:scale-90 ${done ? 'text-teal-500' : 'text-ink-200'}`}
          >
            <Icon name={done ? 'CheckCircle2' : 'Circle'} className="w-6 h-6" />
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`chip ${colors.bg} ${colors.text} text-xs`}>
              <Icon name={CATEGORY_ICON_NAME[kayit.kategori ?? 'not']} className="w-3.5 h-3.5" />
              {kayit.kategori ? CATEGORY_LABELS[kayit.kategori] : 'Sınıflandırılmamış'}
            </span>
            {kayit.oncelik === 'yuksek' && (
              <span className="flex items-center gap-1 text-xs text-rose-500 font-medium">
                <Icon name="Flame" className="w-3 h-3" />
              </span>
            )}
            {done && <span className="text-xs text-teal-600 font-medium">Yapıldı</span>}
          </div>

          <h3 className={`font-semibold text-ink-700 text-balance leading-snug ${done ? 'line-through' : ''}`}>
            {kayit.emoji && <span aria-hidden="true">{kayit.emoji} </span>}
            <Vurgulu metin={baslik} sorgu={sorgu} />
          </h3>
          {gizliOzet && (
            <p className="mt-1 text-xs text-ink-400 line-clamp-2">
              <Vurgulu metin={gizliOzet} sorgu={sorgu} />
            </p>
          )}

          {(dateLabel || timeLabel || kayit.konum) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              {dateLabel && (
                <span className={`flex items-center gap-1 text-xs ${past && !done ? 'text-rose-500 font-medium' : 'text-ink-400'}`}>
                  <Icon name="Clock" className="w-3.5 h-3.5" />
                  {dateLabel}
                  {timeLabel ? ` ${timeLabel}` : ''}
                  {durLabel ? ` · ${durLabel}` : ''}
                </span>
              )}
              {kayit.konum &&
                (secim ? (
                  <span className="flex items-center gap-1 text-xs text-teal-600 font-medium">
                    <Icon name="MapPin" className="w-3.5 h-3.5" />
                    <Vurgulu metin={kayit.konum} sorgu={sorgu} />
                  </span>
                ) : (
                  <a
                    href={mapsLink ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs text-teal-600 font-medium active:scale-95 transition-transform"
                  >
                    <Icon name="MapPin" className="w-3.5 h-3.5" />
                    <Vurgulu metin={kayit.konum} sorgu={sorgu} />
                  </a>
                ))}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {kalan ? (
                <span className={`text-xs font-medium ${kalan.durum === 'yakin' || kalan.durum === 'suruyor' ? 'text-orchid-600' : 'text-ink-300'}`}>
                  {kalan.metin}
                </span>
              ) : (
                <span className="text-xs text-ink-300">{formatRelativeTime(kayit.olusturulmaTarihi)}</span>
              )}
              <PlanRozetleri kayit={kayit} />
              {kayit.oncelik !== 'orta' && (
                <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[kayit.oncelik].dot}`} />
              )}
            </div>
            {!secim && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                aria-label="Kaydı sil"
                className="w-8 h-8 rounded-full flex items-center justify-center text-ink-200 hover:text-rose-500 hover:bg-rose-50 transition-all active:scale-90"
              >
                <Icon name="Trash2" className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
