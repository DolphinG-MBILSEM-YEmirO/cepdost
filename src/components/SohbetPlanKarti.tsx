import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { formatDate, formatDuration, formatPlanTime } from '../lib/format'
import { davetKaydi, planGectiMi } from '../lib/planPaylasimi'
import { planiTakvimeIndir } from '../takvim'
import { kayitSil } from '../db'
import type { PlanDaveti } from '../sosyal/api'
import type { GrupPlani, PlanYaniti, YanitDurumu } from '../sosyal/gruplar'

// Plan cards inside chats: a friend's invite in a one-to-one chat, a group
// plan in a group chat. They sit under the message bubble (not inside it)
// so they stay readable on every chat theme, and can be answered, added to
// the phone calendar or opened on a map right there.

interface CerceveProps {
  etiket: string
  emoji: string | null
  baslik: string
  tarih: string
  saat: string | null
  sure: number | null
  tumGun: boolean
  konum: string | null
  not: string | null
  children: ReactNode
}

function KartCercevesi({ etiket, emoji, baslik, tarih, saat, sure, tumGun, konum, not, children }: CerceveProps) {
  const zaman = [formatDate(tarih) ?? tarih, formatPlanTime(saat, tumGun), formatDuration(sure)].filter(Boolean).join(' · ')
  return (
    <div className="w-72 max-w-full rounded-2xl bg-mist-50 border border-ink-100 shadow-soft p-3.5 text-ink-700">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-bolum-soluk text-bolum-koyu flex items-center justify-center shrink-0 text-lg">
          {emoji ?? <Icon name="CalendarClock" className="w-5 h-5 text-bolum-koyu" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-brand-600">{etiket}</p>
          <p className="text-sm font-semibold leading-snug">{baslik}</p>
          <p className="text-xs text-ink-400 mt-0.5">{zaman}</p>
        </div>
      </div>
      {konum && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(konum)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs text-ink-500 mt-2 hover:text-brand-600"
        >
          <Icon name="MapPin" className="w-3.5 h-3.5 text-ink-500 shrink-0" />
          <span className="truncate">{konum}</span>
        </a>
      )}
      {not && <p className="text-xs text-ink-400 mt-1.5 whitespace-pre-wrap">{not}</p>}
      <div className="mt-3">{children}</div>
    </div>
  )
}

function TakvimeEkle(props: Parameters<typeof planiTakvimeIndir>[0]) {
  return (
    <button
      onClick={() => planiTakvimeIndir(props)}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800"
    >
      <Icon name="CalendarPlus" className="w-3.5 h-3.5" />
      Telefon takvimine ekle
    </button>
  )
}

function Durum({ renk, children }: { renk: string; children: ReactNode }) {
  return <p className={`text-xs font-semibold ${renk}`}>{children}</p>
}

const kucukDugme = 'text-[11px] font-semibold text-ink-400 hover:text-ink-600 underline-offset-2 hover:underline'

// ---------- one-to-one invite ----------

