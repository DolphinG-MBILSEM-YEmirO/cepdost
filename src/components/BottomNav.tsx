import { useState } from 'react'
import { Icon, type IconName } from './Icon'
import { SAG_TABLAR as sagTablar, SOL_TABLAR as solTablar, type Tab } from './sekmeler'

export type { Tab }

// 4 sekme + tam ortada + butonu. Hatırlatmalar "Planlar" içine, Ayarlar ve
// Arşiv "Profil" içine, Arkadaşlar "Sohbet" içine taşındı; istekler ve
// davetler Sohbet rozetine sayılır. Masaüstünde (lg) bu çubuk gizli; yerini
// KenarCubugu alıyor.
//
// Canlı tema (2026-10-31): ekranın altında yüzen buzlu bir çubuk. Seçili
// sekmenin altında tek bir renkli damla var: sekme değişince damla yeni
// yerine kayarken sıvı gibi uzayıp toplanıyor ("erime"), rengi de bir
// sonraki sekmenin rengine akıyor (index.css'teki --bolum geçişi). Yeni
// seçilen simge bir kez zıplıyor. + düğmesi basınca dalga yayıp dönüyor.

interface BottomNavProps {
  active: Tab
  onChange: (tab: Tab) => void
  onAddClick: () => void
  // Okunmamış mesaj + bekleyen arkadaşlık isteği / plan daveti sayısı.
  sohbetRozeti?: number
}

// Column of each tab in the five-column bar (2 is the + button).
const SUTUN: Record<Tab, number> = { planlar: 0, sohbet: 1, akis: 3, profil: 4 }

export function BottomNav({ active, onChange, onAddClick, sohbetRozeti = 0 }: BottomNavProps) {
  // Bumped on every press of +, so its ripple replays.
  const [dalga, setDalga] = useState(0)

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 lg:hidden px-3 pb-[calc(0.5rem+var(--safe-bottom))] pointer-events-none">
      <div className="glass border rounded-[1.75rem] shadow-float safe-x max-w-md md:max-w-2xl mx-auto pointer-events-auto">
        {/* grid-cols-5 + ortadaki hücre: buton matematiksel olarak tam
            merkezde kalıyor, sekme etiketlerinin uzunluğundan etkilenmiyor. */}
        <div className="relative grid grid-cols-5 items-center px-1.5 py-1.5">
          {/* The liquid selection: the outer layer slides between columns,
              the inner one (re-keyed per tab) stretches as it moves. */}
          <div
            aria-hidden
            className="absolute top-[7px] h-8 w-[20%] flex justify-center pointer-events-none transition-[left] duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)]"
            style={{ left: `calc(0.375rem + ${SUTUN[active]} * (100% - 0.75rem) / 5)` }}
          >
            <span key={active} className="block w-14 h-8 rounded-full bg-bolum shadow-glow animate-eri" />
          </div>

          {solTablar.map((t) => (
            <NavButton
              key={t.id}
              tab={t}
              active={active === t.id}
              onClick={() => onChange(t.id)}
              rozet={t.id === 'sohbet' ? sohbetRozeti : 0}
            />
          ))}

          <div className="flex justify-center">
            <button
              onClick={() => {
                setDalga((d) => d + 1)
                onAddClick()
              }}
              aria-label="Yeni plan ekle"
              className="group relative w-[52px] h-[52px] -my-1 rounded-full bg-bolum-canli text-white flex items-center justify-center shadow-glow basinca hover:brightness-110"
            >
              {dalga > 0 && (
                <span key={dalga} aria-hidden className="absolute inset-0 rounded-full bg-bolum animate-dalga pointer-events-none" />
              )}
              <Icon
                name="Plus"
                className="relative w-7 h-7 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:rotate-90 group-active:rotate-90"
                strokeWidth={2.5}
              />
            </button>
          </div>

          {sagTablar.map((t) => (
            <NavButton key={t.id} tab={t} active={active === t.id} onClick={() => onChange(t.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function NavButton({
  tab,
  active,
  onClick,
  rozet = 0,
}: {
  tab: { id: Tab; label: string; icon: IconName }
  active: boolean
  onClick: () => void
  rozet?: number
}) {
  return (
    <button
      onClick={onClick}
      aria-label={rozet > 0 ? `${tab.label}, ${rozet} yeni` : tab.label}
      aria-current={active ? 'page' : undefined}
      className="relative flex flex-col items-center gap-0.5 py-0.5 min-h-[48px] basinca"
    >
      <div className="relative h-8 w-14 flex items-center justify-center">
        <Icon
          key={active ? 'secili' : 'bos'}
          name={tab.icon}
          className={`w-[22px] h-[22px] transition-colors duration-300 ${active ? 'text-white animate-sicra' : 'text-ink-400'}`}
          strokeWidth={active ? 2.25 : undefined}
        />
        {rozet > 0 && (
          <span className="absolute -top-1 right-0 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums ring-2 ring-white animate-pop-in">
            {rozet > 9 ? '9+' : rozet}
          </span>
        )}
      </div>
      <span
        className={`text-[11px] leading-none transition-all duration-300 ${active ? 'text-bolum-koyu font-bold' : 'text-ink-400 font-medium'}`}
      >
        {tab.label}
      </span>
    </button>
  )
}
