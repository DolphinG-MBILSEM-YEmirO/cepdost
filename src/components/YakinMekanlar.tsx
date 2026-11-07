import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { MekanSayfasi, MekanPuani, MekanSimgesi, SponsorluEtiketi } from './MekanSayfasi'
import { motorVarMi } from '../sosyal/cekirdek'
import { akisAnilariGetir, type Ani } from '../sosyal/gruplar'
import { yakindakiIsletmeler } from '../sosyal/isletme'
import type { Kayit } from '../db'
import {
  konumAl,
  tazeOnbellek,
  yakinIzniniKaydet,
  yakinIzniVarMi,
  yakinOnbellegeYaz,
  yakinOnerileriGetir,
  type YakinOneri,
} from '../lib/yakin'
import { mesafeMetni, puanlariTopla } from '../../shared/yakinMekanlar'
import { LOOPPOINT_ADI, ziyaretKazanci } from '../../shared/looppoint'

// "Yakınında" in the feed: places near the person, best rated first, with
// at most one labelled sponsored place (shared/yakinMekanlar.ts). Location
// is asked for only when the person taps "Konumumu kullan"; after that the
// strip loads by itself on this device.

interface Props {
  // Posts already on screen; their stars count towards the ratings too.
  anilar: Ani[]
  onPlanAc: (kayit: Kayit) => void
}

type Durum =
  | { tur: 'izin-sor' }
  | { tur: 'yukleniyor' }
  | { tur: 'hata'; mesaj: string }
  | { tur: 'hazir'; oneriler: YakinOneri[] }

export function YakinMekanlar({ anilar, onPlanAc }: Props) {
  const [durum, setDurum] = useState<Durum>(() => {
    const kayitli = yakinIzniVarMi() ? tazeOnbellek() : null
    if (kayitli) return { tur: 'hazir', oneriler: kayitli }
    return yakinIzniVarMi() ? { tur: 'yukleniyor' } : { tur: 'izin-sor' }
  })
  const [acik, setAcik] = useState<YakinOneri | null>(null)
  // The latest posts, read when the strip loads (not a reason to reload).
  const anilarRef = useRef(anilar)
  useEffect(() => {
    anilarRef.current = anilar
  }, [anilar])

  const yukle = useCallback(async () => {
    setDurum({ tur: 'yukleniyor' })
    const konum = await konumAl()
    if (konum === 'izin-yok') {
      yakinIzniniKaydet(false)
      setDurum({ tur: 'hata', mesaj: 'Konum izni kapalı. Telefonun ayarlarından Sharloop için konuma izin verebilirsin.' })
      return
    }
    if (konum === 'bulunamadi') {
      setDurum({ tur: 'hata', mesaj: 'Konumun bulunamadı. Biraz sonra tekrar dene.' })
      return
    }
    yakinIzniniKaydet(true)
    try {
      // Public posts' stars rate places too, whichever feed is open.
      const kesfet = motorVarMi() ? await akisAnilariGetir('herkes').catch(() => []) : []
      const puanlar = puanlariTopla([...anilarRef.current, ...kesfet])
      // Businesses' own profiles (photos, contact, discount) near here.
      const isletmeler = motorVarMi() ? await yakindakiIsletmeler(konum).catch(() => []) : []
      const oneriler = await yakinOnerileriGetir(konum, puanlar, isletmeler)
      yakinOnbellegeYaz(oneriler)
      setDurum({ tur: 'hazir', oneriler })
    } catch (err) {
      setDurum({ tur: 'hata', mesaj: err instanceof Error ? err.message : 'Yakındaki yerler yüklenemedi.' })
    }
  }, [])

  useEffect(() => {
    if (yakinIzniVarMi() && !tazeOnbellek()) void yukle()
  }, [yukle])

  return (
    <section aria-label="Yakınındaki yerler" className="lg:col-span-2">
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-sm font-semibold text-ink-700 flex items-center gap-1.5">
          <Icon name="MapPin" className="w-4 h-4 text-bolum-koyu" />
          Yakınında
        </h2>
        {durum.tur === 'hazir' && (
          <button onClick={() => void yukle()} className="text-xs font-medium text-ink-400 flex items-center gap-1">
            <Icon name="RefreshCw" className="w-3.5 h-3.5" />
            Yenile
          </button>
        )}
      </div>

      {durum.tur === 'izin-sor' && (
        <div className="card p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-bolum-soluk text-bolum-koyu flex items-center justify-center shrink-0">
            <Icon name="LocateFixed" className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink-700">Yakınındaki güzel yerleri gör</p>
            <p className="text-xs text-ink-400 mt-0.5 leading-relaxed">
              Sharloop'taki puanlara göre sıralanır. Konumun yaklaşık olarak kullanılır, kaydedilmez.
            </p>
            <button onClick={() => void yukle()} className="btn-primary mt-3 text-sm py-2 px-4">
              Konumumu kullan
            </button>
          </div>
        </div>
      )}

      {durum.tur === 'yukleniyor' && (
        <div className="flex gap-3 overflow-hidden">
          <div className="skeleton h-28 w-56 rounded-2xl shrink-0" />
          <div className="skeleton h-28 w-56 rounded-2xl shrink-0" />
        </div>
      )}

      {durum.tur === 'hata' && (
        <div className="card p-4 flex items-start gap-3">
          <Icon name="AlertCircle" className="w-5 h-5 text-ink-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-ink-500">{durum.mesaj}</p>
            <button onClick={() => void yukle()} className="text-sm font-semibold text-bolum-koyu mt-2">
              Tekrar dene
            </button>
          </div>
        </div>
      )}

      {durum.tur === 'hazir' &&
        (durum.oneriler.length === 0 ? (
          <p className="card p-4 text-sm text-ink-400">Yakınında henüz önerecek bir yer bulamadık.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1 snap-x">
            {durum.oneriler.map((o) => (
              <MekanKarti key={o.mekan.id} oneri={o} onAc={() => setAcik(o)} />
            ))}
          </div>
        ))}

      {acik && <MekanSayfasi oneri={acik} onKapat={() => setAcik(null)} onPlanAc={onPlanAc} />}
    </section>
  )
}

