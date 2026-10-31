import { useCallback, useMemo, useState } from 'react'
import { Icon } from './Icon'
import { AniGorseli } from './AniGorseli'
import { AniEkleModal } from './AniArsivi'
import { AniPenceresi } from './AniPenceresi'
import { useArsivAnilari } from './useArsivAnilari'
import { motor, motorVarMi } from '../sosyal/cekirdek'
import { adListesi } from '../sosyal/adlar'
import { aniSahipleri, planAnilari } from '../lib/planAnilari'

// On a past plan's page, done together with a group or a friend: the
// photos from that day in their archive and who added them, and a way to
// add one. With none yet, it asks how it went. A photo opens large, with
// its reactions and comments.

interface Props {
  grupId?: string | null
  arkadasId?: string | null
  tarih: string | null
  konum?: string | null
  // The plan's title, shown over an opened photo.
  planBasligi: string
  // Whose archive a new photo goes to: the group's or the friend's name.
  hedefAdi: string
  onEklendi?: () => Promise<void> | void
}

export function PlanAnilariKarti({ grupId, arkadasId, tarih, konum, planBasligi, hedefAdi, onEklendi }: Props) {
  // Photos and answers friends add show up after the next sync.
  const { arsiv, ulasilamaz, tazele } = useArsivAnilari(grupId, arkadasId)
  const [acikId, setAcikId] = useState<string | null>(null)
  const [ekleAcik, setEkleAcik] = useState(false)
  const benimId = motorVarMi() ? motor().benimId : ''
  const anilar = useMemo(() => (arsiv ? planAnilari(arsiv.anilar, { tarih, konum }) : []), [arsiv, tarih, konum])

  const kapat = useCallback(() => setAcikId(null), [])

  // The archive can't be read (say, no longer friends): nothing to show or add.
  if (ulasilamaz) return null
  if (!arsiv) return <div className="skeleton h-40 rounded-3xl mb-4" />

  const ekleyenler = adListesi(aniSahipleri(anilar), arsiv.profiller, benimId)

  return (
    <>
      {anilar.length === 0 ? (
        <div className="card p-4 mb-4 bg-brand-50/70 border-brand-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-ink-50 flex items-center justify-center shrink-0">
              <Icon name="Camera" className="w-5 h-5 text-ink-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink-700">Nasıl geçti?</p>
              <p className="text-xs text-ink-500 mt-0.5">Bir fotoğraf ekle, {hedefAdi} arşivinde kalsın.</p>
              <button onClick={() => setEkleAcik(true)} className="mt-3 chip bg-brand-600 text-white">
                <Icon name="ImageIcon" className="w-4 h-4" />
                Fotoğraf ekle
              </button>
            </div>
          </div>
        </div>
      ) : (
        <section className="card p-5 mb-4" aria-label="O günden anılar">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <p className="text-label text-ink-500">O günden anılar</p>
                <span className="text-xs text-ink-400">{anilar.length}</span>
              </div>
              <p className="text-xs text-ink-500 mt-1">{ekleyenler} ekledi</p>
            </div>
            <button
              onClick={() => setEkleAcik(true)}
              className="chip text-xs bg-brand-50 text-brand-700 border border-brand-100 shrink-0 active:opacity-80"
            >
              <Icon name="Plus" className="w-3.5 h-3.5" />
              Anı ekle
            </button>
          </div>

          <ul className="flex gap-2 mt-3 -mx-1 px-1 overflow-x-auto no-scrollbar">
            {anilar.map((a) => {
              const e = arsiv.etkilesimler.get(a.id)
              const yanit = (e?.tepkiler.length ?? 0) + (e?.yorumlar.length ?? 0)
              const kim = a.sahip_id === benimId ? 'Sen' : (arsiv.profiller.get(a.sahip_id)?.ad ?? 'Bir arkadaşın')
              return (
                <li key={a.id} className="shrink-0">
                  <button
                    onClick={() => setAcikId(a.id)}
                    aria-label={`${a.mekan_adi}, ${kim}${yanit ? `, ${yanit} yanıt` : ''}`}
                    className="relative block w-24 h-24 rounded-2xl overflow-hidden bg-mist-100 active:opacity-80 transition-transform"
                  >
                    <AniGorseli ani={a} />
                    {yanit > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-1.5 right-1.5 rounded-full bg-ink-900/55 text-white text-[11px] font-semibold px-1.5 py-0.5 flex items-center gap-0.5"
                      >
                        <Icon name="MessageCircle" className="w-3 h-3" />
                        {yanit}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {acikId && (
        <AniPenceresi
          anilar={anilar}
          baslangicId={acikId}
          baslik={planBasligi}
          etkilesimler={arsiv.etkilesimler}
          profiller={arsiv.profiller}
          benimId={benimId}
          onKapat={kapat}
        />
      )}

      {ekleAcik && (
        <AniEkleModal
          grupId={grupId}
          arkadasId={arkadasId}
          hedefAdi={hedefAdi}
          baslangicMekan={konum}
          baslangicTarih={tarih}
          onClose={() => setEkleAcik(false)}
          onEklendi={async () => {
            setEkleAcik(false)
            await tazele()
            await onEklendi?.()
          }}
        />
      )}
    </>
  )
}
