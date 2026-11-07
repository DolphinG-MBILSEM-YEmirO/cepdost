import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import qrcode from 'qrcode-generator'
import { Icon, type IconName } from './Icon'
import { motor, motorVarMi } from '../sosyal/cekirdek'
import { isletmeFotoUrl, type IsletmeFotosu, type IsletmeProfili } from '../sosyal/isletme'
import { planIsaretleri, useSharpoint } from '../sosyal/sharpoint'
import { PlanOlustur, type Kapsam } from './PlanOlustur'
import { anidanPlan } from '../lib/planPaylasimi'
import { useGeriAdimi, useGeriIleKapat } from '../lib/geriTusu'
import { googleAdresi, indirimKoduAl, yolTarifiAdresi, type IndirimKodu, type YakinOneri } from '../lib/yakin'
import type { Kayit } from '../db'
import { mesafeMetni, yetiskinMi } from '../../shared/yakinMekanlar'
import { PUANLAR, SHARPOINT_ADI, ziyaretKazanci, type IsletmeOdulu } from '../../shared/sharpoint'

// A place's page, opened from the feed's "Yakınında": the business's own
// photos, description, hours and contact when it has a profile; its Google
// Maps page for reviews and more photos; directions, a plan, and the
// business's discount with a code and QR to show at the till. Sponsored
// places also suggest a plan, alone or with friends, that earns SharPoint
// when the till scans the QR, and businesses' rewards can be spent here.

export function kategoriSimgesi(kategori: string | null): IconName {
  const k = (kategori ?? '').toLocaleLowerCase('tr-TR')
  if (/caf|coffee|kahve|tea|çay|bakery|pastane|dessert|tatlı/.test(k)) return 'Coffee'
  if (/park|garden|bahçe|beach|plaj|outdoor/.test(k)) return 'Trees'
  if (/museum|müze|gallery|historic|landmark|tarihi/.test(k)) return 'Landmark'
  if (/restaurant|restoran|food|pizza|burger|kebab|kebap|döner|breakfast|kahvaltı/.test(k)) return 'UtensilsCrossed'
  return 'MapPin'
}

export function MekanPuani({ oneri }: { oneri: YakinOneri }) {
  if (!oneri.puan) return <span className="text-ink-400">Sharloop'ta henüz puan yok</span>
  return (
    <span className="flex items-center gap-0.5 text-ink-600">
      <Icon name="Star" className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
      <span className="font-semibold">{oneri.puan.ortalama.toLocaleString('tr-TR')}</span>
      <span className="text-ink-400">({oneri.puan.sayi} Sharloop puanı)</span>
    </span>
  )
}

export function SponsorluEtiketi() {
  return (
    <span className="inline-flex items-center rounded-full bg-ink-100 text-ink-500 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
      Sponsorlu
    </span>
  )
}

function useIsletmeFotosu(isletme: IsletmeProfili | null, foto: IsletmeFotosu | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let iptal = false
    if (isletme && foto) void isletmeFotoUrl(isletme, foto).then((u) => !iptal && setUrl(u)).catch(() => {})
    return () => {
      iptal = true
    }
  }, [isletme, foto])
  return url
}

// The business's first photo, or the category's icon.
export function MekanSimgesi({ oneri, boyut }: { oneri: YakinOneri; boyut: 'kucuk' | 'buyuk' }) {
  const url = useIsletmeFotosu(oneri.isletme, oneri.isletme?.fotolar[0])
  const sinif = boyut === 'kucuk' ? 'w-9 h-9 rounded-xl' : 'w-12 h-12 rounded-2xl'
  if (url) return <img src={url} alt="" className={`${sinif} object-cover shrink-0 bg-mist-100`} />
  return (
    <div className={`${sinif} bg-bolum-soluk text-bolum-koyu flex items-center justify-center shrink-0`}>
      <Icon name={kategoriSimgesi(oneri.mekan.kategori)} className={boyut === 'kucuk' ? 'w-4 h-4' : 'w-6 h-6'} />
    </div>
  )
}

function Foto({ isletme, foto }: { isletme: IsletmeProfili; foto: IsletmeFotosu }) {
  const url = useIsletmeFotosu(isletme, foto)
  return url ? (
    <img src={url} alt="" className="h-44 w-64 shrink-0 snap-start rounded-2xl object-cover bg-mist-100" />
  ) : (
    <div className="skeleton h-44 w-64 shrink-0 rounded-2xl" />
  )
}

