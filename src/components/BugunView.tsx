import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { type Kayit, goruntulemeBasligi } from '../db'
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
  formatPlanTime,
  formatDuration,
  isPast,
  formatDate,
  parseLocalDate,
} from '../lib/format'
import { useBugun } from '../hooks/useBugun'
import { tiklanabilir } from '../lib/a11y'
import { useGeriAdimi } from '../lib/geriTusu'
import { gunFarki, gunOzetleri, kacanPlanlar } from '../lib/takvimIzgarasi'
import { useTopluIslem } from '../lib/topluIslem'
import { PlanRozetleri } from './PlanRozetleri'
import { AyTakvimi } from './AyTakvimi'
import { ErtelemeSecici, GeriAlCubugu, KacanlarKarti } from './TakvimIslemleri'

// The week strip or the month grid; the choice stays on the device.
type TakvimGorunumu = 'hafta' | 'ay'
const GORUNUM_ANAHTARI = 'cepdost_takvim_gorunumu'

function gorunumOku(): TakvimGorunumu {
  try {
    return localStorage.getItem(GORUNUM_ANAHTARI) === 'ay' ? 'ay' : 'hafta'
  } catch {
    return 'hafta'
  }
}

function gorunumYaz(gorunum: TakvimGorunumu) {
  try {
    localStorage.setItem(GORUNUM_ANAHTARI, gorunum)
  } catch {
    // Private mode: the choice lasts until the app closes.
  }
}

interface BugunViewProps {
  kayitlar: Kayit[]
  loading: boolean
  onAddClick: () => void
  onRecordClick: (kayit: Kayit) => void
  onToggleStatus: (id: string) => void
}

