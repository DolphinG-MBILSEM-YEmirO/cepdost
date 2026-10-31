import { useMemo, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { KayitCard } from './KayitCard'
import { LinkEkleModal } from './LinkEkleModal'
import { GeriAlCubugu } from './TakvimIslemleri'
import type { Kayit, Kategori } from '../db'
import { CATEGORY_LABELS, CATEGORY_ICON_NAME, CATEGORIES } from '../lib/format'
import { useGeriIleKapat } from '../lib/geriTusu'
import { aramaSorgusu } from '../lib/arama'
import {
  arsivBolumleri,
  durumSayilari,
  kayitDurumu,
  kayitEslesiyor,
  type DurumSuzgeci,
  type Siralama,
} from '../lib/arsivListesi'
import { useGeriAlinabilirSilme, useTopluIslem } from '../lib/topluIslem'
import { useBugun } from '../hooks/useBugun'

// Not: eskiden bir `onAddClick` prop'u vardı ve plan sihirbazını açıyordu.
// Arşivde "yeni plan" yanlış işti — alt bardaki + zaten onu yapıyor. Burada
// arşive ait olan iş var: link ekleme (LinkEkleModal).
// The list is searched with Turkish letters folded (the match highlighted),
// filtered by category and by where a record stands, and cut into sections
// for the chosen order. "Seç" picks several to mark done or delete at once,
// each with a few seconds to take it back.
interface ArchiveViewProps {
  kayitlar: Kayit[]
  loading: boolean
  onToggleStatus: (id: string) => void
  onDelete: (id: string) => void
  onRecordClick: (kayit: Kayit) => void
}

type Filter = 'all' | Kategori

const sortLabels: Record<Siralama, string> = {
  recent: 'En yeni',
  date: 'Tarihe göre',
  category: 'Kategori',
}

const DURUMLAR: { id: DurumSuzgeci; etiket: string }[] = [
  { id: 'hepsi', etiket: 'Hepsi' },
  { id: 'bekleyen', etiket: 'Bekleyen' },
  { id: 'yapildi', etiket: 'Yapıldı' },
  { id: 'kacti', etiket: 'Kaçtı' },
]

export function ArchiveView({ kayitlar, loading, onToggleStatus, onDelete, onRecordClick }: ArchiveViewProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [durum, setDurum] = useState<DurumSuzgeci>('hepsi')
  const [sortMode, setSortMode] = useState<Siralama>('recent')
  const [showSortMenu, setShowSortMenu] = useState(false)
  useGeriIleKapat(() => setShowSortMenu(false), showSortMenu)
  const [linkEkleAcik, setLinkEkleAcik] = useState(false)
  // The picked records' ids; null outside selection mode.
  const [secilenler, setSecilenler] = useState<Set<string> | null>(null)
  useGeriIleKapat(() => setSecilenler(null), secilenler !== null)
  const islem = useTopluIslem()
  const silme = useGeriAlinabilirSilme()
  const bugun = useBugun()
  const sorgu = aramaSorgusu(search)

  // Records waiting out a delete's "Geri al" are already gone from here.
  const gorunen = useMemo(() => kayitlar.filter((k) => !silme.gizli.has(k.id)), [kayitlar, silme.gizli])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: gorunen.length }
    for (const cat of CATEGORIES) {
      c[cat] = gorunen.filter((k) => k.kategori === cat).length
    }
    return c
  }, [gorunen])

  // The status counts follow the search and the category picked.
  const kategoride = useMemo(
    () =>
      gorunen.filter(
        (k) => (filter === 'all' || k.kategori === filter) && (!sorgu || kayitEslesiyor(k, sorgu)),
      ),
    [gorunen, filter, sorgu],
  )
  const durumlar = useMemo(() => durumSayilari(kategoride, bugun), [kategoride, bugun])
  const filtered = useMemo(
    () => (durum === 'hepsi' ? kategoride : kategoride.filter((k) => kayitDurumu(k, bugun) === durum)),
    [kategoride, durum, bugun],
  )
  const bolumler = useMemo(() => arsivBolumleri(filtered, sortMode), [filtered, sortMode])

  // Only what's on screen is acted on, whatever was picked before a filter.
  const secilenKayitlar = secilenler ? filtered.filter((k) => secilenler.has(k.id)) : []
  const hepsiSecili = filtered.length > 0 && secilenKayitlar.length === filtered.length

  function sec(id: string) {
    setSecilenler((onceki) => {
      const yeni = new Set(onceki)
      if (yeni.has(id)) yeni.delete(id)
      else yeni.add(id)
      return yeni
    })
  }

  async function topluYapildi() {
    silme.kapat()
    await islem.uygula(secilenKayitlar, { tur: 'yapildi' })
    setSecilenler(null)
  }

  function topluSil() {
    islem.kapat()
    silme.baslat(secilenKayitlar)
    setSecilenler(null)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 lg:px-0 pt-1 pb-3">
        {secilenler ? (
          <div className="flex items-center mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setSecilenler(null)}
                aria-label="Seçimi bitir"
                className="w-10 h-10 rounded-xl bg-white border border-ink-100 flex items-center justify-center hover:bg-ink-50 active:bg-ink-100 shrink-0"
              >
                <Icon name="X" className="w-5 h-5 text-ink-400" />
              </button>
              <div className="min-w-0">
                <h2 className="text-title text-ink-800" aria-live="polite">
                  {secilenKayitlar.length} seçili
                </h2>
                <button
                  onClick={() => setSecilenler(hepsiSecili ? new Set() : new Set(filtered.map((k) => k.id)))}
                  disabled={filtered.length === 0}
                  className="text-xs font-semibold text-brand-600 disabled:text-ink-400"
                >
                  {hepsiSecili ? 'Seçimi kaldır' : 'Tümünü seç'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-title text-ink-800">Arşiv</h2>
              <p className="text-caption font-normal text-ink-400 mt-0.5">{gorunen.length} kayıt</p>
            </div>
            <div className="flex items-center gap-2">
              {gorunen.length > 0 && (
                <button
                  onClick={() => {
                    setShowSortMenu(false)
                    setSecilenler(new Set())
                  }}
                  aria-label="Seç"
                  className="w-10 h-10 rounded-xl bg-white border border-ink-100 flex items-center justify-center hover:bg-ink-50 active:bg-ink-100"
                >
                  <Icon name="ListChecks" className="w-5 h-5 text-ink-400" />
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  aria-label={`Sırala: ${sortLabels[sortMode]}`}
                  aria-expanded={showSortMenu}
                  className="w-10 h-10 rounded-xl bg-white border border-ink-100 flex items-center justify-center hover:bg-ink-50 active:bg-ink-100"
                >
                  <Icon name="Filter" className="w-5 h-5 text-ink-400" />
                </button>
                {showSortMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                    <div className="absolute right-0 top-12 z-20 card p-1 w-40 animate-scale-in">
                      {(['recent', 'date', 'category'] as Siralama[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => { setSortMode(mode); setShowSortMenu(false) }}
                          className={`w-full px-3 py-2.5 rounded-xl text-sm font-medium text-left flex items-center justify-between transition-colors
                            ${sortMode === mode ? 'bg-brand-50 text-brand-600' : 'text-ink-500 hover:bg-ink-50'}`}
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
                className="w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 active:bg-brand-800"
              >
                <Icon name="LinkIcon" className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        <div className="relative">
          <Icon name="Search" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara..."
            aria-label="Arşivde ara"
            className="w-full bg-white border border-ink-200 rounded-xl pl-11 pr-11 py-2.5 text-ink-700 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Aramayı temizle"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-ink-400 hover:bg-ink-50"
            >
              <Icon name="X" className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex gap-1 mt-3 p-1 bg-mist-100 rounded-2xl" role="group" aria-label="Duruma göre süz">
          {DURUMLAR.map((d) => {
            const secili = durum === d.id
            const sayi = durumlar[d.id]
            return (
              <button
                key={d.id}
                onClick={() => setDurum(d.id)}
                aria-pressed={secili}
                className={`flex-1 min-w-0 rounded-xl py-1.5 text-xs font-semibold transition-colors ${
                  secili ? 'bg-mist-50 text-ink-700 shadow-card' : 'text-ink-400'
                }`}
              >
                {d.etiket}{' '}
                <span className={d.id === 'kacti' && sayi > 0 ? 'text-rose-500' : secili ? 'text-ink-400' : 'text-ink-400'}>{sayi}</span>
              </button>
            )
          })}
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

      <div className={`flex-1 overflow-y-auto px-4 ${secilenler ? 'pb-64 lg:pb-28' : 'pb-24 lg:pb-10'}`}>
        {loading ? (
          <div className="space-y-3 mt-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
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
          <EmptyState search={search} filter={filter} durum={durum} onLinkEkle={() => setLinkEkleAcik(true)} />
        ) : (
          <div className="space-y-5 mt-2">
            {bolumler.map((bolum) => (
              <section key={bolum.anahtar} aria-label={bolum.baslik}>
                <h2 className="flex items-baseline gap-2 text-label text-ink-500 px-1 mb-2">
                  {bolum.baslik}
                  <span className="text-caption font-normal text-ink-400 tabular-nums">{bolum.kayitlar.length}</span>
                </h2>
                <div className="card divide-y divide-ink-100/70 overflow-hidden kademeli">
                  {bolum.kayitlar.map((kayit) => (
                    <KayitCard
                      key={kayit.id}
                      kayit={kayit}
                      sorgu={sorgu}
                      onToggleStatus={() => onToggleStatus(kayit.id)}
                      onDelete={() => onDelete(kayit.id)}
                      onClick={() => onRecordClick(kayit)}
                      secim={secilenler ? { secili: secilenler.has(kayit.id), onSec: () => sec(kayit.id) } : undefined}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* The actions stay in reach however far the list is scrolled. */}
      {secilenler && (
        <div
          role="toolbar"
          aria-label="Seçilenler"
          className="fixed z-[45] inset-x-4 mx-auto max-w-sm bottom-[calc(10.5rem+var(--safe-bottom))] lg:bottom-6 animate-fade-in"
        >
          <div className="flex items-center gap-1 rounded-2xl bg-ink-800/95 text-white shadow-float p-1.5">
            <span className="pl-3 pr-1 text-sm text-white/70 shrink-0">{secilenKayitlar.length} seçili</span>
            <button
              onClick={() => void topluYapildi()}
              disabled={secilenKayitlar.length === 0 || islem.mesgul}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-teal-200 hover:bg-white/10 active:opacity-80 disabled:opacity-40"
            >
              <Icon name="CheckCircle2" className="w-4 h-4" />
              Yapıldı
            </button>
            <button
              onClick={topluSil}
              disabled={secilenKayitlar.length === 0}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-rose-200 hover:bg-white/10 active:opacity-80 disabled:opacity-40"
            >
              <Icon name="Trash2" className="w-4 h-4" />
              Sil
            </button>
          </div>
        </div>
      )}

      <GeriAlCubugu sonIslem={islem.sonIslem} onGeriAl={() => void islem.geriAl()} onKapat={islem.kapat} />
      <GeriAlCubugu sonIslem={silme.bekleyen} onGeriAl={silme.geriAl} onKapat={silme.kapat} ikon="Trash2" />

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
      className={`chip shrink-0 ${active ? 'bg-ink-700 text-mist-50' : 'bg-white text-ink-600 border border-ink-200'}`}
    >
      <Icon name={icon} className="w-4 h-4" />
      {label}
      <span className={`text-xs ${active ? 'text-mist-200' : 'text-ink-400'}`}>{count}</span>
    </button>
  )
}

function EmptyState({
  search,
  filter,
  durum,
  onLinkEkle,
}: {
  search: string
  filter: Filter
  durum: DurumSuzgeci
  onLinkEkle: () => void
}) {
  const hasSearch = search.trim().length > 0
  const hasFilter = filter !== 'all' || durum !== 'hepsi'

  if (hasSearch || hasFilter) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-bolum-soluk text-bolum-koyu flex items-center justify-center mb-4">
          <Icon name="Search" className="w-8 h-8 text-bolum-koyu" />
        </div>
        <p className="text-headline text-ink-800 mb-1">Sonuç bulunamadı</p>
        <p className="text-sm text-ink-400">{hasSearch ? 'Başka bir kelime dene.' : durum !== 'hepsi' ? 'Bu süzgeçte kayıt yok.' : 'Bu kategoride kayıt yok.'}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-fade-in">
      <div className="w-12 h-12 rounded-2xl bg-bolum-soluk text-bolum-koyu flex items-center justify-center mb-4">
        <Icon name="Share2" className="w-10 h-10 text-brand-600" />
      </div>
      <p className="text-headline text-ink-800 mb-1">Kaydettiğin şey burada işe yarasın</p>
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