function IletisimSatiri({ ikon, href, children }: { ikon: IconName; href?: string; children: React.ReactNode }) {
  const icerik = (
    <>
      <Icon name={ikon} className="w-4 h-4 shrink-0 mt-0.5 text-ink-400" />
      <span className="min-w-0 break-words">{children}</span>
    </>
  )
  return href ? (
    <a href={href} target="_blank" rel="noopener" className="flex items-start gap-2.5 text-sm text-bolum-koyu font-medium">
      {icerik}
    </a>
  ) : (
    <p className="flex items-start gap-2.5 text-sm text-ink-600">{icerik}</p>
  )
}

export function MekanSayfasi({
  oneri,
  onKapat,
  onPlanAc,
}: {
  oneri: YakinOneri
  onKapat: () => void
  onPlanAc: (kayit: Kayit) => void
}) {
  useGeriIleKapat(onKapat)
  const { mekan, kampanya, isletme } = oneri
  const [nedenAcik, setNedenAcik] = useState(false)
  const [kod, setKod] = useState<IndirimKodu | null>(null)
  const [kodHatasi, setKodHatasi] = useState<string | null>(null)
  const [kodAliniyor, setKodAliniyor] = useState(false)
  const [seciliOdul, setSeciliOdul] = useState<IsletmeOdulu | null>(null)
  const [planKapsami, setPlanKapsami] = useState<Kapsam | null>(null)
  const [planKuruldu, setPlanKuruldu] = useState(false)
  // The discount screen is a step inside the sheet: back returns to the place.
  useGeriAdimi(() => setKod(null), kod !== null)
  const benim = motorVarMi() && isletme?.id === motor().benimId
  const qrVar = !!isletme && !benim && (!!isletme.indirim || isletme.oduller.length > 0)
  const ziyaret = ziyaretKazanci({ oneCikan: !!kampanya, plan: false }).puan

  async function planYap() {
    const { kayit } = await anidanPlan(mekan.ad, null)
    onKapat()
    onPlanAc(kayit)
  }

  async function koduAl(odul: IsletmeOdulu | null = null) {
    if (!isletme || !motorVarMi()) return
    setKodAliniyor(true)
    setKodHatasi(null)
    try {
      // Today's plans for this place ride along, for the plan and group bonus.
      const isaretler = await planIsaretleri(mekan.ad).catch(() => [])
      setKod(await indirimKoduAl(isletme.id, motor().benimId, { isaretler, odul: odul?.id }))
      setSeciliOdul(odul)
    } catch (err) {
      setKodHatasi(err instanceof Error ? err.message : 'Kod alınamadı.')
    } finally {
      setKodAliniyor(false)
    }
  }

  if (planKapsami) {
    // In place of the sheet, which comes back when the plan is done.
    return createPortal(
      <div className="relative z-[90]">
        <PlanOlustur
          baslangic={{ konum: mekan.ad, kapsam: planKapsami }}
          onClose={() => setPlanKapsami(null)}
          onSaved={() => {
            setPlanKapsami(null)
            setPlanKuruldu(true)
          }}
        />
      </div>,
      document.body,
    )
  }

  // On <body>: the feed's animated list would otherwise trap a fixed sheet
  // inside it, under the bottom bar.
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-ink-900/40 animate-fade-in" onClick={onKapat}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mekan.ad}
        className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-mist-50 rounded-t-3xl p-5 pb-[calc(1.25rem+var(--safe-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative mb-4">
          <div className="w-10 h-1 rounded-full bg-ink-200 mx-auto" />
          <button
            onClick={onKapat}
            aria-label="Kapat"
            className="absolute -top-1.5 right-0 w-8 h-8 rounded-full bg-ink-100/80 hover:bg-ink-100 flex items-center justify-center basinca"
          >
            <Icon name="X" className="w-4 h-4 text-ink-500" />
          </button>
        </div>

        {kod && isletme ? (
          <IndirimEkrani kod={kod} isletme={isletme} odul={seciliOdul} puan={ziyaret} onGeri={() => setKod(null)} />
        ) : (
          <>
            {isletme && isletme.fotolar.length > 0 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 mb-4 snap-x">
                {isletme.fotolar.map((f) => (
                  <Foto key={f.id} isletme={isletme} foto={f} />
                ))}
              </div>
            )}

            <div className="flex items-start gap-3 mb-3">
              {!isletme?.fotolar.length && <MekanSimgesi oneri={oneri} boyut="buyuk" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-ink-700 text-lg leading-tight">{mekan.ad}</h3>
                  {kampanya && <SponsorluEtiketi />}
                  {yetiskinMi(`${mekan.kategori ?? ''} ${mekan.ad}`) && (
                    <span className="inline-flex items-center rounded-full bg-ink-700 text-white text-[10px] font-bold px-2 py-0.5">18+</span>
                  )}
                </div>
                <p className="text-sm text-ink-400 mt-0.5">
                  {[mekan.kategori, mesafeMetni(oneri.mesafeMetre)].filter(Boolean).join(' · ')}
                </p>
                <div className="text-sm mt-1">
                  <MekanPuani oneri={oneri} />
                </div>
              </div>
            </div>

            {(isletme?.aciklama ?? kampanya?.aciklama) && (
              <p className="text-sm text-ink-600 mb-3 leading-relaxed">{isletme?.aciklama ?? kampanya?.aciklama}</p>
            )}

            {kampanya && !benim && (
              <PlanOnerisi
                puan={ziyaret + PUANLAR.plan}
                kuruldu={planKuruldu}
                onKendime={() => void planYap()}
                onArkadaslarla={() => setPlanKapsami('arkadas')}
              />
            )}

            {isletme?.indirim && !benim && (
              <div className="rounded-2xl bg-teal-50 border border-teal-100 p-4 mb-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-teal-800">
                  <Icon name="Ticket" className="w-4 h-4" />
                  {isletme.indirim.metin}
                </p>
                {isletme.indirim.kosul && <p className="text-xs text-teal-700 mt-1">{isletme.indirim.kosul}</p>}
                <p className="text-xs text-teal-700 mt-1">
                  Kasada QR'ını okutunca +{ziyaret} {SHARPOINT_ADI} kazanırsın.
                </p>
                <button
                  onClick={() => void koduAl()}
                  disabled={kodAliniyor}
                  className="w-full mt-3 rounded-2xl py-2.5 text-sm font-semibold bg-teal-600 text-white disabled:opacity-60 active:opacity-90"
                >
                  {kodAliniyor ? 'Kod hazırlanıyor…' : 'İndirim kodunu al'}
                </button>
              </div>
            )}

            {qrVar && isletme.oduller.length > 0 && (
              <Oduller oduller={isletme.oduller} mesgul={kodAliniyor} onKullan={(o) => void koduAl(o)} />
            )}
            {kodHatasi && <p className="text-xs text-rose-600 -mt-2 mb-4">{kodHatasi}</p>}

            <div className="flex flex-col gap-2.5 mb-4">
              {mekan.adres && <IletisimSatiri ikon="MapPin">{mekan.adres}</IletisimSatiri>}
              {isletme?.saatler && <IletisimSatiri ikon="Clock">{isletme.saatler}</IletisimSatiri>}
              {isletme?.telefon && (
                <IletisimSatiri ikon="Phone" href={`tel:${isletme.telefon.replace(/[^\d+]/g, '')}`}>
                  {isletme.telefon}
                </IletisimSatiri>
              )}
              {isletme?.web && (
                <IletisimSatiri ikon="Globe" href={isletme.web}>
                  {isletme.web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                </IletisimSatiri>
              )}
              {isletme?.instagram && (
                <IletisimSatiri ikon="AtSign" href={`https://instagram.com/${isletme.instagram}`}>
                  @{isletme.instagram}
                </IletisimSatiri>
              )}
              <IletisimSatiri ikon="Star" href={googleAdresi(mekan)}>
                Google'da yorumlar ve fotoğraflar
              </IletisimSatiri>
            </div>

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

// SVG markup of a QR code for `metin`.
export function qrSvg(metin: string): string {
  const qr = qrcode(0, 'M')
  qr.addData(metin)
  qr.make()
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })
}

// What to show at the till: the business scans the QR with its phone's
// camera (or types the code) and its page says whether it's good today,
// counts the SharPoint and spends the reward when one was picked. The
// clock ticks so a screenshot from another day is easy to spot.
function IndirimEkrani({
  kod,
  isletme,
  odul,
  puan,
  onGeri,
}: {
  kod: IndirimKodu
  isletme: IsletmeProfili
  odul: IsletmeOdulu | null
  puan: number
  onGeri: () => void
}) {
  const [simdi, setSimdi] = useState(() => new Date())
  useEffect(() => {
    const z = setInterval(() => setSimdi(new Date()), 1000)
    return () => clearInterval(z)
  }, [])
  const saat = simdi.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' })
  const gun = simdi.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long' })
  const [svg] = useState(() => qrSvg(kod.dogrulama))

  return (
    <div className="text-center">
      <p className="text-sm text-ink-400">{isletme.ad}</p>
      <p className="font-semibold text-ink-700 mt-1">
        {odul ? `🎁 ${odul.metin}` : (isletme.indirim?.metin ?? `${SHARPOINT_ADI} kazan`)}
      </p>
      {odul && (
        <p className="text-xs text-amber-700 mt-0.5">
          {odul.puan} {SHARPOINT_ADI} harcanacak
        </p>
      )}
      <div className={`my-4 rounded-3xl bg-white border-2 border-dashed p-5 ${odul ? 'border-amber-300' : 'border-teal-300'}`}>
        <div
          className="w-48 h-48 mx-auto [&>svg]:w-full [&>svg]:h-full"
          role="img"
          aria-label={odul ? 'Ödül QR kodu' : 'İndirim QR kodu'}
          // Generated locally from our own URL; no outside input.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="font-mono text-2xl font-bold tracking-[0.2em] text-ink-800 mt-3">{kod.kod}</p>
        <p className="text-xs text-ink-400 mt-1 tabular-nums">
          {gun} · {saat}
        </p>
      </div>
      <p className="text-xs text-ink-400 leading-relaxed mb-4">
        {odul
          ? 'Kasada göster: işletme QR\'ı telefonunun kamerasıyla okutunca ödülün onaylanır.'
          : `Kasada göster: işletme QR'ı telefonunun kamerasıyla okutunca indirimin onaylanır ve +${puan} ${SHARPOINT_ADI} kazanırsın.`}{' '}
        Kod yalnızca bugün geçerli.
        {!odul && isletme.indirim?.kosul && ` ${isletme.indirim.kosul}.`}
      </p>
      <button onClick={onGeri} className="btn-ghost border border-ink-100 w-full text-sm">
        Geri
      </button>
    </div>
  )
}

// A sponsored place suggests a plan: going earns SharPoint, more with
// friends from the same plan.
function PlanOnerisi({
  puan,
  kuruldu,
  onKendime,
  onArkadaslarla,
}: {
  puan: number
  kuruldu: boolean
  onKendime: () => void
  onArkadaslarla: () => void
}) {
  return (
    <div className="rounded-2xl bg-bolum-soluk border border-bolum/20 p-4 mb-4">
      <p className="text-sm font-semibold text-bolum-koyu flex items-center gap-2">
        <Icon name="CalendarPlus" className="w-4 h-4" />
        Plan önerisi
      </p>
      <p className="text-sm text-ink-600 mt-1 leading-relaxed">
        Bu hafta buraya bir plan yap, gittiğinde kasada QR'ını okut: <b>+{puan} {SHARPOINT_ADI}</b>. Arkadaşlarınla aynı plana gelirseniz her biriniz{' '}
        <b>+{PUANLAR.grup}</b> daha kazanır.
      </p>
      {kuruldu ? (
        <p className="text-sm text-teal-700 mt-3 flex items-center gap-1.5">
          <Icon name="Check" className="w-4 h-4" />
          Plan kuruldu, davetler gitti. Gittiğin gün QR'ını okutmayı unutma.
        </p>
      ) : (
        <div className="flex gap-2 mt-3">
          <button onClick={onKendime} className="btn-ghost border border-ink-100 bg-white flex-1 text-sm">
            Kendime plan
          </button>
          <button onClick={onArkadaslarla} className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5">
            <Icon name="Users" className="w-4 h-4" />
            Arkadaşlarla
          </button>
        </div>
      )}
    </div>
  )
}

// The business's rewards and what I have to spend on them.
function Oduller({ oduller, mesgul, onKullan }: { oduller: IsletmeOdulu[]; mesgul: boolean; onKullan: (o: IsletmeOdulu) => void }) {
  const { ozet, yukleniyor } = useSharpoint()
  return (
    <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 mb-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
          <Icon name="Star" className="w-4 h-4" />
          {SHARPOINT_ADI} ödülleri
        </p>
        <span className="text-xs font-semibold text-amber-800 tabular-nums">
          {yukleniyor && ozet.kazanilan === 0 ? '…' : `Bakiyen ${ozet.bakiye}`}
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {oduller.map((o) => {
          const eksik = o.puan - ozet.bakiye
          return (
            <li key={o.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-700">{o.metin}</p>
                <p className="text-xs text-amber-700 tabular-nums">
                  {o.puan} {SHARPOINT_ADI}
                  {eksik > 0 && ` · ${eksik} daha lazım`}
                </p>
              </div>
              <button
                onClick={() => onKullan(o)}
                disabled={mesgul || eksik > 0}
                className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold bg-amber-500 text-white disabled:bg-amber-200 disabled:text-amber-700"
              >
                Kullan
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
