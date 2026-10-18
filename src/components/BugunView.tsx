import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { type Kayit, goruntulemeBasligi, kayitGuncelle } from '../db'
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  CATEGORY_ICON_NAME,
  isSameDay,
  isToday,
  isTomorrow,
  sortByTime,
  sortByPriority,
  toDateString,
  addDays,
  formatTime,
  formatDuration,
  isPast,
  formatDate,
} from '../lib/format'
import { useBugun } from '../hooks/useBugun'
import { tiklanabilir } from '../lib/a11y'

interface BugunViewProps {
  kayitlar: Kayit[]
  loading: boolean
  onAddClick: () => void
  onRecordClick: (kayit: Kayit) => void
  onToggleStatus: (id: string) => void
}

export function BugunView({ kayitlar, loading, onAddClick, onRecordClick, onToggleStatus }: BugunViewProps) {
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [rescheduling, setRescheduling] = useState<string | null>(null)
  const bugun = useBugun()

  // When the day rolls over while the app stays open, a view that was on
  // "today" follows along instead of staying on yesterday.
  const oncekiBugun = useRef(bugun)
  useEffect(() => {
    if (oncekiBugun.current === bugun) return
    setSelectedDate((secili) => (toDateString(secili) === oncekiBugun.current ? new Date() : secili))
    oncekiBugun.current = bugun
  }, [bugun])

  const allDayRecords = useMemo(() => kayitlar.filter((k) => isSameDay(k.tarih, selectedDate)), [kayitlar, selectedDate])

  const pending = useMemo(() => allDayRecords.filter((k) => k.durum === 'bekliyor'), [allDayRecords])
  const done = useMemo(() => allDayRecords.filter((k) => k.durum === 'yapildi'), [allDayRecords])

  const scheduled = useMemo(() => sortByTime(pending.filter((k) => k.saat)), [pending])
  const unscheduled = useMemo(() => sortByPriority(pending.filter((k) => !k.saat)), [pending])
  const doneSorted = useMemo(() => sortByTime(done), [done])

  const isTodayView = isToday(toDateString(selectedDate))
  const isTomorrowView = isTomorrow(toDateString(selectedDate))
  const isPastView = isPast(toDateString(selectedDate))

  const dayLabel = useMemo(() => {
    if (isTodayView) return 'Bugün'
    if (isTomorrowView) return 'Yarın'
    return selectedDate.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
  }, [selectedDate, isTodayView, isTomorrowView])

  const weekDays = useMemo(() => {
    const today = new Date()
    const days: Date[] = []
    for (let i = -1; i <= 5; i++) days.push(addDays(today, i))
    return days
    // `bugun` is the trigger: the strip is rebuilt when the date changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bugun])

  const totalDuration = pending.reduce((sum, k) => sum + (k.sure ?? 0), 0)
  const highPriority = pending.filter((k) => k.oncelik === 'yuksek').length
  const progressPct = allDayRecords.length > 0 ? Math.round((done.length / allDayRecords.length) * 100) : 0

  async function handleReschedule(id: string, newDate: Date) {
    setRescheduling(id)
    try {
      await kayitGuncelle(id, { tarih: toDateString(newDate) })
    } finally {
      setRescheduling(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-[calc(1rem+var(--safe-top))] pb-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink-700">{dayLabel}</h1>
            <p className="text-sm text-ink-400 mt-0.5">
              {pending.length} bekliyor{done.length > 0 ? `, ${done.length} yapıldı` : ''}
              {totalDuration > 0 ? ` · ${formatDuration(totalDuration)}` : ''}
              {highPriority > 0 ? ` · ${highPriority} yüksek` : ''}
            </p>
          </div>
          <button
            onClick={onAddClick}
            aria-label="Yeni kayıt ekle"
            className="w-11 h-11 rounded-full bg-coral-500 text-white flex items-center justify-center shadow-soft active:scale-90 transition-transform"
          >
            <Icon name="Plus" className="w-5 h-5" />
          </button>
        </div>

        {allDayRecords.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex-1 h-2 rounded-full bg-ink-100 overflow-hidden">
                <div className="h-full rounded-full bg-teal-400 transition-all duration-500" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="text-xs font-medium text-ink-400">{progressPct}%</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 mb-2">
          <button
            onClick={() => setSelectedDate((d) => addDays(d, -1))}
            aria-label="Önceki gün"
            className="w-9 h-9 rounded-full bg-cream-50 border border-ink-100/40 flex items-center justify-center active:scale-90 transition-transform shrink-0"
          >
            <Icon name="ChevronRight" className="w-4 h-4 text-ink-400 rotate-180" />
          </button>

          <div className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar">
            {weekDays.map((d) => {
              const active = isSameDay(toDateString(d), selectedDate)
              const today = isToday(toDateString(d))
              const count = kayitlar.filter((k) => isSameDay(k.tarih, d) && k.durum === 'bekliyor').length
              return (
                <button
                  key={toDateString(d)}
                  onClick={() => setSelectedDate(d)}
                  className={`flex flex-col items-center gap-0.5 py-2 px-2.5 rounded-2xl transition-all active:scale-95 min-w-[52px]
                    ${active ? 'bg-coral-500 text-white shadow-soft' : 'bg-cream-50 text-ink-400 border border-ink-100/40'}`}
                >
                  <span className={`text-[10px] font-medium uppercase ${active ? 'text-cream-100' : 'text-ink-300'}`}>
                    {d.toLocaleDateString('tr-TR', { weekday: 'short' })}
                  </span>
                  <span className={`text-lg font-bold font-display ${today && !active ? 'text-coral-500' : ''}`}>{d.getDate()}</span>
                  {count > 0 && <span className={`text-[10px] ${active ? 'text-cream-100' : 'text-coral-400'}`}>{count}</span>}
                </button>
              )
            })}
          </div>

          <button
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            aria-label="Sonraki gün"
            className="w-9 h-9 rounded-full bg-cream-50 border border-ink-100/40 flex items-center justify-center active:scale-90 transition-transform shrink-0"
          >
            <Icon name="ChevronRight" className="w-4 h-4 text-ink-400" />
          </button>
        </div>

        {!isTodayView && (
          <button
            onClick={() => setSelectedDate(new Date())}
            className="text-sm text-coral-600 font-medium flex items-center gap-1 active:scale-95 transition-transform"
          >
            <Icon name="Calendar" className="w-4 h-4" />
            Bugüne dön
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-24">
        {loading ? (
          <div className="space-y-3 mt-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card p-4">
                <div className="flex gap-3">
                  <div className="skeleton w-12 h-6 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-3/4 rounded-lg" />
                    <div className="skeleton h-3 w-1/3 rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : allDayRecords.length === 0 ? (
          <EmptyDay date={selectedDate} isPastView={isPastView} onAddClick={onAddClick} />
        ) : (
          <div className="space-y-6 mt-2">
            {scheduled.length > 0 && (
              <Section title="Saatli planlar" icon="Clock" count={scheduled.length}>
                <div className="relative space-y-2">
                  <div className="absolute left-[52px] top-2 bottom-2 w-px bg-ink-100" />
                  {scheduled.map((kayit) => (
                    <TimelineItem
                      key={kayit.id}
                      kayit={kayit}
                      onClick={() => onRecordClick(kayit)}
                      onToggle={() => onToggleStatus(kayit.id)}
                      onReschedule={(d) => handleReschedule(kayit.id, d)}
                      rescheduling={rescheduling === kayit.id}
                    />
                  ))}
                </div>
              </Section>
            )}

            {unscheduled.length > 0 && (
              <Section title="Saat belirtilmemiş" icon="ListChecks" count={unscheduled.length}>
                <div className="space-y-2">
                  {unscheduled.map((kayit) => (
                    <UnscheduledItem
                      key={kayit.id}
                      kayit={kayit}
                      onClick={() => onRecordClick(kayit)}
                      onToggle={() => onToggleStatus(kayit.id)}
                      onReschedule={(d) => handleReschedule(kayit.id, d)}
                      rescheduling={rescheduling === kayit.id}
                    />
                  ))}
                </div>
              </Section>
            )}

            {doneSorted.length > 0 && (
              <Section title="Halledilenler" icon="CheckCheck" count={doneSorted.length} muted>
                <div className="space-y-2">
                  {doneSorted.map((kayit) => (
                    <DoneItem key={kayit.id} kayit={kayit} onClick={() => onRecordClick(kayit)} onToggle={() => onToggleStatus(kayit.id)} />
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, icon, count, children, muted }: { title: string; icon: IconName; count: number; children: React.ReactNode; muted?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 px-1">
        <Icon name={icon} className={`w-4 h-4 ${muted ? 'text-teal-500' : 'text-coral-500'}`} />
        <h2 className={`text-sm font-semibold ${muted ? 'text-teal-600' : 'text-ink-500'}`}>{title}</h2>
        <span className="text-xs text-ink-300">{count}</span>
      </div>
      {children}
    </div>
  )
}

function RescheduleBar({ onReschedule, busy }: { onReschedule: (d: Date) => void; busy: boolean }) {
  const tomorrow = addDays(new Date(), 1)
  const weekend = addDays(new Date(), 3)
  const nextWeek = addDays(new Date(), 7)
  return (
    <div className="flex gap-1.5 mt-2 animate-fade-in">
      <button onClick={() => onReschedule(tomorrow)} disabled={busy} className="chip bg-cream-50 text-ink-500 border border-ink-100/40 active:scale-95 disabled:opacity-50">
        <Icon name="Calendar" className="w-3.5 h-3.5" />
        Yarın
      </button>
      <button onClick={() => onReschedule(weekend)} disabled={busy} className="chip bg-cream-50 text-ink-500 border border-ink-100/40 active:scale-95 disabled:opacity-50">
        <Icon name="Calendar" className="w-3.5 h-3.5" />
        3 gün sonra
      </button>
      <button onClick={() => onReschedule(nextWeek)} disabled={busy} className="chip bg-cream-50 text-ink-500 border border-ink-100/40 active:scale-95 disabled:opacity-50">
        <Icon name="Calendar" className="w-3.5 h-3.5" />
        Haftaya
      </button>
    </div>
  )
}

function TimelineItem({ kayit, onClick, onToggle, onReschedule, rescheduling }: { kayit: Kayit; onClick: () => void; onToggle: () => void; onReschedule: (d: Date) => void; rescheduling: boolean }) {
  const colors = CATEGORY_COLORS[kayit.kategori ?? 'not']
  const timeLabel = formatTime(kayit.saat)
  const durLabel = formatDuration(kayit.sure)
  const [showReschedule, setShowReschedule] = useState(false)
  const baslik = goruntulemeBasligi(kayit)

  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center w-[52px] shrink-0 pt-1">
        <span className="text-sm font-bold text-ink-600 font-display">{timeLabel}</span>
        {durLabel && <span className="text-[10px] text-ink-300 mt-0.5">{durLabel}</span>}
      </div>
      <div className="relative">
        <div className={`w-3 h-3 rounded-full ${kayit.oncelik === 'yuksek' ? 'bg-rose-400' : kayit.oncelik === 'orta' ? 'bg-amber-400' : 'bg-ink-200'} ring-4 ring-cream-100 mt-2`} />
      </div>
      <div className="flex-1 min-w-0">
        <div {...tiklanabilir(onClick)} className="card p-3.5 w-full text-left cursor-pointer active:scale-[0.98] transition-transform">
          <div className="flex items-start gap-2">
            <button onClick={(e) => { e.stopPropagation(); onToggle() }} aria-label="Yapıldı olarak işaretle" className="shrink-0 mt-0.5 transition-transform active:scale-90 text-ink-200">
              <Icon name="Circle" className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`chip ${colors.bg} ${colors.text} text-xs py-1`}>
                  <Icon name={CATEGORY_ICON_NAME[kayit.kategori ?? 'not']} className="w-3 h-3" />
                  {kayit.kategori ? CATEGORY_LABELS[kayit.kategori] : 'Sınıflandırılmamış'}
                </span>
                {kayit.oncelik === 'yuksek' && (
                  <span className="flex items-center gap-1 text-xs text-rose-500 font-medium">
                    <Icon name="Flame" className="w-3 h-3" />
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-ink-700 text-sm leading-snug">{baslik}</h3>
              {kayit.konum && (
                <span className="flex items-center gap-1 text-xs text-teal-600 mt-1">
                  <Icon name="MapPin" className="w-3 h-3" />
                  {kayit.konum}
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={() => setShowReschedule(!showReschedule)} className="mt-1 text-xs text-ink-300 font-medium flex items-center gap-1 active:scale-95 transition-transform">
          <Icon name="Calendar" className="w-3.5 h-3.5" />
          {showReschedule ? 'Vazgeç' : 'Ertele'}
        </button>
        {showReschedule && <RescheduleBar onReschedule={onReschedule} busy={rescheduling} />}
      </div>
    </div>
  )
}

function UnscheduledItem({ kayit, onClick, onToggle, onReschedule, rescheduling }: { kayit: Kayit; onClick: () => void; onToggle: () => void; onReschedule: (d: Date) => void; rescheduling: boolean }) {
  const colors = CATEGORY_COLORS[kayit.kategori ?? 'not']
  const [showReschedule, setShowReschedule] = useState(false)
  const baslik = goruntulemeBasligi(kayit)

  return (
    <div>
      <div {...tiklanabilir(onClick)} className="card p-3.5 w-full text-left cursor-pointer active:scale-[0.98] transition-transform">
        <div className="flex items-start gap-2">
          <button onClick={(e) => { e.stopPropagation(); onToggle() }} aria-label="Yapıldı olarak işaretle" className="shrink-0 mt-0.5 transition-transform active:scale-90 text-ink-200">
            <Icon name="Circle" className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`chip ${colors.bg} ${colors.text} text-xs py-1`}>
                <Icon name={CATEGORY_ICON_NAME[kayit.kategori ?? 'not']} className="w-3 h-3" />
                {kayit.kategori ? CATEGORY_LABELS[kayit.kategori] : 'Sınıflandırılmamış'}
              </span>
            </div>
            <h3 className="font-semibold text-ink-700 text-sm leading-snug">{baslik}</h3>
            {kayit.konum && (
              <span className="flex items-center gap-1 text-xs text-teal-600 mt-1">
                <Icon name="MapPin" className="w-3 h-3" />
                {kayit.konum}
              </span>
            )}
          </div>
        </div>
      </div>
      <button onClick={() => setShowReschedule(!showReschedule)} className="mt-1 ml-12 text-xs text-ink-300 font-medium flex items-center gap-1 active:scale-95 transition-transform">
        <Icon name="Calendar" className="w-3.5 h-3.5" />
        {showReschedule ? 'Vazgeç' : 'Ertele'}
      </button>
      {showReschedule && <RescheduleBar onReschedule={onReschedule} busy={rescheduling} />}
    </div>
  )
}

function DoneItem({ kayit, onClick, onToggle }: { kayit: Kayit; onClick: () => void; onToggle: () => void }) {
  const colors = CATEGORY_COLORS[kayit.kategori ?? 'not']
  const timeLabel = formatTime(kayit.saat)
  const baslik = goruntulemeBasligi(kayit)

  return (
    <div {...tiklanabilir(onClick)} className="card p-3 w-full text-left cursor-pointer active:scale-[0.98] transition-transform opacity-60">
      <div className="flex items-center gap-2">
        <button onClick={(e) => { e.stopPropagation(); onToggle() }} aria-label="Bekliyor olarak işaretle" className="shrink-0 transition-transform active:scale-90 text-teal-500">
          <Icon name="CheckCircle2" className="w-5 h-5" />
        </button>
        <span className={`chip ${colors.bg} ${colors.text} text-xs py-0.5`}>
          <Icon name={CATEGORY_ICON_NAME[kayit.kategori ?? 'not']} className="w-3 h-3" />
        </span>
        {timeLabel && <span className="text-xs text-ink-300">{timeLabel}</span>}
        <span className="text-sm text-ink-500 truncate flex-1 line-through">{baslik}</span>
      </div>
    </div>
  )
}

function EmptyDay({ date, isPastView, onAddClick }: { date: Date; isPastView: boolean; onAddClick: () => void }) {
  const label = isToday(toDateString(date)) ? 'Bugün' : isTomorrow(toDateString(date)) ? 'Yarın' : formatDate(toDateString(date))

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-fade-in">
      <div className="w-20 h-20 rounded-full bg-coral-100 flex items-center justify-center mb-5">
        <Icon name={isPastView ? 'CheckCheck' : 'CalendarDays'} className="w-10 h-10 text-coral-500" />
      </div>
      <p className="font-display text-lg font-bold text-ink-600 mb-2">{isPastView ? `${label} için plan yok` : `${label} boş`}</p>
      <p className="text-sm text-ink-400 mb-6 max-w-xs">
        {isPastView
          ? 'Bu gün için kayıt yok. Geçmiş planlarına bakıyorsun.'
          : 'Bu güne bir plan ekle — tek başına ya da arkadaşlarınla.'}
      </p>
      {!isPastView && (
        <button onClick={onAddClick} className="btn-primary flex items-center gap-2">
          <Icon name="Plus" className="w-5 h-5" />
          Plan ekle
        </button>
      )}
    </div>
  )
}
