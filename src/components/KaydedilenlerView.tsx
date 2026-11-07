import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icon'
import { AniGorseli } from './AniGorseli'
import { AniPenceresi } from './AniPenceresi'
import type { PaylasimOlayi } from './AkisKarti'
import { BosDurum } from '../ui/BosDurum'
import { SegmentedControl } from '../ui/SegmentedControl'
import { motor, motorVarMi, useSosyalSurum } from '../sosyal/cekirdek'
import { arsivdekiPaylasimlarim, profilleriGetir, type Ani } from '../sosyal/gruplar'
import { aniEtkilesimleri, yanitlayanlar, type AniEtkilesimi } from '../sosyal/aniEtkilesimi'
import { kayitliPaylasimlar, listeyeKoy, type KayitliPaylasim } from '../sosyal/kaydedilenler'
import type { Profil } from '../sosyal/api'
import { anidanPlan } from '../lib/planPaylasimi'
import { formatDate } from '../lib/format'
import type { Kayit } from '../db'

// Profil → Kaydedilen: the posts I saved, the places I want to go to
// (from "Ben de gitmek istiyorum" or the feed), and my archived posts.
// Only I see any of it.

type Bolum = 'kaydedilen' | 'gitmek' | 'arsiv'

interface Icerik {
  // Saved and want-to-go entries; my archived posts come as plain entries.
  liste: KayitliPaylasim[]
  etkilesimler: Map<string, AniEtkilesimi>
  profiller: Map<string, Profil>
}

async function bolumuOku(bolum: Bolum): Promise<Icerik> {
  const liste =
    bolum === 'arsiv'
      ? (await arsivdekiPaylasimlarim()).map((ani) => ({ ani, zaman: Date.parse(ani.olusturulma), kaldirildi: false }))
      : await kayitliPaylasimlar(bolum === 'kaydedilen' ? 'kaydedilen' : 'gitmek-listesi')
  const anilar = liste.filter((k) => !k.kaldirildi).map((k) => k.ani)
  const etkilesimler = await aniEtkilesimleri(anilar)
  const profiller = await profilleriGetir([
    ...anilar.map((a) => a.sahip_id),
    ...anilar.flatMap((a) => a.etiketler),
    ...yanitlayanlar(etkilesimler),
  ])
  return { liste, etkilesimler, profiller }
}

