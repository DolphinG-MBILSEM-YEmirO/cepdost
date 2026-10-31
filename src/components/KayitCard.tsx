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

  const kategori = kayit.kategori ? CATEGORY_LABELS[kayit.kategori] : 'Sınıflandırılmamış'
  const geciken = past && !done

  // A row of a grouped list (the caller draws the white group and the
  // dividers): status on the left, title and details in the middle, time
  // left and delete on the right.
  return (
    <div
      {...tiklama}
      className={`flex items-start gap-3 px-4 py-3 transition-colors ${onClick || secim ? 'cursor-pointer hover:bg-ink-50/60' : ''} ${
        secim?.secili ? 'bg-brand-50' : ''
      }`}
    >
      {secim ? (
        <span
          aria-hidden="true"
          className={`shrink-0 mt-0.5 w-[22px] h-[22px] rounded-md border-2 flex items-center justify-center transition-colors ${
            secim.secili ? 'bg-brand-600 border-brand-600 text-white' : 'border-ink-200 bg-white'
          }`}
        >
          {secim.secili && <Icon name="Check" className="w-3.5 h-3.5" strokeWidth={2.5} />}
        </span>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleStatus() }}
          aria-label={done ? 'Bekliyor olarak işaretle' : 'Yapıldı olarak işaretle'}
          className={`shrink-0 -m-1.5 p-1.5 rounded-lg hover:bg-ink-50 ${done ? 'text-teal-600' : 'text-ink-300 hover:text-teal-600'}`}
        >
          <Icon name={done ? 'CheckCircle2' : 'Circle'} className="w-[22px] h-[22px]" />
        </button>
      )}

      <div className="flex-1 min-w-0">
        <p className={`text-body font-medium leading-snug ${done ? 'text-ink-400 line-through' : 'text-ink-800'}`}>
          {kayit.emoji && <span aria-hidden="true">{kayit.emoji} </span>}
          <Vurgulu metin={baslik} sorgu={sorgu} />
        </p>
        {gizliOzet && (
          <p className="mt-0.5 text-caption font-normal text-ink-400 line-clamp-2">
            <Vurgulu metin={gizliOzet} sorgu={sorgu} />
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption font-normal text-ink-400">
          <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${colors.bg} ${colors.text}`} aria-hidden="true">
            <Icon name={CATEGORY_ICON_NAME[kayit.kategori ?? 'not']} className="w-3 h-3" />
          </span>
          <span>{kategori}</span>
          {dateLabel && (
            <>
              <span aria-hidden="true">·</span>
              <span className={geciken ? 'text-rose-600 font-medium' : ''}>
                {dateLabel}
                {timeLabel ? ` ${timeLabel}` : ''}
                {durLabel ? `, ${durLabel}` : ''}
              </span>
            </>
          )}
          {kayit.konum && (
            <>
              <span aria-hidden="true">·</span>
              {secim ? (
                <span className="truncate max-w-[12rem]">
                  <Vurgulu metin={kayit.konum} sorgu={sorgu} />
                </span>
              ) : (
                <a
                  href={mapsLink ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-0.5 text-ink-500 underline decoration-ink-200 underline-offset-2 hover:text-ink-700 truncate max-w-[12rem]"
                >
                  <Icon name="MapPin" className="w-3 h-3 shrink-0" />
                  <Vurgulu metin={kayit.konum} sorgu={sorgu} />
                </a>
              )}
            </>
          )}
          {kayit.oncelik === 'yuksek' && (
            <span className="inline-flex items-center gap-0.5 text-rose-600 font-medium">
              <Icon name="Flame" className="w-3 h-3" />
              Öncelikli
            </span>
          )}
          {kayit.oncelik === 'dusuk' && <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_COLORS.dusuk.dot}`} aria-label="Düşük öncelik" />}
        </div>

        <div className="mt-1.5 empty:hidden">
          <PlanRozetleri kayit={kayit} />
        </div>
      </div>

      <div className="shrink-0 flex flex-col items-end gap-1 -mr-1.5">
        <span
          className={`text-caption tabular-nums whitespace-nowrap ${
            kalan && (kalan.durum === 'yakin' || kalan.durum === 'suruyor') ? 'text-brand-600 font-semibold' : 'text-ink-400 font-normal'
          }`}
        >
          {kalan ? kalan.metin : done ? 'Yapıldı' : formatRelativeTime(kayit.olusturulmaTarihi)}
        </span>
        {!secim && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            aria-label="Kaydı sil"
            title="Sil"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-300 hover:text-rose-600 hover:bg-rose-50"
          >
            <Icon name="Trash2" className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
