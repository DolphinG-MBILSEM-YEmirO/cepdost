import { useMemo, useState } from 'react'
import { Icon } from './Icon'
import { Avatar } from './Avatar'
import { useGeriIleKapat } from '../lib/geriTusu'
import { Katman } from '../ui/Katman'
import { aramaSorgusu, eslesiyor } from '../lib/arama'
import type { Profil } from '../sosyal/api'
import { AZAMI_ETIKET } from '../sosyal/gruplar'

// Tagging people in a post: who can be tagged comes from
// useEtiketAdaylari.

// A sheet to pick who's tagged; `onKaydet` gets the chosen ids.
export function EtiketSecici({
  adaylar,
  secili,
  onKaydet,
  onKapat,
  kaydetEtiketi = 'Tamam',
}: {
  adaylar: Profil[] | null
  secili: string[]
  onKaydet: (idler: string[]) => void | Promise<void>
  onKapat: () => void
  kaydetEtiketi?: string
}) {
  useGeriIleKapat(onKapat)
  const [secim, setSecim] = useState<string[]>(secili)
  const [arama, setArama] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  const gorunenler = useMemo(() => {
    const sorgu = aramaSorgusu(arama)
    if (!adaylar || !sorgu) return adaylar
    return adaylar.filter((p) => eslesiyor(`${p.ad} ${p.kullanici_adi ?? ''}`, sorgu))
  }, [adaylar, arama])

  const dolu = secim.length >= AZAMI_ETIKET

  function degistir(id: string) {
    setSecim((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= AZAMI_ETIKET ? s : [...s, id]))
  }

  async function kaydet() {
    setKaydediliyor(true)
    setHata(null)
    try {
      await onKaydet(secim)
      onKapat()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Kaydedilemedi, tekrar dener misin?')
      setKaydediliyor(false)
    }
  }

  return (
    <Katman>
      <div className="fixed inset-0 z-[85] flex items-end justify-center bg-ink-900/40 animate-fade-in" onClick={onKapat}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Kişileri etiketle"
          className="w-full max-w-md max-h-[85vh] flex flex-col bg-mist-50 rounded-t-3xl pt-3 animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-10 h-1 rounded-full bg-ink-200 mx-auto mb-3 shrink-0" />
          <div className="px-4 shrink-0">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h3 className="font-semibold text-ink-700">Kişileri etiketle</h3>
              <span className="text-xs text-ink-400 tabular-nums">
                {secim.length}/{AZAMI_ETIKET}
              </span>
            </div>
            <p className="text-xs text-ink-400 mb-3">Etiketlediğin kişilere haber gider; yalnızca paylaşımı görebilenler etiketlenebilir.</p>
            <div className="relative mb-2">
              <Icon name="Search" className="w-4 h-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                value={arama}
                onChange={(e) => setArama(e.target.value)}
                placeholder="İsim ya da @kullanıcı adı"
                aria-label="Kişi ara"
                className="input-field pl-9 py-2.5 text-sm"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2">
            {gorunenler === null ? (
              <div className="space-y-2 py-1">
                <div className="skeleton h-12 rounded-2xl" />
                <div className="skeleton h-12 rounded-2xl" />
              </div>
            ) : gorunenler.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-6">
                {adaylar?.length ? 'Bu isimde biri yok.' : 'Etiketleyebileceğin kimse yok. Önce arkadaş ekle.'}
              </p>
            ) : (
              <ul className="space-y-1" aria-label="Etiketlenebilecek kişiler">
                {gorunenler.map((p) => {
                  const secildi = secim.includes(p.id)
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={secildi}
                        disabled={!secildi && dolu}
                        onClick={() => degistir(p.id)}
                        className={`w-full flex items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                          secildi ? 'bg-bolum-soluk' : 'hover:bg-white'
                        }`}
                      >
                        <Avatar ad={p.ad} foto={p.avatar} emoji={p.emoji} renk={p.renk} boyut="sm" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-ink-700 truncate">{p.ad}</span>
                          {p.kullanici_adi && <span className="block text-xs text-ink-400 truncate">@{p.kullanici_adi}</span>}
                        </span>
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
                            secildi ? 'bg-bolum text-white scale-100' : 'border-2 border-ink-200 scale-90'
                          }`}
                          aria-hidden="true"
                        >
                          {secildi && <Icon name="Check" className="w-3.5 h-3.5" />}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="px-4 pt-2 pb-[calc(1rem+var(--safe-bottom))] shrink-0 border-t border-ink-100">
            {hata && <p className="text-xs text-rose-600 mb-2">{hata}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onKapat} className="btn-ghost flex-1 border border-ink-100">
                Vazgeç
              </button>
              <button type="button" onClick={() => void kaydet()} disabled={kaydediliyor} className="btn-primary flex-1">
                {kaydediliyor ? 'Kaydediliyor…' : kaydetEtiketi}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Katman>
  )
}
