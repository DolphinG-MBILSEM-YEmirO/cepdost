import { Icon } from './Icon'
import type { Kayit } from '../db'
import { geriSayim } from '../lib/planAyrintilari'

// Small signs on a plan in a list: the checklist's progress, a bell when a
// reminder is set, and (where asked) "starts in 20 min" when it's close.
export function PlanRozetleri({ kayit, yakinsaSayim = false }: { kayit: Kayit; yakinsaSayim?: boolean }) {
  const bekliyor = kayit.durum === 'bekliyor'
  const liste = kayit.yapilacaklar ?? []
  const biten = liste.filter((m) => m.tamam).length
  const sayim = yakinsaSayim && bekliyor ? geriSayim(kayit) : null
  const yakin = sayim && (sayim.durum === 'yakin' || sayim.durum === 'suruyor') ? sayim : null
  const zil = bekliyor && kayit.hatirlatma != null

  if (!yakin && liste.length === 0 && !zil) return null
  return (
    <span className="flex items-center gap-2 min-w-0">
      {yakin && <span className="text-xs font-medium text-orchid-600 truncate">{yakin.metin}</span>}
      {liste.length > 0 && (
        <span
          className={`flex items-center gap-1 text-xs shrink-0 ${biten === liste.length ? 'text-teal-600' : 'text-ink-300'}`}
          aria-label={`${liste.length} maddeden ${biten} tanesi yapıldı`}
        >
          <Icon name="ListChecks" className="w-3.5 h-3.5" />
          {biten}/{liste.length}
        </span>
      )}
      {zil && (
        <span role="img" aria-label="Hatırlatma kurulu" className="text-orchid-400 shrink-0">
          <Icon name="BellRing" className="w-3.5 h-3.5" />
        </span>
      )}
    </span>
  )
}
