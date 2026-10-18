import { useState } from 'react'
import { GrupAvatari } from './Avatar'
import { EmojiSecici, RenkSecici } from './Seciciler'
import { grupGuncelle, type Grup } from '../sosyal/gruplar'
import { GRUP_ACIKLAMA_MAKS, GRUP_EMOJILERI, renkAl } from '../lib/kisisellestirme'
import { useEscapeIleKapat } from '../lib/useEscapeIleKapat'

// Edits how a group looks to its members: name, a short description, an
// emoji and a colour. Any member can change it, like most group chats; the
// newest change wins on every device.
export function GrupDuzenle({
  grup,
  onKapat,
  onKaydedildi,
}: {
  grup: Grup
  onKapat: () => void
  onKaydedildi: () => void
}) {
  useEscapeIleKapat(onKapat)
  const [ad, setAd] = useState(grup.ad)
  const [aciklama, setAciklama] = useState(grup.aciklama ?? '')
  const [emoji, setEmoji] = useState<string | null>(grup.emoji)
  const [renk, setRenk] = useState<string | null>(grup.renk)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  async function kaydet() {
    if (!ad.trim()) {
      setHata('Grubun bir adı olmalı.')
      return
    }
    setKaydediliyor(true)
    setHata(null)
    try {
      await grupGuncelle(grup.id, { ad: ad.trim(), aciklama: aciklama.trim() || null, emoji, renk })
      onKaydedildi()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Kaydedilemedi')
      setKaydediliyor(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm animate-fade-in"
      onClick={onKapat}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Grubu düzenle"
        className="card w-full max-w-sm mx-4 mb-4 sm:mb-0 p-5 animate-slide-up max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`-mx-5 -mt-5 mb-4 px-5 pt-5 pb-4 rounded-t-3xl ${renkAl(renk, ad).zemin}`}>
          <div className="flex items-center gap-3">
            <GrupAvatari grup={{ ad: ad || '?', emoji, renk }} boyut="lg" />
            <div className="min-w-0">
              <p className="font-display text-lg font-bold text-ink-700 truncate">{ad || 'Grup adı'}</p>
              {aciklama.trim() && <p className="text-xs text-ink-500 mt-1 line-clamp-2">{aciklama}</p>}
            </div>
          </div>
        </div>

        <label htmlFor="grup-ad" className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
          Grup adı
        </label>
        <input id="grup-ad" value={ad} onChange={(e) => setAd(e.target.value)} maxLength={80} className="input-field mb-4" />

        <label htmlFor="grup-duzenle-aciklama" className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
          Açıklama
        </label>
        <input
          id="grup-duzenle-aciklama"
          value={aciklama}
          onChange={(e) => setAciklama(e.target.value)}
          maxLength={GRUP_ACIKLAMA_MAKS}
          placeholder="Cumartesi buluşmaları"
          className="input-field mb-4"
        />

        <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">Simge</p>
        <div className="mb-4">
          <EmojiSecici secenekler={GRUP_EMOJILERI} secili={emoji} onSec={setEmoji} />
        </div>

        <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">Renk</p>
        <div className="mb-4">
          <RenkSecici secili={renk} onSec={setRenk} />
        </div>

        {hata && <p className="text-sm text-rose-600 mb-3">{hata}</p>}

        <div className="flex gap-3">
          <button onClick={onKapat} disabled={kaydediliyor} className="btn-ghost flex-1 border border-ink-100/40">
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
