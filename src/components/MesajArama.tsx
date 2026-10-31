import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Avatar, GrupAvatari } from './Avatar'
import { Vurgulu } from './Vurgulu'
import { aramaSorgusu, eslesiyor, eslesmeOzeti } from '../lib/arama'
import { formatRelativeTime } from '../lib/format'
import { useGeriIleKapat } from '../lib/geriTusu'
import type { MesajSonucu } from '../sosyal/mesajArama'

// Searching messages: the matched words highlighted, a result row for the
// chat list's search, and the bar that steps through matches in an open
// chat.

export function MesajSonucuSatiri({ sonuc, sorgu, onAc }: { sonuc: MesajSonucu; sorgu: string; onAc: () => void }) {
  const { sohbet } = sonuc
  return (
    <button onClick={onAc} className="w-full card p-3 flex items-start gap-3 text-left active:opacity-80 transition-all lg:hover:border-orchid-200">
      {sohbet.tur === 'grup' && sohbet.grup ? (
        <GrupAvatari grup={sohbet.grup} boyut="sm" />
      ) : (
        <Avatar ad={sohbet.ad} foto={sohbet.avatar} emoji={sohbet.profil?.emoji} renk={sohbet.profil?.renk} boyut="sm" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-ink-700 truncate flex-1">{sohbet.ad}</p>
          <span className="text-[11px] text-ink-400 shrink-0">{formatRelativeTime(new Date(sonuc.olusturulma).getTime())}</span>
        </div>
        <p className="text-xs text-ink-500 mt-0.5 line-clamp-2 break-words">
          <span className="font-medium text-ink-600">{sonuc.gonderenAd}: </span>
          <Vurgulu metin={eslesmeOzeti(sonuc.metin, sorgu)} sorgu={sorgu} />
        </p>
      </div>
    </button>
  )
}

interface AranabilirMesaj {
  id: string
  metin: string
  silindi?: boolean
}

// In an open chat: type, and the newest match comes into view and flashes;
// the arrows (or Enter) step to older and newer ones.
export function SohbetIciArama({
  mesajlar,
  onGit,
  onKapat,
}: {
  mesajlar: AranabilirMesaj[]
  onGit: (mesajId: string) => void
  onKapat: () => void
}) {
  useGeriIleKapat(onKapat)
  const [girdi, setGirdi] = useState('')
  // 0 is the newest match.
  const [sira, setSira] = useState(0)
  const alan = useRef<HTMLInputElement>(null)
  const sorgu = aramaSorgusu(girdi)
  const eslesenler = useMemo(
    () => (sorgu ? mesajlar.filter((m) => !m.silindi && m.metin && eslesiyor(m.metin, sorgu)).reverse() : []),
    [mesajlar, sorgu],
  )
  const gecerliSira = Math.min(sira, Math.max(0, eslesenler.length - 1))
  const hedef = eslesenler[gecerliSira]?.id ?? null

  useEffect(() => {
    alan.current?.focus()
  }, [])

  // A new search starts again from the newest match.
  useEffect(() => {
    setSira(0)
  }, [sorgu])

  useEffect(() => {
    if (hedef) onGit(hedef)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hedef])

  const daha = (yon: 1 | -1) => setSira((s) => Math.min(Math.max(0, s + yon), Math.max(0, eslesenler.length - 1)))

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-ink-100 bg-white/90 shrink-0 animate-fade-in" role="search">
      <Icon name="Search" className="w-4 h-4 text-ink-400 shrink-0" />
      <input
        ref={alan}
        value={girdi}
        onChange={(e) => setGirdi(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            daha(e.shiftKey ? -1 : 1)
          }
        }}
        placeholder="Bu sohbette ara"
        aria-label="Bu sohbette ara"
        enterKeyHint="search"
        className="flex-1 min-w-0 bg-transparent text-sm text-ink-700 placeholder:text-ink-300 outline-none py-1.5"
      />
      {sorgu && (
        <span className="text-xs text-ink-400 shrink-0 tabular-nums" role="status">
          {eslesenler.length === 0 ? 'Sonuç yok' : `${gecerliSira + 1}/${eslesenler.length}`}
        </span>
      )}
      <button
        onClick={() => daha(1)}
        disabled={gecerliSira >= eslesenler.length - 1}
        aria-label="Daha eski sonuç"
        className="w-8 h-8 rounded-full flex items-center justify-center text-ink-400 hover:bg-ink-50 disabled:opacity-30 shrink-0"
      >
        <Icon name="ChevronUp" className="w-4 h-4" />
      </button>
      <button
        onClick={() => daha(-1)}
        disabled={gecerliSira <= 0}
        aria-label="Daha yeni sonuç"
        className="w-8 h-8 rounded-full flex items-center justify-center text-ink-400 hover:bg-ink-50 disabled:opacity-30 shrink-0"
      >
        <Icon name="ChevronDown" className="w-4 h-4" />
      </button>
      <button
        onClick={onKapat}
        aria-label="Aramayı kapat"
        className="w-8 h-8 rounded-full flex items-center justify-center text-ink-400 hover:bg-ink-50 shrink-0"
      >
        <Icon name="X" className="w-4 h-4" />
      </button>
    </div>
  )
}
