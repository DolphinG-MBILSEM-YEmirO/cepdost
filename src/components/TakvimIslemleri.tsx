import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { type Kayit, goruntulemeBasligi } from '../db'
import { formatPlanTime } from '../lib/format'
import { ertelemeSecenekleri, goreceGun, gunEkle, gunFarki, gunSecenekleri } from '../lib/takvimIzgarasi'
import type { GeriAlinabilir, TopluIslem } from '../lib/topluIslem'
import { useBugun } from '../hooks/useBugun'
import { tiklanabilir } from '../lib/a11y'

// The calendar's actions on plans: moving them to another day (one or a
// whole day's worth), the missed plans card, and the "Geri al" bar that
// follows each of these.

const CHIP = 'chip bg-mist-50 text-ink-500 border border-ink-100 active:scale-95 disabled:opacity-50'

// Where a plan (or a day's plans) on `tarih` can go, plus any date. A plan
// with no day yet (`tarih` null) is offered its first one.
export function ErtelemeSecici({
  tarih,
  onSec,
  mesgul = false,
  etiket,
}: {
  tarih: string | null
  onSec: (hedef: string) => void
  mesgul?: boolean
  // Names what moves, for screen readers ("Spor", "Bu günün planları").
  etiket?: string
}) {
  const bugun = useBugun()
  const [tarihSec, setTarihSec] = useState(false)
  const girdi = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!tarihSec) return
    girdi.current?.focus()
    try {
      girdi.current?.showPicker?.()
    } catch {
      // Some browsers only open the picker on a direct tap; the field is there.
    }
  }, [tarihSec])

  return (
    <div className="flex flex-wrap gap-1.5 animate-fade-in" role="group" aria-label={`${etiket ? `${etiket}: ` : ''}${tarih ? 'taşı' : 'gün seç'}`}>
      {(tarih ? ertelemeSecenekleri(tarih, bugun) : gunSecenekleri(bugun)).map((s) => (
        <button key={s.tarih} onClick={() => onSec(s.tarih)} disabled={mesgul} className={CHIP}>
          <Icon name="Calendar" className="w-3.5 h-3.5" />
          {s.etiket}
        </button>
      ))}
      {tarihSec ? (
        <input
          ref={girdi}
          type="date"
          min={bugun}
          disabled={mesgul}
          aria-label="Tarih seç"
          onChange={(e) => e.target.value && e.target.value !== tarih && onSec(e.target.value)}
          className="input-field py-1.5 px-3 text-sm w-auto"
        />
      ) : (
        <button onClick={() => setTarihSec(true)} disabled={mesgul} className={CHIP}>
          <Icon name="CalendarDays" className="w-3.5 h-3.5" />
          Tarih seç
        </button>
      )}
    </div>
  )
}