export function KaydedilenlerView({ onRecordClick }: { onRecordClick: (kayit: Kayit) => void }) {
  const [bolum, setBolum] = useState<Bolum>('kaydedilen')
  const [icerik, setIcerik] = useState<{ bolum: Bolum; veri: Icerik } | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [acikId, setAcikId] = useState<string | null>(null)
  const sosyalSurum = useSosyalSurum()
  const benimId = motorVarMi() ? motor().benimId : ''

  const tazele = useCallback(async () => {
    if (!motorVarMi()) return
    try {
      const veri = await bolumuOku(bolum)
      setIcerik({ bolum, veri })
      setHata(null)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Yüklenemedi')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bolum, sosyalSurum])

  useEffect(() => {
    void tazele()
  }, [tazele])

  const veri = icerik?.bolum === bolum ? icerik.veri : null
  const gorunenler = veri?.liste.filter((k) => !k.kaldirildi).map((k) => k.ani) ?? []

  async function cikar(k: KayitliPaylasim) {
    try {
      await listeyeKoy(bolum === 'kaydedilen' ? 'kaydedilen' : 'gitmek-listesi', k.ani, false)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Çıkarılamadı')
    }
  }

  async function planla(ani: Ani) {
    const sahip = veri?.profiller.get(ani.sahip_id)?.ad ?? ani.sahip?.ad ?? null
    onRecordClick((await anidanPlan(ani.mekan_adi, ani.sahip_id === benimId ? null : sahip)).kayit)
  }

  function degisti(olay: PaylasimOlayi) {
    // The open post left this list (deleted, or out of the archive).
    if (olay.tur !== 'guncellendi') setAcikId(null)
    void tazele()
  }

  return (
    <div className="h-full overflow-y-auto px-4 pb-[calc(10.5rem+var(--safe-bottom))] lg:pb-10">
      <div className="max-w-2xl mx-auto pt-1">
        <SegmentedControl
          etiket="Kaydedilenler bölümleri"
          secili={bolum}
          onSec={(b) => {
            setBolum(b)
            setAcikId(null)
          }}
          segmentler={[
            { id: 'kaydedilen', etiket: 'Kaydedilen', ikon: 'Bookmark' },
            { id: 'gitmek', etiket: 'Gidilecek', ikon: 'MapPin' },
            { id: 'arsiv', etiket: 'Arşivlenen', ikon: 'Archive' },
          ]}
        />

        {hata && (
          <div className="flex items-start gap-2 bg-white border border-rose-200 rounded-xl px-4 py-3 mt-4">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        <div key={bolum} className="mt-4 animate-gecis">
          {veri === null ? (
            <div className="grid grid-cols-3 gap-1.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton aspect-square rounded-2xl" />
              ))}
            </div>
          ) : veri.liste.length === 0 ? (
            <div className="card">
              <BosDurum
                sikisik
                ikon={bolum === 'kaydedilen' ? 'Bookmark' : bolum === 'gitmek' ? 'MapPin' : 'Archive'}
                baslik={bolum === 'kaydedilen' ? 'Kaydettiğin paylaşım yok' : bolum === 'gitmek' ? 'Listen boş' : 'Arşivin boş'}
                aciklama={
                  bolum === 'kaydedilen'
                    ? 'Akışta bir paylaşımın altındaki kaydet simgesine dokun; burada durur, yalnızca sen görürsün.'
                    : bolum === 'gitmek'
                      ? 'Bir paylaşımda “Ben de gitmek istiyorum”a dokun; mekan buraya gelir, istediğin gün plan yaparsın.'
                      : 'Bir paylaşımını ⋯ menüsünden arşivlersen akıştan kalkar ve burada yalnızca sen görürsün.'
                }
              />
            </div>
          ) : bolum === 'gitmek' ? (
            <ul className="space-y-2.5 kademeli" aria-label="Gitmek istediklerim">
              {veri.liste.map((k) => (
                <GitmekSatiri
                  key={k.ani.id}
                  kayit={k}
                  paylasan={k.ani.sahip_id === benimId ? 'Sen' : (veri.profiller.get(k.ani.sahip_id)?.ad ?? k.ani.sahip?.ad ?? null)}
                  onAc={() => setAcikId(k.ani.id)}
                  onPlanla={() => void planla(k.ani)}
                  onCikar={() => void cikar(k)}
                />
              ))}
            </ul>
          ) : (
            <ul className="grid grid-cols-3 gap-1.5 kademeli" aria-label={bolum === 'arsiv' ? 'Arşivlediklerim' : 'Kaydettiklerim'}>
              {veri.liste.map((k) => (
                <li key={k.ani.id} className="relative aspect-square rounded-2xl overflow-hidden bg-mist-100">
                  {k.kaldirildi ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2 text-center">
                      <Icon name="EyeOff" className="w-5 h-5 text-ink-300" />
                      <span className="text-[11px] text-ink-400 leading-tight">Artık görünmüyor</span>
                      <button onClick={() => void cikar(k)} className="text-[11px] font-semibold text-bolum-koyu mt-0.5">
                        Kaldır
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAcikId(k.ani.id)}
                      aria-label={k.ani.mekan_adi}
                      className="group w-full h-full block"
                    >
                      <span className="block w-full h-full transition-transform duration-300 group-hover:scale-105">
                        <AniGorseli ani={k.ani} />
                      </span>
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-900/70 to-transparent px-2 pt-6 pb-1.5 text-left">
                        <span className="block text-[11px] font-semibold text-white truncate">{k.ani.mekan_adi}</span>
                      </span>
                      {k.ani.medya.length > 1 && (
                        <Icon name="Copy" className="absolute top-1.5 right-1.5 w-4 h-4 text-white drop-shadow" />
                      )}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {acikId && veri && gorunenler.some((a) => a.id === acikId) && (
        <AniPenceresi
          anilar={gorunenler}
          baslangicId={acikId}
          baslik={bolum === 'kaydedilen' ? 'Kaydettiklerim' : bolum === 'gitmek' ? 'Gitmek istediklerim' : 'Arşivlediklerim'}
          etkilesimler={veri.etkilesimler}
          profiller={veri.profiller}
          benimId={benimId}
          onKapat={() => setAcikId(null)}
          onDegisti={degisti}
        />
      )}
    </div>
  )
}

function GitmekSatiri({
  kayit,
  paylasan,
  onAc,
  onPlanla,
  onCikar,
}: {
  kayit: KayitliPaylasim
  paylasan: string | null
  onAc: () => void
  onPlanla: () => void
  onCikar: () => void
}) {
  const { ani, kaldirildi } = kayit
  return (
    <li className="card flex items-center gap-3 p-2.5">
      <button
        type="button"
        onClick={onAc}
        disabled={kaldirildi}
        aria-label={`${ani.mekan_adi} paylaşımını aç`}
        className="w-16 h-16 rounded-2xl overflow-hidden bg-mist-100 shrink-0 disabled:opacity-60"
      >
        {kaldirildi ? (
          <span className="w-full h-full flex items-center justify-center">
            <Icon name="MapPin" className="w-6 h-6 text-ink-300" />
          </span>
        ) : (
          <AniGorseli ani={ani} />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink-800 truncate">{ani.mekan_adi}</p>
        <p className="text-xs text-ink-400 truncate">
          {kaldirildi
            ? 'Paylaşım kalktı, mekan listende duruyor'
            : [paylasan && `${paylasan} paylaştı`, formatDate(ani.tarih)].filter(Boolean).join(' · ')}
        </p>
        <div className="flex gap-1.5 mt-1.5">
          <button onClick={onPlanla} className="chip text-xs py-1 bg-bolum text-white shadow-glow active:opacity-80">
            <Icon name="CalendarPlus" className="w-3.5 h-3.5" />
            Plan yap
          </button>
          <button onClick={onCikar} className="chip text-xs py-1 bg-white text-ink-500 border border-ink-200 active:opacity-80">
            <Icon name="X" className="w-3.5 h-3.5" />
            Çıkar
          </button>
        </div>
      </div>
    </li>
  )
}