function MekanKarti({ oneri, onAc }: { oneri: YakinOneri; onAc: () => void }) {
  const { mekan, kampanya } = oneri
  return (
    <button
      onClick={onAc}
      className="card w-56 shrink-0 snap-start p-3.5 text-left flex flex-col gap-2 active:scale-[0.98] transition-transform"
    >
      <div className="flex items-start gap-2.5">
        <MekanSimgesi oneri={oneri} boyut="kucuk" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-700 truncate">{mekan.ad}</p>
          <p className="text-xs text-ink-400 truncate">
            {[mekan.kategori, mesafeMetni(oneri.mesafeMetre)].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <MekanPuani oneri={oneri} />
        {kampanya && <SponsorluEtiketi />}
      </div>
      {oneri.isletme?.indirim && (
        <p className="flex items-center gap-1 text-xs font-semibold text-teal-700 truncate">
          <Icon name="Ticket" className="w-3.5 h-3.5 shrink-0" />
          {oneri.isletme.indirim.metin}
        </p>
      )}
      {/* Sponsored places with a till suggest a plan that earns points. */}
      {kampanya && oneri.isletme && (oneri.isletme.indirim || oneri.isletme.oduller.length > 0) && (
        <p className="flex items-center gap-1 text-xs font-semibold text-amber-700 truncate">
          <Icon name="Star" className="w-3.5 h-3.5 shrink-0" />
          Plan yap, git: +{ziyaretKazanci({ oneCikan: true, plan: true }).puan} {LOOPPOINT_ADI}
        </p>
      )}
    </button>
  )
}
