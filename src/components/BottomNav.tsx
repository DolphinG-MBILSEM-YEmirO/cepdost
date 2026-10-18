import { Icon, type IconName } from './Icon'
import { SAG_TABLAR as sagTablar, SOL_TABLAR as solTablar, type Tab } from './sekmeler'

export type { Tab }

// 4 sekme + tam ortada + butonu. Önceki 5 sekmeli düzende buton sola
// kayıyordu (2 sol + 3 sağ) ve seçenek kalabalığı vardı; Hatırlatmalar
// "Planlar" içine, Ayarlar "Profil" içine taşındı.
// Arşiv alt bardan çıkıp Profil'in içine taşındı; yeri Sohbet'e verildi.
// Masaüstünde (lg) bu çubuk gizli; yerini KenarCubugu alıyor.

interface BottomNavProps {
  active: Tab
  onChange: (tab: Tab) => void
  onAddClick: () => void
  // Bekleyen arkadaşlık isteği / plan daveti sayısı.
  profilRozeti?: number
  // Okunmamış mesaj sayısı.
  sohbetRozeti?: number
}

export function BottomNav({
  active,
  onChange,
  onAddClick,
  profilRozeti = 0,
  sohbetRozeti = 0,
}: BottomNavProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 lg:hidden">
      <div className="glass safe-x">
        {/* grid-cols-5 + ortadaki hücre: buton matematiksel olarak tam
            merkezde kalıyor, sekme etiketlerinin uzunluğundan etkilenmiyor. */}
        <div className="grid grid-cols-5 items-center px-2 py-2 pb-[calc(0.5rem+var(--safe-bottom))] max-w-md md:max-w-2xl mx-auto">
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
              onClick={onAddClick}
              aria-label="Yeni plan ekle"
              className="w-14 h-14 rounded-full bg-gradient-orchid text-white flex items-center justify-center shadow-brand -mt-6 active:scale-90 transition-transform ring-4 ring-white/90"
            >
              <Icon name="Plus" className="w-6 h-6" />
            </button>
          </div>

          {sagTablar.map((t) => (
            <NavButton
              key={t.id}
              tab={t}
              active={active === t.id}
              onClick={() => onChange(t.id)}
              rozet={t.id === 'profil' ? profilRozeti : 0}
            />
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
      className="flex flex-col items-center gap-1 py-1 active:scale-95 transition-transform"
    >
      <div className="relative">
        <Icon
          name={tab.icon}
          className={`w-5 h-5 transition-colors ${active ? 'text-orchid-600' : 'text-ink-300'}`}
        />
        {rozet > 0 && (
          <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {rozet > 9 ? '9+' : rozet}
          </span>
        )}
      </div>
      <span
        className={`text-[11px] transition-colors ${active ? 'text-orchid-600 font-semibold' : 'text-ink-300 font-medium'}`}
      >
        {tab.label}
      </span>
    </button>
  )
}