export function BugunView({ kayitlar, loading, onAddClick, onRecordClick, onToggleStatus }: BugunViewProps) {
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [gorunum, setGorunum] = useState<TakvimGorunumu>(gorunumOku)
  const [gunuErtele, setGunuErtele] = useState(false)
  const bugun = useBugun()
  const islem = useTopluIslem()
  const seciliTarih = toDateString(selectedDate)

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

  // All-day plans head the timeline; plans with no time go under it.
  const scheduled = useMemo(() => sortByTime(pending.filter((k) => k.saat || k.tumGun)), [pending])
  const unscheduled = useMemo(() => sortByPriority(pending.filter((k) => !k.saat && !k.tumGun)), [pending])
  const doneSorted = useMemo(() => sortByTime(done), [done])

  const isTodayView = isToday(seciliTarih)
  const isTomorrowView = isTomorrow(seciliTarih)
  const isPastView = isPast(seciliTarih)

  // Missed plans wait on today's page until they're moved or done.
  const kacanlar = useMemo(() => (isTodayView ? kacanPlanlar(kayitlar, bugun) : []), [kayitlar, bugun, isTodayView])
  const ozetler = useMemo(() => gunOzetleri(kayitlar), [kayitlar])

  // Moving a whole day closes with the day it was opened for.
  useEffect(() => setGunuErtele(false), [seciliTarih])
  useGeriAdimi(() => setGunuErtele(false), gunuErtele)

  const dayLabel = useMemo(() => {
    if (isTodayView) return 'Bugün'
    if (isTomorrowView) return 'Yarın'
    return selectedDate.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
  }, [selectedDate, isTodayView, isTomorrowView])

  // Yesterday to five days ahead; a day outside that (picked with the
  // arrows or in the month view) gets a week around it instead.
  const weekDays = useMemo(() => {
    const fark = gunFarki(bugun, seciliTarih)
    const ilk = fark >= -1 && fark <= 5 ? addDays(parseLocalDate(bugun), -1) : addDays(parseLocalDate(seciliTarih), -3)
    return Array.from({ length: 7 }, (_, i) => addDays(ilk, i))
  }, [bugun, seciliTarih])

  const totalDuration = pending.reduce((sum, k) => sum + (k.sure ?? 0), 0)
  const highPriority = pending.filter((k) => k.oncelik === 'yuksek').length
  const progressPct = allDayRecords.length > 0 ? Math.round((done.length / allDayRecords.length) * 100) : 0

  function gorunumDegistir() {
    const yeni = gorunum === 'ay' ? 'hafta' : 'ay'
    setGorunum(yeni)
    gorunumYaz(yeni)
  }

  async function gunuTasi(hedef: string) {
    setGunuErtele(false)
    await islem.uygula(pending, { tur: 'tasi', tarih: hedef })
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
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={gorunumDegistir}
              aria-label="Ay görünümü"
              aria-pressed={gorunum === 'ay'}
              title={gorunum === 'ay' ? 'Haftaya dön' : 'Ayı göster'}
              className={`w-11 h-11 rounded-full flex items-center justify-center active:opacity-80 transition-all border ${
                gorunum === 'ay' ? 'bg-orchid-100 border-orchid-200 text-orchid-600' : 'bg-mist-50 border-ink-100 text-ink-400'
              }`}
            >
              <Icon name="CalendarRange" className="w-5 h-5" />
            </button>
            <button
              onClick={onAddClick}
              aria-label="Yeni kayıt ekle"
              className="w-11 h-11 rounded-full bg-orchid-600 text-white flex items-center justify-center shadow-soft active:opacity-80 transition-transform"
            >
              <Icon name="Plus" className="w-5 h-5" />
            </button>
          </div>
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

        {gorunum === 'hafta' && (
        <div className="flex items-center gap-1 mb-2">
          <button
            onClick={() => setSelectedDate((d) => addDays(d, -1))}
            aria-label="Önceki gün"
            className="w-9 h-9 rounded-full bg-mist-50 border border-ink-100 flex items-center justify-center active:opacity-80 transition-transform shrink-0"
          >
            <Icon name="ChevronRight" className="w-4 h-4 text-ink-400 rotate-180" />
          </button>

          <div className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar">
            {weekDays.map((d) => {
              const active = isSameDay(toDateString(d), selectedDate)
              const today = isToday(toDateString(d))
              const count = ozetler.get(toDateString(d))?.bekleyen.length ?? 0
              return (
                <button
                  key={toDateString(d)}
                  onClick={() => setSelectedDate(d)}
                  aria-label={`${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}${count > 0 ? `, ${count} plan` : ''}`}
                  aria-pressed={active}
                  aria-current={today ? 'date' : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2 px-2.5 rounded-2xl transition-all active:opacity-80 min-w-[52px]
                    ${active ? 'bg-orchid-600 text-white shadow-soft' : 'bg-mist-50 text-ink-400 border border-ink-100'}`}
                >
                  <span className={`text-[10px] font-medium uppercase ${active ? 'text-mist-100' : 'text-ink-400'}`}>
                    {d.toLocaleDateString('tr-TR', { weekday: 'short' })}
                  </span>
                  <span className={`text-lg font-bold font-display ${today && !active ? 'text-orchid-500' : ''}`}>{d.getDate()}</span>
                  {count > 0 && <span className={`text-[10px] ${active ? 'text-mist-100' : 'text-orchid-400'}`}>{count}</span>}
                </button>
              )
            })}
          </div>

          <button
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            aria-label="Sonraki gün"
            className="w-9 h-9 rounded-full bg-mist-50 border border-ink-100 flex items-center justify-center active:opacity-80 transition-transform shrink-0"
          >
            <Icon name="ChevronRight" className="w-4 h-4 text-ink-400" />
          </button>
        </div>
        )}

        {(!isTodayView || pending.length > 1) && (
          <div className="flex items-center gap-3 min-h-[1.75rem]">
            {!isTodayView && (
              <button
                onClick={() => setSelectedDate(new Date())}
                className="text-sm text-orchid-600 font-medium flex items-center gap-1 active:opacity-80 transition-transform"
              >
                <Icon name="Calendar" className="w-4 h-4" />
                Bugüne dön
              </button>
            )}
            {pending.length > 1 && (
              <button
                onClick={() => setGunuErtele(!gunuErtele)}
                aria-expanded={gunuErtele}
                className="ml-auto text-sm text-ink-400 font-medium flex items-center gap-1 active:opacity-80 transition-transform"
              >
                <Icon name="CalendarClock" className="w-4 h-4" />
                {gunuErtele ? 'Vazgeç' : isPastView ? 'Hepsini taşı' : 'Günü ertele'}
              </button>
            )}
          </div>
        )}

        {gunuErtele && (
          <div className="mt-2 rounded-2xl bg-mist-50 border border-ink-100 p-3">
            <p className="text-xs text-ink-400 mb-2">Bu günün {pending.length} bekleyen planı nereye taşınsın?</p>
            <ErtelemeSecici tarih={seciliTarih} onSec={(hedef) => void gunuTasi(hedef)} mesgul={islem.mesgul} etiket="Bu günün planları" />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-24">
        {gorunum === 'ay' && (
          <AyTakvimi kayitlar={kayitlar} secili={seciliTarih} bugun={bugun} onSec={(t) => setSelectedDate(parseLocalDate(t))} />
        )}
        {!loading && kacanlar.length > 0 && (
          <div className="mt-2 mb-6">
            <KacanlarKarti kayitlar={kacanlar} onRecordClick={onRecordClick} onUygula={(k, i) => void islem.uygula(k, i)} mesgul={islem.mesgul} />
          </div>
        )}
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
              <Section
                title={scheduled.some((k) => k.tumGun) ? 'Saatli ve tüm gün' : 'Saatli planlar'}
                icon="Clock"
                count={scheduled.length}
              >
                <div className="relative space-y-2">
                  <div className="absolute left-[52px] top-2 bottom-2 w-px bg-ink-100" />
                  {scheduled.map((kayit) => (
                    <TimelineItem
                      key={kayit.id}
                      kayit={kayit}
                      onClick={() => onRecordClick(kayit)}
                      onToggle={() => onToggleStatus(kayit.id)}
                      onReschedule={(tarih) => void islem.uygula([kayit], { tur: 'tasi', tarih })}
                      rescheduling={islem.mesgul}
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
                      onReschedule={(tarih) => void islem.uygula([kayit], { tur: 'tasi', tarih })}
                      rescheduling={islem.mesgul}
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

      <GeriAlCubugu sonIslem={islem.sonIslem} onGeriAl={() => void islem.geriAl()} onKapat={islem.kapat} />
    </div>
  )
}

function Section({ title, icon, count, children, muted }: { title: string; icon: IconName; count: number; children: React.ReactNode; muted?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 px-1">
        <Icon name={icon} className={`w-4 h-4 ${muted ? 'text-teal-500' : 'text-orchid-500'}`} />
        <h2 className={`text-sm font-semibold ${muted ? 'text-teal-600' : 'text-ink-500'}`}>{title}</h2>
        <span className="text-xs text-ink-400">{count}</span>
      </div>
      {children}
    </div>
  )
}

function TimelineItem({ kayit, onClick, onToggle, onReschedule, rescheduling }: { kayit: Kayit; onClick: () => void; onToggle: () => void; onReschedule: (tarih: string) => void; rescheduling: boolean }) {
  const colors = CATEGORY_COLORS[kayit.kategori ?? 'not']
  const timeLabel = formatPlanTime(kayit.saat, kayit.tumGun)
  const durLabel = formatDuration(kayit.sure)
  const [showReschedule, setShowReschedule] = useState(false)
  const baslik = goruntulemeBasligi(kayit)

  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center w-[52px] shrink-0 pt-1">
        <span className={`font-bold font-display text-center ${kayit.tumGun ? 'text-xs text-orchid-600 leading-tight' : 'text-sm text-ink-600'}`}>
          {timeLabel}
        </span>
        {durLabel && <span className="text-[10px] text-ink-400 mt-0.5">{durLabel}</span>}
      </div>
      <div className="relative">
        <div className={`w-3 h-3 rounded-full ${kayit.oncelik === 'yuksek' ? 'bg-rose-400' : kayit.oncelik === 'orta' ? 'bg-amber-400' : 'bg-ink-200'} ring-4 ring-mist-100 mt-2`} />
      </div>
      <div className="flex-1 min-w-0">
        <div {...tiklanabilir(onClick)} className="card p-3.5 w-full text-left cursor-pointer active:opacity-80 transition-transform">
          <div className="flex items-start gap-2">
            <button onClick={(e) => { e.stopPropagation(); onToggle() }} aria-label="Yapıldı olarak işaretle" className="shrink-0 mt-0.5 transition-transform active:opacity-80 text-ink-200">
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
              <h3 className="font-semibold text-ink-700 text-sm leading-snug">
                {kayit.emoji && <span aria-hidden="true">{kayit.emoji} </span>}
                {baslik}
              </h3>
              {kayit.konum && (
                <span className="flex items-center gap-1 text-xs text-teal-600 mt-1">
                  <Icon name="MapPin" className="w-3 h-3" />
                  {kayit.konum}
                </span>
              )}
              <div className="mt-1 empty:hidden">
                <PlanRozetleri kayit={kayit} yakinsaSayim />
              </div>
            </div>
          </div>
        </div>
        <button onClick={() => setShowReschedule(!showReschedule)} className="mt-1 text-xs text-ink-400 font-medium flex items-center gap-1 active:opacity-80 transition-transform">
          <Icon name="Calendar" className="w-3.5 h-3.5" />
          {showReschedule ? 'Vazgeç' : 'Ertele'}
        </button>
        {showReschedule && kayit.tarih && (
          <div className="mt-2">
            <ErtelemeSecici tarih={kayit.tarih} onSec={onReschedule} mesgul={rescheduling} etiket={baslik} />
          </div>
        )}
      </div>
    </div>
  )
}

function UnscheduledItem({ kayit, onClick, onToggle, onReschedule, rescheduling }: { kayit: Kayit; onClick: () => void; onToggle: () => void; onReschedule: (tarih: string) => void; rescheduling: boolean }) {
  const colors = CATEGORY_COLORS[kayit.kategori ?? 'not']
  const [showReschedule, setShowReschedule] = useState(false)
  const baslik = goruntulemeBasligi(kayit)

  return (
    <div>
      <div {...tiklanabilir(onClick)} className="card p-3.5 w-full text-left cursor-pointer active:opacity-80 transition-transform">
        <div className="flex items-start gap-2">
          <button onClick={(e) => { e.stopPropagation(); onToggle() }} aria-label="Yapıldı olarak işaretle" className="shrink-0 mt-0.5 transition-transform active:opacity-80 text-ink-200">
            <Icon name="Circle" className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`chip ${colors.bg} ${colors.text} text-xs py-1`}>
                <Icon name={CATEGORY_ICON_NAME[kayit.kategori ?? 'not']} className="w-3 h-3" />
                {kayit.kategori ? CATEGORY_LABELS[kayit.kategori] : 'Sınıflandırılmamış'}
              </span>
            </div>
            <h3 className="font-semibold text-ink-700 text-sm leading-snug">
              {kayit.emoji && <span aria-hidden="true">{kayit.emoji} </span>}
              {baslik}
            </h3>
            {kayit.konum && (
              <span className="flex items-center gap-1 text-xs text-teal-600 mt-1">
                <Icon name="MapPin" className="w-3 h-3" />
                {kayit.konum}
              </span>
            )}
            <div className="mt-1 empty:hidden">
              <PlanRozetleri kayit={kayit} />
            </div>
          </div>
        </div>
      </div>
      <button onClick={() => setShowReschedule(!showReschedule)} className="mt-1 ml-12 text-xs text-ink-400 font-medium flex items-center gap-1 active:opacity-80 transition-transform">
        <Icon name="Calendar" className="w-3.5 h-3.5" />
        {showReschedule ? 'Vazgeç' : 'Ertele'}
      </button>
      {showReschedule && kayit.tarih && (
        <div className="mt-2">
          <ErtelemeSecici tarih={kayit.tarih} onSec={onReschedule} mesgul={rescheduling} etiket={baslik} />
        </div>
      )}
    </div>
  )
}

function DoneItem({ kayit, onClick, onToggle }: { kayit: Kayit; onClick: () => void; onToggle: () => void }) {
  const colors = CATEGORY_COLORS[kayit.kategori ?? 'not']
  const timeLabel = formatPlanTime(kayit.saat, kayit.tumGun)
  const baslik = goruntulemeBasligi(kayit)

  return (
    <div {...tiklanabilir(onClick)} className="card p-3 w-full text-left cursor-pointer active:opacity-80 transition-transform opacity-60">
      <div className="flex items-center gap-2">
        <button onClick={(e) => { e.stopPropagation(); onToggle() }} aria-label="Bekliyor olarak işaretle" className="shrink-0 transition-transform active:opacity-80 text-teal-500">
          <Icon name="CheckCircle2" className="w-5 h-5" />
        </button>
        <span className={`chip ${colors.bg} ${colors.text} text-xs py-0.5`}>
          <Icon name={CATEGORY_ICON_NAME[kayit.kategori ?? 'not']} className="w-3 h-3" />
        </span>
        {timeLabel && <span className="text-xs text-ink-400">{timeLabel}</span>}
        <span className="text-sm text-ink-500 truncate flex-1 line-through">{baslik}</span>
      </div>
    </div>
  )
}

function EmptyDay({ date, isPastView, onAddClick }: { date: Date; isPastView: boolean; onAddClick: () => void }) {
  const label = isToday(toDateString(date)) ? 'Bugün' : isTomorrow(toDateString(date)) ? 'Yarın' : formatDate(toDateString(date))

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-fade-in">
      <div className="w-20 h-20 rounded-full bg-orchid-100 flex items-center justify-center mb-5">
        <Icon name={isPastView ? 'CheckCheck' : 'CalendarDays'} className="w-10 h-10 text-orchid-500" />
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
