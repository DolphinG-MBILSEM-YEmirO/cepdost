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

interface KayitCardProps {
  kayit: Kayit
  onToggleStatus: () => void
  onDelete: () => void
  onClick?: () => void
}

export function KayitCard({ kayit, onToggleStatus, onDelete, onClick }: KayitCardProps) {
  const colors = CATEGORY_COLORS[kayit.kategori ?? 'not']
  const dateLabel = formatDate(kayit.tarih)
  const timeLabel = formatPlanTime(kayit.saat, kayit.tumGun)
  const durLabel = formatDuration(kayit.sure)
  const past = isPast(kayit.tarih)
  const mapsLink = mapUrl(kayit)
  const done = kayit.durum === 'yapildi'
  const baslik = goruntulemeBasligi(kayit)

  return (
    <div
      {...(onClick ? tiklanabilir(onClick) : {})}
      className={`card p-4 ${onClick ? 'cursor-pointer' : ''} transition-all duration-200 active:scale-[0.98] ${done ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleStatus() }}
          aria-label={done ? 'Bekliyor olarak işaretle' : 'Yapıldı olarak işaretle'}
          className={`shrink-0 mt-0.5 transition-transform active:scale-90 ${done ? 'text-teal-500' : 'text-ink-200'}`}
        >
          <Icon name={done ? 'CheckCircle2' : 'Circle'} className="w-6 h-6" />
        </button>

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
            {baslik}
          </h3>

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
              {kayit.konum && (
                <a
                  href={mapsLink ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-xs text-teal-600 font-medium active:scale-95 transition-transform"
                >
                  <Icon name="MapPin" className="w-3.5 h-3.5" />
                  {kayit.konum}
                </a>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-300">{formatRelativeTime(kayit.olusturulmaTarihi)}</span>
              {kayit.oncelik !== 'orta' && (
                <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[kayit.oncelik].dot}`} />
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              aria-label="Kaydı sil"
              className="w-8 h-8 rounded-full flex items-center justify-center text-ink-200 hover:text-rose-500 hover:bg-rose-50 transition-all active:scale-90"
            >
              <Icon name="Trash2" className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
