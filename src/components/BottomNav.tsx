import { Icon, type IconName } from './Icon'
import { SAG_TABLAR as sagTablar, SOL_TABLAR as solTablar, type Tab } from './sekmeler'

export type { Tab }

// 4 sekme + tam ortada + butonu. Önceki 5 sekmeli düzende buton sola
// kayıyordu (2 sol + 3 sağ) ve seçenek kalabalığı vardı; Hatırlatmalar
// "Planlar" içine, Ayarlar "Profil" içine taşındı.
// Arşiv alt bardan çıkıp Profil'in içine taşındı; yeri Sohbet'e verildi.
// Arkadaşlar da Sohbet'te; istekler ve davetler Sohbet rozetine sayılır.
// Masaüstünde (lg) bu çubuk gizli; yerini KenarCubugu alıyor.
// Arayüz planı (2026-10-31): opak zemin + ince çizgi, + düğmesi çubuğun
// içinde düz marka rengi bir kare; yukarı taşan yuvarlak buton kalktı.

interface BottomNavProps {
  active: Tab
  onChange: (tab: Tab) => void
  onAddClick: () => void
  // Okunmamış mesaj + bekleyen arkadaşlık isteği / plan daveti sayısı.
  sohbetRozeti?: number
}

export function BottomNav({
  active,
  onChange,
  onAddClick,
  sohbetRozeti = 0,
}: BottomNavProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 lg:hidden">
      <div className="bg-white border-t border-ink-100 safe-x">
        {/* grid-cols-5 + ortadaki hücre: buton matematiksel olarak tam
            merkezde kalıyor, sekme etiketlerinin uzunluğundan etkilenmiyor. */}
        <div className="grid grid-cols-5 items-center px-2 pt-1.5 pb-[calc(0.375rem+var(--safe-bottom))] max-w-md md:max-w-2xl mx-auto">
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
              className="w-11 h-11 rounded-xl bg-brand-600 text-white flex items-center justify-center transition-colors hover:bg-brand-700 active:bg-brand-800"
            >
              <Icon name="Plus" className="w-6 h-6" strokeWidth={2.25} />
            </button>
          </div>

          {sagTablar.map((t) => (
            <NavButton
              key={t.id}
              tab={t}
              active={active === t.id}
              onClick={() => onChange(t.id)}
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
      className="flex flex-col items-center gap-1 py-1 min-h-[44px] active:opacity-80"
    >
      <div className="relative">
        <Icon
          name={tab.icon}
          className={`w-6 h-6 transition-colors ${active ? 'text-brand-600' : 'text-ink-400'}`}
        />
        {rozet > 0 && (
          <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums ring-2 ring-white">
            {rozet > 9 ? '9+' : rozet}
          </span>
        )}
      </div>
      <span
        className={`text-[11px] leading-none transition-colors ${active ? 'text-brand-700 font-semibold' : 'text-ink-500 font-medium'}`}
      >
        {tab.label}
      </span>
    </button>
  )
}
