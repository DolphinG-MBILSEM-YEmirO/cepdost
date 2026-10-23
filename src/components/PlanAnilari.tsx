import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icon'
import { AniGorseli } from './AniGorseli'
import { AniEkleModal } from './AniArsivi'
import { AniPenceresi } from './AniPenceresi'
import { motor, motorVarMi, useSosyalSurum } from '../sosyal/cekirdek'
import { anilariGetir, profilleriGetir, type Ani } from '../sosyal/gruplar'
import { aniEtkilesimleri, yanitlayanlar, type AniEtkilesimi } from '../sosyal/aniEtkilesimi'
import type { Profil } from '../sosyal/api'
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

interface Durum {
  anilar: Ani[]
  etkilesimler: Map<string, AniEtkilesimi>
  profiller: Map<string, Profil>
}

export function PlanAnilariKarti({ grupId, arkadasId, tarih, konum, planBasligi, hedefAdi, onEklendi }: Props) {
  const [durum, setDurum] = useState<Durum | null>(null)
  // The archive can't be read (say, no longer friends): nothing to show or add.
  const [ulasilamaz, setUlasilamaz] = useState(false)
  const [acikId, setAcikId] = useState<string | null>(null)
  const [ekleAcik, setEkleAcik] = useState(false)
  // Photos and answers friends add show up after the next sync.
  const sosyalSurum = useSosyalSurum()
  const benimId = motorVarMi() ? motor().benimId : ''

  const tazele = useCallback(async () => {
    try {
      const anilar = planAnilari(await anilariGetir({ grupId, arkadasId }), { tarih, konum })
      const etkilesimler = await aniEtkilesimleri(anilar)
      const profiller = await profilleriGetir([...anilar.map((a) => a.sahip_id), ...yanitlayanlar(etkilesimler)])
      setDurum({ anilar, etkilesimler, profiller })
      setUlasilamaz(false)
    } catch {
      setUlasilamaz(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupId, arkadasId, tarih, konum, sosyalSurum])

  useEffect(() => {
    void tazele()
  }, [tazele])

  const kapat = useCallback(() => setAcikId(null), [])

  if (ulasilamaz) return null
  if (!durum) return <div className="skeleton h-40 rounded-3xl mb-4" />

  const { anilar } = durum
  const ekleyenler = adListesi(aniSahipleri(anilar), durum.profiller, benimId)

  return (
    <>
      {anilar.length === 0 ? (
        <div className="card p-4 mb-4 bg-orchid-50/70 border-orchid-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-orchid-100 flex items-center justify-center shrink-0">
              <Icon name="Camera" className="w-5 h-5 text-orchid-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink-700">Nasıl geçti?</p>
              <p className="text-xs text-ink-500 mt-0.5">Bir fotoğraf ekle, {hedefAdi} arşivinde kalsın.</p>
              <button onClick={() => setEkleAcik(true)} className="mt-3 chip bg-gradient-orchid text-white">
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
                <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">O günden anılar</p>
                <span className="text-xs text-ink-300">{anilar.length}</span>
              </div>
              <p className="text-xs text-ink-500 mt-1">{ekleyenler} ekledi</p>
            </div>
            <button
              onClick={() => setEkleAcik(true)}
              className="chip text-xs bg-orchid-50 text-orchid-700 border border-orchid-100 shrink-0 active:scale-95"
            >
              <Icon name="Plus" className="w-3.5 h-3.5" />
              Anı ekle
            </button>
          </div>

          <ul className="flex gap-2 mt-3 -mx-1 px-1 overflow-x-auto no-scrollbar">
            {anilar.map((a) => {
              const e = durum.etkilesimler.get(a.id)
              const yanit = (e?.tepkiler.length ?? 0) + (e?.yorumlar.length ?? 0)
              const kim = a.sahip_id === benimId ? 'Sen' : (durum.profiller.get(a.sahip_id)?.ad ?? 'Bir arkadaşın')
              return (
                <li key={a.id} className="shrink-0">
                  <button
                    onClick={() => setAcikId(a.id)}
                    aria-label={`${a.mekan_adi}, ${kim}${yanit ? `, ${yanit} yanıt` : ''}`}
                    className="relative block w-24 h-24 rounded-2xl overflow-hidden bg-mist-100 active:scale-95 transition-transform"
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
          etkilesimler={durum.etkilesimler}
          profiller={durum.profiller}
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
