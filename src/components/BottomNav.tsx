import { Icon, type IconName } from './Icon'
import { SAG_TABLAR as sagTablar, SOL_TABLAR as solTablar, type Tab } from './sekmeler'

export type { Tab }

// 4 sekme + tam ortada + butonu. Önceki 5 sekmeli düzende buton sola
// kayıyordu (2 sol + 3 sağ) ve seçenek kalabalığı vardı; Hatırlatmalar
// "Planlar" içine, Ayarlar "Profil" içine taşındı.
// Arşiv alt bardan çıkıp Profil'in içine taşındı; yeri Sohbet'e verildi.
// Arkadaşlar da Sohbet'te; istekler ve davetler Sohbet rozetine sayılır.
// Masaüstünde (lg) bu çubuk gizli; yerini KenarCubugu alıyor.
// Canlı tema (2026-10-31): ekranın altında yüzen buzlu bir çubuk. Seçili
// sekmenin simgesi kendi renk geçişli kapsülüne yaylanarak oturur; + düğmesi
// o anki sekmenin renginde, basınca dönen yuvarlak bir düğme.

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
    <div className="fixed bottom-0 left-0 right-0 z-30 lg:hidden px-3 pb-[calc(0.5rem+var(--safe-bottom))] pointer-events-none">
      <div className="glass border rounded-[1.75rem] shadow-float safe-x max-w-md md:max-w-2xl mx-auto pointer-events-auto">
        {/* grid-cols-5 + ortadaki hücre: buton matematiksel olarak tam
            merkezde kalıyor, sekme etiketlerinin uzunluğundan etkilenmiyor. */}
        <div className="grid grid-cols-5 items-center px-1.5 py-1.5">
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
              className="group w-[52px] h-[52px] -my-1 rounded-full bg-bolum-canli text-white flex items-center justify-center shadow-glow basinca hover:brightness-110"
            >
              <Icon
                name="Plus"
                className="w-7 h-7 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:rotate-90 group-active:rotate-90"
                strokeWidth={2.5}
              />
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
      data-bolum={tab.id}
      className="flex flex-col items-center gap-0.5 py-0.5 min-h-[48px] basinca"
    >
      <div
        className={`relative h-8 flex items-center justify-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          active ? 'w-14 bg-bolum shadow-glow' : 'w-10'
        }`}
      >
        <Icon
          name={tab.icon}
          className={`w-[22px] h-[22px] transition-colors duration-200 ${active ? 'text-white' : 'text-ink-400'}`}
          strokeWidth={active ? 2.25 : undefined}
        />
        {rozet > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums ring-2 ring-white animate-pop-in">
            {rozet > 9 ? '9+' : rozet}
          </span>
        )}
      </div>
      <span
        className={`text-[11px] leading-none transition-colors ${active ? 'text-bolum-koyu font-bold' : 'text-ink-400 font-medium'}`}
      >
        {tab.label}
      </span>
    </button>
  )
}
