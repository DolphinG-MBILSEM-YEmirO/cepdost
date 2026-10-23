import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icon'
import { AkisKarti } from './AkisKarti'
import { AniYanitlari } from './AniYanitlari'
import { motor, motorVarMi, useSosyalSurum } from '../sosyal/cekirdek'
import { akisAnilariGetir, profilleriGetir, type AkisKapsami, type Ani } from '../sosyal/gruplar'
import { ozettenProfil, type Profil } from '../sosyal/api'
import { BOS_ETKILESIM, aniEtkilesimleri, gitmekIstiyorum, yanitlayanlar, type AniEtkilesimi } from '../sosyal/aniEtkilesimi'
import { anidanPlan } from '../lib/planPaylasimi'
import type { Kayit } from '../db'

// "İnsanların ve arkadaşların paylaştıkları" — tek akış, iki kapsam:
// Arkadaşlar (bana/gruplarıma özel paylaşılanlar) ve Herkes (Keşfet).
// Friends answer a memory with a reaction or a comment; anyone can say
// they want to go there too, which puts the place in their calendar.

// How long "added to your plans" stays on screen.
const EKLENDI_MS = 6000

export function AkisView({ onPlanAc }: { onPlanAc: (kayit: Kayit) => void }) {
  const [kapsam, setKapsam] = useState<AkisKapsami>('arkadaslar')
  const [anilar, setAnilar] = useState<Ani[] | null>(null)
  const [profiller, setProfiller] = useState<Map<string, Profil>>(new Map())
  const [etkilesimler, setEtkilesimler] = useState<Map<string, AniEtkilesimi>>(new Map())
  const [eklenen, setEklenen] = useState<Kayit | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const sosyalSurum = useSosyalSurum()
  const benimId = motorVarMi() ? motor().benimId : ''
  // The friends feed is read from the local copy, so it follows every sync;
  // Keşfet asks the relays, so it only reloads when opened.
  const surumBagimliligi = kapsam === 'arkadaslar' ? sosyalSurum : 0

  const tazele = useCallback(async () => {
    setHata(null)
    try {
      const liste = await akisAnilariGetir(kapsam)
      // Answers only exist on the friends feed (see aniEtkilesimi.ts).
      const yanitlar = kapsam === 'arkadaslar' ? await aniEtkilesimleri(liste) : new Map<string, AniEtkilesimi>()
      setAnilar(liste)
      setEtkilesimler(yanitlar)
      setProfiller(await profilleriGetir([...liste.map((a) => a.sahip_id), ...yanitlayanlar(yanitlar)]))
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Akış yüklenemedi')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kapsam, surumBagimliligi])

  useEffect(() => {
    void tazele()
  }, [tazele])

  useEffect(() => {
    if (!eklenen) return
    const zamanlayici = setTimeout(() => setEklenen(null), EKLENDI_MS)
    return () => clearTimeout(zamanlayici)
  }, [eklenen])

  // "Ben de gitmek istiyorum": the one who shared it hears about it (friends
  // feed only), and the place goes into my plans as an idea.
  async function gitmek(ani: Ani, istiyor: boolean) {
    if (kapsam === 'arkadaslar') await gitmekIstiyorum(ani, istiyor)
    if (!istiyor) return
    const sahip = profiller.get(ani.sahip_id)?.ad ?? ani.sahip?.ad ?? null
    setEklenen((await anidanPlan(ani.mekan_adi, sahip)).kayit)
  }

  // The one who shared it makes a plan of it, straight on the plan's page.
  async function planla(ani: Ani) {
    onPlanAc((await anidanPlan(ani.mekan_adi, null)).kayit)
  }

  function kapsamSec(yeni: AkisKapsami) {
    if (yeni === kapsam) return
    setAnilar(null)
    setKapsam(yeni)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-[calc(1rem+var(--safe-top))] pb-3">
        <h1 className="font-display text-2xl font-bold text-ink-700">Akış</h1>
        <p className="text-sm text-ink-400 mt-0.5">Paylaşılan mekanlar</p>
      </div>

      <div className="flex gap-1.5 px-5 pb-3 shrink-0">
        {([
          { id: 'arkadaslar' as const, etiket: 'Arkadaşlar', ikon: 'Users' as const },
          { id: 'herkes' as const, etiket: 'Keşfet', ikon: 'ImageIcon' as const },
        ]).map((s) => (
          <button
            key={s.id}
            onClick={() => kapsamSec(s.id)}
            className={`chip ${
              kapsam === s.id ? 'bg-gradient-orchid text-white' : 'bg-mist-50 text-ink-400 border border-ink-100'
            }`}
          >
            <Icon name={s.ikon} className="w-4 h-4" />
            {s.etiket}
          </button>
        ))}
      </div>

      {/* On a phone the last card scrolls clear of the bottom bar and the
          assistant button, so its comment box and buttons stay tappable. */}
      <div className="flex-1 overflow-y-auto px-5 pb-[calc(10.5rem+var(--safe-bottom))] space-y-4 lg:pb-10 lg:grid lg:grid-cols-2 lg:gap-5 lg:space-y-0 lg:items-start">
        {hata && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 lg:col-span-2">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        {anilar === null && !hata ? (
          <>
            <div className="skeleton h-72 rounded-3xl" />
            <div className="skeleton h-72 rounded-3xl" />
          </>
        ) : anilar && anilar.length === 0 ? (
          <div className="card p-6 text-center lg:col-span-2">
            <div className="w-14 h-14 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="ImageIcon" className="w-7 h-7 text-sky-600" />
            </div>
            <p className="font-semibold text-ink-600 mb-1">Henüz paylaşım yok</p>
            <p className="text-sm text-ink-400">
              {kapsam === 'arkadaslar'
                ? 'Arkadaşların seninle bir mekan fotoğrafı paylaştığında burada görünecek.'
                : 'Herkese açık paylaşılan mekan fotoğrafları burada görünecek.'}
            </p>
          </div>
        ) : (
          anilar?.map((a) => (
            <AkisKarti
              key={a.id}
              ani={a}
              sahip={profiller.get(a.sahip_id) ?? (a.sahip ? ozettenProfil(a.sahip_id, a.sahip) : null)}
            >
              <AniYanitlari
                ani={a}
                etkilesim={etkilesimler.get(a.id) ?? BOS_ETKILESIM}
                profiller={profiller}
                benimId={benimId}
                yanitlanabilir={kapsam === 'arkadaslar'}
                onGitmek={gitmek}
                onPlanla={planla}
              />
            </AkisKarti>
          ))
        )}
      </div>

      {eklenen && (
        <div role="status" className="fixed z-[45] inset-x-4 mx-auto max-w-sm bottom-[calc(10.5rem+var(--safe-bottom))] lg:bottom-6 animate-fade-in">
          <div className="flex items-center gap-3 rounded-2xl bg-ink-800/95 text-white shadow-float pl-4 pr-2 py-2.5">
            <Icon name="CalendarPlus" className="w-4 h-4 text-teal-300 shrink-0" />
            <span className="flex-1 text-sm leading-snug">Planlarına eklendi, günü sen seç</span>
            <button
              onClick={() => {
                onPlanAc(eklenen)
                setEklenen(null)
              }}
              className="shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-orchid-200 hover:bg-white/10 active:scale-95"
            >
              Aç
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
