import { useState } from 'react'
import { Icon } from './Icon'
import { Avatar } from './Avatar'
import { useGeriIleKapat } from '../lib/geriTusu'
import { arkadaslikIsteGonder, arkadaslikYanitla, type Arkadas } from '../sosyal/api'
import type { GrupUyesi } from '../sosyal/gruplar'
import { UYGULAMA_ADI } from '../../shared/marka'

// A group member who isn't my friend: who they are, from the card they keep
// in the group, and a friend request (or accepting theirs). Friends open
// their full profile instead.

interface Props {
  uye: GrupUyesi
  grupAdi: string
  // A pending request between us, either way.
  iliski: Arkadas | null
  onKapat: () => void
}

export function GrupUyesiKarti({ uye, grupAdi, iliski, onKapat }: Props) {
  useGeriIleKapat(onKapat)
  const [durum, setDurum] = useState<'gonderildi' | 'arkadas' | null>(null)
  const [isleniyor, setIsleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const profil = uye.profil
  const ad = profil?.ad ?? `${UYGULAMA_ADI} kullanıcısı`
  const istegimVar = durum === 'gonderildi' || (iliski?.durum === 'bekliyor' && iliski.yon === 'giden')
  const istekGeldi = !durum && iliski?.durum === 'bekliyor' && iliski.yon === 'gelen'

  async function calistir(is: () => Promise<void>, sonra: 'gonderildi' | 'arkadas') {
    setIsleniyor(true)
    setHata(null)
    try {
      await is()
      setDurum(sonra)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Olmadı, tekrar dener misin?')
    } finally {
      setIsleniyor(false)
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
        aria-label={ad}
        className="card w-full max-w-sm mx-4 mb-4 sm:mb-0 p-5 animate-slide-up text-center relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onKapat}
          aria-label="Kapat"
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-ink-50 flex items-center justify-center active:scale-90 transition-transform"
        >
          <Icon name="X" className="w-4 h-4 text-ink-500" />
        </button>

        <div className="flex justify-center mb-3">
          <Avatar ad={ad} foto={profil?.avatar} emoji={profil?.emoji} renk={profil?.renk} boyut="lg" />
        </div>
        <h3 className="font-display text-lg font-bold text-ink-700 break-words">{ad}</h3>
        {profil?.kullanici_adi && <p className="text-sm text-ink-400">@{profil.kullanici_adi}</p>}
        <p className="text-xs text-ink-400 mt-1">
          {grupAdi} grubunda {uye.rol === 'yonetici' ? 'yönetici' : 'üye'}
        </p>
        {profil?.biyografi && <p className="text-sm text-ink-500 mt-3 whitespace-pre-line break-words">{profil.biyografi}</p>}

        <div className="mt-5">
          {durum === 'arkadas' ? (
            <p className="chip mx-auto bg-teal-50 text-teal-700 border border-teal-100">
              <Icon name="Check" className="w-4 h-4" />
              Artık arkadaşsınız
            </p>
          ) : istegimVar ? (
            <p className="chip mx-auto bg-mist-100 text-ink-500 border border-ink-100">
              <Icon name="Check" className="w-4 h-4" />
              Arkadaşlık isteğin gönderildi
            </p>
          ) : istekGeldi ? (
            <button
              onClick={() => void calistir(() => arkadaslikYanitla(uye.kullanici_id, true), 'arkadas')}
              disabled={isleniyor}
              className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-3 disabled:opacity-50"
            >
              <Icon name="UserPlus" className="w-4 h-4" />
              İsteğini kabul et
            </button>
          ) : (
            <button
              onClick={() =>
                void calistir(
                  () =>
                    arkadaslikIsteGonder(uye.kullanici_id, {
                      id: uye.kullanici_id,
                      ad,
                      kullanici_adi: profil?.kullanici_adi ?? null,
                      arkadas_kodu: profil?.arkadas_kodu ?? '',
                      avatar: profil?.avatar ?? null,
                    }),
                  'gonderildi',
                )
              }
              disabled={isleniyor}
              className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-3 disabled:opacity-50"
            >
              <Icon name="UserPlus" className="w-4 h-4" />
              Arkadaş ekle
            </button>
          )}
          {!durum && !istegimVar && (
            <p className="text-xs text-ink-400 mt-2">Arkadaş olunca profilini, müsaitliğini ve anılarınızı görürsün.</p>
          )}
          {hata && <p className="text-xs text-rose-600 mt-2">{hata}</p>}
        </div>
      </div>
    </div>
  )
}
