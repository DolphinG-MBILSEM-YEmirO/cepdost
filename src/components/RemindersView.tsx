import { useMemo } from 'react'
import { Icon } from './Icon'
import { BosDurum } from '../ui/BosDurum'
import { KayitCard } from './KayitCard'
import { type Kayit } from '../db'
import { isToday, isTomorrow, isPast, isUpcoming, parseLocalDate, sortByTime, sortByPriority, addDays } from '../lib/format'
import { useBugun } from '../hooks/useBugun'
import { gunEkle } from '../lib/takvimIzgarasi'
import { useTopluIslem } from '../lib/topluIslem'
import { GeriAlCubugu } from './TakvimIslemleri'

interface RemindersViewProps {
  kayitlar: Kayit[]
  onToggleStatus: (id: string) => void
  onDelete: (id: string) => void
  onAddClick: () => void
  onRecordClick: (kayit: Kayit) => void
  // Plans with no day live in Fikirler; on a phone this leads there (on
  // desktop the list sits right below).
  onFikirler?: () => void
}

export function RemindersView({ kayitlar, onToggleStatus, onDelete, onAddClick, onRecordClick, onFikirler }: RemindersViewProps) {
  // Regroup when the date changes, not only when records do.
  const bugun = useBugun()
  const islem = useTopluIslem()
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
      } else if (isUpcoming(k.tarih) && parseLocalDate(k.tarih) <= weekEnd) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kayitlar, bugun])

  const totalCount = groups.overdue.length + groups.today.length + groups.tomorrow.length + groups.thisWeek.length + groups.later.length
  const hasAny = kayitlar.length > 0

  if (!hasAny) {
    return (
      <BosDurum
        ikon="Bell"
        baslik="Henüz hatırlatma yok"
        aciklama="Tarihi olan planların burada gün gün sıralanır."
        eylem={{ etiket: 'Plan ekle', ikon: 'Plus', onClick: onAddClick }}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-1 pb-3 lg:pt-4">
        <h2 className="text-title text-ink-800">Hatırlatmalar</h2>
        <p className="text-caption font-normal text-ink-400 mt-0.5">
          {totalCount} bekleyen
          {groups.overdue.length > 0 && <span className="text-rose-600 font-medium"> · {groups.overdue.length} kaçtı</span>}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-5">
        {totalCount === 0 ? (
          <BosDurum ikon="CheckCheck" baslik="Hepsi halledildi" aciklama="Bekleyen planın yok." sikisik />
        ) : (
          <>
            {groups.overdue.length > 0 && (
              <Section
                title="Kaçtı"
               
                count={groups.overdue.length}
                accent="rose"
                kayitlar={groups.overdue}
                onToggleStatus={onToggleStatus}
                onDelete={onDelete}
                onRecordClick={onRecordClick}
                eylemler={
                  groups.overdue.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-2 px-1">
                      <span className="text-caption font-normal text-ink-400 mr-1">Hepsini:</span>
                      <button
                        onClick={() => void islem.uygula(groups.overdue, { tur: 'tasi', tarih: bugun })}
                        disabled={islem.mesgul}
                        aria-label="Hepsini bugüne al"
                        className="chip text-xs bg-white text-ink-600 border border-ink-200 hover:bg-ink-50 disabled:opacity-50"
                      >
                        Bugüne al
                      </button>
                      <button
                        onClick={() => void islem.uygula(groups.overdue, { tur: 'tasi', tarih: gunEkle(bugun, 1) })}
                        disabled={islem.mesgul}
                        aria-label="Hepsini yarına ertele"
                        className="chip text-xs bg-white text-ink-600 border border-ink-200 hover:bg-ink-50 disabled:opacity-50"
                      >
                        Yarına ertele
                      </button>
                      <button
                        onClick={() => void islem.uygula(groups.overdue, { tur: 'yapildi' })}
                        disabled={islem.mesgul}
                        aria-label="Hepsini yapıldı say"
                        className="chip text-xs bg-white text-ink-600 border border-ink-200 hover:bg-ink-50 disabled:opacity-50"
                      >
                        <Icon name="CheckCheck" className="w-3.5 h-3.5" />
                        Yapıldı say
                      </button>
                    </div>
                  )
                }
              />
            )}
            {groups.today.length > 0 && (
              <Section title="Bugün" count={groups.today.length} accent="orchid" kayitlar={groups.today} onToggleStatus={onToggleStatus} onDelete={onDelete} onRecordClick={onRecordClick} />
            )}
            {groups.tomorrow.length > 0 && (
              <Section title="Yarın" count={groups.tomorrow.length} kayitlar={groups.tomorrow} onToggleStatus={onToggleStatus} onDelete={onDelete} onRecordClick={onRecordClick} />
            )}
            {groups.thisWeek.length > 0 && (
              <Section title="Bu hafta" count={groups.thisWeek.length} kayitlar={groups.thisWeek} onToggleStatus={onToggleStatus} onDelete={onDelete} onRecordClick={onRecordClick} />
            )}
            {groups.later.length > 0 && (
              <Section title="Daha sonra" count={groups.later.length} kayitlar={groups.later} onToggleStatus={onToggleStatus} onDelete={onDelete} onRecordClick={onRecordClick} />
            )}
          </>
        )}
        {onFikirler && groups.noDate.length > 0 && (
          <button
            onClick={onFikirler}
            className="w-full bg-white rounded-2xl border border-ink-100 px-4 py-3 flex items-center gap-3 text-left hover:bg-ink-50/60"
          >
            <span className="w-8 h-8 rounded-2xl bg-bolum-soluk text-bolum-koyu flex items-center justify-center shrink-0">
              <Icon name="Lightbulb" className="w-[18px] h-[18px] text-bolum-koyu" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-body font-medium text-ink-800">Fikirler</span>
              <span className="block text-caption font-normal text-ink-400">Günü belli olmayan {groups.noDate.length} plan</span>
            </span>
            <Icon name="ChevronRight" className="w-4 h-4 text-ink-400 shrink-0" />
          </button>
        )}
      </div>

      <GeriAlCubugu sonIslem={islem.sonIslem} onGeriAl={() => void islem.geriAl()} onKapat={islem.kapat} />
    </div>
  )
}

function Section({
  title,
  count,
  kayitlar,
  onToggleStatus,
  onDelete,
  onRecordClick,
  accent,
  eylemler,
}: {
  title: string
  count: number
  kayitlar: Kayit[]
  onToggleStatus: (id: string) => void
  onDelete: (id: string) => void
  onRecordClick: (kayit: Kayit) => void
  accent?: 'rose' | 'orchid'
  // Buttons that act on the whole section, under its title.
  eylemler?: React.ReactNode
}) {
  const textColor = accent === 'rose' ? 'text-rose-600' : accent === 'orchid' ? 'text-brand-600' : 'text-ink-500'

  return (
    <section>
      <h2 className={`flex items-baseline gap-2 text-label px-1 mb-2 ${textColor}`}>
        {title}
        <span className="text-caption font-normal text-ink-400 tabular-nums">{count}</span>
      </h2>
      {eylemler}
      <div className="card divide-y divide-ink-100/70 overflow-hidden kademeli">
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
    </section>
  )
}