export function DavetKartiSohbet({
  davet,
  benimId,
  karsiAd,
  onYanit,
  onIptal,
}: {
  davet: PlanDaveti
  benimId: string
  karsiAd: string
  onYanit: (kabul: boolean) => Promise<void>
  onIptal: () => Promise<void>
}) {
  const [isleniyor, setIsleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const bana = davet.alan_id === benimId
  const gecti = planGectiMi(davet.tarih)
  const ics = {
    baslik: davet.baslik,
    tarih: davet.tarih,
    saat: davet.saat,
    sure: davet.sure,
    konum: davet.konum,
    notlar: davet.mesaj,
  }

  // A cancelled invite I had accepted is still in my calendar; offer to
  // take it out.
  const [iptalKaydi, setIptalKaydi] = useState<string | null>(null)
  useEffect(() => {
    if (davet.durum !== 'iptal' || !bana) return
    let iptal = false
    void davetKaydi(davet.id).then((k) => {
      if (!iptal) setIptalKaydi(k?.id ?? null)
    })
    return () => {
      iptal = true
    }
  }, [davet.durum, davet.id, bana])

  async function calistir(is: () => Promise<void>) {
    setIsleniyor(true)
    setHata(null)
    try {
      await is()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Olmadı, tekrar dener misin?')
    } finally {
      setIsleniyor(false)
    }
  }

  let alt: ReactNode
  if (davet.durum === 'iptal') {
    alt = (
      <div className="flex items-center justify-between gap-2">
        <Durum renk="text-ink-400">İptal edildi</Durum>
        {iptalKaydi && (
          <button
            onClick={() => void calistir(async () => {
              await kayitSil(iptalKaydi)
              setIptalKaydi(null)
            })}
            className={kucukDugme}
          >
            Takviminden kaldır
          </button>
        )}
      </div>
    )
  } else if (bana && davet.durum === 'bekliyor' && !gecti) {
    alt = (
      <div className="flex gap-2">
        <button
          onClick={() => void calistir(() => onYanit(false))}
          disabled={isleniyor}
          className="flex-1 rounded-xl bg-mist-100 border border-ink-100 text-ink-500 text-xs font-semibold py-2 active:opacity-80 transition-transform disabled:opacity-50"
        >
          Uymuyor
        </button>
        <button
          onClick={() => void calistir(() => onYanit(true))}
          disabled={isleniyor}
          className="flex-1 rounded-xl bg-brand-600 text-white text-xs font-semibold py-2 active:opacity-80 transition-transform disabled:opacity-50"
        >
          Geliyorum
        </button>
      </div>
    )
  } else if (bana) {
    alt = (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          {davet.durum === 'kabul' ? (
            <Durum renk="text-teal-600">Geliyorsun ✓</Durum>
          ) : davet.durum === 'red' ? (
            <Durum renk="text-ink-400">Gelmiyorsun</Durum>
          ) : (
            <Durum renk="text-ink-400">Bu plan geçti</Durum>
          )}
          {!gecti && davet.durum !== 'bekliyor' && (
            <button
              onClick={() => void calistir(() => onYanit(davet.durum !== 'kabul'))}
              disabled={isleniyor}
              className={kucukDugme}
            >
              {davet.durum === 'kabul' ? 'Gelemeyeceğim' : 'Fikrimi değiştirdim'}
            </button>
          )}
        </div>
        {davet.durum === 'kabul' && !gecti && <TakvimeEkle {...ics} />}
      </div>
    )
  } else {
    alt = (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          {davet.durum === 'kabul' ? (
            <Durum renk="text-teal-600">{karsiAd} geliyor ✓</Durum>
          ) : davet.durum === 'red' ? (
            <Durum renk="text-ink-400">{karsiAd} gelemiyor</Durum>
          ) : (
            <Durum renk="text-ink-400">{gecti ? 'Bu plan geçti' : 'Yanıt bekleniyor'}</Durum>
          )}
          {!gecti && (
            <button onClick={() => void calistir(onIptal)} disabled={isleniyor} className={kucukDugme}>
              İptal et
            </button>
          )}
        </div>
        {!gecti && <TakvimeEkle {...ics} />}
      </div>
    )
  }

  return (
    <KartCercevesi
      etiket="Plan daveti"
      emoji={davet.emoji}
      baslik={davet.baslik}
      tarih={davet.tarih}
      saat={davet.saat}
      sure={davet.sure}
      tumGun={davet.tum_gun}
      konum={davet.konum}
      not={davet.mesaj}
    >
      {alt}
      {hata && <p className="text-[11px] text-rose-600 mt-2">{hata}</p>}
    </KartCercevesi>
  )
}

// ---------- group plan ----------

const SECENEKLER: { d: YanitDurumu; etiket: string; renk: string }[] = [
  { d: 'geliyorum', etiket: 'Geliyorum', renk: 'bg-teal-500 text-white' },
  { d: 'belki', etiket: 'Belki', renk: 'bg-amber-400 text-amber-900' },
  { d: 'gelmiyorum', etiket: 'Gelemem', renk: 'bg-ink-200 text-ink-600' },
]

export function GrupPlanKartiSohbet({
  plan,
  yanitlar,
  benimId,
  adHaritasi,
  onYanit,
  onAc,
}: {
  plan: GrupPlani
  yanitlar: PlanYaniti[]
  benimId: string
  adHaritasi: Map<string, string>
  onYanit: (d: YanitDurumu) => Promise<void>
  // Opens the plan's own page (everyone's answer, who brings what).
  onAc?: () => void
}) {
  const [isleniyor, setIsleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const benimYanit = yanitlar.find((y) => y.kullanici_id === benimId)?.durum ?? null
  const gelenler = yanitlar.filter((y) => y.durum === 'geliyorum')
  const belkiler = yanitlar.filter((y) => y.durum === 'belki')
  const gecti = planGectiMi(plan.tarih)
  const adlar = gelenler.map((y) => (y.kullanici_id === benimId ? 'Sen' : (adHaritasi.get(y.kullanici_id) ?? '?')))

  return (
    <KartCercevesi
      etiket="Grup planı"
      emoji={plan.emoji}
      baslik={plan.baslik}
      tarih={plan.tarih}
      saat={plan.saat}
      sure={plan.sure}
      tumGun={plan.tum_gun}
      konum={plan.konum}
      not={plan.notlar}
    >
      <p className="text-[11px] text-ink-400 mb-2">
        {gelenler.length > 0 ? `${adlar.join(', ')} geliyor` : 'Henüz gelen yok'}
        {belkiler.length > 0 && ` · ${belkiler.length} belki`}
      </p>
      {gecti ? (
        <Durum renk="text-ink-400">Bu plan geçti</Durum>
      ) : (
        <>
          <div className="flex gap-1.5">
            {SECENEKLER.map((s) => (
              <button
                key={s.d}
                onClick={async () => {
                  setIsleniyor(true)
                  setHata(null)
                  try {
                    await onYanit(s.d)
                  } catch (err) {
                    setHata(err instanceof Error ? err.message : 'Olmadı, tekrar dener misin?')
                  } finally {
                    setIsleniyor(false)
                  }
                }}
                disabled={isleniyor}
                aria-pressed={benimYanit === s.d}
                className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold active:opacity-80 transition-all disabled:opacity-60 ${
                  benimYanit === s.d ? s.renk : 'bg-white text-ink-600 border border-ink-200'
                }`}
              >
                {s.etiket}
              </button>
            ))}
          </div>
          {benimYanit === 'geliyorum' && (
            <div className="mt-2">
              <TakvimeEkle
                baslik={plan.baslik}
                tarih={plan.tarih}
                saat={plan.saat}
                sure={plan.sure}
                konum={plan.konum}
                notlar={plan.notlar}
              />
            </div>
          )}
          {hata && <p className="text-[11px] text-rose-600 mt-2">{hata}</p>}
        </>
      )}
      {onAc && (
        <button onClick={onAc} className="mt-2 inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand-600 hover:text-brand-700">
          Ayrıntılar ve kim ne getiriyor
          <Icon name="ChevronRight" className="w-3.5 h-3.5" />
        </button>
      )}
    </KartCercevesi>
  )
}
