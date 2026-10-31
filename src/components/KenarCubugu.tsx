import { Icon } from './Icon'
import { Avatar } from './Avatar'
import { TABLAR, type Tab } from './sekmeler'
import type { Profil } from '../sosyal/api'
import { UYGULAMA_ADI } from '../../shared/marka'

// Desktop navigation (lg and up): the bottom bar and the floating
// assistant button become a fixed sidebar with the same tabs and actions.
interface Props {
  active: Tab
  onChange: (tab: Tab) => void
  onAddClick: () => void
  onAsistan: () => void
  profil: Profil | null
  // Unread messages plus pending friend requests and plan invites.
  sohbetRozeti?: number
}

export function KenarCubugu({
  active,
  onChange,
  onAddClick,
  onAsistan,
  profil,
  sohbetRozeti = 0,
}: Props) {
  const rozetler: Partial<Record<Tab, number>> = { sohbet: sohbetRozeti }

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 flex-col border-r border-ink-100 bg-white px-4 py-6">
      <div className="flex items-center gap-2.5 px-2 mb-7">
        <img src="/icons/icon-192.png" alt="" className="w-8 h-8 rounded-lg" />
        <span className="font-display text-lg font-bold tracking-tight text-ink-800">{UYGULAMA_ADI}</span>
      </div>

      <button onClick={onAddClick} className="btn-primary w-full flex items-center justify-center gap-2 mb-6">
        <Icon name="Plus" className="w-5 h-5" />
        Yeni plan
      </button>

      <nav aria-label="Ana menü" className="space-y-1">
        {TABLAR.map((t) => {
          const secili = active === t.id
          const rozet = rozetler[t.id] ?? 0
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              aria-label={rozet > 0 ? `${t.label}, ${rozet} yeni` : t.label}
              aria-current={secili ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                secili ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:bg-ink-50 hover:text-ink-700'
              }`}
            >
              <Icon name={t.icon} className="w-5 h-5" />
              <span className="flex-1 text-left">{t.label}</span>
              {rozet > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-600 text-white text-[11px] font-bold flex items-center justify-center tabular-nums">
                  {rozet > 9 ? '9+' : rozet}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="my-3 border-t border-ink-100" />

      <button
        onClick={onAsistan}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-ink-500 hover:bg-ink-50 hover:text-ink-700 transition-colors"
      >
        <Icon name="MessageCircle" className="w-5 h-5" />
        Asistan
      </button>

      {profil && (
        <button
          onClick={() => onChange('profil')}
          className="mt-auto flex items-center gap-3 rounded-xl p-2.5 text-left hover:bg-ink-50 transition-colors"
        >
          <Avatar ad={profil.ad} foto={profil.avatar} emoji={profil.emoji} renk={profil.renk} boyut="sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-700 truncate">{profil.ad}</p>
            {profil.kullanici_adi && <p className="text-xs text-ink-400 truncate">@{profil.kullanici_adi}</p>}
          </div>
        </button>
      )}
    </aside>
  )
}
