import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { BosDurum } from '../ui/BosDurum'
import { SimgeButonu } from '../ui/SimgeButonu'
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

  const ozet = [
    pending.length > 0 ? `${pending.length} plan` : allDayRecords.length > 0 ? 'Hepsi tamam' : 'Plan yok',
    done.length > 0 && pending.length > 0 ? `${done.length} yapıldı` : '',
    totalDuration > 0 ? formatDuration(totalDuration) : '',
    highPriority > 0 ? `${highPriority} öncelikli` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 lg:px-0 pb-2">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h2 key={dayLabel} className="text-title text-ink-800 truncate first-letter:uppercase animate-slide-up">{dayLabel}</h2>
            <p className="text-caption font-normal text-ink-400 mt-0.5">{ozet}</p>
          </div>
          <SimgeButonu
            ikon="CalendarRange"
            etiket={gorunum === 'ay' ? 'Haftaya dön' : 'Ayı göster'}
            secili={gorunum === 'ay'}
            onClick={gorunumDegistir}
          />
        </div>

        {gorunum === 'hafta' && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedDate((d) => addDays(d, -1))}
              aria-label="Önceki gün"
              className="w-8 h-10 rounded-lg flex items-center justify-center text-ink-400 hover:bg-ink-50 active:bg-ink-100 shrink-0"
            >
              <Icon name="ChevronLeft" className="w-5 h-5" />
            </button>

            <div className="flex-1 grid grid-cols-7 gap-1">
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
                    className={`flex flex-col items-center py-2 rounded-2xl basinca transition-all duration-300 ${
                      active
                        ? 'bg-bolum text-white shadow-glow scale-105'
                        : today
                          ? 'bg-white shadow-soft ring-2 ring-brand-300'
                          : 'bg-white/70 hover:bg-white hover:shadow-soft'
                    }`}
                  >
                    <span className={`text-[11px] font-medium leading-4 ${active ? 'text-white/80' : 'text-ink-400'}`}>
                      {d.toLocaleDateString('tr-TR', { weekday: 'short' }).replace('.', '')}
                    </span>
                    <span
                      className={`text-headline tabular-nums leading-6 ${
                        active ? 'text-white' : today ? 'text-bolum-koyu' : 'text-ink-800'
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`w-1.5 h-1.5 rounded-full mt-0.5 ${count > 0 ? (active ? 'bg-white' : 'bg-bolum') : 'bg-transparent'}`}
                    />
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setSelectedDate((d) => addDays(d, 1))}
              aria-label="Sonraki gün"
              className="w-8 h-10 rounded-lg flex items-center justify-center text-ink-400 hover:bg-ink-50 active:bg-ink-100 shrink-0"
            >
              <Icon name="ChevronRight" className="w-5 h-5" />
            </button>
          </div>
        )}

        {(done.length > 0 || !isTodayView || pending.length > 1) && (
          <div className="flex items-center gap-4 mt-3 min-h-[1.5rem]">
            {done.length > 0 && (
              <div className="flex items-center gap-2 flex-1 min-w-0" aria-label={`${done.length} / ${allDayRecords.length} tamamlandı`}>
                <div className="flex-1 max-w-[8rem] h-2 rounded-full bg-ink-100 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-500 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="text-caption font-normal text-ink-400 tabular-nums">
                  {done.length}/{allDayRecords.length}
                </span>
              </div>
            )}
            <div className="flex items-center gap-4 ml-auto">
              {!isTodayView && (
                <button onClick={() => setSelectedDate(new Date())} className="chip bg-bolum-soluk text-bolum-koyu font-semibold">
                  Bugüne dön
                </button>
              )}
              {pending.length > 1 && (
                <button
                  onClick={() => setGunuErtele(!gunuErtele)}
                  aria-expanded={gunuErtele}
                  className="text-callout text-ink-500 hover:text-ink-700"
                >
                  {gunuErtele ? 'Vazgeç' : isPastView ? 'Hepsini taşı' : 'Günü ertele'}
                </button>
              )}
            </div>
          </div>
        )}

        {gunuErtele && (
          <div className="mt-2 card p-3 animate-pop-in">
            <p className="text-caption font-normal text-ink-400 mb-2">Bu günün {pending.length} bekleyen planı nereye taşınsın?</p>
            <ErtelemeSecici tarih={seciliTarih} onSec={(hedef) => void gunuTasi(hedef)} mesgul={islem.mesgul} etiket="Bu günün planları" />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 lg:px-0 pb-24">
        {gorunum === 'ay' && (
          <AyTakvimi kayitlar={kayitlar} secili={seciliTarih} bugun={bugun} onSec={(t) => setSelectedDate(parseLocalDate(t))} />
        )}
        {!loading && kacanlar.length > 0 && (
          <div className="mt-2 mb-5">
            <KacanlarKarti kayitlar={kacanlar} onRecordClick={onRecordClick} onUygula={(k, i) => void islem.uygula(k, i)} mesgul={islem.mesgul} />
          </div>
        )}
        {loading ? (
          <div className="mt-2 card divide-y divide-ink-100">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-3 px-4 py-3.5">
                <div className="skeleton w-10 h-4 rounded-md" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-3/4 rounded-md" />
                  <div className="skeleton h-3 w-1/3 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : allDayRecords.length === 0 ? (
          <EmptyDay date={selectedDate} isPastView={isPastView} onAddClick={onAddClick} />
        ) : (
          <div className="space-y-5 mt-2">
            {scheduled.length > 0 && (
              <Section title={scheduled.some((k) => k.tumGun) ? 'Saatli ve tüm gün' : 'Saatli'} count={scheduled.length}>
                {scheduled.map((kayit) => (
                  <PlanSatiri
                    key={kayit.id}
                    kayit={kayit}
                    saatli
                    onClick={() => onRecordClick(kayit)}
                    onToggle={() => onToggleStatus(kayit.id)}
                    onReschedule={(tarih) => void islem.uygula([kayit], { tur: 'tasi', tarih })}
                    rescheduling={islem.mesgul}
                  />
                ))}
              </Section>
            )}

            {unscheduled.length > 0 && (
              <Section title="Saat belirlenmedi" count={unscheduled.length}>
                {unscheduled.map((kayit) => (
                  <PlanSatiri
                    key={kayit.id}
                    kayit={kayit}
                    onClick={() => onRecordClick(kayit)}
                    onToggle={() => onToggleStatus(kayit.id)}
                    onReschedule={(tarih) => void islem.uygula([kayit], { tur: 'tasi', tarih })}
                    rescheduling={islem.mesgul}
                  />
                ))}
              </Section>
            )}

            {doneSorted.length > 0 && (
              <Section title="Yapıldı" count={doneSorted.length}>
                {doneSorted.map((kayit) => (
                  <DoneItem key={kayit.id} kayit={kayit} onClick={() => onRecordClick(kayit)} onToggle={() => onToggleStatus(kayit.id)} />
                ))}
              </Section>
            )}
          </div>
        )}
      </div>

      <GeriAlCubugu sonIslem={islem.sonIslem} onGeriAl={() => void islem.geriAl()} onKapat={islem.kapat} />
    </div>
  )
}

// A titled group of plan cards that arrive one after another.
function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-label text-ink-600 px-1 mb-2.5">
        {title}
        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-bolum-soluk text-bolum-koyu text-[11px] font-bold flex items-center justify-center tabular-nums">
          {count}
        </span>
      </h3>
      <div className="space-y-2.5 kademeli">{children}</div>
    </section>
  )
}

// One plan on the day: time, title, place and category on the left; done
// and postpone on the right. Postponing opens a picker under the row.
function PlanSatiri({
  kayit,
  saatli,
  onClick,
  onToggle,
  onReschedule,
  rescheduling,
}: {
  kayit: Kayit
  saatli?: boolean
  onClick: () => void
  onToggle: () => void
  onReschedule: (tarih: string) => void
  rescheduling: boolean
}) {
  const colors = CATEGORY_COLORS[kayit.kategori ?? 'not']
  const timeLabel = formatPlanTime(kayit.saat, kayit.tumGun)
  const durLabel = formatDuration(kayit.sure)
  const [showReschedule, setShowReschedule] = useState(false)
  const baslik = goruntulemeBasligi(kayit)
  const kategori = kayit.kategori ? CATEGORY_LABELS[kayit.kategori] : 'Sınıflandırılmamış'

  return (
    <div className="card overflow-hidden transition-shadow duration-300 hover:shadow-float">
      <div className="flex items-start gap-3 px-3.5 py-3">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${colors.bg} ${colors.text}`}>
          <Icon name={CATEGORY_ICON_NAME[kayit.kategori ?? 'not']} className="w-5 h-5" />
        </div>
        <div {...tiklanabilir(onClick)} className="flex-1 min-w-0 cursor-pointer">
          <p className="text-body font-medium text-ink-800 leading-snug">
            {kayit.emoji && <span aria-hidden="true">{kayit.emoji} </span>}
            {baslik}
          </p>
          <p className="flex items-center gap-1.5 text-caption font-normal text-ink-400 mt-1 min-w-0">
            {saatli && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                  kayit.tumGun ? 'bg-bolum-soluk text-bolum-koyu' : 'bg-bolum text-white'
                }`}
              >
                {timeLabel}
                {durLabel && <span className="font-medium opacity-80"> · {durLabel}</span>}
              </span>
            )}
            <span className="truncate">
              {kategori}
              {kayit.konum ? ` · ${kayit.konum}` : ''}
            </span>
            {kayit.oncelik === 'yuksek' && <Icon name="Flame" className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-label="Öncelikli" />}
          </p>
          <div className="mt-1.5 empty:hidden">
            <PlanRozetleri kayit={kayit} yakinsaSayim={saatli} />
          </div>
        </div>
        <div className="flex items-center gap-0.5 -mr-2 shrink-0">
          {kayit.tarih && (
            <button
              onClick={() => setShowReschedule(!showReschedule)}
              aria-label={showReschedule ? 'Ertelemekten vazgeç' : 'Ertele'}
              aria-expanded={showReschedule}
              title="Ertele"
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                showReschedule ? 'bg-bolum-soluk text-bolum-koyu' : 'text-ink-300 hover:text-ink-500 hover:bg-ink-50'
              }`}
            >
              <Icon name="CalendarClock" className="w-[18px] h-[18px]" />
            </button>
          )}
          <button
            onClick={onToggle}
            aria-label="Yapıldı olarak işaretle"
            className="w-9 h-9 rounded-full flex items-center justify-center text-ink-300 basinca hover:text-teal-600 hover:bg-teal-50"
          >
            <Icon name="Circle" className="w-[22px] h-[22px]" />
          </button>
        </div>
      </div>
      {showReschedule && kayit.tarih && (
        <div className="px-4 pb-3 animate-slide-down">
          <ErtelemeSecici tarih={kayit.tarih} onSec={onReschedule} mesgul={rescheduling} etiket={baslik} />
        </div>
      )}
    </div>
  )
}

