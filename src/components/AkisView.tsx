import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icon'
import { Avatar } from './Avatar'
import { AniGorseli } from './AniGorseli'
import { useSosyalSurum } from '../sosyal/cekirdek'
import { akisAnilariGetir, profilleriGetir, type AkisKapsami, type Ani } from '../sosyal/gruplar'
import { ozettenProfil, type Profil } from '../sosyal/api'
import { formatDate } from '../lib/format'

// "İnsanların ve arkadaşların paylaştıkları" — tek akış, iki kapsam:
// Arkadaşlar (bana/gruplarıma özel paylaşılanlar) ve Herkes (Keşfet).
export function AkisView() {
  const [kapsam, setKapsam] = useState<AkisKapsami>('arkadaslar')
  const [anilar, setAnilar] = useState<Ani[] | null>(null)
  const [profiller, setProfiller] = useState<Map<string, Profil>>(new Map())
  const [hata, setHata] = useState<string | null>(null)
  const sosyalSurum = useSosyalSurum()
  // The friends feed is read from the local copy, so it follows every sync;
  // Keşfet asks the relays, so it only reloads when opened.
  const surumBagimliligi = kapsam === 'arkadaslar' ? sosyalSurum : 0

  const tazele = useCallback(async () => {
    setHata(null)
    try {
      const liste = await akisAnilariGetir(kapsam)
      setAnilar(liste)
      setProfiller(await profilleriGetir(liste.map((a) => a.sahip_id)))
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Akış yüklenemedi')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kapsam, surumBagimliligi])

  useEffect(() => {
    void tazele()
  }, [tazele])

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

      <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-4 lg:pb-10 lg:grid lg:grid-cols-2 lg:gap-5 lg:space-y-0 lg:items-start">
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
            />
          ))
        )}
      </div>
    </div>
  )
}

function AkisKarti({ ani, sahip }: { ani: Ani; sahip: Profil | null }) {
  // Fotoğrafını herkese açmış ama profili kapalı biri olabilir — o zaman
  // profili okuyamayız, isim yerine nötr bir etiket gösteriyoruz.
  const ad = sahip?.ad ?? 'SharOS kullanıcısı'

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 p-3">
        <Avatar ad={ad} foto={sahip?.avatar} emoji={sahip?.emoji} renk={sahip?.renk} boyut="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-700 truncate">{ad}</p>
          {sahip?.kullanici_adi && <p className="text-xs text-ink-400 truncate">@{sahip.kullanici_adi}</p>}
        </div>
      </div>

      <div className="aspect-square bg-mist-100">
        <AniGorseli ani={ani} />
      </div>

      <div className="p-4">
        <div className="flex items-center gap-1.5">
          <Icon name="MapPin" className="w-4 h-4 text-orchid-500 shrink-0" />
          <p className="text-sm font-semibold text-ink-700 truncate">{ani.mekan_adi}</p>
        </div>
        <p className="text-xs text-ink-400 mt-0.5">{formatDate(ani.tarih) ?? ani.tarih}</p>
        {ani.notlar && <p className="text-sm text-ink-500 mt-2">{ani.notlar}</p>}
      </div>
    </div>
  )
}
