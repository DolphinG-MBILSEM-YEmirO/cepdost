import { useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import type { Kayit } from '../db'
import { CATEGORY_MARK_COLORS, parseLocalDate } from '../lib/format'
import { HAFTA_GUNLERI, ayBasligi, ayIzgarasi, gunOzetleri } from '../lib/takvimIzgarasi'

// The calendar's month view: a dot per pending plan (in its category's
// colour, red once the day has passed), a ring for a day whose plans are
// all done, today outlined, the chosen day filled. Swipe or use the arrows
// to change month.

const AZAMI_NOKTA = 3
// A horizontal swipe longer than this changes month.
const KAYDIRMA_ESIGI = 50

export function AyTakvimi({
  kayitlar,
  secili,
  bugun,
  onSec,
}: {
  kayitlar: Kayit[]
  secili: string
  bugun: string
  onSec: (tarih: string) => void
}) {
  const seciliGun = parseLocalDate(secili)
  const [ay, setAy] = useState({ yil: seciliGun.getFullYear(), ay: seciliGun.getMonth() })
  const dokunus = useRef<{ x: number; y: number } | null>(null)

  // The grid follows the chosen day when it moves to another month (the
  // day arrows, "Bugüne dön", a day from the next month tapped in the grid).
  const [oncekiSecili, setOncekiSecili] = useState(secili)
  if (oncekiSecili !== secili) {
    setOncekiSecili(secili)
    setAy({ yil: seciliGun.getFullYear(), ay: seciliGun.getMonth() })
  }

  const gunler = useMemo(() => ayIzgarasi(ay.yil, ay.ay), [ay])
  const ozetler = useMemo(() => gunOzetleri(kayitlar), [kayitlar])
  const buAyda = ay.yil === parseLocalDate(bugun).getFullYear() && ay.ay === parseLocalDate(bugun).getMonth()

  function ayDegistir(fark: number) {
    setAy(({ yil, ay }) => {
      const d = new Date(yil, ay + fark, 1)
      return { yil: d.getFullYear(), ay: d.getMonth() }
    })
  }

  return (
    <section className="card p-3 mb-4" aria-label="Ay takvimi">
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={() => ayDegistir(-1)}
          aria-label="Önceki ay"
          className="w-9 h-9 rounded-full flex items-center justify-center text-ink-400 hover:bg-ink-50 active:opacity-80 transition-transform"
        >
          <Icon name="ChevronRight" className="w-4 h-4 rotate-180" />
        </button>
        <h2 className="flex-1 text-center font-display font-bold text-ink-700 capitalize" aria-live="polite">
          {ayBasligi(ay.yil, ay.ay)}
        </h2>
        {!buAyda && (
          <button
            onClick={() => {
              const d = parseLocalDate(bugun)
              setAy({ yil: d.getFullYear(), ay: d.getMonth() })
              onSec(bugun)
            }}
            className="text-xs font-medium text-brand-600 px-2 py-1 rounded-full hover:bg-brand-50"
          >
            Bu ay
          </button>
        )}
        <button
          onClick={() => ayDegistir(1)}
          aria-label="Sonraki ay"
          className="w-9 h-9 rounded-full flex items-center justify-center text-ink-400 hover:bg-ink-50 active:opacity-80 transition-transform"
        >
          <Icon name="ChevronRight" className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1" aria-hidden="true">
        {HAFTA_GUNLERI.map((g) => (
          <span key={g} className="text-center text-[10px] font-semibold uppercase text-ink-400">
            {g}
          </span>
        ))}
      </div>

      <div
        className="grid grid-cols-7 gap-y-1"
        onTouchStart={(e) => {
          const t = e.touches[0]
          dokunus.current = { x: t.clientX, y: t.clientY }
        }}
        onTouchEnd={(e) => {
          const bas = dokunus.current
          dokunus.current = null
          if (!bas) return
          const t = e.changedTouches[0]
          const dx = t.clientX - bas.x
          if (Math.abs(dx) > KAYDIRMA_ESIGI && Math.abs(dx) > Math.abs(t.clientY - bas.y)) ayDegistir(dx < 0 ? 1 : -1)
        }}
      >
        {gunler.map((g) => {
          const ozet = ozetler.get(g.tarih)
          const bekleyen = ozet?.bekleyen ?? []
          const gecti = g.tarih < bugun
          const seciliMi = g.tarih === secili
          const bugunMu = g.tarih === bugun
          const etiket = [
            parseLocalDate(g.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }),
            bekleyen.length > 0 ? (gecti ? `${bekleyen.length} kaçan plan` : `${bekleyen.length} plan`) : null,
            ozet?.yapilan ? `${ozet.yapilan} yapıldı` : null,
          ]
            .filter(Boolean)
            .join(', ')
          return (
            <button
              key={g.tarih}
              onClick={() => onSec(g.tarih)}
              aria-label={etiket}
              aria-pressed={seciliMi}
              aria-current={bugunMu ? 'date' : undefined}
              className={`relative mx-auto w-10 h-11 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all active:opacity-80
                ${seciliMi ? 'bg-brand-600 text-white shadow-soft' : bugunMu ? 'ring-2 ring-brand-300 text-brand-600' : 'hover:bg-ink-50'}
                ${!g.buAy && !seciliMi ? 'text-ink-200' : ''}`}
            >
              <span className={`text-sm leading-none ${bugunMu || seciliMi ? 'font-bold' : 'font-medium'} ${g.buAy && !seciliMi && !bugunMu ? 'text-ink-600' : ''}`}>
                {g.gun}
              </span>
              <span className="flex gap-0.5 h-1.5 items-center" aria-hidden="true">
                {bekleyen.slice(0, AZAMI_NOKTA).map((k) => (
                  <span
                    key={k.id}
                    className={`w-1.5 h-1.5 rounded-full ${seciliMi ? 'bg-white/90' : gecti ? 'bg-rose-500' : CATEGORY_MARK_COLORS[k.kategori ?? 'not']}`}
                  />
                ))}
                {bekleyen.length === 0 && (ozet?.yapilan ?? 0) > 0 && (
                  <span className={`w-1.5 h-1.5 rounded-full border ${seciliMi ? 'border-white/80' : 'border-teal-500'}`} />
                )}
              </span>
              {bekleyen.length > AZAMI_NOKTA && (
                <span className={`absolute top-0.5 right-0.5 text-[8px] font-bold ${seciliMi ? 'text-white/80' : 'text-ink-400'}`} aria-hidden="true">
                  +{bekleyen.length - AZAMI_NOKTA}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
