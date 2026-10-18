import { Icon } from './Icon'

// Sağ altta, alt navigasyon çubuğunun hemen üstünde yüzen sohbet butonu.
// z-40: BottomNav'ın (z-30) üstünde, tam ekran modalların (z-50/60) altında
// kalır — bir modal açıkken otomatik gizlenir, ayrıca koşul yazmaya gerek yok.
// Masaüstünde asistan kenar çubuğunda, bu buton gizli.
export function ChatButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Planların hakkında sohbet et"
      className="lg:hidden fixed right-4 z-40 bottom-[calc(6rem+var(--safe-bottom))] w-14 h-14 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-float active:scale-90 transition-transform ring-4 ring-cream-50/80"
    >
      <Icon name="MessageCircle" className="w-6 h-6" />
    </button>
  )
}
