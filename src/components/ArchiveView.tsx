import { useMemo, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { KayitCard } from './KayitCard'
import { LinkEkleModal } from './LinkEkleModal'
import { type Kayit, type Kategori, goruntulemeBasligi } from '../db'
import { CATEGORY_LABELS, CATEGORY_ICON_NAME, CATEGORIES } from '../lib/format'

// Not: eskiden bir `onAddClick` prop'u vardı ve plan sihirbazını açıyordu.
// Arşivde "yeni plan" yanlış işti — alt bardaki + zaten onu yapıyor. Burada
// arşive ait olan iş var: link ekleme (LinkEkleModal).
interface ArchiveViewProps {
  kayitlar: Kayit[]
  loading: boolean
  onToggleStatus: (id: string) => void
  onDelete: (id: string) => void
  onRecordClick: (kayit: Kayit) => void
}

type Filter = 'all' | Kategori
type SortMode = 'recent' | 'date' | 'category'

export function ArchiveView({ kayitlar, loading, onToggleStatus, onDelete, onRecordClick }: ArchiveViewProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [linkEkleAcik, setLinkEkleAcik] = useState(false)

  const filtered = useMemo(() => {
    let result = kayitlar

    if (filter !== 'all') {
      result = result.filter((k) => k.kategori === filter)
    }

    if (search.trim()) {
      const q = search.trim().toLocaleLowerCase('tr-TR')
      result = result.filter((k) => {
        const alanlar = [goruntulemeBasligi(k), k.hamMetin, k.hamLink, k.ozetNot ?? '', k.konum ?? '']
        return alanlar.some((a) => a.toLocaleLowerCase('tr-TR').includes(q))
      })
    }

    const sorted = [...result]
    if (sortMode === 'recent') {
      sorted.sort((a, b) => b.olusturulmaTarihi - a.olusturulmaTarihi)
    } else if (sortMode === 'date') {
      sorted.sort((a, b) => {
        const aDate = a.tarih ? new Date(a.tarih).getTime() : Infinity
        const bDate = b.tarih ? new Date(b.tarih).getTime() : Infinity
        return aDate - bDate
      })
    } else if (sortMode === 'category') {
      sorted.sort((a, b) => (a.kategori ?? '').localeCompare(b.kategori ?? ''))
    }

    return sorted
  }, [kayitlar, filter, search, sortMode])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: kayitlar.length }
    for (const cat of CATEGORIES) {
      c[cat] = kayitlar.filter((k) => k.kategori === cat).length
    }
    return c
  }, [kayitlar])

  const sortLabels: Record<SortMode, string> = {
    recent: 'En yeni',
    date: 'Tarihe göre',
    category: 'Kategori',
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-[calc(1rem+var(--safe-top))] pb-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink-700">Arşiv</h1>
            <p className="text-sm text-ink-400 mt-0.5">{kayitlar.length} kayıt</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="w-11 h-11 rounded-full bg-cream-50 border border-ink-100/40 flex items-center justify-center active:scale-90 transition-transform"
              >
                <Icon name="Filter" className="w-5 h-5 text-ink-400" />
              </button>
              {showSortMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                  <div className="absolute right-0 top-12 z-20 card p-1 w-40 animate-scale-in">
                    {(['recent', 'date', 'category'] as SortMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => { setSortMode(mode); setShowSortMenu(false) }}
                        className={`w-full px-3 py-2.5 rounded-xl text-sm font-medium text-left flex items-center justify-between transition-colors
                          ${sortMode === mode ? 'bg-coral-50 text-coral-600' : 'text-ink-500 hover:bg-ink-50'}`}
                      >
                        {sortLabels[mode]}
                        {sortMode === mode && <Icon name="Check" className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* Arşivde "+" plan oluşturmayı açıyordu; alt bardaki + zaten
                bunu yapıyor. Burada arşive ait olan iş var: link ekleme. */}
            <button
              onClick={() => setLinkEkleAcik(true)}
              aria-label="Arşive link ekle"
              className="w-11 h-11 rounded-full bg-coral-500 text-white flex items-center justify-center shadow-soft active:scale-90 transition-transform"
            >
              <Icon name="LinkIcon" className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="relative">
          <Icon name="Search" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara..."
            className="w-full bg-cream-50 border border-ink-100/40 rounded-2xl pl-11 pr-4 py-3 text-ink-700 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral-200 transition-all"
          />
        </div>

        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar pb-1">
          <FilterChip label="Tümü" count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} icon="Archive" />
          {CATEGORIES.map((cat) => (
            <FilterChip
              key={cat}
              label={CATEGORY_LABELS[cat]}
              count={counts[cat] ?? 0}
              active={filter === cat}
              onClick={() => setFilter(cat)}
              icon={CATEGORY_ICON_NAME[cat]}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-24">
        {loading ? (
          <div className="space-y-3 mt-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card p-4">
                <div className="flex gap-3">
                  <div className="skeleton w-6 h-6 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-20 rounded-lg" />
                    <div className="skeleton h-5 w-3/4 rounded-lg" />
                    <div className="skeleton h-3 w-1/3 rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState search={search} filter={filter} onLinkEkle={() => setLinkEkleAcik(true)} />
        ) : (
          <div className="space-y-3 mt-2">
            {filtered.map((kayit) => (
              <KayitCard
                key={kayit.id}
                kayit={kayit}
                onToggleStatus={() => onToggleStatus(kayit.id)}
                onDelete={() => onDelete(kayit.id)}
                onClick={() => onRecordClick(kayit)}
              />
            ))}
          </div>
        )}
      </div>

      {linkEkleAcik && (
        <LinkEkleModal onClose={() => setLinkEkleAcik(false)} onEklendi={() => {}} />
      )}
    </div>
  )
}

function FilterChip({ label, count, active, onClick, icon }: { label: string; count: number; active: boolean; onClick: () => void; icon: IconName }) {
  return (
    <button
      onClick={onClick}
      className={`chip shrink-0 ${active ? 'bg-ink-700 text-cream-50' : 'bg-cream-50 text-ink-400 border border-ink-100/40'}`}
    >
      <Icon name={icon} className="w-4 h-4" />
      {label}
      <span className={`text-xs ${active ? 'text-cream-200' : 'text-ink-300'}`}>{count}</span>
    </button>
  )
}

function EmptyState({
  search,
  filter,
  onLinkEkle,
}: {
  search: string
  filter: Filter
  onLinkEkle: () => void
}) {
  const hasSearch = search.trim().length > 0
  const hasFilter = filter !== 'all'

  if (hasSearch || hasFilter) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-ink-50 flex items-center justify-center mb-4">
          <Icon name="Search" className="w-8 h-8 text-ink-300" />
        </div>
        <p className="font-semibold text-ink-500 mb-1">Sonuç bulunamadı</p>
        <p className="text-sm text-ink-400">{hasSearch ? 'Başka bir kelime dene.' : 'Bu kategoride kayıt yok.'}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-fade-in">
      <div className="w-20 h-20 rounded-full bg-coral-100 flex items-center justify-center mb-5">
        <Icon name="Sparkles" className="w-10 h-10 text-coral-500" />
      </div>
      <p className="font-display text-lg font-bold text-ink-600 mb-2">Kaydettiğin şey burada işe yarasın</p>
      <p className="text-sm text-ink-400 mb-6 max-w-xs">
        Telefonun paylaş menüsünden bir link ya da ekran görüntüsü gönder — ben anlayıp
        arşivleyeyim. Ya da bir bağlantıyı buradan elle ekle.
      </p>
      <button onClick={onLinkEkle} className="btn-primary flex items-center gap-2">
        <Icon name="LinkIcon" className="w-5 h-5" />
        Link ekle
      </button>
    </div>
  )
}
