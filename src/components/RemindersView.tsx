import { useMemo } from 'react'
import { Icon, type IconName } from './Icon'
import { KayitCard } from './KayitCard'
import { type Kayit } from '../db'
import { isToday, isTomorrow, isPast, isUpcoming, sortByTime, sortByPriority, addDays } from '../lib/format'

interface RemindersViewProps {
  kayitlar: Kayit[]
  onToggleStatus: (id: string) => void
  onDelete: (id: string) => void
  onAddClick: () => void
  onRecordClick: (kayit: Kayit) => void
}

export function RemindersView({ kayitlar, onToggleStatus, onDelete, onAddClick, onRecordClick }: RemindersViewProps) {
  const groups = useMemo(() => {
    const pending = kayitlar.filter((k) => k.durum === 'bekliyor')

    const overdue: Kayit[] = []
    const today: Kayit[] = []
    const tomorrow: Kayit[] = []
    const thisWeek: Kayit[] = []
    const later: Kayit[] = []
    const noDate: Kayit[] = []

    const weekEnd = addDays(new Date(), 7)

    for (const k of pending) {
      if (!k.tarih) {
        noDate.push(k)
      } else if (isPast(k.tarih)) {
        overdue.push(k)
      } else if (isToday(k.tarih)) {
        today.push(k)
      } else if (isTomorrow(k.tarih)) {
        tomorrow.push(k)
      } else if (isUpcoming(k.tarih) && new Date(k.tarih) <= weekEnd) {
        thisWeek.push(k)
      } else {
        later.push(k)
      }
    }

    const sortFn = (arr: Kayit[]) => {
      const withTime = sortByTime(arr.filter((k) => k.saat))
      const withoutTime = sortByPriority(arr.filter((k) => !k.saat))
      return [...withTime, ...withoutTime]
    }

    return {
      overdue: sortFn(overdue),
      today: sortFn(today),
      tomorrow: sortFn(tomorrow),
      thisWeek: sortFn(thisWeek),
      later: sortFn(later),
      noDate: sortByPriority(noDate),
    }
  }, [kayitlar])

  const totalCount = groups.overdue.length + groups.today.length + groups.tomorrow.length + groups.thisWeek.length + groups.later.length + groups.noDate.length
  const hasAny = kayitlar.length > 0

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-coral-100 flex items-center justify-center mb-5">
          <Icon name="BellRing" className="w-10 h-10 text-coral-500" />
        </div>
        <p className="font-display text-lg font-bold text-ink-600 mb-2">Henüz hatırlatma yok</p>
        <p className="text-sm text-ink-400 mb-6 max-w-xs">Tarihi olan kayıtların burada öne çıkar. Bir etkinlik veya randevu kaydet.</p>
        <button onClick={onAddClick} className="btn-primary flex items-center gap-2">
          <Icon name="Plus" className="w-5 h-5" />
          Kayıt ekle
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-[calc(1rem+var(--safe-top))] pb-3">
        <h1 className="font-display text-2xl font-bold text-ink-700">Hatırlatmalar</h1>
        <p className="text-sm text-ink-400 mt-0.5">
          {totalCount} bekleyen
          {groups.overdue.length > 0 && <span className="text-rose-500 font-medium"> · {groups.overdue.length} kaçtı</span>}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-6">
        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mb-4">
              <Icon name="CheckCheck" className="w-8 h-8 text-teal-600" />
            </div>
            <p className="font-semibold text-ink-500 mb-1">Hepsi halledilmiş</p>
            <p className="text-sm text-ink-400">Yeni bir kayıt eklemek için + simgesine dokun.</p>
          </div>
        ) : (
          <>
            {groups.overdue.length > 0 && (
              <Section title="Kaçtı" icon="AlertCircle" count={groups.overdue.length} accent="rose" kayitlar={groups.overdue} onToggleStatus={onToggleStatus} onDelete={onDelete} onRecordClick={onRecordClick} />
            )}
            {groups.today.length > 0 && (
              <Section title="Bugün" icon="CalendarDays" count={groups.today.length} accent="coral" kayitlar={groups.today} onToggleStatus={onToggleStatus} onDelete={onDelete} onRecordClick={onRecordClick} />
            )}
            {groups.tomorrow.length > 0 && (
              <Section title="Yarın" icon="Clock" count={groups.tomorrow.length} kayitlar={groups.tomorrow} onToggleStatus={onToggleStatus} onDelete={onDelete} onRecordClick={onRecordClick} />
            )}
            {groups.thisWeek.length > 0 && (
              <Section title="Bu hafta" icon="Calendar" count={groups.thisWeek.length} kayitlar={groups.thisWeek} onToggleStatus={onToggleStatus} onDelete={onDelete} onRecordClick={onRecordClick} />
            )}
            {groups.later.length > 0 && (
              <Section title="Daha sonra" icon="CalendarHeart" count={groups.later.length} kayitlar={groups.later} onToggleStatus={onToggleStatus} onDelete={onDelete} onRecordClick={onRecordClick} muted />
            )}
            {groups.noDate.length > 0 && (
              <Section title="Tarihsiz" icon="Archive" count={groups.noDate.length} kayitlar={groups.noDate.slice(0, 10)} onToggleStatus={onToggleStatus} onDelete={onDelete} onRecordClick={onRecordClick} muted />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Section({
  title,
  icon,
  count,
  kayitlar,
  onToggleStatus,
  onDelete,
  onRecordClick,
  accent,
  muted,
}: {
  title: string
  icon: IconName
  count: number
  kayitlar: Kayit[]
  onToggleStatus: (id: string) => void
  onDelete: (id: string) => void
  onRecordClick: (kayit: Kayit) => void
  accent?: 'rose' | 'coral'
  muted?: boolean
}) {
  const color = accent === 'rose' ? 'text-rose-500' : accent === 'coral' ? 'text-coral-500' : muted ? 'text-ink-300' : 'text-ink-400'
  const textColor = accent === 'rose' ? 'text-rose-600' : accent === 'coral' ? 'text-coral-600' : muted ? 'text-ink-300' : 'text-ink-500'

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 px-1">
        <Icon name={icon} className={`w-4 h-4 ${color}`} />
        <h2 className={`text-sm font-semibold ${textColor}`}>{title}</h2>
        <span className={`text-xs ${color}`}>{count}</span>
      </div>
      <div className="space-y-3">
        {kayitlar.map((kayit) => (
          <KayitCard
            key={kayit.id}
            kayit={kayit}
            onToggleStatus={() => onToggleStatus(kayit.id)}
            onDelete={() => onDelete(kayit.id)}
            onClick={() => onRecordClick(kayit)}
          />
        ))}
      </div>
    </div>
  )
}
