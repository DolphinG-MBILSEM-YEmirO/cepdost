import { useState } from 'react'
import { Avatar } from './Avatar'
import { EmojiSecici, RenkSecici } from './Seciciler'
import { profilGuncelle, type Profil } from '../sosyal/api'
import { PROFIL_EMOJILERI, renkAl } from '../lib/kisisellestirme'
import { useEscapeIleKapat } from '../lib/useEscapeIleKapat'

// Edits how the user appears to friends: name, a short bio, an emoji and
// an accent colour (used when there's no photo, and on the profile card).

const BIYOGRAFI_MAKS = 160

export function ProfilDuzenle({
  profil,
  onKapat,
  onKaydedildi,
}: {
  profil: Profil
  onKapat: () => void
  onKaydedildi: () => Promise<void>
}) {
  useEscapeIleKapat(onKapat)
  const [ad, setAd] = useState(profil.ad)
  const [biyografi, setBiyografi] = useState(profil.biyografi ?? '')
  const [emoji, setEmoji] = useState<string | null>(profil.emoji)
  const [renk, setRenk] = useState<string | null>(profil.renk)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  async function kaydet() {
    if (!ad.trim()) {
      setHata('Adın boş olamaz.')
      return
    }
    setKaydediliyor(true)
    setHata(null)
    try {
      await profilGuncelle({ ad: ad.trim(), biyografi: biyografi.trim() || null, emoji, renk })
      await onKaydedildi()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Kaydedilemedi')
      setKaydediliyor(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm animate-fade-in"
      onClick={onKapat}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profili düzenle"
        className="card w-full max-w-sm mx-4 mb-4 sm:mb-0 p-5 animate-slide-up max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`-mx-5 -mt-5 mb-4 px-5 pt-5 pb-4 rounded-t-3xl ${renkAl(renk, ad).zemin}`}>
          <div className="flex items-center gap-3">
            <Avatar ad={ad || '?'} foto={profil.avatar} emoji={emoji} renk={renk} boyut="lg" />
            <div className="min-w-0">
              <p className="font-display text-lg font-bold text-ink-700 truncate">{ad || 'Adın'}</p>
              {profil.kullanici_adi && <p className="text-xs text-ink-400">@{profil.kullanici_adi}</p>}
              {biyografi.trim() && <p className="text-xs text-ink-500 mt-1 line-clamp-2">{biyografi}</p>}
            </div>
          </div>
        </div>

        <label htmlFor="profil-ad" className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
          Adın
        </label>
        <input id="profil-ad" value={ad} onChange={(e) => setAd(e.target.value)} maxLength={80} className="input-field mb-4" />

        <label htmlFor="profil-bio" className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
          Hakkında
        </label>
        <textarea
          id="profil-bio"
          value={biyografi}
          onChange={(e) => setBiyografi(e.target.value.slice(0, BIYOGRAFI_MAKS))}
          rows={2}
          placeholder="Hafta sonları kahve ve yürüyüş ☕"
          className="input-field resize-none"
        />
        <p className="text-[11px] text-ink-300 text-right mb-3">
          {biyografi.length}/{BIYOGRAFI_MAKS}
        </p>

        <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">Simgen</p>
        <div className="mb-4">
          <EmojiSecici secenekler={PROFIL_EMOJILERI} secili={emoji} onSec={setEmoji} />
        </div>

        <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">Rengin</p>
        <div className="mb-4">
          <RenkSecici secili={renk} onSec={setRenk} />
        </div>

        {hata && <p className="text-sm text-rose-600 mb-3">{hata}</p>}

        <div className="flex gap-3">
          <button onClick={onKapat} disabled={kaydediliyor} className="btn-ghost flex-1 border border-ink-100">
            Vazgeç
          </button>
          <button onClick={() => void kaydet()} disabled={kaydediliyor} className="btn-primary flex-1 disabled:opacity-50">
            {kaydediliyor ? '...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}
