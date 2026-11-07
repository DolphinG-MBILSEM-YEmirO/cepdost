import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'
import { motorVarMi, motor } from '../sosyal/cekirdek'
import { akisAnilariGetir, type Ani } from '../sosyal/gruplar'
import { anidanPlan } from '../lib/planPaylasimi'
import { useGeriIleKapat } from '../lib/geriTusu'
import type { Kayit } from '../db'
import {
  indirimKoduAl,
  konumAl,
  yakinIzniniKaydet,
  yakinIzniVarMi,
  yakinOnerileriGetir,
  yolTarifiAdresi,
  type IndirimKodu,
} from '../lib/yakin'
import { mesafeMetni, puanlariTopla, type MekanOnerisi } from '../../shared/yakinMekanlar'

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
  | { tur: 'hazir'; oneriler: MekanOnerisi[] }

// The last list, so switching feeds or coming back doesn't ask the phone
// and the relays again every time.
const ONBELLEK_MS = 10 * 60_000
let onbellek: { zaman: number; oneriler: MekanOnerisi[] } | null = null

function tazeOnbellek(): MekanOnerisi[] | null {
  return onbellek && Date.now() - onbellek.zaman < ONBELLEK_MS ? onbellek.oneriler : null
}

function kategoriSimgesi(kategori: string | null): IconName {
  const k = (kategori ?? '').toLocaleLowerCase('tr-TR')
  if (/caf|coffee|kahve|tea|çay|bakery|pastane|dessert|tatlı/.test(k)) return 'Coffee'
  if (/park|garden|bahçe|beach|plaj|outdoor/.test(k)) return 'Trees'
  if (/museum|müze|gallery|historic|landmark|tarihi/.test(k)) return 'Landmark'
  if (/restaurant|restoran|food|pizza|burger|kebab|kebap|döner|breakfast|kahvaltı/.test(k)) return 'UtensilsCrossed'
  return 'MapPin'
}