function DoneItem({ kayit, onClick, onToggle }: { kayit: Kayit; onClick: () => void; onToggle: () => void }) {
  const timeLabel = formatPlanTime(kayit.saat, kayit.tumGun)
  const baslik = goruntulemeBasligi(kayit)

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/60">
      <div {...tiklanabilir(onClick)} className="flex-1 min-w-0 flex items-center gap-3 cursor-pointer">
        {timeLabel && <span className="w-12 shrink-0 text-caption font-normal text-ink-400 tabular-nums">{timeLabel}</span>}
        <span className="text-callout font-normal text-ink-400 truncate line-through">{baslik}</span>
      </div>
      <button
        onClick={onToggle}
        aria-label="Bekliyor olarak işaretle"
        className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center text-teal-500 hover:bg-teal-50 shrink-0 basinca"
      >
        <Icon name="CheckCircle2" className="w-[22px] h-[22px] animate-pop-in" />
      </button>
    </div>
  )
}

function EmptyDay({ date, isPastView, onAddClick }: { date: Date; isPastView: boolean; onAddClick: () => void }) {
  const label = isToday(toDateString(date)) ? 'Bugün' : isTomorrow(toDateString(date)) ? 'Yarın' : formatDate(toDateString(date))

  return (
    <BosDurum
      ikon={isPastView ? 'CheckCheck' : 'CalendarDays'}
      baslik={isPastView ? `${label} için plan yok` : `${label} boş`}
      aciklama={isPastView ? 'Bu güne ait kayıt yok.' : 'Tek başına ya da arkadaşlarınla bir plan ekle.'}
      eylem={isPastView ? undefined : { etiket: 'Plan ekle', ikon: 'Plus', onClick: onAddClick }}
    />
  )
}