// A few seconds to take back the last move.
export function GeriAlCubugu({ sonIslem, onGeriAl, onKapat }: { sonIslem: GeriAlinabilir | null; onGeriAl: () => void; onKapat: () => void }) {
  if (!sonIslem) return null
  return (
    <div
      role="status"
      className="fixed z-[45] inset-x-4 mx-auto max-w-sm bottom-[calc(10.5rem+var(--safe-bottom))] lg:bottom-6 animate-fade-in"
    >
      <div className="flex items-center gap-3 rounded-2xl bg-ink-800/95 text-white shadow-float pl-4 pr-2 py-2.5">
        <Icon name="CheckCircle2" className="w-4 h-4 text-teal-300 shrink-0" />
        <span className="flex-1 text-sm leading-snug">{sonIslem.mesaj}</span>
        <button onClick={onGeriAl} className="shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-orchid-200 hover:bg-white/10 active:scale-95">
          Geri al
        </button>
        <button onClick={onKapat} aria-label="Kapat" className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:bg-white/10">
          <Icon name="X" className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// How long ago a missed plan's day was, with its time.
function kacanZamani(kayit: Kayit, bugun: string): string {
  const fark = gunFarki(kayit.tarih ?? bugun, bugun)
  const gun = fark === 1 ? 'Dün' : fark < 7 ? `${fark} gün önce` : goreceGun(kayit.tarih ?? bugun, bugun)
  const saat = formatPlanTime(kayit.saat, kayit.tumGun)
  return saat ? `${gun} · ${saat}` : gun
}

// Folded to this many until "show all".
const KISA_LISTE = 3

// Plans whose day passed while still pending: bring each (or all) to today
// or tomorrow, or say they're done.
export function KacanlarKarti({
  kayitlar,
  onRecordClick,
  onUygula,
  mesgul,
}: {
  kayitlar: Kayit[]
  onRecordClick: (kayit: Kayit) => void
  onUygula: (kayitlar: Kayit[], islem: TopluIslem) => void
  mesgul: boolean
}) {
  const bugun = useBugun()
  const [acik, setAcik] = useState(false)
  if (kayitlar.length === 0) return null

  const yarin = gunEkle(bugun, 1)
  const gorunen = acik ? kayitlar : kayitlar.slice(0, KISA_LISTE)

  return (
    <section className="card p-4 border-rose-100 bg-rose-50/40" aria-label="Kaçanlar">
      <div className="flex items-center gap-2 mb-1 px-1">
        <Icon name="AlertCircle" className="w-4 h-4 text-rose-500" />
        <h2 className="text-sm font-semibold text-rose-600">Kaçanlar</h2>
        <span className="text-xs text-rose-400">{kayitlar.length}</span>
        <span className="ml-auto text-[11px] text-ink-300">Günü geçti, hâlâ bekliyor</span>
      </div>

      <ul className="divide-y divide-rose-100/70">
        {gorunen.map((k) => {
          const baslik = goruntulemeBasligi(k)
          return (
            <li key={k.id} className="flex items-start gap-2.5 py-2.5">
              <button
                onClick={() => onUygula([k], { tur: 'yapildi' })}
                disabled={mesgul}
                aria-label={`${baslik}: yapıldı`}
                className="shrink-0 mt-0.5 text-ink-200 hover:text-teal-500 active:scale-90 transition-all"
              >
                <Icon name="Circle" className="w-5 h-5" />
              </button>
              <div {...tiklanabilir(() => onRecordClick(k))} className="flex-1 min-w-0 cursor-pointer">
                <p className="text-sm font-medium text-ink-700 leading-snug break-words">
                  {k.emoji && <span aria-hidden="true">{k.emoji} </span>}
                  {baslik}
                </p>
                <p className="text-[11px] text-rose-500 mt-0.5">{kacanZamani(k, bugun)}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => onUygula([k], { tur: 'tasi', tarih: bugun })}
                  disabled={mesgul}
                  aria-label={`${baslik}: bugüne al`}
                  className="chip text-xs py-1 bg-white text-orchid-600 border border-orchid-100 active:scale-95 disabled:opacity-50"
                >
                  Bugün
                </button>
                <button
                  onClick={() => onUygula([k], { tur: 'tasi', tarih: yarin })}
                  disabled={mesgul}
                  aria-label={`${baslik}: yarına ertele`}
                  className="chip text-xs py-1 bg-white text-ink-500 border border-ink-100 active:scale-95 disabled:opacity-50"
                >
                  Yarın
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {kayitlar.length > KISA_LISTE && (
        <button onClick={() => setAcik(!acik)} className="text-xs font-medium text-ink-400 px-1 py-1 flex items-center gap-1">
          <Icon name="ChevronDown" className={`w-3.5 h-3.5 transition-transform ${acik ? 'rotate-180' : ''}`} />
          {acik ? 'Daha az göster' : `${kayitlar.length - KISA_LISTE} tane daha`}
        </button>
      )}

      {kayitlar.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-3 border-t border-rose-100/70">
          <span className="text-xs text-ink-400 mr-1">Hepsini:</span>
          <button onClick={() => onUygula(kayitlar, { tur: 'tasi', tarih: bugun })} disabled={mesgul} aria-label="Hepsini bugüne al" className={CHIP}>
            Bugüne al
          </button>
          <button onClick={() => onUygula(kayitlar, { tur: 'tasi', tarih: yarin })} disabled={mesgul} aria-label="Hepsini yarına ertele" className={CHIP}>
            Yarına ertele
          </button>
          <button onClick={() => onUygula(kayitlar, { tur: 'yapildi' })} disabled={mesgul} aria-label="Hepsini yapıldı say" className={CHIP}>
            <Icon name="CheckCheck" className="w-3.5 h-3.5" />
            Yapıldı say
          </button>
        </div>
      )}
    </section>
  )
}