export function YakinMekanlar({ anilar, onPlanAc }: Props) {
  const [durum, setDurum] = useState<Durum>(() => {
    const kayitli = yakinIzniVarMi() ? tazeOnbellek() : null
    if (kayitli) return { tur: 'hazir', oneriler: kayitli }
    return yakinIzniVarMi() ? { tur: 'yukleniyor' } : { tur: 'izin-sor' }
  })
  const [acik, setAcik] = useState<MekanOnerisi | null>(null)
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
      const oneriler = await yakinOnerileriGetir(konum, puanlar)
      onbellek = { zaman: Date.now(), oneriler }
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

function Puan({ oneri }: { oneri: MekanOnerisi }) {
  if (!oneri.puan) return <span className="text-ink-400">Henüz puan yok</span>
  return (
    <span className="flex items-center gap-0.5 text-ink-600">
      <Icon name="Star" className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
      <span className="font-semibold">{oneri.puan.ortalama.toLocaleString('tr-TR')}</span>
      <span className="text-ink-400">({oneri.puan.sayi})</span>
    </span>
  )
}

function SponsorluEtiketi() {
  return (
    <span className="inline-flex items-center rounded-full bg-ink-100 text-ink-500 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
      Sponsorlu
    </span>
  )
}

function MekanKarti({ oneri, onAc }: { oneri: MekanOnerisi; onAc: () => void }) {
  const { mekan, kampanya } = oneri
  return (
    <button
      onClick={onAc}
      className="card w-56 shrink-0 snap-start p-3.5 text-left flex flex-col gap-2 active:scale-[0.98] transition-transform"
    >
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-bolum-soluk text-bolum-koyu flex items-center justify-center shrink-0">
          <Icon name={kategoriSimgesi(mekan.kategori)} className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-700 truncate">{mekan.ad}</p>
          <p className="text-xs text-ink-400 truncate">
            {[mekan.kategori, mesafeMetni(oneri.mesafeMetre)].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <Puan oneri={oneri} />
        {kampanya && <SponsorluEtiketi />}
      </div>
      {kampanya?.indirim && (
        <p className="flex items-center gap-1 text-xs font-semibold text-teal-700 truncate">
          <Icon name="Ticket" className="w-3.5 h-3.5 shrink-0" />
          {kampanya.indirim.metin}
        </p>
      )}
    </button>
  )
}

function MekanSayfasi({
  oneri,
  onKapat,
  onPlanAc,
}: {
  oneri: MekanOnerisi
  onKapat: () => void
  onPlanAc: (kayit: Kayit) => void
}) {
  useGeriIleKapat(onKapat)
  const { mekan, kampanya } = oneri
  const [nedenAcik, setNedenAcik] = useState(false)
  const [kod, setKod] = useState<IndirimKodu | null>(null)
  const [kodHatasi, setKodHatasi] = useState<string | null>(null)
  const [kodAliniyor, setKodAliniyor] = useState(false)

  async function planYap() {
    const { kayit } = await anidanPlan(mekan.ad, null)
    onKapat()
    onPlanAc(kayit)
  }

  async function koduAl() {
    if (!kampanya || !motorVarMi()) return
    setKodAliniyor(true)
    setKodHatasi(null)
    try {
      setKod(await indirimKoduAl(kampanya.id, motor().benimId))
    } catch (err) {
      setKodHatasi(err instanceof Error ? err.message : 'Kod alınamadı.')
    } finally {
      setKodAliniyor(false)
    }
  }

  // On <body>: the feed's animated list would otherwise trap a fixed sheet
  // inside it, under the bottom bar.
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-ink-900/40 animate-fade-in" onClick={onKapat}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mekan.ad}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-mist-50 rounded-t-3xl p-5 pb-[calc(1.25rem+var(--safe-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-ink-200 mx-auto mb-4" />

        {kod ? (
          <IndirimEkrani kod={kod} onGeri={() => setKod(null)} />
        ) : (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-bolum-soluk text-bolum-koyu flex items-center justify-center shrink-0">
                <Icon name={kategoriSimgesi(mekan.kategori)} className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-ink-700 text-lg leading-tight">{mekan.ad}</h3>
                  {kampanya && <SponsorluEtiketi />}
                </div>
                <p className="text-sm text-ink-400 mt-0.5">
                  {[mekan.kategori, mesafeMetni(oneri.mesafeMetre)].filter(Boolean).join(' · ')}
                </p>
                <div className="text-sm mt-1">
                  <Puan oneri={oneri} />
                </div>
              </div>
            </div>

            {kampanya?.aciklama && <p className="text-sm text-ink-600 mb-3">{kampanya.aciklama}</p>}
            {mekan.adres && (
              <p className="flex items-start gap-2 text-sm text-ink-500 mb-4">
                <Icon name="MapPin" className="w-4 h-4 shrink-0 mt-0.5 text-ink-400" />
                {mekan.adres}
              </p>
            )}

            {kampanya?.indirim && (
              <div className="rounded-2xl bg-teal-50 border border-teal-100 p-4 mb-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-teal-800">
                  <Icon name="Ticket" className="w-4 h-4" />
                  {kampanya.indirim.metin}
                </p>
                {kampanya.indirim.kosul && <p className="text-xs text-teal-700 mt-1">{kampanya.indirim.kosul}</p>}
                <button
                  onClick={() => void koduAl()}
                  disabled={kodAliniyor}
                  className="w-full mt-3 rounded-2xl py-2.5 text-sm font-semibold bg-teal-600 text-white disabled:opacity-60 active:opacity-90"
                >
                  {kodAliniyor ? 'Kod hazırlanıyor…' : 'İndirim kodunu al'}
                </button>
                {kodHatasi && <p className="text-xs text-rose-600 mt-2">{kodHatasi}</p>}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => void planYap()} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm">
                <Icon name="CalendarPlus" className="w-4 h-4" />
                Plan yap
              </button>
              <a
                href={yolTarifiAdresi(mekan)}
                target="_blank"
                rel="noopener"
                className="btn-ghost border border-ink-100 flex-1 flex items-center justify-center gap-2 text-sm"
              >
                <Icon name="Navigation" className="w-4 h-4" />
                Yol tarifi
              </a>
            </div>

            {kampanya && (
              <div className="mt-4">
                <button
                  onClick={() => setNedenAcik((a) => !a)}
                  aria-expanded={nedenAcik}
                  className="text-xs font-medium text-ink-400 flex items-center gap-1"
                >
                  <Icon name="Info" className="w-3.5 h-3.5" />
                  Bunu neden görüyorum?
                </button>
                {nedenAcik && (
                  <p className="text-xs text-ink-400 leading-relaxed mt-1.5">
                    Bu işletme Sharloop'ta reklam veriyor ve sana yakın olduğu için gösteriliyor. Konumun ya da kim
                    olduğun işletmeyle paylaşılmaz; listede her zaman en fazla bir sponsorlu yer olur.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

// The code to show at the till. The clock ticks so a screenshot from
// another day is easy to spot.
function IndirimEkrani({ kod, onGeri }: { kod: IndirimKodu; onGeri: () => void }) {
  const [simdi, setSimdi] = useState(() => new Date())
  useEffect(() => {
    const z = setInterval(() => setSimdi(new Date()), 1000)
    return () => clearInterval(z)
  }, [])
  const saat = simdi.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' })
  const gun = simdi.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long' })

  return (
    <div className="text-center">
      <p className="text-sm text-ink-400">{kod.mekanAdi}</p>
      <p className="font-semibold text-ink-700 mt-1">{kod.indirim.metin}</p>
      <div className="my-5 rounded-3xl bg-white border-2 border-dashed border-teal-300 py-6">
        <p className="font-mono text-3xl font-bold tracking-[0.2em] text-ink-800">{kod.kod}</p>
        <p className="text-xs text-ink-400 mt-2 tabular-nums">
          {gun} · {saat}
        </p>
      </div>
      <p className="text-xs text-ink-400 leading-relaxed mb-4">
        Bu kodu kasada göster. Yalnızca bugün geçerli.
        {kod.indirim.kosul && ` ${kod.indirim.kosul}.`}
      </p>
      <button onClick={onGeri} className="btn-ghost border border-ink-100 w-full text-sm">
        Geri
      </button>
    </div>
  )
}
